#!/usr/bin/env python3
"""
sweep_iam_roles.py — Delete orphaned map-auto-tagger IAM roles.

These roles are created by CloudFormation (named map-auto-tagger-role-<mpe>-<region>)
but can be left behind if a CFN stack deletion fails or times out. They are not
tagged, so teardown.py's tag-based sweep misses them. This script finds and
deletes any role matching the prefix in the current account.

Usage:
    python3 sweep_iam_roles.py [--dry-run]
"""

from __future__ import annotations

import argparse
import logging
import sys

import boto3
from botocore.exceptions import ClientError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)

ROLE_PREFIX = "map-auto-tagger-role-"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="List roles but do not delete")
    args = parser.parse_args()

    iam = boto3.client("iam")
    paginator = iam.get_paginator("list_roles")

    roles_to_delete = []
    for page in paginator.paginate(PathPrefix="/"):
        for role in page["Roles"]:
            if role["RoleName"].startswith(ROLE_PREFIX):
                roles_to_delete.append(role["RoleName"])

    if not roles_to_delete:
        log.info("No orphaned map-auto-tagger IAM roles found.")
        return

    log.info("Found %d orphaned role(s): %s", len(roles_to_delete), roles_to_delete)

    if args.dry_run:
        log.info("Dry-run mode — skipping deletion.")
        return

    for role_name in roles_to_delete:
        try:
            # Delete inline policies
            inline = iam.list_role_policies(RoleName=role_name)["PolicyNames"]
            for policy_name in inline:
                iam.delete_role_policy(RoleName=role_name, PolicyName=policy_name)
                log.info("  Deleted inline policy %s from %s", policy_name, role_name)

            # Detach managed policies
            attached = iam.list_attached_role_policies(RoleName=role_name)["AttachedPolicies"]
            for policy in attached:
                iam.detach_role_policy(RoleName=role_name, PolicyArn=policy["PolicyArn"])
                log.info("  Detached %s from %s", policy["PolicyArn"], role_name)

            # Delete the role
            iam.delete_role(RoleName=role_name)
            log.info("Deleted role: %s", role_name)
        except ClientError as exc:
            log.warning("Could not delete %s: %s", role_name, exc)


if __name__ == "__main__":
    main()
