#!/usr/bin/env python3
"""
delete_stackset.py — Delete stack instances, wait, then delete the StackSet.

Usage:
    python3 delete_stackset.py \
        --name map-auto-tagger-e2e-pr42 \
        --accounts "111111111111,222222222222"
"""

from __future__ import annotations

import argparse
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
OPERATION_TIMEOUT = 1800


def main() -> None:
    parser = argparse.ArgumentParser(description="Delete a CloudFormation StackSet and its instances")
    parser.add_argument("--name", required=True, help="StackSet name")
    parser.add_argument("--accounts", required=True, help="Comma-separated account IDs")
    parser.add_argument("--region", default="ap-northeast-2", help="Region where instances were created")
    args = parser.parse_args()

    cfn = boto3.client("cloudformation", region_name=args.region)
    account_ids = [a.strip() for a in args.accounts.split(",") if a.strip()]

    # ── Check StackSet exists ─────────────────────────────────────────────────
    if not _stackset_exists(cfn, args.name):
        log.info("StackSet %s does not exist — nothing to delete.", args.name)
        return

    # ── Detect permission model ────────────────────────────────────────────
    try:
        ss_desc = cfn.describe_stack_set(StackSetName=args.name)
        perm_model = ss_desc["StackSet"].get("PermissionModel", "SELF_MANAGED")
    except ClientError:
        perm_model = "SELF_MANAGED"
    log.info("StackSet permission model: %s", perm_model)

    # ── Delete stack instances ────────────────────────────────────────────────
    if perm_model == "SERVICE_MANAGED":
        # SERVICE_MANAGED requires OrganizationalUnitIds, not Accounts
        log.info("Discovering org root OU for SERVICE_MANAGED deletion...")
        try:
            orgs = boto3.client("organizations")
            roots = orgs.list_roots()["Roots"]
            root_id = roots[0]["Id"]
            log.info("Using org root OU: %s", root_id)
            resp = cfn.delete_stack_instances(
                StackSetName=args.name,
                DeploymentTargets={"OrganizationalUnitIds": [root_id]},
                Regions=[args.region],
                RetainStacks=False,
                OperationPreferences={
                    "MaxConcurrentPercentage": 100,
                    "FailureTolerancePercentage": 100,
                    "RegionConcurrencyType": "PARALLEL",
                },
            )
            op_id = resp["OperationId"]
            log.info("Delete instances operation: %s", op_id)
            _wait_operation(cfn, args.name, op_id, "delete instances")
        except ClientError as exc:
            code = exc.response["Error"]["Code"]
            if code in ("StackSetNotFoundException", "StackInstanceNotFoundException"):
                log.info("No stack instances found — skipping instance deletion.")
            else:
                log.warning("Delete instances error (continuing): %s", exc)
    else:
        log.info("Deleting stack instances in accounts: %s region: %s", account_ids, args.region)
        try:
            resp = cfn.delete_stack_instances(
                StackSetName=args.name,
                DeploymentTargets={"Accounts": account_ids},
                Regions=[args.region],
                RetainStacks=False,
                OperationPreferences={
                    "MaxConcurrentPercentage": 100,
                    "FailureTolerancePercentage": 100,
                    "RegionConcurrencyType": "PARALLEL",
                },
            )
            op_id = resp["OperationId"]
            log.info("Delete instances operation: %s", op_id)
            _wait_operation(cfn, args.name, op_id, "delete instances")
        except ClientError as exc:
            code = exc.response["Error"]["Code"]
            if code in ("StackSetNotFoundException", "StackInstanceNotFoundException"):
                log.info("No stack instances found — skipping instance deletion.")
            else:
                log.warning("Delete instances error (continuing): %s", exc)

    # ── Delete the StackSet ───────────────────────────────────────────────────
    log.info("Deleting StackSet: %s", args.name)
    try:
        cfn.delete_stack_set(StackSetName=args.name)
        log.info("StackSet %s deleted.", args.name)
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code in ("StackSetNotFoundException",):
            log.info("StackSet already gone.")
        elif code == "OperationInProgressException":
            log.warning("An operation is still in progress — waiting before retry...")
            time.sleep(60)
            try:
                cfn.delete_stack_set(StackSetName=args.name)
                log.info("StackSet %s deleted (retry).", args.name)
            except Exception as exc2:
                log.error("Could not delete StackSet after retry: %s", exc2)
        else:
            log.error("Could not delete StackSet: %s", exc)


def _stackset_exists(cfn, name: str) -> bool:
    try:
        cfn.describe_stack_set(StackSetName=name)
        return True
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "StackSetNotFoundException":
            return False
        raise


def _wait_operation(cfn, stack_set_name: str, operation_id: str, label: str) -> None:
    log.info("Waiting for %s (operation %s)...", label, operation_id)
    deadline = time.time() + OPERATION_TIMEOUT
    while time.time() < deadline:
        try:
            resp = cfn.describe_stack_set_operation(
                StackSetName=stack_set_name,
                OperationId=operation_id,
            )
            status = resp["StackSetOperation"]["Status"]
            log.info("  %s status: %s", label, status)
            if status == "SUCCEEDED":
                log.info("  %s completed.", label)
                return
            if status in ("FAILED", "CANCELLED", "STOPPED"):
                log.warning("  %s ended with status: %s (continuing teardown)", label, status)
                return
        except ClientError as exc:
            log.warning("Poll error: %s", exc)
        time.sleep(POLL_INTERVAL)
    log.warning("Timeout waiting for %s — continuing anyway", label)


if __name__ == "__main__":
    main()
