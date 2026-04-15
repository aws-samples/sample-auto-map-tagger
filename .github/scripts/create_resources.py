#!/usr/bin/env python3
"""
Main dispatcher for E2E resource creation.

Usage:
    python3 create_resources.py --group <name> [--vpc-id vpc-xxx] \
        [--subnet-ids "subnet-a,subnet-b"] [--sg-id sg-xxx] \
        [--region ap-northeast-2] [--account-index 1]

Groups:
    core, networking, databases, analytics, integration, security,
    devtools, ml, media-iot, misc, global-us-east-1, global-us-west-2,
    multiaccount-linked1 .. multiaccount-linked5
"""

import argparse
import importlib
import json
import os
import sys
import time

# Ensure resource_groups package is importable regardless of cwd
sys.path.insert(0, os.path.dirname(__file__))


VALID_GROUPS = [
    "core",
    "networking",
    "databases",
    "analytics",
    "integration",
    "security",
    "devtools",
    "ml",
    "media-iot",
    "misc",
    "global-us-east-1",
    "global-us-west-2",
    *[f"multiaccount-linked{i}" for i in range(1, 6)],
]

# Map CLI group name → module name inside resource_groups/
GROUP_TO_MODULE = {
    "core": "core",
    "networking": "networking",
    "databases": "databases",
    "analytics": "analytics",
    "integration": "integration",
    "security": "security",
    "devtools": "devtools",
    "ml": "ml",
    "media-iot": "media_iot",
    "misc": "misc",
    "global-us-east-1": "global_us_east_1",
    "global-us-west-2": "global_us_west_2",
    **{f"multiaccount-linked{i}": "multiaccount_linked" for i in range(1, 6)},
}


def set_gha_output(name: str, value: str) -> None:
    """Write a key=value pair to the GitHub Actions $GITHUB_OUTPUT file."""
    output_file = os.environ.get("GITHUB_OUTPUT")
    if output_file:
        with open(output_file, "a") as f:
            f.write(f"{name}={value}\n")
    else:
        # Fallback: print for local debugging
        print(f"[GHA output] {name}={value}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create E2E test resources")
    parser.add_argument("--group", required=True, choices=VALID_GROUPS,
                        help="Resource group to create")
    parser.add_argument("--vpc-id", default="", help="VPC ID (for groups that need it)")
    parser.add_argument("--subnet-ids", default="",
                        help="Comma-separated subnet IDs")
    parser.add_argument("--sg-id", default="", help="Security Group ID")
    parser.add_argument("--region", default="ap-northeast-2", help="AWS region")
    parser.add_argument("--account-index", type=int, default=1,
                        help="Account index for multiaccount groups (1-5)")
    args = parser.parse_args()

    # Resolve PR number and timestamp from environment / args
    pr_number = os.environ.get("PR_NUMBER", "0")
    timestamp = str(int(time.time()))
    tag_value = os.environ.get("MPE_ID", "migTEST0000001")

    print(f"[create_resources] group={args.group} region={args.region} "
          f"pr={pr_number} ts={timestamp}")

    # Dynamically import the module
    module_name = GROUP_TO_MODULE[args.group]
    module = importlib.import_module(f"resource_groups.{module_name}")

    # Build kwargs that modules may consume
    kwargs = dict(
        region=args.region,
        pr_number=pr_number,
        timestamp=timestamp,
        tag_value=tag_value,
        vpc_id=args.vpc_id,
        subnet_ids=[s for s in args.subnet_ids.split(",") if s],
        sg_id=args.sg_id,
        account_index=args.account_index,
    )

    result = module.create(**kwargs)

    arns: list = result.get("arns", [])
    outputs: dict = result.get("outputs", {})

    # Write ARN record file
    output_filename = f"created-arns-{args.group}.json"
    with open(output_filename, "w") as f:
        json.dump(arns, f, indent=2, default=str)
    print(f"[create_resources] Wrote {len(arns)} ARN records to {output_filename}")

    # Propagate any extra outputs (e.g. vpc-id from networking group) to GHA
    for k, v in outputs.items():
        set_gha_output(k, v)
        print(f"[create_resources] output: {k}={v}")


if __name__ == "__main__":
    main()
