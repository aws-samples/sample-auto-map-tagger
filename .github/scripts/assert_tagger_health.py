#!/usr/bin/env python3
"""
assert_tagger_health.py — fast-fail assertions on the auto-tagger Lambda.

Runs right after resource creation and before verify_tags polls.
Fails the E2E early (in ~10s, not 600s) if the Lambda isn't actually
processing events.

Checks:
  1. Lambda function exists in this account (name = map-auto-tagger-$MPE_ID)
  2. Lambda Invocations metric > 0 over the assertion window
  3. Lambda DLQ has 0 messages (ApproximateNumberOfMessagesVisible)

Why this exists:
  The E2E previously pre-tagged every resource with `map-migrated` at creation
  time. verify_tags then asserted the tag existed — which was always true,
  regardless of whether the Lambda ever ran. A completely broken Lambda could
  ship undetected (seen concretely in PR #5 debugging: 199/201 EventBridge
  deliveries failed, E2E reported 79/81 PASSED).

  Post PR #7.a, resources are pre-tagged with `e2e-run-id` (teardown
  bookkeeping), and `map-migrated` is only applied by the Lambda. But
  verify_tags polls for 600s, so a broken Lambda still wastes 10 minutes
  per failed run. This tool gives an early-fail signal in seconds.

Usage:
    python3 assert_tagger_health.py \
        --mpe-id migTEST24547037024 \
        --region ap-northeast-2 \
        --account 586009411781  (optional; uses current if omitted)

Exit codes:
    0 — Lambda exists, has recent invocations, DLQ empty
    1 — at least one assertion failed (details logged)
    2 — argparse / setup error
"""

from __future__ import annotations

import argparse
import datetime
import logging
import sys
import time
from typing import Any

import boto3
from botocore.exceptions import ClientError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)


def _client(service: str, region: str, account: str | None = None) -> Any:
    """boto3 client in optionally-assumed role."""
    current = boto3.client("sts").get_caller_identity()["Account"]
    if account and account != current:
        sts = boto3.client("sts")
        creds = sts.assume_role(
            RoleArn=f"arn:aws:iam::{account}:role/GitHubActionsE2ERole",
            RoleSessionName="e2e-tagger-health",
        )["Credentials"]
        session = boto3.Session(
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds["SessionToken"],
            region_name=region,
        )
        return session.client(service, region_name=region)
    return boto3.client(service, region_name=region)


def assert_lambda_exists(region: str, account: str, function_name: str) -> bool:
    """Assert the tagger Lambda is deployed."""
    try:
        lam = _client("lambda", region, account)
        lam.get_function(FunctionName=function_name)
        log.info("  ✅ Lambda exists: %s", function_name)
        return True
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code == "ResourceNotFoundException":
            log.error("  ❌ Lambda NOT found: %s — did CFN deploy succeed?", function_name)
            return False
        log.error("  ❌ Lambda check error (%s): %s", code, exc)
        return False


def assert_lambda_invoked(
    region: str,
    account: str,
    function_name: str,
    window_minutes: int = 10,
    min_invocations: int = 1,
    max_wait_seconds: int = 300,
    poll_interval: int = 30,
) -> bool:
    """Assert Lambda has been invoked at least N times in the last window_minutes.

    CloudWatch's Invocations metric has a 1-2 minute publishing lag after
    the invocation happens. When the create-resource job finishes and this
    assertion runs immediately after, the metric may not yet reflect the
    just-triggered CloudTrail events. Poll until the metric appears, up to
    max_wait_seconds.
    """
    try:
        cw = _client("cloudwatch", region, account)
    except Exception as exc:
        log.error("  ❌ CloudWatch client init failed: %s", exc)
        return False

    deadline = datetime.datetime.utcnow() + datetime.timedelta(seconds=max_wait_seconds)
    attempt = 0
    while True:
        attempt += 1
        end = datetime.datetime.utcnow()
        start = end - datetime.timedelta(minutes=window_minutes)
        try:
            resp = cw.get_metric_statistics(
                Namespace="AWS/Lambda",
                MetricName="Invocations",
                Dimensions=[{"Name": "FunctionName", "Value": function_name}],
                StartTime=start,
                EndTime=end,
                Period=60,
                Statistics=["Sum"],
            )
            total = sum(dp["Sum"] for dp in resp.get("Datapoints", []))
        except Exception as exc:
            log.warning("  CloudWatch poll %d: %s", attempt, exc)
            total = 0

        if total >= min_invocations:
            log.info("  ✅ Lambda Invocations (last %dmin): %d", window_minutes, int(total))
            return True

        now = datetime.datetime.utcnow()
        if now >= deadline:
            log.error(
                "  ❌ Lambda Invocations in last %dmin: %d (expected >= %d) after %ds of polling. "
                "The auto-tagger is not processing EventBridge events — check EventBridge rule, "
                "SQS event source mapping, and IAM permissions.",
                window_minutes, int(total), min_invocations, max_wait_seconds,
            )
            return False

        log.info(
            "  ⏳ Attempt %d: Invocations=%d (need >= %d). CloudWatch has ~1-2min publishing lag "
            "— sleeping %ds and retrying (deadline in %ds).",
            attempt, int(total), min_invocations, poll_interval,
            int((deadline - now).total_seconds()),
        )
        time.sleep(poll_interval)


def assert_dlq_empty(region: str, account: str, mpe_id: str) -> bool:
    """Assert the Lambda's DLQ has 0 visible messages.

    DLQ name is `map-auto-tagger-dlq-{MpeId}` per the CFN template
    (EventDLQ.QueueName). Not `{function_name}-dlq`.
    """
    dlq_name = f"map-auto-tagger-dlq-{mpe_id}"
    try:
        sqs = _client("sqs", region, account)
        url = sqs.get_queue_url(QueueName=dlq_name)["QueueUrl"]
        attrs = sqs.get_queue_attributes(
            QueueUrl=url,
            AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
        )["Attributes"]
        visible = int(attrs.get("ApproximateNumberOfMessages", 0))
        in_flight = int(attrs.get("ApproximateNumberOfMessagesNotVisible", 0))
        if visible == 0 and in_flight == 0:
            log.info("  ✅ DLQ empty: %s", dlq_name)
            return True
        log.error(
            "  ❌ DLQ has messages: %s (visible=%d, in-flight=%d). "
            "The Lambda is throwing exceptions repeatedly — check CloudWatch Logs.",
            dlq_name, visible, in_flight,
        )
        return False
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code in ("AWS.SimpleQueueService.NonExistentQueue", "QueueDoesNotExist"):
            log.warning("  ⚠️  DLQ not found (%s) — skipping DLQ assertion", dlq_name)
            return True  # not fatal if queue name convention changed
        log.error("  ❌ DLQ check error (%s): %s", code, exc)
        return False
    except Exception as exc:
        log.error("  ❌ DLQ check failed: %s", exc)
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Fast-fail health check on auto-tagger Lambda")
    parser.add_argument("--mpe-id", required=True,
                        help="MpeId parameter used in the CFN deploy (drives Lambda/DLQ names)")
    parser.add_argument("--region", default="ap-northeast-2")
    parser.add_argument("--account", default=None,
                        help="AWS account ID; omit to use current caller's account")
    parser.add_argument("--window-minutes", type=int, default=10,
                        help="CloudWatch window for Invocations metric (default: 10)")
    parser.add_argument("--min-invocations", type=int, default=1,
                        help="Minimum Invocations over the window (default: 1)")
    parser.add_argument("--skip-invocations", action="store_true",
                        help="Skip the Invocations assertion (e.g. before resources created)")
    parser.add_argument("--skip-dlq", action="store_true",
                        help="Skip the DLQ assertion")
    args = parser.parse_args()

    function_name = f"map-auto-tagger-{args.mpe_id}"
    log.info("Asserting health of Lambda: %s (region=%s account=%s)",
             function_name, args.region, args.account or "<current>")

    ok = assert_lambda_exists(args.region, args.account, function_name)
    if not ok:
        return 1

    if not args.skip_invocations:
        ok &= assert_lambda_invoked(
            args.region, args.account, function_name,
            window_minutes=args.window_minutes,
            min_invocations=args.min_invocations,
        )

    if not args.skip_dlq:
        ok &= assert_dlq_empty(args.region, args.account, args.mpe_id)

    if ok:
        log.info("✅ All assertions passed — Lambda is healthy")
        return 0
    log.error("❌ One or more assertions failed")
    return 1


if __name__ == "__main__":
    sys.exit(main())
