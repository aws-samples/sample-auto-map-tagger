#!/usr/bin/env python3
"""
deploy_stackset.py — Create or update a SERVICE_MANAGED StackSet and deploy instances.

Usage:
    python3 deploy_stackset.py \
        --stack-set-name map-auto-tagger-e2e-pr42 \
        --template map2-auto-tagger-optimized.yaml \
        --mpe-id migTEST0000001 \
        --agreement-date 2024-01-01 \
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

POLL_INTERVAL = 30  # seconds
OPERATION_TIMEOUT = 1800  # 30 minutes


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy or update a CloudFormation StackSet")
    parser.add_argument("--stack-set-name", required=True)
    parser.add_argument("--template", required=True, help="Path to CloudFormation template file")
    parser.add_argument("--mpe-id", required=True, help="MPE ID / migration tag value")
    parser.add_argument("--agreement-date", required=True, help="MAP agreement date YYYY-MM-DD")
    parser.add_argument("--accounts", required=True, help="Comma-separated account IDs")
    parser.add_argument("--region", default="ap-northeast-2", help="Target region for stack instances")
    parser.add_argument("--org-unit-ids", default="", help="Comma-separated OU IDs (for SERVICE_MANAGED)")
    args = parser.parse_args()

    cfn = boto3.client("cloudformation", region_name=args.region)
    account_ids = [a.strip() for a in args.accounts.split(",") if a.strip()]

    # Read template
    with open(args.template) as f:
        template_body = f.read()

    # Common parameters
    parameters = [
        {"ParameterKey": "MpeId", "ParameterValue": args.mpe_id},
        {"ParameterKey": "MigrationAgreementDate", "ParameterValue": args.agreement_date},
    ]

    # ── Create or update StackSet ─────────────────────────────────────────────
    existing = _get_stackset(cfn, args.stack_set_name)
    if existing is None:
        log.info("Creating StackSet: %s", args.stack_set_name)
        try:
            cfn.create_stack_set(
                StackSetName=args.stack_set_name,
                Description="auto-map-tagger E2E test StackSet",
                TemplateBody=template_body,
                Parameters=parameters,
                PermissionModel="SERVICE_MANAGED",
                AutoDeployment={
                    "Enabled": False,
                    "RetainStacksOnAccountRemoval": False,
                },
                Capabilities=["CAPABILITY_NAMED_IAM", "CAPABILITY_AUTO_EXPAND"],
                Tags=[{"Key": "e2e-test", "Value": "true"}],
            )
            log.info("StackSet created.")
        except ClientError as exc:
            log.error("Failed to create StackSet: %s", exc)
            sys.exit(1)
    else:
        log.info("Updating existing StackSet: %s", args.stack_set_name)
        try:
            resp = cfn.update_stack_set(
                StackSetName=args.stack_set_name,
                TemplateBody=template_body,
                Parameters=parameters,
                OperationPreferences={
                    "MaxConcurrentPercentage": 100,
                    "FailureTolerancePercentage": 50,
                },
                Capabilities=["CAPABILITY_NAMED_IAM", "CAPABILITY_AUTO_EXPAND"],
            )
            op_id = resp.get("OperationId")
            if op_id:
                _wait_operation(cfn, args.stack_set_name, op_id, "update StackSet")
        except ClientError as exc:
            if "No updates are to be performed" in str(exc):
                log.info("No template changes — skipping StackSet update.")
            else:
                log.error("Failed to update StackSet: %s", exc)
                sys.exit(1)

    # ── Create stack instances ────────────────────────────────────────────────
    log.info("Creating stack instances in accounts: %s", account_ids)
    try:
        # SERVICE_MANAGED StackSets use DeploymentTargets with AccountIds
        create_kwargs: dict = {
            "StackSetName": args.stack_set_name,
            "DeploymentTargets": {"Accounts": account_ids},
            "Regions": [args.region],
            "OperationPreferences": {
                "MaxConcurrentPercentage": 100,
                "FailureTolerancePercentage": 50,
                "RegionConcurrencyType": "PARALLEL",
            },
            "ParameterOverrides": parameters,
        }
        if args.org_unit_ids:
            create_kwargs["DeploymentTargets"]["OrganizationalUnitIds"] = [
                ou.strip() for ou in args.org_unit_ids.split(",") if ou.strip()
            ]

        resp = cfn.create_stack_instances(**create_kwargs)
        op_id = resp["OperationId"]
        log.info("Stack instances operation: %s", op_id)
        _wait_operation(cfn, args.stack_set_name, op_id, "create instances")
    except ClientError as exc:
        if "StackInstanceNotFoundException" in str(exc) or "already exists" in str(exc).lower():
            log.info("Stack instances may already exist — attempting update instead.")
            _update_instances(cfn, args.stack_set_name, account_ids, args.region, parameters)
        else:
            log.error("Failed to create stack instances: %s", exc)
            sys.exit(1)

    log.info("StackSet deployment complete: %s", args.stack_set_name)


def _update_instances(
    cfn, stack_set_name: str, account_ids: list, region: str, parameters: list
) -> None:
    try:
        resp = cfn.update_stack_instances(
            StackSetName=stack_set_name,
            DeploymentTargets={"Accounts": account_ids},
            Regions=[region],
            ParameterOverrides=parameters,
            OperationPreferences={
                "MaxConcurrentPercentage": 100,
                "FailureTolerancePercentage": 50,
            },
        )
        op_id = resp["OperationId"]
        _wait_operation(cfn, stack_set_name, op_id, "update instances")
    except Exception as exc:
        log.warning("Update instances: %s", exc)


def _get_stackset(cfn, name: str) -> dict | None:
    try:
        return cfn.describe_stack_set(StackSetName=name)["StackSet"]
    except ClientError as exc:
        if exc.response["Error"]["Code"] == "StackSetNotFoundException":
            return None
        raise


def _wait_operation(cfn, stack_set_name: str, operation_id: str, label: str) -> None:
    """Poll a StackSet operation until it completes or times out."""
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
                log.info("  %s completed successfully.", label)
                return
            if status in ("FAILED", "CANCELLED", "STOPPED"):
                log.error("  %s operation ended with status: %s", label, status)
                # Print operation results
                try:
                    results = cfn.list_stack_set_operation_results(
                        StackSetName=stack_set_name, OperationId=operation_id
                    )
                    for r in results.get("Summaries", []):
                        if r.get("Status") not in ("SUCCEEDED",):
                            log.error("    Account %s/%s: %s — %s",
                                      r.get("Account"), r.get("Region"),
                                      r.get("Status"), r.get("StatusReason", ""))
                except Exception:
                    pass
                sys.exit(1)
        except ClientError as exc:
            log.warning("Poll error: %s", exc)
        time.sleep(POLL_INTERVAL)
    log.error("Timeout waiting for %s after %ds", label, OPERATION_TIMEOUT)
    sys.exit(1)


if __name__ == "__main__":
    main()
