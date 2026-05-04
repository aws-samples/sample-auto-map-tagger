#!/usr/bin/env python3
"""
sync-check.py — detects drift between map2-auto-tagger-optimized.yaml
and configurator.html on the surfaces that matter:

  1. IAM permissions — both files must cover every permission in the canonical list
  2. Critical edge-case handlers — specific handlers that cannot be covered by the
     universal ARN scanner and must be explicitly present in both files

Exit codes:
  0 — all checks passed (warnings may be present)
  1 — at least one check FAILED
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
YAML_FILE = ROOT / 'map2-auto-tagger-optimized.yaml'
HTML_FILE = ROOT / 'build' / 'configurator.html'
PERMS_FILE = ROOT / '.github' / 'sync' / 'tagging-permissions.txt'

fails: list[str] = []
warns: list[str] = []

yaml = YAML_FILE.read_text()
html = HTML_FILE.read_text()

# ── Check 1: IAM permissions ────────────────────────────────────────────────
# Canonical list in .github/sync/tagging-permissions.txt is derived from the
# YAML and is the source of truth. Both files must contain every listed permission.

canonical = {l.strip() for l in PERMS_FILE.read_text().splitlines() if l.strip()}

# YAML: extract from all Sids in the Lambda execution role IAM policy.
# Service prefixes may contain hyphens (vpc-lattice, resource-explorer-2,
# sms-voice). Action suffix is always alphanumeric per the AWS IAM action
# grammar.
yaml_perms: set[str] = set()
for block in re.findall(r'Sid: \w+.*?Resource:', yaml, re.DOTALL):
    yaml_perms |= set(re.findall(r'- ([\w-]+:[\w]+)', block))

# HTML: extract all IAM permission strings from the built configurator.
# After the per-service decoupling, permissions are spread across individual
# service module objects (e.g. SERVICE_EC2.permissions = ['ec2:CreateTags']).
# We scan the entire file for quoted IAM action patterns.
html_perms: set[str] = set(re.findall(r"'([\w-]+:[\w]+)'", html))

for p in sorted(canonical - yaml_perms):
    fails.append(f"IAM: '{p}' is in canonical list but MISSING from map2-auto-tagger-optimized.yaml")

for p in sorted(canonical - html_perms):
    fails.append(f"IAM: '{p}' is in canonical list but MISSING from configurator.html TAGGING_PERMISSIONS")

for p in sorted(yaml_perms - canonical):
    warns.append(f"IAM: '{p}' is in YAML but not in canonical list — add it if intentional")

for p in sorted(html_perms - canonical):
    # HTML has extra permissions for its retry/backfill architecture — warn but don't fail
    warns.append(f"IAM: '{p}' is in HTML but not in canonical list (may be intentional for retry architecture)")

# ── Check 2: Critical edge-case handlers ────────────────────────────────────
# These handlers CANNOT be covered by the universal ARN scanner (no ARN in
# response, requires ID construction or nested response unwrapping).
# They must be explicitly present in BOTH files.

CRITICAL_HANDLERS = [
    # Handler name, reason it's critical
    ("CreateFlowLogs",
     "EC2 nested response wrapper (CreateFlowLogsResponse.flowLogIdSet) — no ARN in response"),
    ("CreatePipeline",
     "CodePipeline response has no pipelineArn — only roleArn which would tag the wrong resource"),
]

# Extract handlers from YAML Lambda (ZipFile block)
yaml_zip_start = yaml.index('ZipFile: |\n') + len('ZipFile: |\n')
yaml_lambda = yaml[yaml_zip_start:]
yaml_handlers = set(re.findall(r"event_name == '([^']+)'", yaml_lambda))

# Extract handlers from all of configurator.html (Lambda is inlined as JS template)
html_handlers = set(re.findall(r"event_name == '([^']+)'", html))

for handler, reason in CRITICAL_HANDLERS:
    if handler not in yaml_handlers:
        fails.append(
            f"HANDLER: '{handler}' is missing from map2-auto-tagger-optimized.yaml Lambda\n"
            f"         Reason it's critical: {reason}"
        )
    if handler not in html_handlers:
        fails.append(
            f"HANDLER: '{handler}' is missing from configurator.html Lambda\n"
            f"         Reason it's critical: {reason}"
        )

# ── Check 2b: Handler count parity ───────────────────────────────────────────
# The configurator Lambda must be a superset of the YAML Lambda. If the
# configurator has fewer handlers, customers deploying via the supported path
# get a gutted Lambda (F012 class regression).
yaml_count = len(yaml_handlers)
html_count = len(html_handlers)
if html_count < yaml_count:
    fails.append(
        f"HANDLER_COUNT: configurator has {html_count} handlers but YAML has {yaml_count}. "
        f"The configurator Lambda must be a superset of the YAML Lambda."
    )

# ── Check 3: CodePipeline handler has correct source guard ──────────────────
# The universal scanner would pick up roleArn from CreatePipeline response.
# The correct handler must guard on event_source == 'codepipeline.amazonaws.com'.
if "CreatePipeline" in html_handlers:
    if "codepipeline.amazonaws.com" not in html:
        fails.append(
            "HANDLER: CreatePipeline handler in configurator.html is missing "
            "event_source == 'codepipeline.amazonaws.com' guard — would fire on "
            "SageMaker CreatePipeline and tag the IAM role instead"
        )

# ── Check 4: v20 architecture parity ────────────────────────────────────────
# The configurator generates CFN inline. Its architecture MUST match v20 YAML.
# Key resources must exist in both files.
V20_RESOURCES = [
    ("EventQueue",        "v20 SQS buffering queue (EventBridge target)"),
    ("EventDLQ",          "v20 dead letter queue after 3 failed attempts"),
    ("EventQueueMapping", "v20 Lambda event source mapping from EventQueue"),
    ("EventQueuePolicy",  "v20 SQS queue policy allowing EventBridge to send"),
    ("DLQAlarm",          "v20 alarm on DLQ depth (catches silent drops)"),
    ("AlertTopic",        "v20 SNS topic for alert notifications"),
]
for resource_name, purpose in V20_RESOURCES:
    if f"\n  {resource_name}:" not in yaml:
        fails.append(f"V20_ARCH: '{resource_name}' missing from YAML — {purpose}")
    if f"\n  {resource_name}:" not in html:
        fails.append(
            f"V20_ARCH: '{resource_name}' missing from configurator.html — {purpose}\n"
            f"          The configurator generates CFN inline. If this resource is absent, "
            f"every customer running deploy.sh gets a pre-v20 architecture."
        )

# ── Check 5: v20 anti-patterns — must NEVER reappear ────────────────────────
# These are bugs fixed in v20 that would cause silent data loss if reintroduced.
V20_ANTIPATTERNS = [
    (
        "KmsMasterKeyId: alias/aws/sqs",
        "PR #5 bug: EventBridge cannot deliver to KMS-encrypted SQS with AWS-managed "
        "key (no kms:GenerateDataKey grant). Use SqsManagedSseEnabled: true instead."
    ),
]
for needle, reason in V20_ANTIPATTERNS:
    if needle in yaml:
        fails.append(f"V20_ANTIPATTERN in YAML: '{needle}'\n  Reason: {reason}")
    if needle in html:
        fails.append(f"V20_ANTIPATTERN in configurator.html: '{needle}'\n  Reason: {reason}")

# In configurator only, ReservedConcurrentExecutions must not be set as a Lambda property.
# (v20 removed this to prevent deployment failure on accounts with reduced quota.)
# Allow mentions in comments/descriptions; forbid actual CFN property assignment.
rce_config_match = re.search(r'^\s*ReservedConcurrentExecutions:\s*\d', html, re.MULTILINE)
if rce_config_match:
    fails.append(
        "V20_ANTIPATTERN in configurator.html: ReservedConcurrentExecutions config line\n"
        "  Reason: v20 removed this — CT-managed accounts have quota=400, smaller than "
        "the hard-coded 10 reservation left UnreservedConcurrentExecutions below AWS "
        "minimum, causing deployment failure."
    )

# ── Check 6: Version parity (SemVer per VERSIONING.md) ───────────────────────
# Version is SemVer: vMAJOR.MINOR.PATCH (e.g., v20.1.0). MAJOR bump = customer
# must take action to upgrade. MINOR = new capability or behavior. PATCH = fix.
# Every v20-prefixed reference in both files must match — except historical
# entries inside the VERSION_HISTORY array in configurator.html, which by
# design list prior versions.
VERSION_RE = r'v\d+\.\d+\.\d+'
yaml_versions = set(re.findall(VERSION_RE, yaml))

# Extract the VERSION_HISTORY JS array so we can (a) exclude its historical
# versions from the drift check and (b) enforce that its newest entry matches
# TEMPLATE_VERSION.
vh_match = re.search(r'const\s+VERSION_HISTORY\s*=\s*\[([\s\S]+?)\n\s*\];', html)
vh_versions: list[str] = []
if vh_match:
    vh_body = vh_match.group(1)
    vh_versions = re.findall(rf"version:\s*'({VERSION_RE})'", vh_body)

# HTML versions outside VERSION_HISTORY must match TEMPLATE_VERSION.
html_excl_vh = html.replace(vh_match.group(0), '') if vh_match else html
html_versions = set(re.findall(VERSION_RE, html_excl_vh))

# The single source of truth: the TEMPLATE_VERSION constant in configurator.html.
html_src_match = re.search(rf"TEMPLATE_VERSION\s*=\s*'({VERSION_RE})'", html)
html_src = html_src_match.group(1) if html_src_match else None
if not html_src:
    fails.append("VERSION: could not find TEMPLATE_VERSION = 'vN.N.N' in configurator.html")
else:
    # All YAML version mentions must equal the canonical version.
    for v in yaml_versions - {html_src}:
        fails.append(
            f"VERSION: YAML has '{v}' but canonical is '{html_src}'. "
            f"Bump every reference together per VERSIONING.md."
        )
    # All HTML version mentions (outside VERSION_HISTORY) must also match.
    for v in html_versions - {html_src}:
        fails.append(
            f"VERSION: configurator.html has '{v}' but TEMPLATE_VERSION is '{html_src}'."
        )
    if not yaml_versions:
        fails.append(f"VERSION: YAML has no vN.N.N reference (expected {html_src})")

    # VERSION_HISTORY[0] must equal TEMPLATE_VERSION (the newest release shown
    # to customers upgrading must be the version the configurator actually bakes).
    if vh_versions:
        if vh_versions[0] != html_src:
            fails.append(
                f"VERSION_HISTORY: newest entry is '{vh_versions[0]}' but TEMPLATE_VERSION is '{html_src}'. "
                f"Add a VERSION_HISTORY entry for the new version (most recent first)."
            )
        # Enforce strictly descending order: customers reading the panel
        # should see latest-first.
        def _parse(v: str) -> tuple[int, int, int]:
            parts = v.lstrip('v').split('.')
            return (int(parts[0]), int(parts[1]), int(parts[2]))
        for i in range(len(vh_versions) - 1):
            if _parse(vh_versions[i]) <= _parse(vh_versions[i + 1]):
                fails.append(
                    f"VERSION_HISTORY: entries must be strictly descending. "
                    f"'{vh_versions[i]}' is not newer than '{vh_versions[i + 1]}'."
                )
                break
    else:
        warns.append("VERSION_HISTORY: no entries found in configurator.html (customers will see an empty Version history panel).")

# ── Report ────────────────────────────────────────────────────────────────────
print()
if warns:
    for w in warns:
        print(f"  ⚠️  {w}")
    print()

if fails:
    for f in fails:
        print(f"  ❌ {f}")
    print()
    print(f"FAILED: {len(fails)} issue(s) found. Fix before merging.")
    sys.exit(1)
else:
    total = len(canonical)
    print(f"  ✅ IAM permissions: {total} canonical, {len(yaml_perms)} in YAML, {len(html_perms)} in HTML")
    print(f"  ✅ Critical handlers: all present in both files")
    if warns:
        print(f"  ⚠️  {len(warns)} warning(s) — review but not blocking")
    print()
    print("All sync checks passed.")
