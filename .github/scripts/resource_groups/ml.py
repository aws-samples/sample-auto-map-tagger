"""
ml.py — Creates ML/AI resources for E2E tests.

Gracefully skips services not available in the target region.

Creates:
  - SageMaker notebook instance (no wait)
  - SageMaker model
  - SageMaker endpoint config
  - SageMaker endpoint (no wait)
  - SageMaker domain / Studio (no wait)
  - SageMaker pipeline
  - SageMaker feature group
  - Bedrock inference profile (APPLICATION type)
  - Bedrock agent
  - Bedrock guardrail
  - Comprehend document classifier (no wait)
  - HealthLake data store (no wait)
"""

from __future__ import annotations

import json
import logging
import time

import boto3
from botocore.exceptions import ClientError

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
    vpc_id: str = "",
    subnet_ids: list[str] | None = None,
    sg_id: str = "",
    **_kwargs,
) -> dict:
    account = get_account_id()
    arns: list[dict] = []
    prefix = lambda svc: resource_name(pr_number, timestamp, svc)
    tags = [{"Key": PRE_TAG_KEY, "Value": tag_value}]
    tags_dict = {PRE_TAG_KEY: tag_value}
    subnets = subnet_ids or []
    sgs = [sg_id] if sg_id else []

    iam = boto3.client("iam")
    sagemaker = boto3.client("sagemaker", region_name=region)

    def rec(arn, service, resource_id, taggable=True):
        arns.append(make_record(
            arn=arn, service=service, region=region, account=account,
            resource_id=resource_id, tag_key=EXPECTED_TAG_KEY, tag_value=tag_value,
            taggable=taggable,
        ))

    # ── SageMaker execution role ──────────────────────────────────────────────
    sm_role_arn = _ensure_sagemaker_role(iam, account, prefix("sm-role"))

    # ── SageMaker notebook instance ───────────────────────────────────────────
    nb_name = prefix("sm-nb")
    try:
        sm_kwargs: dict = {
            "NotebookInstanceName": nb_name,
            "InstanceType": "ml.t3.medium",
            "RoleArn": sm_role_arn,
            "Tags": tags,
        }
        if subnets:
            sm_kwargs["SubnetId"] = subnets[0]
        if sgs:
            sm_kwargs["SecurityGroupIds"] = sgs

        resp = sagemaker.create_notebook_instance(**sm_kwargs)
        nb_arn = resp["NotebookInstanceArn"]
        rec(nb_arn, "sagemaker", nb_name)
        log.info("SageMaker notebook: %s (not waiting)", nb_arn)
    except Exception as exc:
        log.error("SageMaker notebook creation failed: %s", exc)

    # ── SageMaker model ───────────────────────────────────────────────────────
    sm_model_name = prefix("sm-model")
    sm_model_arn = None
    try:
        # Use public sklearn container
        container_image = _get_sklearn_container(region)
        resp = sagemaker.create_model(
            ModelName=sm_model_name,
            ExecutionRoleArn=sm_role_arn,
            PrimaryContainer={
                "Image": container_image,
                "Environment": {"SAGEMAKER_PROGRAM": "inference.py"},
            },
            Tags=tags,
        )
        sm_model_arn = resp["ModelArn"]
        rec(sm_model_arn, "sagemaker", sm_model_name)
        log.info("SageMaker model: %s", sm_model_arn)
    except Exception as exc:
        log.error("SageMaker model creation failed: %s", exc)

    # ── SageMaker endpoint config ─────────────────────────────────────────────
    ec_name = prefix("sm-epc")
    ec_arn = None
    if sm_model_arn:
        try:
            resp = sagemaker.create_endpoint_config(
                EndpointConfigName=ec_name,
                ProductionVariants=[{
                    "VariantName": "default",
                    "ModelName": sm_model_name,
                    "InitialInstanceCount": 1,
                    "InstanceType": "ml.t2.medium",
                    "InitialVariantWeight": 1.0,
                }],
                Tags=tags,
            )
            ec_arn = resp["EndpointConfigArn"]
            rec(ec_arn, "sagemaker", ec_name)
            log.info("SageMaker endpoint config: %s", ec_arn)
        except Exception as exc:
            log.error("SageMaker endpoint config creation failed: %s", exc)

    # ── SageMaker endpoint ────────────────────────────────────────────────────
    ep_name = prefix("sm-ep")
    if ec_arn:
        try:
            resp = sagemaker.create_endpoint(
                EndpointName=ep_name,
                EndpointConfigName=ec_name,
                Tags=tags,
            )
            ep_arn = resp["EndpointArn"]
            rec(ep_arn, "sagemaker", ep_name)
            log.info("SageMaker endpoint: %s (not waiting)", ep_arn)
        except Exception as exc:
            log.error("SageMaker endpoint creation failed: %s", exc)

    # ── SageMaker domain (Studio) ─────────────────────────────────────────────
    sm_domain_name = prefix("sm-domain")
    if subnets and vpc_id:
        try:
            resp = sagemaker.create_domain(
                DomainName=sm_domain_name,
                AuthMode="IAM",
                DefaultUserSettings={
                    "ExecutionRole": sm_role_arn,
                },
                SubnetIds=subnets,
                VpcId=vpc_id,
                Tags=tags,
            )
            domain_arn = resp["DomainArn"]
            rec(domain_arn, "sagemaker", sm_domain_name)
            log.info("SageMaker domain: %s (not waiting)", domain_arn)
        except Exception as exc:
            log.error("SageMaker domain creation failed: %s", exc)

    # ── SageMaker pipeline ────────────────────────────────────────────────────
    sm_pipeline_name = prefix("sm-pipeline")
    try:
        pipeline_def = json.dumps({
            "Version": "2020-12-01",
            "Metadata": {},
            "Parameters": [],
            "Steps": [],
        })
        resp = sagemaker.create_pipeline(
            PipelineName=sm_pipeline_name,
            PipelineDefinition=pipeline_def,
            RoleArn=sm_role_arn,
            Tags=tags,
        )
        pipeline_arn = resp["PipelineArn"]
        rec(pipeline_arn, "sagemaker", sm_pipeline_name)
        log.info("SageMaker pipeline: %s", pipeline_arn)
    except Exception as exc:
        log.error("SageMaker pipeline creation failed: %s", exc)

    # ── SageMaker feature group ───────────────────────────────────────────────
    fg_name = prefix("sm-fg")
    try:
        resp = sagemaker.create_feature_group(
            FeatureGroupName=fg_name,
            RecordIdentifierFeatureName="record_id",
            EventTimeFeatureName="event_time",
            FeatureDefinitions=[
                {"FeatureName": "record_id", "FeatureType": "Integral"},
                {"FeatureName": "event_time", "FeatureType": "Fractional"},
                {"FeatureName": "value", "FeatureType": "String"},
            ],
            OnlineStoreConfig={"EnableOnlineStore": True},
            RoleArn=sm_role_arn,
            Tags=tags,
        )
        fg_arn = resp["FeatureGroupArn"]
        rec(fg_arn, "sagemaker", fg_name)
        log.info("SageMaker feature group: %s", fg_arn)
    except Exception as exc:
        log.error("SageMaker feature group creation failed: %s", exc)

    # ── Bedrock inference profile ─────────────────────────────────────────────
    try:
        bedrock = boto3.client("bedrock", region_name=region)
        profile_name = prefix("bedrock-profile")
        # Use Claude Sonnet as the model
        model_arn = (
            f"arn:aws:bedrock:{region}::foundation-model/"
            "anthropic.claude-3-sonnet-20240229-v1:0"
        )
        resp = bedrock.create_inference_profile(
            inferenceProfileName=profile_name,
            modelSource={"copyFrom": model_arn},
            type="APPLICATION",
            tags=tags,
        )
        profile_arn = resp["inferenceProfileArn"]
        rec(profile_arn, "bedrock", profile_name)
        log.info("Bedrock inference profile: %s", profile_arn)
    except Exception as exc:
        log.warning("Bedrock inference profile creation failed (may not be available): %s", exc)

    # ── Bedrock agent ─────────────────────────────────────────────────────────
    try:
        bedrock_agent = boto3.client("bedrock-agent", region_name=region)
        agent_name = prefix("bedrock-agent")
        resp = bedrock_agent.create_agent(
            agentName=agent_name,
            agentResourceRoleArn=sm_role_arn,
            foundationModel="anthropic.claude-3-sonnet-20240229-v1:0",
            description="E2E test Bedrock agent",
            tags=tags_dict,
        )
        agent_arn = resp["agent"]["agentArn"]
        rec(agent_arn, "bedrock", agent_name)
        log.info("Bedrock agent: %s", agent_arn)
    except Exception as exc:
        log.warning("Bedrock agent creation failed (may not be available): %s", exc)

    # ── Bedrock guardrail ─────────────────────────────────────────────────────
    try:
        bedrock = boto3.client("bedrock", region_name=region)
        grd_name = prefix("bedrock-grd")
        resp = bedrock.create_guardrail(
            name=grd_name,
            blockedInputMessaging="Input blocked by guardrail.",
            blockedOutputsMessaging="Output blocked by guardrail.",
            tags=tags,
        )
        grd_arn = resp["guardrailArn"]
        rec(grd_arn, "bedrock", grd_name)
        log.info("Bedrock guardrail: %s", grd_arn)
    except Exception as exc:
        log.warning("Bedrock guardrail creation failed (may not be available): %s", exc)

    # ── Comprehend document classifier ────────────────────────────────────────
    try:
        comprehend = boto3.client("comprehend", region_name=region)
        cls_name = prefix("comprehend")
        # Comprehend requires a training dataset — use a minimal S3 path placeholder.
        # The job will fail to train but the resource will still be created and tagged.
        resp = comprehend.create_document_classifier(
            DocumentClassifierName=cls_name,
            DataAccessRoleArn=sm_role_arn,
            InputDataConfig={
                "DataFormat": "COMPREHEND_CSV",
                "S3Uri": f"s3://aws-ml-platform-datasets/comprehend/e2e-placeholder/",
            },
            OutputDataConfig={
                "S3Uri": f"s3://aws-ml-platform-datasets/comprehend/e2e-output/",
            },
            LanguageCode="en",
            Tags=tags,
        )
        cls_arn = resp["DocumentClassifierArn"]
        rec(cls_arn, "comprehend", cls_name)
        log.info("Comprehend classifier: %s (not waiting)", cls_arn)
    except Exception as exc:
        log.warning("Comprehend classifier creation failed: %s", exc)

    # ── HealthLake data store ─────────────────────────────────────────────────
    try:
        healthlake = boto3.client("healthlake", region_name=region)
        hl_name = prefix("healthlake")
        resp = healthlake.create_fhir_datastore(
            DatastoreName=hl_name,
            DatastoreTypeVersion="R4",
            Tags=tags,
        )
        hl_arn = resp["DatastoreArn"] if "DatastoreArn" in resp else (
            f"arn:aws:healthlake:{region}:{account}:datastore/fhir/{resp.get('DatastoreId', '')}"
        )
        rec(hl_arn, "healthlake", hl_name)
        log.info("HealthLake: %s (not waiting)", hl_arn)
    except Exception as exc:
        log.warning("HealthLake creation failed (may not be available in region): %s", exc)

    return {"arns": arns, "outputs": {}}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_sagemaker_role(iam_client, account: str, role_name: str) -> str:
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": [
                "sagemaker.amazonaws.com",
                "bedrock.amazonaws.com",
                "comprehend.amazonaws.com",
            ]},
            "Action": "sts:AssumeRole",
        }],
    })
    try:
        resp = iam_client.create_role(RoleName=role_name, AssumeRolePolicyDocument=trust)
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn="arn:aws:iam::aws:policy/AmazonSageMakerFullAccess",
        )
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn="arn:aws:iam::aws:policy/AmazonS3FullAccess",
        )
        time.sleep(15)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("SageMaker role: %s", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"


def _get_sklearn_container(region: str) -> str:
    """Return a public sklearn inference container URI for the region."""
    # These are valid public SageMaker sklearn containers
    container_map = {
        "us-east-1": "683313688378.dkr.ecr.us-east-1.amazonaws.com/sagemaker-scikit-learn:1.2-1-cpu-py3",
        "us-west-2": "246618743249.dkr.ecr.us-west-2.amazonaws.com/sagemaker-scikit-learn:1.2-1-cpu-py3",
        "ap-northeast-2": "366743142698.dkr.ecr.ap-northeast-2.amazonaws.com/sagemaker-scikit-learn:1.2-1-cpu-py3",
    }
    return container_map.get(
        region,
        f"683313688378.dkr.ecr.us-east-1.amazonaws.com/sagemaker-scikit-learn:1.2-1-cpu-py3",
    )
