"""
multiaccount_linked.py — Creates representative resources in a linked account.

Takes --account-index 1..5. Each linked account creates:
  - S3 bucket
  - Lambda function
  - DynamoDB table
  - SNS topic
  - SQS queue
  - EC2 security group (uses default VPC)
  - CloudWatch log group
  - SSM parameter
  - KMS key
  - IAM role

The caller (create_resources.py dispatcher / GitHub Actions) is responsible
for assuming the correct cross-account role before calling this module.
"""

from __future__ import annotations

import io
import json
import logging
import time
import zipfile

import boto3

from ._common import get_account_id, make_record, resource_name, safe_call

log = logging.getLogger(__name__)
TAG_KEY = "map-migrated"


def create(
    region: str,
    pr_number: str,
    timestamp: str,
    tag_value: str,
    account_index: int = 1,
    **_kwargs,
) -> dict:
    account = get_account_id()
    arns: list[dict] = []
    # Include account_index in the prefix so names are unique across accounts
    prefix = lambda svc: resource_name(pr_number, timestamp, f"linked{account_index}-{svc}")
    tags = [{"Key": TAG_KEY, "Value": tag_value}]
    tags_dict = {TAG_KEY: tag_value}

    s3 = boto3.client("s3", region_name=region)
    lambda_client = boto3.client("lambda", region_name=region)
    dynamodb = boto3.client("dynamodb", region_name=region)
    sns = boto3.client("sns", region_name=region)
    sqs = boto3.client("sqs", region_name=region)
    ec2 = boto3.client("ec2", region_name=region)
    logs_client = boto3.client("logs", region_name=region)
    ssm = boto3.client("ssm", region_name=region)
    kms = boto3.client("kms", region_name=region)
    iam = boto3.client("iam")

    def rec(arn, service, resource_id, taggable=True):
        arns.append(make_record(
            arn=arn, service=service, region=region, account=account,
            resource_id=resource_id, tag_key=TAG_KEY, tag_value=tag_value,
            taggable=taggable,
        ))

    # ── S3 bucket ─────────────────────────────────────────────────────────────
    bucket_name = f"e2e-pr{pr_number}-{timestamp}-linked{account_index}-{account}"[:63].lower()
    try:
        if region == "us-east-1":
            s3.create_bucket(Bucket=bucket_name)
        else:
            s3.create_bucket(
                Bucket=bucket_name,
                CreateBucketConfiguration={"LocationConstraint": region},
            )
        s3.put_bucket_tagging(Bucket=bucket_name, Tagging={"TagSet": tags})
        rec(f"arn:aws:s3:::{bucket_name}", "s3", bucket_name)
        log.info("S3: %s", bucket_name)
    except Exception as exc:
        log.error("S3 creation failed: %s", exc)

    # ── Lambda function ───────────────────────────────────────────────────────
    lambda_name = prefix("lambda")
    lambda_role_arn = _ensure_lambda_role(iam, account, prefix("lambda-role"))
    try:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("index.py", "def handler(e,c): return {'statusCode':200}\n")
        resp = lambda_client.create_function(
            FunctionName=lambda_name,
            Runtime="python3.12",
            Role=lambda_role_arn,
            Handler="index.handler",
            Code={"ZipFile": buf.getvalue()},
            Tags=tags_dict,
        )
        rec(resp["FunctionArn"], "lambda", lambda_name)
        log.info("Lambda: %s", lambda_name)
    except Exception as exc:
        log.error("Lambda creation failed: %s", exc)

    # ── DynamoDB table ────────────────────────────────────────────────────────
    ddb_name = prefix("dynamodb")
    try:
        resp = dynamodb.create_table(
            TableName=ddb_name,
            AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}],
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
            BillingMode="PAY_PER_REQUEST",
            Tags=tags,
        )
        rec(resp["TableDescription"]["TableArn"], "dynamodb", ddb_name)
        log.info("DynamoDB: %s", ddb_name)
    except Exception as exc:
        log.error("DynamoDB creation failed: %s", exc)

    # ── SNS topic ─────────────────────────────────────────────────────────────
    sns_name = prefix("sns")
    try:
        resp = sns.create_topic(Name=sns_name, Tags=tags)
        rec(resp["TopicArn"], "sns", sns_name)
        log.info("SNS: %s", sns_name)
    except Exception as exc:
        log.error("SNS creation failed: %s", exc)

    # ── SQS queue ─────────────────────────────────────────────────────────────
    sqs_name = prefix("sqs")
    try:
        resp = sqs.create_queue(QueueName=sqs_name, tags=tags_dict)
        sqs_url = resp["QueueUrl"]
        attrs = sqs.get_queue_attributes(QueueUrl=sqs_url, AttributeNames=["QueueArn"])
        rec(attrs["Attributes"]["QueueArn"], "sqs", sqs_name)
        log.info("SQS: %s", sqs_name)
    except Exception as exc:
        log.error("SQS creation failed: %s", exc)

    # ── EC2 security group (default VPC) ──────────────────────────────────────
    sg_name = prefix("sg")
    try:
        # Find default VPC
        vpcs = ec2.describe_vpcs(Filters=[{"Name": "isDefault", "Values": ["true"]}])
        default_vpc_id = vpcs["Vpcs"][0]["VpcId"] if vpcs["Vpcs"] else None

        sg_kwargs: dict = {
            "GroupName": sg_name,
            "Description": f"E2E test SG for linked account {account_index}",
            "TagSpecifications": [{
                "ResourceType": "security-group",
                "Tags": tags,
            }],
        }
        if default_vpc_id:
            sg_kwargs["VpcId"] = default_vpc_id

        resp = ec2.create_security_group(**sg_kwargs)
        sg_id = resp["GroupId"]
        rec(f"arn:aws:ec2:{region}:{account}:security-group/{sg_id}", "ec2", sg_id)
        log.info("Security group: %s", sg_id)
    except Exception as exc:
        log.error("Security group creation failed: %s", exc)

    # ── CloudWatch log group ──────────────────────────────────────────────────
    log_group_name = f"/e2e/{prefix('logs')}"
    try:
        logs_client.create_log_group(logGroupName=log_group_name)
        logs_client.tag_log_group(logGroupName=log_group_name, tags=tags_dict)
        rec(
            f"arn:aws:logs:{region}:{account}:log-group:{log_group_name}",
            "logs", log_group_name,
        )
        log.info("Log group: %s", log_group_name)
    except Exception as exc:
        log.error("Log group creation failed: %s", exc)

    # ── SSM parameter ─────────────────────────────────────────────────────────
    param_name = f"/e2e/{prefix('ssm')}"
    try:
        ssm.put_parameter(
            Name=param_name,
            Value=f"e2e-linked{account_index}-value",
            Type="String",
            Tags=tags,
        )
        rec(
            f"arn:aws:ssm:{region}:{account}:parameter{param_name}",
            "ssm", param_name,
        )
        log.info("SSM parameter: %s", param_name)
    except Exception as exc:
        log.error("SSM parameter creation failed: %s", exc)

    # ── KMS key ───────────────────────────────────────────────────────────────
    try:
        resp = kms.create_key(
            Description=f"E2E test KMS key for linked account {account_index}",
            Tags=[{"TagKey": TAG_KEY, "TagValue": tag_value}],
        )
        rec(resp["KeyMetadata"]["KeyArn"], "kms", resp["KeyMetadata"]["KeyId"])
        log.info("KMS key: %s", resp["KeyMetadata"]["KeyId"])
    except Exception as exc:
        log.error("KMS key creation failed: %s", exc)

    # ── IAM role ──────────────────────────────────────────────────────────────
    iam_role_name = prefix("iam-role")
    try:
        trust = json.dumps({
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "ec2.amazonaws.com"},
                "Action": "sts:AssumeRole",
            }],
        })
        resp = iam.create_role(
            RoleName=iam_role_name,
            AssumeRolePolicyDocument=trust,
            Tags=tags,
        )
        iam.attach_role_policy(
            RoleName=iam_role_name,
            PolicyArn="arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
        )
        rec(resp["Role"]["Arn"], "iam", iam_role_name, taggable=False)
        log.info("IAM role: %s", iam_role_name)
    except Exception as exc:
        log.error("IAM role creation failed: %s", exc)

    return {"arns": arns, "outputs": {}}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_lambda_role(iam_client, account: str, role_name: str) -> str:
    trust = json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "lambda.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    })
    try:
        resp = iam_client.create_role(RoleName=role_name, AssumeRolePolicyDocument=trust)
        iam_client.attach_role_policy(
            RoleName=role_name,
            PolicyArn="arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        )
        time.sleep(10)
        return resp["Role"]["Arn"]
    except iam_client.exceptions.EntityAlreadyExistsException:
        return f"arn:aws:iam::{account}:role/{role_name}"
    except Exception as exc:
        log.warning("Lambda role: %s", exc)
        return f"arn:aws:iam::{account}:role/{role_name}"
