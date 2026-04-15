#!/usr/bin/env python3
"""
wait_stackset.py — Poll a StackSet's latest operation until SUCCEEDED/FAILED or timeout.

Usage:
    python3 wait_stackset.py <stackset-name> <timeout-seconds>
"""

from __future__ import annotations

import logging
import sys
import time

import boto3
from botocore.exceptions import ClientError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)

POLL_INTERVAL = 30


def main() -> None:
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <stackset-name> <timeout-seconds>")
        sys.exit(1)

    stack_set_name = sys.argv[1]
    timeout = int(sys.argv[2])

    cfn = boto3.client("cloudformation")
    deadline = time.time() + timeout

    # ── Find the most recent operation ───────────────────────────────────────
    operation_id = _get_latest_operation_id(cfn, stack_set_name)
    if operation_id is None:
        log.info("No in-progress operation found for %s — nothing to wait for.", stack_set_name)
        sys.exit(0)

    log.info("Waiting for operation %s on StackSet %s (timeout=%ds)...",
             operation_id, stack_set_name, timeout)

    while time.time() < deadline:
        try:
            resp = cfn.describe_stack_set_operation(
                StackSetName=stack_set_name,
                OperationId=operation_id,
            )
            status = resp["StackSetOperation"]["Status"]
            elapsed = int(time.time() - (deadline - timeout))
            log.info("  [+%ds] Status: %s", elapsed, status)

            if status == "SUCCEEDED":
                log.info("StackSet operation SUCCEEDED.")
                sys.exit(0)

            if status in ("FAILED", "CANCELLED", "STOPPED"):
                log.error("StackSet operation ended with status: %s", status)
                # Print per-account results
                try:
                    results = cfn.list_stack_set_operation_results(
                        StackSetName=stack_set_name, OperationId=operation_id
                    )
                    for r in results.get("Summaries", []):
                        log.error("  Account %s / %s: %s — %s",
                                  r.get("Account"), r.get("Region"),
                                  r.get("Status"), r.get("StatusReason", ""))
                except Exception:
                    pass
                sys.exit(1)

        except ClientError as exc:
            log.warning("Poll error: %s", exc)

        time.sleep(POLL_INTERVAL)

    log.error("Timeout (%ds) waiting for StackSet operation %s", timeout, operation_id)
    sys.exit(1)


def _get_latest_operation_id(cfn, stack_set_name: str) -> str | None:
    """Return the ID of the most recently started operation, if it's still running."""
    try:
        resp = cfn.list_stack_set_operations(
            StackSetName=stack_set_name,
            MaxResults=5,
        )
        operations = resp.get("Summaries", [])
        # Operations are returned newest-first
        for op in operations:
            if op.get("Status") in ("RUNNING", "STOPPING", "QUEUED"):
                return op["OperationId"]
        # Return the most recent completed one (so caller can inspect it)
        if operations:
            return operations[0]["OperationId"]
        return None
    except ClientError as exc:
        log.warning("Could not list operations for %s: %s", stack_set_name, exc)
        return None


if __name__ == "__main__":
    main()
