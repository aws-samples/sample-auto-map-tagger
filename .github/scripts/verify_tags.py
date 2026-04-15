#!/usr/bin/env python3
"""
verify_tags.py — Polls all E2E ARNs until the expected tag is present.

Usage:
    python3 verify_tags.py \
        --arns-dir artifacts/ \
        --tag-key map-migrated \
        --tag-value migTEST0000001 \
        --max-wait 900 \
        --poll-interval 30

Exit codes:
    0 — all taggable ARNs received the tag within the timeout
    1 — one or more taggable ARNs did NOT receive the tag
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import boto3
from botocore.exceptions import ClientError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Client caches (per-region and per-account-region)
# ---------------------------------------------------------------------------
_clients: dict[tuple, Any] = {}


def _client(service: str, region: str, account: str | None = None) -> Any:
    """Return a boto3 client, assuming cross-account role if account differs."""
    key = (service, region, account or "")
    if key in _clients:
        return _clients[key]

    current_account = _get_current_account()
    if account and account != current_account:
        session = _assume_role(account, region)
        c = session.client(service, region_name=region)
    else:
        c = boto3.client(service, region_name=region)

    _clients[key] = c
    return c


_current_account: str | None = None


def _get_current_account() -> str:
    global _current_account
    if _current_account is None:
        _current_account = boto3.client("sts").get_caller_identity()["Account"]
    return _current_account


_assumed_sessions: dict[str, boto3.Session] = {}


def _assume_role(account: str, region: str) -> boto3.Session:
    if account in _assumed_sessions:
        return _assumed_sessions[account]
    sts = boto3.client("sts")
    role_arn = f"arn:aws:iam::{account}:role/GitHubActionsE2ERole"
    try:
        creds = sts.assume_role(
            RoleArn=role_arn,
            RoleSessionName="e2e-verify-tags",
        )["Credentials"]
        session = boto3.Session(
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds["SessionToken"],
            region_name=region,
        )
        _assumed_sessions[account] = session
        return session
    except Exception as exc:
        log.warning("Could not assume role in account %s: %s — using default creds", account, exc)
        return boto3.Session(region_name=region)


# ---------------------------------------------------------------------------
# Tag-checking dispatch
# ---------------------------------------------------------------------------

def check_tag(record: dict, tag_key: str, tag_value: str) -> bool:
    """Return True if the resource has the expected tag."""
    arn: str = record["arn"]
    region: str = record.get("region", "ap-northeast-2")
    account: str = record.get("account", "")

    try:
        # ── S3 bucket ─────────────────────────────────────────────────────────
        if _is_s3(arn):
            return _check_s3(arn, tag_key, tag_value, account)

        # ── EC2 resources ─────────────────────────────────────────────────────
        if _is_ec2(arn):
            return _check_ec2(arn, tag_key, tag_value, region, account)

        # ── Kinesis Data Stream ───────────────────────────────────────────────
        if ":kinesis:" in arn and ":stream/" in arn:
            return _check_kinesis_stream(arn, tag_key, tag_value, region, account)

        # ── Firehose ──────────────────────────────────────────────────────────
        if ":firehose:" in arn or "delivery-stream/" in arn:
            return _check_firehose(arn, tag_key, tag_value, region, account)

        # ── SQS ───────────────────────────────────────────────────────────────
        if ":sqs:" in arn:
            return _check_sqs(arn, tag_key, tag_value, region, account)

        # ── Route53 ───────────────────────────────────────────────────────────
        if ":route53:::hostedzone/" in arn:
            return _check_route53_hz(arn, tag_key, tag_value, account)
        if ":route53:::healthcheck/" in arn:
            return _check_route53_hc(arn, tag_key, tag_value, account)

        # ── CloudFront ────────────────────────────────────────────────────────
        if ":cloudfront::" in arn:
            return _check_cloudfront(arn, tag_key, tag_value, account)

        # ── Global Accelerator ────────────────────────────────────────────────
        if ":globalaccelerator::" in arn:
            return _check_global_accelerator(arn, tag_key, tag_value)

        # ── CloudWatch Logs log group ─────────────────────────────────────────
        if ":log-group:" in arn:
            return _check_logs(arn, tag_key, tag_value, region, account)

        # ── Default: Resource Groups Tagging API ──────────────────────────────
        return _check_tagging_api(arn, tag_key, tag_value, region, account)

    except Exception as exc:
        log.debug("Tag check error for %s: %s", arn, exc)
        return False


# ---------------------------------------------------------------------------
# Per-service tag checkers
# ---------------------------------------------------------------------------

def _is_s3(arn: str) -> bool:
    """True if ARN is an S3 bucket (format: arn:aws:s3:::bucket-name)."""
    parts = arn.split(":")
    return len(parts) >= 6 and parts[2] == "s3" and parts[4] == "" and parts[5] != ""


def _check_s3(arn: str, key: str, value: str, account: str) -> bool:
    bucket = arn.split(":::")[-1]
    # S3 is global but we use us-east-1 as the default for the client
    region = "us-east-1"
    try:
        resp = _client("s3", region, account).get_bucket_tagging(Bucket=bucket)
        return any(t["Key"] == key and t["Value"] == value for t in resp.get("TagSet", []))
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "NoSuchTagSet":
            return False
        raise


def _is_ec2(arn: str) -> bool:
    ec2_resources = (
        ":instance/", ":volume/", ":snapshot/", ":image/", ":vpc/",
        ":subnet/", ":security-group/", ":internet-gateway/", ":route-table/",
        ":network-acl/", ":dhcp-options/", ":natgateway/", ":vpc-peering-connection/",
        ":transit-gateway/", ":vpc-endpoint/", ":vpc-flow-log/", ":vpn-gateway/",
        ":customer-gateway/", ":egress-only-internet-gateway/", ":network-interface/",
        ":placement-group/", ":launch-template/", ":key-pair/", ":elastic-ip/",
    )
    return ":ec2:" in arn and any(r in arn for r in ec2_resources)


def _check_ec2(arn: str, key: str, value: str, region: str, account: str) -> bool:
    # Extract resource ID from ARN
    resource_id = arn.split("/")[-1]
    ec2 = _client("ec2", region, account)
    resp = ec2.describe_tags(Filters=[
        {"Name": "resource-id", "Values": [resource_id]},
        {"Name": "key", "Values": [key]},
    ])
    return any(t["Value"] == value for t in resp.get("Tags", []))


def _check_kinesis_stream(arn: str, key: str, value: str, region: str, account: str) -> bool:
    stream_name = arn.split("/")[-1] if "/" in arn else arn.split("stream:")[-1]
    kinesis = _client("kinesis", region, account)
    resp = kinesis.list_tags_for_stream(StreamName=stream_name)
    return any(t["Key"] == key and t["Value"] == value for t in resp.get("Tags", []))


def _check_firehose(arn: str, key: str, value: str, region: str, account: str) -> bool:
    # ARN format: arn:aws:firehose:region:account:deliverystream/name
    name = arn.split("/")[-1]
    firehose = _client("firehose", region, account)
    resp = firehose.list_tags_for_delivery_stream(DeliveryStreamName=name)
    return any(t["Key"] == key and t["Value"] == value for t in resp.get("Tags", []))


def _check_sqs(arn: str, key: str, value: str, region: str, account: str) -> bool:
    # Reconstruct queue URL from ARN
    # ARN format: arn:aws:sqs:region:account:queue-name
    parts = arn.split(":")
    queue_name = parts[-1]
    queue_url = f"https://sqs.{region}.amazonaws.com/{account}/{queue_name}"
    sqs = _client("sqs", region, account)
    try:
        resp = sqs.list_queue_tags(QueueUrl=queue_url)
        tags = resp.get("Tags", {})
        return tags.get(key) == value
    except ClientError:
        return False


def _check_route53_hz(arn: str, key: str, value: str, account: str) -> bool:
    hz_id = arn.split("/")[-1]
    route53 = _client("route53", "us-east-1", account)
    resp = route53.list_tags_for_resource(ResourceType="hostedzone", ResourceId=hz_id)
    return any(t["Key"] == key and t["Value"] == value
               for t in resp.get("ResourceTagSet", {}).get("Tags", []))


def _check_route53_hc(arn: str, key: str, value: str, account: str) -> bool:
    hc_id = arn.split("/")[-1]
    route53 = _client("route53", "us-east-1", account)
    resp = route53.list_tags_for_resource(ResourceType="healthcheck", ResourceId=hc_id)
    return any(t["Key"] == key and t["Value"] == value
               for t in resp.get("ResourceTagSet", {}).get("Tags", []))


def _check_cloudfront(arn: str, key: str, value: str, account: str) -> bool:
    cf = _client("cloudfront", "us-east-1", account)
    resp = cf.list_tags_for_resource(Resource=arn)
    return any(t["Key"] == key and t["Value"] == value
               for t in resp.get("Tags", {}).get("Items", []))


def _check_global_accelerator(arn: str, key: str, value: str) -> bool:
    # Global Accelerator must use us-west-2
    ga = _client("globalaccelerator", "us-west-2")
    resp = ga.list_tags_for_resource(ResourceArn=arn)
    return any(t["Key"] == key and t["Value"] == value for t in resp.get("Tags", []))


def _check_logs(arn: str, key: str, value: str, region: str, account: str) -> bool:
    # ARN: arn:aws:logs:region:account:log-group:/path/to/group
    log_group_name = arn.split("log-group:", 1)[-1]
    logs = _client("logs", region, account)
    try:
        resp = logs.list_tags_log_group(logGroupName=log_group_name)
        tags = resp.get("tags", {})
        return tags.get(key) == value
    except ClientError:
        # Fall back to list_tags_for_resource
        try:
            resp = logs.list_tags_for_resource(resourceArn=arn)
            return any(t["key"] == key and t["value"] == value
                       for t in resp.get("tags", []))
        except ClientError:
            return False


def _check_tagging_api(arn: str, key: str, value: str, region: str, account: str) -> bool:
    tagging = _client("resourcegroupstaggingapi", region, account)
    resp = tagging.get_resources(ResourceARNList=[arn])
    for rm in resp.get("ResourceTagMappingList", []):
        if rm["ResourceARN"] == arn:
            for t in rm.get("Tags", []):
                if t["Key"] == key and t["Value"] == value:
                    return True
    return False


# ---------------------------------------------------------------------------
# Main polling loop
# ---------------------------------------------------------------------------

def load_records(arns_dir: str) -> list[dict]:
    """Read and merge all *.json files from arns_dir."""
    records: list[dict] = []
    p = Path(arns_dir)
    for json_file in sorted(p.glob("*.json")):
        try:
            data = json.loads(json_file.read_text())
            if isinstance(data, list):
                records.extend(data)
            elif isinstance(data, dict):
                records.append(data)
        except Exception as exc:
            log.warning("Could not read %s: %s", json_file, exc)
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify map-migrated tags on E2E resources")
    parser.add_argument("--arns-dir", required=True, help="Directory containing ARN JSON files")
    parser.add_argument("--tag-key", default="map-migrated")
    parser.add_argument("--tag-value", required=True)
    parser.add_argument("--max-wait", type=int, default=900, help="Max seconds to wait")
    parser.add_argument("--poll-interval", type=int, default=30, help="Poll interval in seconds")
    args = parser.parse_args()

    records = load_records(args.arns_dir)
    # Filter: only check taggable resources
    taggable = [r for r in records if r.get("taggable", True)]
    skipped = [r for r in records if not r.get("taggable", True)]

    log.info("Loaded %d total records: %d taggable, %d skipped",
             len(records), len(taggable), len(skipped))

    if not taggable:
        log.warning("No taggable ARNs found — nothing to verify")
        _write_report([], [], args)
        return

    # Track state
    pending: list[dict] = list(taggable)
    passed: list[dict] = []
    failed: list[dict] = []

    deadline = time.time() + args.max_wait
    poll_number = 0

    while pending and time.time() < deadline:
        poll_number += 1
        log.info("Poll %d: %d ARNs remaining | elapsed=%.0fs | budget=%.0fs",
                 poll_number, len(pending),
                 time.time() - (deadline - args.max_wait),
                 deadline - time.time())

        still_pending: list[dict] = []
        for record in pending:
            arn = record["arn"]
            try:
                tagged = check_tag(record, args.tag_key, args.tag_value)
            except Exception as exc:
                log.debug("Error checking %s: %s", arn, exc)
                tagged = False

            if tagged:
                passed.append(record)
                log.info("  PASS: %s", arn)
            else:
                still_pending.append(record)
                log.debug("  WAIT: %s", arn)

        pending = still_pending

        if pending and time.time() < deadline:
            sleep_time = min(args.poll_interval, deadline - time.time())
            if sleep_time > 0:
                log.info("Sleeping %ds before next poll...", sleep_time)
                time.sleep(sleep_time)

    # Any still-pending after timeout are failed
    failed = pending

    log.info("")
    log.info("═══════════════════ VERIFICATION SUMMARY ═══════════════════")
    log.info("  PASSED : %d", len(passed))
    log.info("  FAILED : %d", len(failed))
    log.info("  SKIPPED: %d (non-taggable)", len(skipped))
    log.info("═════════════════════════════════════════════════════════════")

    if failed:
        log.error("The following ARNs were NOT tagged within %ds:", args.max_wait)
        for r in failed:
            log.error("  - %s", r["arn"])

    _write_report(passed, failed, args)

    sys.exit(0 if not failed else 1)


def _write_report(passed: list, failed: list, args: argparse.Namespace) -> None:
    report = {
        "tag_key": args.tag_key,
        "tag_value": args.tag_value,
        "max_wait_seconds": args.max_wait,
        "total_passed": len(passed),
        "total_failed": len(failed),
        "passed": [r["arn"] for r in passed],
        "failed": [{"arn": r["arn"], "service": r.get("service"), "region": r.get("region")}
                   for r in failed],
    }
    report_path = "verification-report.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    log.info("Report written to %s", report_path)


if __name__ == "__main__":
    main()
