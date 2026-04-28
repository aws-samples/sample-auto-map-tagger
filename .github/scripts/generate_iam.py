#!/usr/bin/env python3
"""
generate_iam.py — derive the canonical IAM tagging-action list from the Lambda
source. Used as a supplement to the hand-curated tagging-permissions.txt: if a
new native-dispatch branch is added to the Lambda without the matching IAM
grant, this script surfaces the drift at CI time.

Methodology:

  1. Parse `map2-auto-tagger-optimized.yaml` for every `boto3.client('<svc>')`
     and `get_service_client('<svc>')` call — these are the services whose
     native TagResource/AddTags APIs the Lambda invokes directly.

  2. For each native-dispatch service, look up the required IAM action in the
     service-action map below (hand-curated from the AWS IAM Service
     Authorization Reference — keep in sync with the handler's `tag_resource`
     branches).

  3. RGTA-dispatched services (anything that falls through to the
     resourcegroupstaggingapi.tag_resources call at the end of `do_tag`)
     require only `tag:TagResources` + the per-service `<svc>:TagResource`
     that RGTA's auth matrix declares — the service TagResource grants are
     kept in the hand-curated canonical list.

  4. Emit either the derived list (stdout) or compare it against
     `.github/sync/tagging-permissions.txt` and fail if the derived list has
     an action not present in the canonical list.

Usage:
    generate_iam.py             # print derived list
    generate_iam.py --check     # compare against canonical; exit nonzero on drift
"""

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
YAML = REPO_ROOT / "map2-auto-tagger-optimized.yaml"
CANONICAL = REPO_ROOT / ".github" / "sync" / "tagging-permissions.txt"

# Map native-dispatch service prefix → list of IAM actions required at runtime.
# Keep one row per service; when a new native branch is added to `do_tag`,
# add an entry here. Services not listed here route through RGTA and only
# need tag:TagResources + <svc>:TagResource in the canonical list.
NATIVE_IAM_REQUIREMENTS = {
    "s3": ["s3:PutBucketTagging", "s3:GetBucketTagging"],
    "route53": ["route53:ChangeTagsForResource"],
    "cloudfront": ["cloudfront:TagResource"],
    "globalaccelerator": ["globalaccelerator:TagResource"],
    "quicksight": ["quicksight:TagResource"],
    "bedrock-agent": ["bedrock:TagResource"],
    "kinesis": ["kinesis:AddTagsToStream"],
    "kinesisvideo": ["kinesisvideo:TagStream"],
    "firehose": ["firehose:TagDeliveryStream"],
    # API Gateway tagging uses HTTP-verb-level IAM actions, NOT the modern
    # TagResource. v1 REST API uses PUT /tags/{arn}, PATCH /tags/{arn} for
    # certain operations; v2 HTTP API uses POST /tags/{arn}. See the comment
    # block in map2-auto-tagger-optimized.yaml's ServiceSpecificTagging policy.
    "apigateway": ["apigateway:PUT", "apigateway:PATCH"],
    "apigatewayv2": ["apigateway:POST"],
    "autoscaling": ["autoscaling:CreateOrUpdateTags"],
    "sqs": ["sqs:TagQueue"],
    "memorydb": ["memorydb:TagResource"],
    "iot": ["iot:TagResource"],
    # Keyspaces/Cassandra: both cassandra:TagResource AND cassandra:Alter
    # per AWS IAM Service Authorization Reference (§1.99).
    "keyspaces": ["cassandra:TagResource", "cassandra:Alter"],
    "cloudhsmv2": ["cloudhsm:TagResource"],
    "ds": ["ds:AddTagsToResource"],
    "dsql": ["dsql:TagResource"],
    "dax": ["dax:TagResource"],
    "vpc-lattice": ["vpc-lattice:TagResource"],
    "payment-cryptography": ["payment-cryptography:TagResource"],
    "networkmanager": ["networkmanager:TagResource"],
    "storagegateway": ["storagegateway:AddTagsToResource"],
    # Infrastructure clients — not for tagging dispatch.
    "ssm": [],
    "ec2": [],
    "sns": [],
    "cloudwatch": [],
    "resourcegroupstaggingapi": [],
    # cloudformation: read-only peer-tagger detector at cold-start (§1.108,
    # plan-PR #57). cloudformation:ListStacks has no resource-level IAM;
    # scope is implicitly the caller's account.
    "cloudformation": ["cloudformation:ListStacks"],
}


def extract_native_services(yaml_text: str) -> set[str]:
    """Find every service whose native boto3 client is constructed."""
    patterns = [
        r"boto3\.client\(['\"]([a-z0-9-]+)['\"]",
        r"get_service_client\(['\"]([a-z0-9-]+)['\"]\)",
    ]
    found = set()
    for pat in patterns:
        found.update(re.findall(pat, yaml_text))
    return found


def derive_required_actions(services: set[str]) -> set[str]:
    actions = set()
    for svc in services:
        if svc not in NATIVE_IAM_REQUIREMENTS:
            # Unknown service — flag loudly so the author extends this map.
            print(
                f"generate_iam.py: unknown native service '{svc}' — add a row to "
                f"NATIVE_IAM_REQUIREMENTS in this script with the IAM actions "
                f"per AWS service-authorization matrix.",
                file=sys.stderr,
            )
            sys.exit(2)
        actions.update(NATIVE_IAM_REQUIREMENTS[svc])
    return actions


def load_canonical() -> set[str]:
    with CANONICAL.open() as f:
        return {line.strip() for line in f if line.strip() and not line.startswith("#")}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--check",
        action="store_true",
        help="Fail if the derived set has actions not present in the canonical list",
    )
    args = ap.parse_args()

    yaml_text = YAML.read_text()
    services = extract_native_services(yaml_text)
    derived = derive_required_actions(services)

    if args.check:
        canonical = load_canonical()
        missing = derived - canonical
        if missing:
            print("❌ IAM drift: native-dispatch handlers require actions NOT in canonical list:")
            for action in sorted(missing):
                print(f"   - {action}")
            print(
                f"\nFix by adding each missing action to {CANONICAL.relative_to(REPO_ROOT)} "
                f"AND the matching row in map2-auto-tagger-optimized.yaml's ServiceSpecificTagging policy.",
                file=sys.stderr,
            )
            return 1
        print(f"✅ IAM completeness: {len(derived)} derived actions are all in the canonical list.")
        return 0

    for action in sorted(derived):
        print(action)
    return 0


if __name__ == "__main__":
    sys.exit(main())
