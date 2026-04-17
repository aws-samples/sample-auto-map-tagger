"""
analytics.py — Creates analytics and data-processing resources for E2E tests.

Creates:
  - Kinesis Data Stream
  - Kinesis Firehose (S3 destination)
  - Kinesis Video Stream
  - Glue database
  - Glue crawler (S3 target)
  - Glue job (Python shell)
  - Athena workgroup
  - EMR cluster (1 master + 2 core, in VPC or default)
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
    vpc_id: str = "",
    subnet_ids: list[str] | None = None,
    sg_id: str = "",
    **_kwargs,
) -> dict:
    account = get_account_id()
    arns: list[dict] = []
    prefix = lambda svc: resource_name(pr_number, timestamp, svc)
    subnets = subnet_ids or []
    tags = [{"Key": PRE_TAG_KEY, "Value": tag_value}]

    kinesis = boto3.client("kinesis", region_name=region)
    firehose = boto3.client("firehose", region_name=region)
    kvs = boto3.client("kinesisvideo", region_name=region)
    glue = boto3.client("glue", region_name=region)
    athena = boto3.client("athena", region_name=region)
    s3 = boto3.client("s3", region_name=region)
    emr = boto3.client("emr", region_name=region)
    iam = boto3.client("iam")

    def rec(arn, service, resource_id, taggable=True):
        arns.append(make_record(
            arn=arn, service=service, region=region, account=account,
            resource_id=resource_id, tag_key=EXPECTED_TAG_KEY, tag_value=tag_value,
            taggable=taggable,
        ))

    # ── S3 bucket (prerequisite for Firehose and others) ─────────────────────
    bucket_name = f"e2e-pr{pr_number}-{timestamp}-analytics-{account}"
    bucket_name = bucket_name[:63].lower()
    s3_bucket_arn = None
    try:
        if region == "us-east-1":
            s3.create_bucket(Bucket=bucket_name)
        else:
            s3.create_bucket(
                Bucket=bucket_name,
                CreateBucketConfiguration={"LocationConstraint": region},
            )
        s3.put_bucket_tagging(
            Bucket=bucket_name,
            Tagging={"TagSet": tags},
        )
        s3_bucket_arn = f"arn:aws:s3:::{bucket_name}"
        rec(s3_bucket_arn, "s3", bucket_name, taggable=False)
        log.info("S3 bucket: %s", bucket_name)
    except Exception as exc:
        log.error("S3 bucket creation failed: %s", exc)

    # ── Kinesis Data Stream ───────────────────────────────────────────────────
    stream_name = prefix("kinesis")
    try:
        kinesis.create_stream(StreamName=stream_name, ShardCount=1)
        kinesis.add_tags_to_stream(StreamName=stream_name, Tags={PRE_TAG_KEY: tag_value})
        stream_arn = f"arn:aws:kinesis:{region}:{account}:stream/{stream_name}"
        rec(stream_arn, "kinesis", stream_name)
        log.info("Kinesis stream: %s", stream_name)
    except Exception as exc:
        log.error("Kinesis Data Stream creation failed: %s", exc)

    # ── Kinesis Firehose ──────────────────────────────────────────────────────
    firehose_name = prefix("firehose")
    if s3_bucket_arn:
        try:
            firehose_role_arn = _ensure_firehose_role(iam, account, prefix("firehose-role"), bucket_name)
            resp = firehose.create_delivery_stream(
                DeliveryStreamName=firehose_name,
                DeliveryStreamType="DirectPut",
                S3DestinationConfiguration={
                    "RoleARN": firehose_role_arn,
                    "BucketARN": s3_bucket_arn,
                    "Prefix": "firehose/",
                    "BufferingHints": {"SizeInMBs": 5, "IntervalInSeconds": 300},
                },
                Tags=tags,
            )
            fh_arn = resp["DeliveryStreamARN"]
            rec(fh_arn, "firehose", firehose_name)
            log.info("Firehose: %s", fh_arn)
        except Exception as exc:
            log.error("Firehose creation failed: %s", exc)

    # ── Kinesis Video Stream ──────────────────────────────────────────────────
    kvs_name = prefix("kvideo")
    try:
        resp = kvs.create_stream(
            StreamName=kvs_name,
            DataRetentionInHours=1,
            Tags={PRE_TAG_KEY: tag_value},
        )
        kvs_arn = resp["StreamARN"]
        rec(kvs_arn, "kinesisvideo", kvs_name)
        log.info("Kinesis Video Stream: %s", kvs_arn)
    except Exception as exc:
        log.error("Kinesis Video Stream creation failed: %s", exc)

    # ── Glue database ─────────────────────────────────────────────────────────
    glue_db_name = prefix("gluedb").replace("-", "_")
    try:
        glue.create_database(
            DatabaseInput={
                "Name": glue_db_name,
                "Description": "E2E test Glue database",
            }
        )
        glue_db_arn = f"arn:aws:glue:{region}:{account}:database/{glue_db_name}"
        rec(glue_db_arn, "glue", glue_db_name)
        log.info("Glue database: %s", glue_db_name)
    except Exception as exc:
        log.error("Glue database creation failed: %s", exc)

    # ── Glue role (shared by crawler and job) ─────────────────────────────────
    glue_role_arn = _ensure_glue_role(iam, account, prefix("glue-role"))

    # ── Glue crawler ──────────────────────────────────────────────────────────
    glue_crawler_name = prefix("glue-crawl")
    if s3_bucket_arn:
        try:
            glue.create_crawler(
                Name=glue_crawler_name,
                Role=glue_role_arn,
                DatabaseName=glue_db_name,
                Targets={"S3Targets": [{"Path": f"s3://{bucket_name}/data/"}]},
                Tags={PRE_TAG_KEY: tag_value},
            )
            crawler_arn = f"arn:aws:glue:{region}:{account}:crawler/{glue_crawler_name}"
            rec(crawler_arn, "glue", glue_crawler_name)
            log.info("Glue crawler: %s", glue_crawler_name)
        except Exception as exc:
            log.error("Glue crawler creation failed: %s", exc)

    # ── Glue job ──────────────────────────────────────────────────────────────
    glue_job_name = prefix("glue-job")
    if s3_bucket_arn:
        try:
            # Upload a simple Python shell script to S3
            script_key = "glue-scripts/hello.py"
            script_body = "print('hello from glue e2e')\n"
            safe_call(
                s3.put_object,
                Bucket=bucket_name,
                Key=script_key,
                Body=script_body.encode(),
            )

            resp = glue.create_job(
                Name=glue_job_name,
                Role=glue_role_arn,
                Command={
                    "Name": "pythonshell",
                    "ScriptLocation": f"s3://{bucket_name}/{script_key}",
                    "PythonVersion": "3",
                },
                GlueVersion="3.0",
                MaxCapacity=0.0625,
                Tags={PRE_TAG_KEY: tag_value},
            )
            job_arn = f"arn:aws:glue:{region}:{account}:job/{glue_job_name}"
            rec(job_arn, "glue", glue_job_name)
            log.info("Glue job: %s", glue_job_name)
        except Exception as exc:
            log.error("Glue job creation failed: %s", exc)

    # ── Athena workgroup ──────────────────────────────────────────────────────
    athena_wg_name = prefix("athena")
    try:
        athena.create_work_group(
            Name=athena_wg_name,
            Configuration={
                "ResultConfiguration": {
                    "OutputLocation": f"s3://{bucket_name}/athena-results/",
                },
                "EnforceWorkGroupConfiguration": False,
            },
            Tags=tags,
        )
        athena_arn = f"arn:aws:athena:{region}:{account}:workgroup/{athena_wg_name}"
        rec(athena_arn, "athena", athena_wg_name)
        log.info("Athena workgroup: %s", athena_wg_name)
    except Exception as exc:
        log.error("Athena workgroup creation failed: %s", exc)

    # ── EMR cluster ───────────────────────────────────────────────────────────
    try:
        emr_role_arn = _ensure_emr_roles(iam, account, prefix("emr"))
        emr_kwargs: dict = {
            "Name": prefix("emr"),
            "ReleaseLabel": "emr-6.15.0",
            "Instances": {
                "MasterInstanceType": "m5.xlarge",
                "SlaveInstanceType": "m5.xlarge",
                "InstanceCount": 3,  # 1 master + 2 core
                "KeepJobFlowAliveWhenNoSteps": False,
            },
            "Applications": [{"Name": "Hadoop"}],
            "ServiceRole": emr_role_arn["service"],
            "JobFlowRole": emr_role_arn["ec2"],
            "Tags": tags,
            "LogUri": f"s3://{bucket_name}/emr-logs/",
        }
        if subnets:
            emr_kwargs["Instances"]["Ec2SubnetId"] = subnets[0]

        resp = emr.run_job_flow(**emr_kwargs)
        emr_cluster_id = resp["JobFlowId"]
        emr_arn = f"arn:aws:elasticmapreduce:{region}:{account}:cluster/{emr_cluster_id}"
        rec(emr_arn, "elasticmapreduce", emr_cluster_id)
        log.info("EMR cluster: %s", emr_cluster_id)
    except Exception as exc:
        log.error("EMR cluster creation failed: %s", exc)

    return {"arns": arns, "outputs": {}}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_firehose_role(iam_client, account: str, role_name: str, bucket_name: str) -> str:
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "firehose.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    policy = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": ["s3:PutObject", "s3:GetBucketLocation"],
            "Resource": [
                f"arn:aws:s3:::{bucket_name}",
                f"arn:aws:s3:::{bucket_name}/*",
            ],
        }],
    })
    try:
        resp = iam_client.create_role(RoleName=role_name, AssumeRolePolicyDocument=trust)
        iam_client.put_role_policy(RoleName=role_name, PolicyName="firehose-s3", PolicyDocument=policy)
        time.sleep(10)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("Firehose role: %s", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"


def _ensure_glue_role(iam_client, account: str, role_name: str) -> str:
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "glue.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    try:
        resp = iam_client.create_role(RoleName=role_name, AssumeRolePolicyDocument=trust)
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn="arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole",
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
        log.warning("Glue role: %s", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"


def _ensure_emr_roles(iam_client, account: str, name_prefix: str) -> dict:
    """Create EMR service role and EC2 instance profile. Returns {service, ec2}."""
    service_role_name = f"{name_prefix}-svc-role"
    ec2_role_name = f"{name_prefix}-ec2-role"
    profile_name = f"{name_prefix}-ec2-profile"

    # Service role
    service_trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "elasticmapreduce.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    try:
        iam_client.create_role(RoleName=service_role_name, AssumeRolePolicyDocument=service_trust)
        iam_client.attach_role_policy(
            RoleName=service_role_name,
            PolicyArn="arn:aws:iam::aws:policy/service-role/AmazonEMRServicePolicy_v2",
        )
    except iam_client.exceptions.EntityAlreadyExistsException:
        pass
    except Exception as exc:
        log.warning("EMR service role: %s", exc)

    # EC2 instance role + profile
    ec2_trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "ec2.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    try:
        iam_client.create_role(RoleName=ec2_role_name, AssumeRolePolicyDocument=ec2_trust)
        iam_client.attach_role_policy(
            RoleName=ec2_role_name,
            PolicyArn="arn:aws:iam::aws:policy/service-role/AmazonElasticMapReduceforEC2Role",
        )
    except iam_client.exceptions.EntityAlreadyExistsException:
        pass
    except Exception as exc:
        log.warning("EMR EC2 role: %s", exc)

    try:
        iam_client.create_instance_profile(InstanceProfileName=profile_name)
        iam_client.add_role_to_instance_profile(
            InstanceProfileName=profile_name, RoleName=ec2_role_name
        )
    except iam_client.exceptions.EntityAlreadyExistsException:
        pass
    except Exception as exc:
        log.warning("EMR instance profile: %s", exc)

    time.sleep(15)
    return {
        "service": service_role_name,
        "ec2": profile_name,
    }
