"""
devtools.py — Creates developer tooling resources for E2E tests.

Creates:
  - CodeCommit repository
  - CodeBuild project
  - CodeDeploy application + deployment group
  - CodePipeline pipeline (CodeCommit source → CodeBuild build)
  - Amplify app
  - CodeArtifact domain + repository
  - CodeGuru Profiler profiling group
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
TAG_KEY = "map-migrated"


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
    tags = [{"Key": TAG_KEY, "Value": tag_value}]
    tags_dict = {TAG_KEY: tag_value}

    codecommit = boto3.client("codecommit", region_name=region)
    codebuild = boto3.client("codebuild", region_name=region)
    codedeploy = boto3.client("codedeploy", region_name=region)
    codepipeline = boto3.client("codepipeline", region_name=region)
    amplify = boto3.client("amplify", region_name=region)
    codeartifact = boto3.client("codeartifact", region_name=region)
    codeguru = boto3.client("codeguruprofiler", region_name=region)
    cfn = boto3.client("cloudformation", region_name=region)
    servicecatalog = boto3.client("servicecatalog", region_name=region)
    iam = boto3.client("iam")
    s3 = boto3.client("s3", region_name=region)

    def rec(arn, service, resource_id, taggable=True):
        arns.append(make_record(
            arn=arn, service=service, region=region, account=account,
            resource_id=resource_id, tag_key=TAG_KEY, tag_value=tag_value,
            taggable=taggable,
        ))

    # ── CodeCommit repository ─────────────────────────────────────────────────
    repo_name = prefix("codecommit")
    repo_arn = None
    try:
        resp = codecommit.create_repository(
            repositoryName=repo_name,
            repositoryDescription="E2E test CodeCommit repo",
            tags=tags_dict,
        )
        repo_arn = resp["repositoryMetadata"]["Arn"]
        rec(repo_arn, "codecommit", repo_name)
        log.info("CodeCommit: %s", repo_arn)
    except Exception as exc:
        log.error("CodeCommit creation failed: %s", exc)

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

    # ── CodeDeploy application ────────────────────────────────────────────────
    cd_app_name = prefix("codedeploy")
    try:
        codedeploy.create_application(applicationName=cd_app_name, computePlatform="Server")
        cd_app_arn = f"arn:aws:codedeploy:{region}:{account}:application:{cd_app_name}"
        rec(cd_app_arn, "codedeploy", cd_app_name)
        log.info("CodeDeploy app: %s", cd_app_name)

        # Deployment group (requires IAM role)
        cd_role_arn = _ensure_codedeploy_role(iam, account, prefix("cd-role"))
        dg_name = prefix("cd-dg")
        codedeploy.create_deployment_group(
            applicationName=cd_app_name,
            deploymentGroupName=dg_name,
            serviceRoleArn=cd_role_arn,
            deploymentConfigName="CodeDeployDefault.AllAtOnce",
            tags=tags,
        )
        dg_arn = (
            f"arn:aws:codedeploy:{region}:{account}:deploymentgroup:"
            f"{cd_app_name}/{dg_name}"
        )
        rec(dg_arn, "codedeploy", dg_name)
        log.info("CodeDeploy DG: %s", dg_name)
    except Exception as exc:
        log.error("CodeDeploy creation failed: %s", exc)

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
    if repo_arn and cb_project_arn:
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
                                    "provider": "CodeCommit",
                                    "version": "1",
                                },
                                "configuration": {
                                    "RepositoryName": repo_name,
                                    "BranchName": "main",
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

    # ── Amplify app ───────────────────────────────────────────────────────────
    amplify_name = prefix("amplify")
    try:
        resp = amplify.create_app(
            name=amplify_name,
            tags=tags_dict,
        )
        amplify_arn = resp["app"]["appArn"]
        rec(amplify_arn, "amplify", amplify_name)
        log.info("Amplify: %s", amplify_arn)
    except Exception as exc:
        log.error("Amplify creation failed: %s", exc)

    # ── CodeArtifact domain ───────────────────────────────────────────────────
    ca_domain_name = prefix("ca-domain").replace("-", "")[:50]
    ca_domain_arn = None
    try:
        resp = codeartifact.create_domain(
            domain=ca_domain_name,
            tags=tags,
        )
        ca_domain_arn = resp["domain"]["arn"]
        rec(ca_domain_arn, "codeartifact", ca_domain_name, taggable=False)
        log.info("CodeArtifact domain: %s", ca_domain_arn)
    except Exception as exc:
        log.error("CodeArtifact domain creation failed: %s", exc)

    # ── CodeArtifact repository ───────────────────────────────────────────────
    if ca_domain_arn:
        ca_repo_name = prefix("ca-repo")
        try:
            resp = codeartifact.create_repository(
                domain=ca_domain_name,
                repository=ca_repo_name,
                tags=tags,
            )
            ca_repo_arn = resp["repository"]["arn"]
            rec(ca_repo_arn, "codeartifact", ca_repo_name)
            log.info("CodeArtifact repo: %s", ca_repo_arn)
        except Exception as exc:
            log.error("CodeArtifact repo creation failed: %s", exc)

    # ── CodeGuru Profiler ─────────────────────────────────────────────────────
    cg_name = prefix("codeguru")
    try:
        resp = codeguru.create_profiling_group(
            profilingGroupName=cg_name,
            tags=tags_dict,
        )
        cg_arn = resp["profilingGroup"]["arn"]
        rec(cg_arn, "codeguru-profiler", cg_name)
        log.info("CodeGuru Profiler: %s", cg_arn)
    except Exception as exc:
        log.error("CodeGuru Profiler creation failed: %s", exc)

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
                    "Tags": [{"Key": TAG_KEY, "Value": tag_value}],
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
            PolicyArn="arn:aws:iam::aws:policy/service-role/AWSCodeDeployRole",
        )
        time.sleep(10)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("CodeDeploy role: %s", exc)
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
