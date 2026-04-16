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

_tag_value_prefix: str | None = None  # set by main() if --tag-value-prefix supplied


def _value_matches(actual_value: str, expected_value: str) -> bool:
    """Return True if actual_value matches expected — or prefix if prefix mode active."""
    if _tag_value_prefix and actual_value.startswith(_tag_value_prefix):
        return True
    return actual_value == expected_value


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

        # ── Auto Scaling Group (ARN has wildcard UUID — use name-based lookup) ──
        if ":autoscaling:" in arn and ":autoScalingGroup:" in arn:
            return _check_asg(arn, tag_key, tag_value, region, account)

        # ── CloudFormation Stack ──────────────────────────────────────────────
        if ":cloudformation:" in arn and ":stack/" in arn:
            return _check_cloudformation_stack(arn, tag_key, tag_value, region, account)

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
        return any(t["Key"] == key and _value_matches(t["Value"], value) for t in resp.get("TagSet", []))
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
    return any(_value_matches(t["Value"], value) for t in resp.get("Tags", []))


def _check_kinesis_stream(arn: str, key: str, value: str, region: str, account: str) -> bool:
    stream_name = arn.split("/")[-1] if "/" in arn else arn.split("stream:")[-1]
    kinesis = _client("kinesis", region, account)
    resp = kinesis.list_tags_for_stream(StreamName=stream_name)
    return any(t["Key"] == key and _value_matches(t["Value"], value) for t in resp.get("Tags", []))


def _check_firehose(arn: str, key: str, value: str, region: str, account: str) -> bool:
    # ARN format: arn:aws:firehose:region:account:deliverystream/name
    name = arn.split("/")[-1]
    firehose = _client("firehose", region, account)
    resp = firehose.list_tags_for_delivery_stream(DeliveryStreamName=name)
    return any(t["Key"] == key and _value_matches(t["Value"], value) for t in resp.get("Tags", []))


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
        return _value_matches(tags.get(key, ""), value)
    except ClientError:
        return False


def _check_route53_hz(arn: str, key: str, value: str, account: str) -> bool:
    hz_id = arn.split("/")[-1]
    route53 = _client("route53", "us-east-1", account)
    resp = route53.list_tags_for_resource(ResourceType="hostedzone", ResourceId=hz_id)
    return any(t["Key"] == key and _value_matches(t["Value"], value)
               for t in resp.get("ResourceTagSet", {}).get("Tags", []))


def _check_route53_hc(arn: str, key: str, value: str, account: str) -> bool:
    hc_id = arn.split("/")[-1]
    route53 = _client("route53", "us-east-1", account)
    resp = route53.list_tags_for_resource(ResourceType="healthcheck", ResourceId=hc_id)
    return any(t["Key"] == key and _value_matches(t["Value"], value)
               for t in resp.get("ResourceTagSet", {}).get("Tags", []))


def _check_cloudfront(arn: str, key: str, value: str, account: str) -> bool:
    cf = _client("cloudfront", "us-east-1", account)
    resp = cf.list_tags_for_resource(Resource=arn)
    return any(t["Key"] == key and _value_matches(t["Value"], value)
               for t in resp.get("Tags", {}).get("Items", []))


def _check_global_accelerator(arn: str, key: str, value: str) -> bool:
    # Global Accelerator must use us-west-2
    ga = _client("globalaccelerator", "us-west-2")
    resp = ga.list_tags_for_resource(ResourceArn=arn)
    return any(t["Key"] == key and _value_matches(t["Value"], value) for t in resp.get("Tags", []))


def _check_logs(arn: str, key: str, value: str, region: str, account: str) -> bool:
    # ARN: arn:aws:logs:region:account:log-group:/path/to/group
    log_group_name = arn.split("log-group:", 1)[-1]
    logs = _client("logs", region, account)
    try:
        resp = logs.list_tags_log_group(logGroupName=log_group_name)
        tags = resp.get("tags", {})
        return _value_matches(tags.get(key, ""), value)
    except ClientError:
        # Fall back to list_tags_for_resource
        try:
            resp = logs.list_tags_for_resource(resourceArn=arn)
            return any(t["key"] == key and _value_matches(t["value"], value)
                       for t in resp.get("tags", []))
        except ClientError:
            return False


def _check_asg(arn: str, key: str, value: str, region: str, account: str) -> bool:
    """Check ASG tags by name — ARN has wildcard/empty UUID so RGTA lookup fails."""
    # ARN formats:
    #   arn:aws:autoscaling:region:account:autoScalingGroup:{uuid}:autoScalingGroupName/{name}
    #   arn:aws:autoscaling:region:account:autoScalingGroup::{name}  (UUID omitted)
    if "autoScalingGroupName/" in arn:
        name = arn.split("autoScalingGroupName/")[-1]
    else:
        # UUID-less format: last colon-separated segment is the name
        name = arn.split(":")[-1]
    if not name:
        return False
    asg = _client("autoscaling", region, account)
    try:
        resp = asg.describe_auto_scaling_groups(AutoScalingGroupNames=[name])
        for group in resp.get("AutoScalingGroups", []):
            for tag in group.get("Tags", []):
                if tag["Key"] == key and _value_matches(tag["Value"], value):
                    return True
    except Exception as exc:
        log.debug("ASG tag check error for %s: %s", name, exc)
    return False


def _check_cloudformation_stack(arn: str, key: str, value: str, region: str, account: str) -> bool:
    """Check CloudFormation stack tags — stack ARN may not work with RGTA directly."""
    # ARN format: arn:aws:cloudformation:region:account:stack/name/uuid
    parts = arn.split(":")
    stack_name_part = parts[-1] if len(parts) > 0 else ""
    stack_name = stack_name_part.split("/")[1] if "/" in stack_name_part else stack_name_part
    if not stack_name:
        return False
    cfn = _client("cloudformation", region, account)
    try:
        resp = cfn.describe_stacks(StackName=stack_name)
        for stack in resp.get("Stacks", []):
            for tag in stack.get("Tags", []):
                if tag["Key"] == key and _value_matches(tag["Value"], value):
                    return True
    except Exception as exc:
        log.debug("CFn stack tag check error for %s: %s", stack_name, exc)
    return False


def _check_tagging_api(arn: str, key: str, value: str, region: str, account: str) -> bool:
    tagging = _client("resourcegroupstaggingapi", region, account)
    resp = tagging.get_resources(ResourceARNList=[arn])
    for rm in resp.get("ResourceTagMappingList", []):
        if rm["ResourceARN"] == arn:
            for t in rm.get("Tags", []):
                if t["Key"] == key and _value_matches(t["Value"], value):
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
    parser.add_argument("--tag-value-prefix", default=None,
                        help="Accept any tag value starting with this prefix (e.g. 'migTEST')")
    parser.add_argument("--max-wait", type=int, default=900, help="Max seconds to wait")
    parser.add_argument("--poll-interval", type=int, default=30, help="Poll interval in seconds")
    parser.add_argument("--expect-not-tagged", action="store_true",
                        help="Invert: verify resources are NOT tagged (scoping/date tests)")
    parser.add_argument("--not-tagged-wait", type=int, default=120,
                        help="Seconds to wait before checking for absence of tag (default: 120)")
    args = parser.parse_args()

    global _tag_value_prefix
    _tag_value_prefix = args.tag_value_prefix

    records = load_records(args.arns_dir)
    taggable = [r for r in records if r.get("taggable", True)]
    skipped  = [r for r in records if not r.get("taggable", True)]

    # ── Inverted mode: verify resources are NOT tagged ─────────────────────
    if args.expect_not_tagged:
        log.info("Mode: expect-not-tagged — verifying resources are NOT tagged")
        log.info("Waiting %ds before checking (allow Lambda time to run if it's going to)...",
                 args.not_tagged_wait)
        time.sleep(args.not_tagged_wait)

        wrongly_tagged: list[dict] = []
        correctly_untagged: list[dict] = []
        for record in taggable:
            try:
                tagged = check_tag(record, args.tag_key, args.tag_value)
            except Exception as exc:
                log.debug("Tag check error for %s: %s", record["arn"], exc)
                tagged = False
            if tagged:
                wrongly_tagged.append(record)
                log.error("  WRONGLY TAGGED: %s", record["arn"])
            else:
                correctly_untagged.append(record)
                log.info("  CORRECTLY UNTAGGED: %s", record["arn"])

        log.info("")
        log.info("═══════ NOT-TAGGED VERIFICATION SUMMARY ═══════")
        log.info("  CORRECTLY UNTAGGED : %d", len(correctly_untagged))
        log.info("  WRONGLY TAGGED     : %d", len(wrongly_tagged))
        log.info("  SKIPPED            : %d", len(skipped))
        log.info("═══════════════════════════════════════════════")

        report = {
            "mode": "expect-not-tagged",
            "tag_key": args.tag_key,
            "tag_value": args.tag_value,
            "total_correctly_untagged": len(correctly_untagged),
            "total_wrongly_tagged": len(wrongly_tagged),
            "correctly_untagged": [r["arn"] for r in correctly_untagged],
            "wrongly_tagged": [r["arn"] for r in wrongly_tagged],
        }
        with open("verification-report.json", "w") as f:
            json.dump(report, f, indent=2)

        if wrongly_tagged:
            log.error("FAILED: %d resource(s) were tagged but should NOT have been "
                      "(scoping/date filter not working)", len(wrongly_tagged))
            sys.exit(1)
        log.info("All resources correctly untagged — scoping/date filter working.")
        return
    # ── End inverted mode ──────────────────────────────────────────────────

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
