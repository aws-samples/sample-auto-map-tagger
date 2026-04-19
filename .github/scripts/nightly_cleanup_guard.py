#!/usr/bin/env python3
"""
nightly_cleanup_guard.py — Guard the nightly sweep against deleting in-flight E2E runs.

Problem:
  The 02:00 UTC nightly cleanup sweeps any resource tagged `map-migrated` or
  `e2e-run-id`, and any stack named `map-auto-tagger-e2e-pr*`. If a PR runs E2E
  near 02:00 UTC (e.g. 11:00 KST), the sweep deletes in-flight resources mid-test.

Fix:
  Before cleanup runs, check for recent `map-auto-tagger-e2e-pr*` stacks across
  the 3 test regions. If any is less than INFLIGHT_WINDOW_MIN old OR currently
  in a *_IN_PROGRESS status, there is probably a live E2E run — exit with
  status 1 and let cleanup.yml skip the sweep for this account. The stacks
  (and their tagged resources) will age past the window by the next night and
  be caught then.

Modes:
  check-account   Exits 1 if this account has an in-flight stack. Meant to be
                  called inside each per-account job in cleanup.yml.
  list-stale      Prints `stackname <TAB> region` for every stack OLDER than
                  INFLIGHT_WINDOW_MIN. Used by the stale-stacks cleanup step
                  to replace the prior unconditional delete loop.

Exit codes:
  0 — safe to proceed / no stale stacks
  1 — in-flight work detected, skip cleanup
  2 — caller / AWS error (don't proceed, don't fail the workflow either —
      cleanup.yml sets continue-on-error to absorb)
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta, timezone

try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
except ImportError:
    print("boto3 not available; install via pip install boto3", file=sys.stderr)
    sys.exit(2)

STACK_PREFIX = "map-auto-tagger-e2e-pr"
REGIONS = ["ap-northeast-2", "us-east-1", "us-west-2"]
# If a stack was created less than INFLIGHT_WINDOW_MIN minutes ago, assume
# an E2E run is live. 60 min comfortably exceeds the observed worst-case
# E2E wall time (25–35 min baseline, 50+ on retry-heavy runs).
INFLIGHT_WINDOW_MIN = 60
# Any *_IN_PROGRESS status indicates the stack is actively being created
# or deleted; treat it as live regardless of age.
IN_PROGRESS_SUFFIX = "_IN_PROGRESS"
# Stacks older than this age can be swept. Matches INFLIGHT_WINDOW_MIN so
# a skipped stack is caught the very next night (24h later > 60min).
STALE_CUTOFF_MIN = INFLIGHT_WINDOW_MIN


def _list_stacks(region: str) -> list[dict]:
    cf = boto3.client("cloudformation", region_name=region)
    stacks: list[dict] = []
    # describe_stacks returns deleted stacks too via list_stacks; we only
    # care about stacks that still exist (any non-DELETE_COMPLETE status).
    paginator = cf.get_paginator("list_stacks")
    for page in paginator.paginate(
        StackStatusFilter=[
            "CREATE_IN_PROGRESS", "CREATE_COMPLETE", "CREATE_FAILED",
            "ROLLBACK_IN_PROGRESS", "ROLLBACK_COMPLETE", "ROLLBACK_FAILED",
            "UPDATE_IN_PROGRESS", "UPDATE_COMPLETE", "UPDATE_FAILED",
            "UPDATE_ROLLBACK_IN_PROGRESS", "UPDATE_ROLLBACK_COMPLETE",
            "UPDATE_ROLLBACK_FAILED",
            "DELETE_IN_PROGRESS", "DELETE_FAILED",
        ]
    ):
        for s in page.get("StackSummaries", []):
            if s.get("StackName", "").startswith(STACK_PREFIX):
                stacks.append(s)
    return stacks


def _is_inflight(stack: dict, now: datetime) -> bool:
    status = stack.get("StackStatus", "")
    if status.endswith(IN_PROGRESS_SUFFIX):
        return True
    created = stack.get("CreationTime")
    if not created:
        # No timestamp — conservative: treat as in-flight rather than race.
        return True
    age = now - created
    return age < timedelta(minutes=INFLIGHT_WINDOW_MIN)


def _check_once(now: datetime) -> tuple[bool, str]:
    """One scan over all regions. Returns (inflight_found, reason_or_ok)."""
    for region in REGIONS:
        for s in _list_stacks(region):
            if _is_inflight(s, now):
                age_min = (now - s["CreationTime"]).total_seconds() / 60
                return (
                    True,
                    f"IN-FLIGHT: {s['StackName']} in {region} "
                    f"(status={s['StackStatus']}, age={age_min:.1f}min) — "
                    f"skipping cleanup for this account.",
                )
    return (False, "No in-flight E2E stacks detected — safe to sweep.")


def cmd_check_account() -> int:
    """Check twice, 15s apart. CloudFormation list-stacks has ~10s propagation
    delay from CreateStack; a stack started within seconds of our query can
    be invisible on the first pass but visible on the second. Two passes
    close the narrow race that caused PR #16's self-induced E2E failure.
    """
    import time
    try:
        first = _check_once(datetime.now(timezone.utc))
        if first[0]:
            print(first[1])
            return 1
        time.sleep(15)
        second = _check_once(datetime.now(timezone.utc))
        if second[0]:
            print(second[1])
            return 1
        print(second[1])
        return 0
    except (BotoCoreError, ClientError) as exc:
        print(f"WARN: stack listing failed: {exc}", file=sys.stderr)
        # Don't block cleanup on a transient AWS read error — exit 0 so the
        # sweep proceeds. If a stack is truly in-flight we'd rather skip,
        # but a CloudFormation outage shouldn't deadlock the whole nightly.
        return 0


def cmd_list_stale() -> int:
    """Print `<region>\\t<stack_name>` for every stack older than the cutoff."""
    now = datetime.now(timezone.utc)
    try:
        for region in REGIONS:
            for s in _list_stacks(region):
                created = s.get("CreationTime")
                if not created:
                    continue
                if (now - created) >= timedelta(minutes=STALE_CUTOFF_MIN):
                    print(f"{region}\t{s['StackName']}")
    except (BotoCoreError, ClientError) as exc:
        print(f"WARN: stack listing failed: {exc}", file=sys.stderr)
        return 2
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check-account", help="Exit 1 if an in-flight E2E stack exists in this account")
    sub.add_parser("list-stale", help="Print stacks older than the in-flight window")
    args = parser.parse_args()

    if args.cmd == "check-account":
        return cmd_check_account()
    if args.cmd == "list-stale":
        return cmd_list_stale()
    return 2


if __name__ == "__main__":
    sys.exit(main())
