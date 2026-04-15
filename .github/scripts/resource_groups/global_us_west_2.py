"""
global_us_west_2.py — Creates global resources that must exist in us-west-2.

Creates (all in us-west-2):
  - Global Accelerator accelerator (no wait)
"""

from __future__ import annotations

import logging

import boto3

from ._common import get_account_id, make_record, resource_name, safe_call

log = logging.getLogger(__name__)
TAG_KEY = "map-migrated"
REGION = "us-west-2"


def create(
    region: str,
    pr_number: str,
    timestamp: str,
    tag_value: str,
    **_kwargs,
) -> dict:
    # Global Accelerator API endpoint lives in us-west-2
    account = get_account_id()
    arns: list[dict] = []
    prefix = lambda svc: resource_name(pr_number, timestamp, svc)
    tags = [{"Key": TAG_KEY, "Value": tag_value}]

    ga = boto3.client("globalaccelerator", region_name=REGION)

    def rec(arn, service, resource_id, taggable=True):
        arns.append(make_record(
            arn=arn, service=service, region=REGION, account=account,
            resource_id=resource_id, tag_key=TAG_KEY, tag_value=tag_value,
            taggable=taggable,
        ))

    # ── Global Accelerator accelerator ────────────────────────────────────────
    ga_name = prefix("ga")
    try:
        resp = ga.create_accelerator(
            Name=ga_name,
            IpAddressType="IPV4",
            Enabled=True,
            Tags=tags,
        )
        ga_arn = resp["Accelerator"]["AcceleratorArn"]
        rec(ga_arn, "globalaccelerator", ga_name)
        log.info("Global Accelerator: %s (not waiting)", ga_arn)
    except Exception as exc:
        log.error("Global Accelerator creation failed: %s", exc)

    return {"arns": arns, "outputs": {}}
