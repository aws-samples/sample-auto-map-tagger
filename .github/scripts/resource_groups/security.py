"""
security.py — Creates security and compliance resources for E2E tests.

Creates:
  - KMS key
  - ACM certificate (example.com, DNS validation — no wait)
  - Cognito User Pool
  - Cognito Identity Pool
  - IAM role (S3 read policy)
  - Secrets Manager secret
  - CloudWatch alarm
  - SSM parameter
  - AWS Backup vault + plan
  - AWS RAM resource share
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

    kms = boto3.client("kms", region_name=region)
    acm = boto3.client("acm", region_name=region)
    cognito_idp = boto3.client("cognito-idp", region_name=region)
    cognito_identity = boto3.client("cognito-identity", region_name=region)
    iam = boto3.client("iam")
    secretsmanager = boto3.client("secretsmanager", region_name=region)
    cloudwatch = boto3.client("cloudwatch", region_name=region)
    ssm = boto3.client("ssm", region_name=region)
    backup = boto3.client("backup", region_name=region)
    ram = boto3.client("ram", region_name=region)
    wafv2 = boto3.client("wafv2", region_name=region)

    def rec(arn, service, resource_id, taggable=True):
        arns.append(make_record(
            arn=arn, service=service, region=region, account=account,
            resource_id=resource_id, tag_key=EXPECTED_TAG_KEY, tag_value=tag_value,
            taggable=taggable,
        ))

    # ── KMS key ───────────────────────────────────────────────────────────────
    kms_key_arn = None
    try:
        resp = kms.create_key(
            Description=f"E2E test KMS key {prefix('kms')}",
            Tags=[{"TagKey": PRE_TAG_KEY, "TagValue": tag_value}],
        )
        kms_key_arn = resp["KeyMetadata"]["KeyArn"]
        kms_key_id = resp["KeyMetadata"]["KeyId"]
        rec(kms_key_arn, "kms", kms_key_id)
        log.info("KMS key: %s", kms_key_arn)
    except Exception as exc:
        log.error("KMS key creation failed: %s", exc)

    # ── ACM certificate ───────────────────────────────────────────────────────
    try:
        resp = acm.request_certificate(
            DomainName="example-e2e-test.com",
            ValidationMethod="DNS",
            Tags=tags,
        )
        cert_arn = resp["CertificateArn"]
        rec(cert_arn, "acm", cert_arn.split("/")[-1])
        log.info("ACM cert: %s", cert_arn)
    except Exception as exc:
        log.error("ACM certificate creation failed: %s", exc)

    # ── Cognito User Pool ─────────────────────────────────────────────────────
    user_pool_id = None
    try:
        resp = cognito_idp.create_user_pool(
            PoolName=prefix("cognito-up"),
            UserPoolTags=tags_dict,
        )
        user_pool_id = resp["UserPool"]["Id"]
        up_arn = resp["UserPool"]["Arn"]
        rec(up_arn, "cognito-idp", user_pool_id)
        log.info("Cognito User Pool: %s", user_pool_id)
    except Exception as exc:
        log.error("Cognito User Pool creation failed: %s", exc)

    # ── Cognito Identity Pool ─────────────────────────────────────────────────
    try:
        cognito_kwargs: dict = {
            "IdentityPoolName": prefix("cognito-ip").replace("-", "_"),
            "AllowUnauthenticatedIdentities": False,
        }
        if user_pool_id:
            # Create an app client first
            try:
                ac_resp = cognito_idp.create_user_pool_client(
                    UserPoolId=user_pool_id,
                    ClientName="e2e-identity-pool",
                    GenerateSecret=False,
                )
                client_id = ac_resp["UserPoolClient"]["ClientId"]
                cognito_kwargs["CognitoIdentityProviders"] = [{
                    "ProviderName": f"cognito-idp.{region}.amazonaws.com/{user_pool_id}",
                    "ClientId": client_id,
                }]
            except Exception as exc:
                log.warning("Cognito app client: %s", exc)

        resp = cognito_identity.create_identity_pool(**cognito_kwargs)
        identity_pool_id = resp["IdentityPoolId"]
        ip_arn = f"arn:aws:cognito-identity:{region}:{account}:identitypool/{identity_pool_id}"
        cognito_identity.tag_resource(ResourceArn=ip_arn, Tags=tags_dict)
        rec(ip_arn, "cognito-identity", identity_pool_id)
        log.info("Cognito Identity Pool: %s", identity_pool_id)
    except Exception as exc:
        log.error("Cognito Identity Pool creation failed: %s", exc)

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
        iam_role_arn = resp["Role"]["Arn"]
        iam.attach_role_policy(
            RoleName=iam_role_name,
            PolicyArn="arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
        )
        rec(iam_role_arn, "iam", iam_role_name, taggable=False)
        log.info("IAM role: %s", iam_role_arn)
    except Exception as exc:
        log.error("IAM role creation failed: %s", exc)

    # ── Secrets Manager secret ────────────────────────────────────────────────
    secret_name = prefix("secret")
    try:
        resp = secretsmanager.create_secret(
            Name=secret_name,
            SecretString=json.dumps({"test-key": "test-value"}),
            Tags=tags,
        )
        secret_arn = resp["ARN"]
        rec(secret_arn, "secretsmanager", secret_name)
        log.info("Secret: %s", secret_arn)
    except Exception as exc:
        log.error("Secrets Manager creation failed: %s", exc)

    # ── CloudWatch alarm ──────────────────────────────────────────────────────
    alarm_name = prefix("cw-alarm")
    try:
        cloudwatch.put_metric_alarm(
            AlarmName=alarm_name,
            MetricName="CPUUtilization",
            Namespace="AWS/EC2",
            Statistic="Average",
            Period=300,
            EvaluationPeriods=1,
            Threshold=90.0,
            ComparisonOperator="GreaterThanThreshold",
            TreatMissingData="notBreaching",
            Tags=tags,
        )
        alarm_arn = f"arn:aws:cloudwatch:{region}:{account}:alarm:{alarm_name}"
        rec(alarm_arn, "cloudwatch", alarm_name)
        log.info("CloudWatch alarm: %s", alarm_name)
    except Exception as exc:
        log.error("CloudWatch alarm creation failed: %s", exc)

    # ── SSM parameter ─────────────────────────────────────────────────────────
    param_name = f"/e2e/{prefix('ssm')}"
    try:
        ssm.put_parameter(
            Name=param_name,
            Value="e2e-test-value",
            Type="String",
            Tags=tags,
        )
        param_arn = f"arn:aws:ssm:{region}:{account}:parameter{param_name}"
        rec(param_arn, "ssm", param_name)
        log.info("SSM parameter: %s", param_name)
    except Exception as exc:
        log.error("SSM parameter creation failed: %s", exc)

    # ── AWS Backup vault ──────────────────────────────────────────────────────
    vault_name = prefix("backup-vault")
    vault_arn = None
    try:
        resp = backup.create_backup_vault(
            BackupVaultName=vault_name,
            BackupVaultTags=tags_dict,
        )
        vault_arn = resp["BackupVaultArn"]
        rec(vault_arn, "backup", vault_name)
        log.info("Backup vault: %s", vault_arn)
    except Exception as exc:
        log.error("Backup vault creation failed: %s", exc)

    # ── AWS Backup plan ───────────────────────────────────────────────────────
    if vault_arn:
        plan_name = prefix("backup-plan")
        try:
            resp = backup.create_backup_plan(
                BackupPlan={
                    "BackupPlanName": plan_name,
                    "Rules": [{
                        "RuleName": "daily",
                        "TargetBackupVaultName": vault_name,
                        "ScheduleExpression": "cron(0 5 ? * * *)",
                        "Lifecycle": {"DeleteAfterDays": 7},
                    }],
                },
                BackupPlanTags=tags_dict,
            )
            plan_arn = resp["BackupPlanArn"]
            rec(plan_arn, "backup", plan_name)
            log.info("Backup plan: %s", plan_arn)
        except Exception as exc:
            log.error("Backup plan creation failed: %s", exc)

    # ── WAFv2 IPSet + WebACL (REGIONAL scope) ─────────────────────────────────
    # CloudTrail events: CreateIPSet, CreateWebACL (source wafv2.amazonaws.com).
    # REGIONAL scope (not CLOUDFRONT) so these can be created in ap-northeast-2
    # without routing through us-east-1. Tagging goes via RGTA.
    ipset_name = prefix("ipset")[:128]
    try:
        resp = wafv2.create_ip_set(
            Name=ipset_name,
            Scope="REGIONAL",
            Description="E2E test IPSet",
            IPAddressVersion="IPV4",
            Addresses=["10.0.0.0/32"],
            Tags=tags,
        )
        ipset_arn = resp["Summary"]["ARN"]
        rec(ipset_arn, "wafv2", ipset_arn.split("/")[-1])
        log.info("WAFv2 IPSet: %s", ipset_arn)
    except Exception as exc:
        log.error("WAFv2 IPSet creation failed: %s", exc)

    webacl_name = prefix("webacl")[:128]
    try:
        resp = wafv2.create_web_acl(
            Name=webacl_name,
            Scope="REGIONAL",
            DefaultAction={"Allow": {}},
            Description="E2E test WebACL",
            Rules=[],
            VisibilityConfig={
                "SampledRequestsEnabled": False,
                "CloudWatchMetricsEnabled": False,
                "MetricName": webacl_name.replace("-", "_")[:128],
            },
            Tags=tags,
        )
        webacl_arn = resp["Summary"]["ARN"]
        rec(webacl_arn, "wafv2", webacl_arn.split("/")[-1])
        log.info("WAFv2 WebACL: %s", webacl_arn)
    except Exception as exc:
        log.error("WAFv2 WebACL creation failed: %s", exc)

    # ── AWS RAM resource share ────────────────────────────────────────────────
    ram_name = prefix("ram-share")
    try:
        resp = ram.create_resource_share(
            name=ram_name,
            allowExternalPrincipals=False,
            tags=tags,
        )
        ram_arn = resp["resourceShare"]["resourceShareArn"]
        rec(ram_arn, "ram", ram_name)
        log.info("RAM resource share: %s", ram_arn)
    except Exception as exc:
        log.error("RAM resource share creation failed: %s", exc)


    return {"arns": arns, "outputs": {}}
