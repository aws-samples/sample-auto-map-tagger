"""
devtools.py — Creates developer tooling resources for E2E tests.

Creates:
  - CodeBuild project
  - CodePipeline pipeline
  - CloudFormation stack (simple S3 bucket template)
  - Service Catalog portfolio
"""

from __future__ import annotations

import json
import logging
import time

import boto3

from ._common import get_account_id, make_record, resource_name, safe_call

log = logging.getLogger(__name__)
# Tag key used to mark E2E-created resources for teardown bookkeeping.
# NOT `map-migrated` — that is the tag the auto-tagger Lambda is supposed
# to apply; pre-tagging with it would make verify_tags a tautology and
# mask any Lambda failure (see auto-map-tagger-e2e-audit.md).
PRE_TAG_KEY = "e2e-run-id"

# Tag key the Lambda is expected to apply — what verify_tags polls for.
EXPECTED_TAG_KEY = "map-migrated"


def create(
    region: str,
    pr_number: str,
    timestamp: str,
    tag_value: str,
    **_kwargs,
) -> dict:
    account = get_account_id()
    arns: list[dict] = []
    prefix = lambda svc: resource_name(pr_number, timestamp, svc)
    tags = [{"Key": PRE_TAG_KEY, "Value": tag_value}]
    tags_dict = {PRE_TAG_KEY: tag_value}

    codebuild = boto3.client("codebuild", region_name=region)
    codepipeline = boto3.client("codepipeline", region_name=region)
    codedeploy = boto3.client("codedeploy", region_name=region)
    cfn = boto3.client("cloudformation", region_name=region)
    servicecatalog = boto3.client("servicecatalog", region_name=region)
    iam = boto3.client("iam")
    s3 = boto3.client("s3", region_name=region)

    def rec(arn, service, resource_id, taggable=True):
        arns.append(make_record(
            arn=arn, service=service, region=region, account=account,
            resource_id=resource_id, tag_key=EXPECTED_TAG_KEY, tag_value=tag_value,
            taggable=taggable,
        ))

    # ── CodeBuild role ────────────────────────────────────────────────────────
    cb_role_arn = _ensure_codebuild_role(iam, account, prefix("cb-role"))

    # ── CodeBuild project ─────────────────────────────────────────────────────
    cb_project_name = prefix("codebuild")
    cb_project_arn = None
    try:
        resp = codebuild.create_project(
            name=cb_project_name,
            source={
                "type": "NO_SOURCE",
                "buildspec": "version: 0.2\nphases:\n  build:\n    commands:\n      - echo 'hello from e2e'\n",
            },
            artifacts={"type": "NO_ARTIFACTS"},
            environment={
                "type": "LINUX_CONTAINER",
                "computeType": "BUILD_GENERAL1_SMALL",
                "image": "aws/codebuild/standard:7.0",
            },
            serviceRole=cb_role_arn,
            tags=tags,
        )
        cb_project_arn = resp["project"]["arn"]
        rec(cb_project_arn, "codebuild", cb_project_name)
        log.info("CodeBuild: %s", cb_project_arn)
    except Exception as exc:
        log.error("CodeBuild creation failed: %s", exc)

    # ── S3 artifact bucket for CodePipeline ───────────────────────────────────
    artifact_bucket = f"e2e-pr{pr_number}-{timestamp}-devtools-{account}"
    artifact_bucket = artifact_bucket[:63].lower()
    try:
        if region == "us-east-1":
            s3.create_bucket(Bucket=artifact_bucket)
        else:
            s3.create_bucket(
                Bucket=artifact_bucket,
                CreateBucketConfiguration={"LocationConstraint": region},
            )
        s3.put_bucket_tagging(
            Bucket=artifact_bucket,
            Tagging={"TagSet": tags},
        )
        log.info("Artifact bucket: %s", artifact_bucket)
    except Exception as exc:
        log.warning("Artifact bucket: %s", exc)

    # ── CodePipeline ──────────────────────────────────────────────────────────
    if cb_project_arn:
        cp_name = prefix("codepipeline")
        try:
            cp_role_arn = _ensure_codepipeline_role(iam, account, prefix("cp-role"))
            resp = codepipeline.create_pipeline(
                pipeline={
                    "name": cp_name,
                    "roleArn": cp_role_arn,
                    "artifactStore": {
                        "type": "S3",
                        "location": artifact_bucket,
                    },
                    "stages": [
                        {
                            "name": "Source",
                            "actions": [{
                                "name": "Source",
                                "actionTypeId": {
                                    "category": "Source",
                                    "owner": "AWS",
                                    "provider": "S3",
                                    "version": "1",
                                },
                                "configuration": {
                                    "S3Bucket": artifact_bucket,
                                    "S3ObjectKey": "source.zip",
                                    "PollForSourceChanges": "false",
                                },
                                "outputArtifacts": [{"name": "SourceOutput"}],
                            }],
                        },
                        {
                            "name": "Build",
                            "actions": [{
                                "name": "Build",
                                "actionTypeId": {
                                    "category": "Build",
                                    "owner": "AWS",
                                    "provider": "CodeBuild",
                                    "version": "1",
                                },
                                "configuration": {"ProjectName": cb_project_name},
                                "inputArtifacts": [{"name": "SourceOutput"}],
                            }],
                        },
                    ],
                },
                tags=tags,
            )
            cp_arn = resp["pipeline"]["pipelineArn"] if "pipeline" in resp else (
                f"arn:aws:codepipeline:{region}:{account}:pipeline:{cp_name}"
            )
            rec(cp_arn, "codepipeline", cp_name)
            log.info("CodePipeline: %s", cp_arn)
        except Exception as exc:
            log.error("CodePipeline creation failed: %s", exc)

    # ── CloudFormation stack ──────────────────────────────────────────────────
    cfn_stack_name = prefix("cfn")
    cfn_bucket_name = f"e2e-pr{pr_number}-{timestamp}-cfn-{account}"
    cfn_bucket_name = cfn_bucket_name[:63].lower()
    template = json.dumps({
        "AWSTemplateFormatVersion": "2010-09-09",
        "Resources": {
            "TestBucket": {
                "Type": "AWS::S3::Bucket",
                "Properties": {
                    "BucketName": cfn_bucket_name,
                    "Tags": [{"Key": PRE_TAG_KEY, "Value": tag_value}],
                },
            }
        },
    })
    try:
        cfn.create_stack(
            StackName=cfn_stack_name,
            TemplateBody=template,
            Tags=tags,
            OnFailure="DELETE",
        )
        cfn_arn = f"arn:aws:cloudformation:{region}:{account}:stack/{cfn_stack_name}/"
        rec(cfn_arn, "cloudformation", cfn_stack_name)
        log.info("CloudFormation stack: %s", cfn_stack_name)
    except Exception as exc:
        log.error("CloudFormation stack creation failed: %s", exc)

    # ── CodeDeploy Application + DeploymentGroup ──────────────────────────────
    # CloudTrail events: CreateApplication, CreateDeploymentGroup (source
    # codedeploy.amazonaws.com). Lambda compute platform avoids needing any
    # EC2 instances or Lambda functions to actually exist — the resources
    # are still taggable.
    cd_app_name = prefix("cd-app")[:100]
    try:
        codedeploy.create_application(
            applicationName=cd_app_name,
            computePlatform="Lambda",
            tags=tags,
        )
        cd_app_arn = f"arn:aws:codedeploy:{region}:{account}:application:{cd_app_name}"
        rec(cd_app_arn, "codedeploy", cd_app_name)
        log.info("CodeDeploy Application: %s", cd_app_arn)

        # DeploymentGroup requires an IAM role trusting codedeploy.amazonaws.com.
        cd_role_arn = _ensure_codedeploy_role(iam, account, prefix("cd-role")[:64])
        cd_group_name = prefix("cd-group")[:100]
        codedeploy.create_deployment_group(
            applicationName=cd_app_name,
            deploymentGroupName=cd_group_name,
            serviceRoleArn=cd_role_arn,
            tags=tags,
        )
        cd_group_arn = f"arn:aws:codedeploy:{region}:{account}:deploymentgroup:{cd_app_name}/{cd_group_name}"
        rec(cd_group_arn, "codedeploy", f"{cd_app_name}/{cd_group_name}")
        log.info("CodeDeploy DeploymentGroup: %s", cd_group_arn)
    except Exception as exc:
        log.error("CodeDeploy creation failed: %s", exc)

    # ── Service Catalog portfolio ─────────────────────────────────────────────
    try:
        resp = servicecatalog.create_portfolio(
            DisplayName=prefix("sc-portfolio"),
            ProviderName="E2E Test",
            Tags=tags,
        )
        portfolio_id = resp["PortfolioDetail"]["Id"]
        portfolio_arn = resp["PortfolioDetail"]["ARN"]
        rec(portfolio_arn, "catalog", portfolio_id)
        log.info("Service Catalog portfolio: %s", portfolio_arn)
    except Exception as exc:
        log.error("Service Catalog portfolio creation failed: %s", exc)

    return {"arns": arns, "outputs": {}}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_codebuild_role(iam_client, account: str, role_name: str) -> str:
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "codebuild.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    try:
        resp = iam_client.create_role(RoleName=role_name, AssumeRolePolicyDocument=trust)
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn="arn:aws:iam::aws:policy/AWSCodeBuildAdminAccess",
        )
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn="arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
        )
        time.sleep(10)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("CodeBuild role: %s", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"


def _ensure_codepipeline_role(iam_client, account: str, role_name: str) -> str:
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "codepipeline.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    try:
        resp = iam_client.create_role(RoleName=role_name, AssumeRolePolicyDocument=trust)
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn="arn:aws:iam::aws:policy/AWSCodePipeline_FullAccess",
        )
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn="arn:aws:iam::aws:policy/AmazonS3FullAccess",
        )
        time.sleep(10)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("CodePipeline role: %s", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"


def _ensure_codedeploy_role(iam_client, account: str, role_name: str) -> str:
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "codedeploy.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    try:
        resp = iam_client.create_role(RoleName=role_name, AssumeRolePolicyDocument=trust)
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn="arn:aws:iam::aws:policy/service-role/AWSCodeDeployRoleForLambda",
        )
        time.sleep(10)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("CodeDeploy role: %s", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"
