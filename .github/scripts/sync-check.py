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
HTML_FILE = ROOT / 'configurator.html'
PERMS_FILE = ROOT / '.github' / 'sync' / 'tagging-permissions.txt'

fails: list[str] = []
warns: list[str] = []

yaml = YAML_FILE.read_text()
html = HTML_FILE.read_text()

# ── Check 1: IAM permissions ────────────────────────────────────────────────
# Canonical list in .github/sync/tagging-permissions.txt is derived from the
# YAML and is the source of truth. Both files must contain every listed permission.

canonical = {l.strip() for l in PERMS_FILE.read_text().splitlines() if l.strip()}

# YAML: extract from UniversalTagging + ServiceSpecificTagging Sids
yaml_perms: set[str] = set()
for block in re.findall(r'Sid: (?:UniversalTagging|ServiceSpecificTagging).*?Resource:', yaml, re.DOTALL):
    yaml_perms |= set(re.findall(r'- ([\w]+:[\w]+)', block))

# HTML: extract from TAGGING_PERMISSIONS JS array
html_perms_match = re.search(r'const TAGGING_PERMISSIONS = \[([\s\S]+?)\];', html)
html_perms: set[str] = set()
if html_perms_match:
    html_perms = set(re.findall(r"'([\w]+:[\w]+)'", html_perms_match.group(1)))
else:
    fails.append("IAM: Could not find TAGGING_PERMISSIONS array in configurator.html")

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
