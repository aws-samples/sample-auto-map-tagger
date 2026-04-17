"""
global_us_east_1.py — Creates global resources that must exist in us-east-1.

Creates (all in us-east-1):
  - S3 bucket (CloudFront origin)
  - CloudFront distribution (no wait)
  - Route53 hosted zone
  - Route53 health check
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
REGION = "us-east-1"


def create(
    region: str,
    pr_number: str,
    timestamp: str,
    tag_value: str,
    **_kwargs,
) -> dict:
    # Always use us-east-1 regardless of passed region
    account = get_account_id()
    arns: list[dict] = []
    prefix = lambda svc: resource_name(pr_number, timestamp, svc)
    tags = [{"Key": PRE_TAG_KEY, "Value": tag_value}]
    tags_dict = {PRE_TAG_KEY: tag_value}

    s3 = boto3.client("s3", region_name=REGION)
    cloudfront = boto3.client("cloudfront", region_name=REGION)
    route53 = boto3.client("route53")

    def rec(arn, service, resource_id, taggable=True):
        arns.append(make_record(
            arn=arn, service=service, region=REGION, account=account,
            resource_id=resource_id, tag_key=EXPECTED_TAG_KEY, tag_value=tag_value,
            taggable=taggable,
        ))

    # ── S3 bucket (CloudFront origin) ─────────────────────────────────────────
    cf_bucket_name = f"e2e-pr{pr_number}-{timestamp}-cf-origin-{account}"[:63].lower()
    cf_bucket_domain = None
    try:
        s3.create_bucket(Bucket=cf_bucket_name)
        s3.put_bucket_tagging(Bucket=cf_bucket_name, Tagging={"TagSet": tags})
        cf_bucket_domain = f"{cf_bucket_name}.s3.amazonaws.com"
        s3_arn = f"arn:aws:s3:::{cf_bucket_name}"
        rec(s3_arn, "s3", cf_bucket_name, taggable=False)
        log.info("S3 origin bucket: %s", cf_bucket_name)
    except Exception as exc:
        log.error("S3 origin bucket failed: %s", exc)

    # ── CloudFront distribution ───────────────────────────────────────────────
    if cf_bucket_domain:
        try:
            cf_config = {
                "CallerReference": f"e2e-pr{pr_number}-{timestamp}",
                "Comment": "E2E test CloudFront distribution",
                "DefaultCacheBehavior": {
                    "TargetOriginId": "s3-origin",
                    "ViewerProtocolPolicy": "redirect-to-https",
                    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",  # Managed-CachingOptimized
                    "Compress": True,
                    "AllowedMethods": {
                        "Quantity": 2,
                        "Items": ["GET", "HEAD"],
                        "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]},
                    },
                },
                "Origins": {
                    "Quantity": 1,
                    "Items": [{
                        "Id": "s3-origin",
                        "DomainName": cf_bucket_domain,
                        "S3OriginConfig": {"OriginAccessIdentity": ""},
                    }],
                },
                "Enabled": True,
                "PriceClass": "PriceClass_100",
            }
            resp = cloudfront.create_distribution_with_tags(
                DistributionConfigWithTags={
                    "DistributionConfig": cf_config,
                    "Tags": {"Items": tags},
                }
            )
            dist_arn = resp["Distribution"]["ARN"]
            dist_id = resp["Distribution"]["Id"]
            rec(dist_arn, "cloudfront", dist_id)
            log.info("CloudFront: %s (not waiting for deployed)", dist_arn)
        except Exception as exc:
            log.error("CloudFront distribution creation failed: %s", exc)

    # ── Route53 hosted zone ───────────────────────────────────────────────────
    hz_id = None
    try:
        resp = route53.create_hosted_zone(
            Name=f"e2e-pr{pr_number}-{timestamp}-test.com",
            CallerReference=f"e2e-pr{pr_number}-{timestamp}",
            HostedZoneConfig={"Comment": "E2E test hosted zone", "PrivateZone": False},
        )
        hz_id = resp["HostedZone"]["Id"].split("/")[-1]
        hz_arn = f"arn:aws:route53:::hostedzone/{hz_id}"
        safe_call(
            route53.change_tags_for_resource,
            ResourceType="hostedzone",
            ResourceId=hz_id,
            AddTags=tags,
        )
        rec(hz_arn, "route53", hz_id)
        log.info("Route53 hosted zone: %s", hz_id)
    except Exception as exc:
        log.error("Route53 hosted zone creation failed: %s", exc)

    # ── Route53 health check ──────────────────────────────────────────────────
    try:
        resp = route53.create_health_check(
            CallerReference=f"e2e-pr{pr_number}-{timestamp}-hc",
            HealthCheckConfig={
                "IPAddress": "1.2.3.4",
                "Port": 80,
                "Type": "HTTP",
                "ResourcePath": "/",
                "RequestInterval": 30,
                "FailureThreshold": 3,
            },
        )
        hc_id = resp["HealthCheck"]["Id"]
        hc_arn = f"arn:aws:route53:::healthcheck/{hc_id}"
        safe_call(
            route53.change_tags_for_resource,
            ResourceType="healthcheck",
            ResourceId=hc_id,
            AddTags=tags,
        )
        rec(hc_arn, "route53", hc_id)
        log.info("Route53 health check: %s", hc_id)
    except Exception as exc:
        log.error("Route53 health check creation failed: %s", exc)


    return {"arns": arns, "outputs": {}}
