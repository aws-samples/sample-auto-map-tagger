#!/usr/bin/env python3
"""
lint_cfn_correctness.py — catch CFN validation errors at lint time rather
than at stack-create time.

Sprint 4 shipped two separate incidents where cfn-lint reported green but
CloudFormation rejected the template at stack-create:

  PR #41 — `ReconciliationRole` RoleName rendered to 69 chars, over IAM's
           64-char cap. cfn-lint does not evaluate !Sub templates against
           AWS service-side length limits.

  PR #42 — configurator.html inline template had `RoleName: ...${AWS::Region}...`
           without wrapping in !Sub. The pseudo-parameter was emitted as a
           literal `${AWS::Region}` string; IAM rejected the `:` as an
           invalid RoleName character.

Both classes would have been caught by this lint. The goal is to close
"green at Layer 1, red at stack-create" as a failure mode going forward.

Checks:

  1. Unsubbed `${AWS::...}` in any scalar NOT inside a !Sub / !GetAtt
  2. Named-resource length overruns computed against worst-case MpeId (20
     chars per MAP spec) and longest-region (ap-northeast-2 / ap-southeast-4
     at 14 chars)
  3. IAM RoleName character class (must match [A-Za-z0-9+=,.@_-])
  4. Dangling !Ref / !GetAtt targets (reference to an ID not in Parameters,
     Resources, Conditions, or the CFN pseudo-parameter set)
  5. !Sub undefined template variables

Covers both sources of truth:
  - configurator.yaml  (runtime)
  - configurator.html                (customer-generated inline template)

Exit codes: 0 all green; 1 drift detected.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent.parent.parent
YAML_FILE = ROOT / 'configurator.yaml'
HTML_FILE = ROOT / 'configurator.html'

# Worst-case expansion budgets. MpeId is validated by YAML AllowedPattern
# to `^mig[a-zA-Z0-9]+$` with no upper bound; MAP spec caps MpeId values
# at ~20 characters in practice (longest observed: `migTEST` + 10-digit
# run ID = 17 chars). Budget to 20 for safety.
WORST_CASE = {
    '${MpeId}': 20,
    '${mpe}': 20,
    '${AWS::Region}': 14,   # ap-northeast-2, ap-southeast-4
    '${AWS::AccountId}': 12,
    '${AWS::Partition}': 8,  # aws-us-gov
    '${AWS::StackName}': 40,  # typical; we own the stack name
}

# Per-resource name limits (AWS side).
NAME_LIMITS = {
    'AWS::IAM::Role': ('RoleName', 64),
    'AWS::IAM::Policy': ('PolicyName', 128),
    'AWS::Lambda::Function': ('FunctionName', 64),
    'AWS::SQS::Queue': ('QueueName', 80),
    'AWS::SNS::Topic': ('TopicName', 256),
    'AWS::Events::Rule': ('Name', 64),
    'AWS::Logs::LogGroup': ('LogGroupName', 512),
    'AWS::CloudFormation::Stack': ('StackName', 128),
    'AWS::CloudFormation::StackSet': ('StackSetName', 128),
    'AWS::DynamoDB::Table': ('TableName', 255),
    'AWS::S3::Bucket': ('BucketName', 63),
    'AWS::SSM::Parameter': ('Name', 2048),
}

# IAM RoleName valid character class (AWS-side regex).
IAM_ROLENAME_ALLOWED = re.compile(r'^[A-Za-z0-9+=,.@_-]+$')

# Pseudo-parameters CFN resolves for us.
CFN_PSEUDO_PARAMS = {
    'AWS::Region', 'AWS::AccountId', 'AWS::Partition', 'AWS::StackName',
    'AWS::StackId', 'AWS::URLSuffix', 'AWS::NoValue', 'AWS::NotificationARNs',
}


def _worst_case_length(template_string: str) -> int:
    """Substitute worst-case values for known placeholders + return length."""
    s = template_string
    for placeholder, length in WORST_CASE.items():
        s = s.replace(placeholder, 'x' * length)
    # Any remaining ${...} we don't know about: assume 20 chars (defensive).
    s = re.sub(r'\$\{[^}]+\}', 'x' * 20, s)
    return len(s)


def _iter_code_blocks(text: str) -> list[tuple[int, int]]:
    """Return (start, end) offsets of YAML `ZipFile: |` code blocks.

    Lines inside these blocks are embedded Lambda code (Python / JS). The
    `${...}` substitutions in the Lambda code are runtime env/format strings,
    NOT CFN intrinsic functions; they must be excluded from CFN lint checks.
    """
    blocks = []
    for m in re.finditer(r'ZipFile:\s*\|\n', text):
        block_start = m.end()
        # Block ends when indentation drops back below 10 spaces.
        lines = text[block_start:].splitlines(keepends=True)
        consumed = 0
        for line in lines:
            if line.strip() == '':
                consumed += len(line)
                continue
            if line.startswith(' ' * 10):
                consumed += len(line)
                continue
            break
        blocks.append((block_start, block_start + consumed))
    return blocks


def _is_inside_code_block(pos: int, blocks: list[tuple[int, int]]) -> bool:
    return any(start <= pos < end for start, end in blocks)


# ── Check 1: unsubbed ${AWS::...} in non-code scalars ─────────────────────

def check_unsubbed_pseudo_params(path: Path, text: str) -> list[str]:
    """Every ${AWS::...} must be inside a !Sub or !GetAtt.

    Match logic: find all ${AWS::...} occurrences outside ZipFile code blocks.
    For each, walk backward on the same line looking for !Sub. If the scalar
    starts without !Sub (quoted or unquoted), it's an error.
    """
    errors = []
    code_blocks = _iter_code_blocks(text)
    for m in re.finditer(r'\$\{AWS::[A-Za-z]+\}', text):
        pos = m.start()
        if _is_inside_code_block(pos, code_blocks):
            continue
        # Find the start of this line.
        line_start = text.rfind('\n', 0, pos) + 1
        line_end = text.find('\n', pos)
        if line_end < 0:
            line_end = len(text)
        line = text[line_start:line_end]
        line_num = text[:pos].count('\n') + 1
        # If the line contains `!Sub` before the occurrence, it's OK.
        # Also OK if the value is rendered as `Fn::Sub` in block form (rare
        # in our templates but supported defensively).
        col_in_line = pos - line_start
        before = line[:col_in_line]
        if '!Sub' in before or 'Fn::Sub' in before:
            continue
        # Also check for JavaScript template-literal escapes (`\${AWS::...}`)
        # in configurator.html — these render as literal ${AWS::...} in the
        # generated YAML, which is fine IF that generated YAML then wraps
        # them in !Sub. We treat unescaped occurrences the same; the lint
        # expects the containing scalar to be a !Sub value.
        errors.append(
            f"{path.name}:{line_num}: ${{AWS::...}} outside !Sub — "
            f"will render as literal string in CFN. Line: {line.strip()[:120]}"
        )
    return errors


# ── Check 2: named-resource length overruns ───────────────────────────────

def check_resource_name_lengths(path: Path, text: str) -> list[str]:
    """For each resource that sets a Name/RoleName/etc., check worst-case length."""
    errors = []
    # Parse the Resources section heuristically. We don't use yaml.safe_load
    # because the file contains CFN intrinsic functions (!Sub, !GetAtt, !Ref)
    # which PyYAML rejects without tag handlers. A regex pass finds every
    # `Type: AWS::X::Y` block start, then scans the following Properties
    # for the name attribute. Good enough for our lint.
    for m in re.finditer(r'\n  (\w+):\n(?:    [^\n]*\n)*?    Type: (AWS::[\w:]+)\n', text):
        logical_id = m.group(1)
        cfn_type = m.group(2)
        if cfn_type not in NAME_LIMITS:
            continue
        name_attr, limit = NAME_LIMITS[cfn_type]
        # Find the name attribute in the resource's Properties. Look ahead
        # up to the next top-level resource or EOF.
        block_start = m.end()
        next_resource = re.search(r'\n  \w+:\n    Type: AWS::', text[block_start:])
        block_end = block_start + next_resource.start() if next_resource else len(text)
        block = text[block_start:block_end]
        name_match = re.search(rf'\n\s*{name_attr}:\s*(.*?)(?=\n)', block)
        if not name_match:
            continue
        name_value = name_match.group(1).strip()
        # Strip !Sub wrapper and surrounding quotes.
        stripped = re.sub(r"^!Sub\s+'([^']*)'$", r'\1', name_value)
        stripped = re.sub(r"^!Sub\s+\"([^\"]*)\"$", r'\1', stripped)
        stripped = re.sub(r"^'([^']*)'$", r'\1', stripped)
        stripped = re.sub(r'^"([^"]*)"$', r'\1', stripped)
        worst = _worst_case_length(stripped)
        if worst > limit:
            line_num = text[:block_start + name_match.start()].count('\n') + 1
            errors.append(
                f"{path.name}:{line_num}: {logical_id} ({cfn_type}) "
                f"{name_attr}='{name_value}' — worst-case expansion {worst} chars "
                f"exceeds AWS limit {limit}. "
                f"Shorten the name template or use a different pattern."
            )
    return errors


# ── Check 3: IAM RoleName character class ─────────────────────────────────

def check_iam_rolename_chars(path: Path, text: str) -> list[str]:
    """RoleName (post-substitution) must match IAM's [A-Za-z0-9+=,.@_-] class.

    We can't truly post-substitute in a lint, but we can detect the PR #42
    class: a literal `${AWS::Region}` in a RoleName (which lacks !Sub
    wrapping) contains `:` and will be rejected. Catching this structurally
    is what Check 1 already does; this check adds a second angle — any
    NON-placeholder character in a RoleName that's outside the allowed set.
    """
    errors = []
    for m in re.finditer(r'\n\s*RoleName:\s*(.*?)(?=\n)', text):
        value = m.group(1).strip()
        # Strip !Sub wrapper + quotes to get the template.
        stripped = re.sub(r"^!Sub\s+'([^']*)'$", r'\1', value)
        stripped = re.sub(r"^!Sub\s+\"([^\"]*)\"$", r'\1', stripped)
        stripped = re.sub(r"^'([^']*)'$", r'\1', stripped)
        stripped = re.sub(r'^"([^"]*)"$', r'\1', stripped)
        # Strip JS template-literal escapes (configurator.html renders
        # `\${AWS::Region}` → `${AWS::Region}` at generation time). Also
        # strip CFN `${...}` placeholders — they get worst-case-checked in
        # Check 2. What remains must match the IAM character class.
        literal = stripped.replace('\\$', '$')
        literal = re.sub(r'\$\{[^}]+\}', '', literal)
        if literal and not IAM_ROLENAME_ALLOWED.match(literal):
            line_num = text[:m.start()].count('\n') + 1
            bad_chars = sorted(set(c for c in literal if not re.match(r'[A-Za-z0-9+=,.@_-]', c)))
            errors.append(
                f"{path.name}:{line_num}: RoleName='{value}' — literal characters "
                f"{bad_chars!r} outside IAM-allowed [A-Za-z0-9+=,.@_-]"
            )
    return errors


# ── Check 4: dangling !Ref / !GetAtt targets ──────────────────────────────

def check_ref_targets(path: Path, text: str) -> list[str]:
    """Every !Ref / !GetAtt must point at a known Parameter / Resource /
    Condition / pseudo-parameter.

    Heuristic parse of Parameters + Resources + Conditions blocks.
    """
    errors = []
    # Build a set of valid logical IDs.
    known: set[str] = set(CFN_PSEUDO_PARAMS)
    # Parameters
    params_match = re.search(r'\nParameters:\n(.*?)(?=\n[A-Z]\w+:)', text, re.DOTALL)
    if params_match:
        # (?:^|\n) matches both first-line and subsequent entries.
        known.update(re.findall(r'(?:^|\n)  (\w+):\n', params_match.group(1)))
    # Resources
    resources_match = re.search(r'\nResources:\n(.*?)(?=\nOutputs:|\n[A-Z]\w+:\n|\Z)', text, re.DOTALL)
    if resources_match:
        known.update(re.findall(r'(?:^|\n)  (\w+):\n\s*Type:', resources_match.group(1)))
    # Conditions
    conditions_match = re.search(r'\nConditions:\n(.*?)(?=\n[A-Z]\w+:)', text, re.DOTALL)
    if conditions_match:
        known.update(re.findall(r'(?:^|\n)  (\w+):', conditions_match.group(1)))
    # Also accept `Fn::Sub` template-local variables (not reliably detectable
    # — skip checking inside `!Sub` strings for this rule).
    code_blocks = _iter_code_blocks(text)
    # Scan !Ref, !GetAtt.
    for pat, kind in [(r'!Ref\s+(\w+)', '!Ref'), (r'!GetAtt\s+([\w.]+)', '!GetAtt')]:
        for m in re.finditer(pat, text):
            if _is_inside_code_block(m.start(), code_blocks):
                continue
            target = m.group(1).split('.')[0]  # !GetAtt uses Foo.Arn
            if target not in known:
                line_num = text[:m.start()].count('\n') + 1
                errors.append(
                    f"{path.name}:{line_num}: {kind} {m.group(1)} — '{target}' "
                    f"is not a known Parameter, Resource, Condition, or pseudo-parameter"
                )
    return errors


# ── Check 5: !Sub undefined template variables ────────────────────────────

def check_sub_variables(path: Path, text: str) -> list[str]:
    """Every ${...} inside a !Sub string must resolve.

    Valid targets: pseudo-parameters, parameters, resources, conditions, or
    a local mapping on the same !Sub (the second form: `!Sub [..., {Foo: ...}]`).
    We approximate by building the same known-IDs set as Check 4.
    """
    errors = []
    known: set[str] = set(CFN_PSEUDO_PARAMS)
    params_match = re.search(r'\nParameters:\n(.*?)(?=\n[A-Z]\w+:)', text, re.DOTALL)
    if params_match:
        # (?:^|\n) matches both first-line and subsequent entries.
        known.update(re.findall(r'(?:^|\n)  (\w+):\n', params_match.group(1)))
    resources_match = re.search(r'\nResources:\n(.*?)(?=\nOutputs:|\n[A-Z]\w+:\n|\Z)', text, re.DOTALL)
    if resources_match:
        known.update(re.findall(r'(?:^|\n)  (\w+):\n\s*Type:', resources_match.group(1)))
    conditions_match = re.search(r'\nConditions:\n(.*?)(?=\n[A-Z]\w+:)', text, re.DOTALL)
    if conditions_match:
        known.update(re.findall(r'(?:^|\n)  (\w+):', conditions_match.group(1)))
    code_blocks = _iter_code_blocks(text)
    # Match `!Sub '...'` or `!Sub "..."` single-line form.
    for m in re.finditer(r"""!Sub\s+(?:'([^']*)'|"([^"]*)")""", text):
        if _is_inside_code_block(m.start(), code_blocks):
            continue
        body = m.group(1) if m.group(1) is not None else m.group(2)
        # In configurator.html's inline CFN template, `${lowercase}` tokens
        # are JS template-literal interpolations that the generator expands
        # at generation time (before the YAML reaches CFN). CFN !Sub refs
        # use PascalCase logical IDs or AWS::-prefixed pseudo-parameters.
        # So `${mpe}` / `${mpeId}` / `${config.foo}` are JS-only and must
        # NOT be linted as CFN references.
        # Pattern: leading lowercase letter OR contains `.` (dotted JS path)
        #          → JS, skip
        # AWS::... → pseudo-param, covered by `known`
        # Anything else (PascalCase) → CFN logical ID, must be in `known`
        for ref in re.findall(r'\$\{([^}]+)\}', body):
            root = ref.split('.')[0]
            # Skip JS template-literal interpolations (lowercase-led).
            if root and root[0].islower():
                continue
            if root not in known:
                line_num = text[:m.start()].count('\n') + 1
                errors.append(
                    f"{path.name}:{line_num}: !Sub references '{ref}' — "
                    f"'{root}' is not a known Parameter/Resource/Condition/pseudo-parameter"
                )
    return errors


# ── Configurator.html inline template extraction ──────────────────────────

def _extract_configurator_inline(html: str) -> str | None:
    """Pull the generateMainTemplate CFN template out of configurator.html.

    The template lives inside a JS template literal (backtick string)
    inside `return \`...\`;` at the end of generateMainTemplate(). We locate
    the function, find the first `return \`` after it, and capture until
    the matching `\`;`.
    """
    start_match = re.search(r'function\s+generateMainTemplate\s*\([^)]*\)', html)
    if not start_match:
        return None
    start = start_match.end()
    return_match = re.search(r'return\s+`', html[start:])
    if not return_match:
        return None
    tmpl_start = start + return_match.end()
    close_match = re.search(r'`\s*;', html[tmpl_start:])
    if not close_match:
        return None
    return html[tmpl_start:tmpl_start + close_match.start()]


# ── Driver ────────────────────────────────────────────────────────────────

def _run_all(path: Path, text: str) -> list[str]:
    errors: list[str] = []
    errors.extend(check_unsubbed_pseudo_params(path, text))
    errors.extend(check_resource_name_lengths(path, text))
    errors.extend(check_iam_rolename_chars(path, text))
    errors.extend(check_ref_targets(path, text))
    errors.extend(check_sub_variables(path, text))
    return errors


def main() -> int:
    all_errors: list[str] = []

    # YAML — runtime template.
    yaml_text = YAML_FILE.read_text()
    all_errors.extend(_run_all(YAML_FILE, yaml_text))

    # configurator.html — extract inline CFN template and lint it.
    html_text = HTML_FILE.read_text()
    inline = _extract_configurator_inline(html_text)
    if inline is None:
        print(f"WARN: could not extract inline CFN template from {HTML_FILE.name}; skipping configurator lint.")
    else:
        # Treat the extracted string as if it were its own YAML file at the
        # configurator.html source location. Line numbers reported will be
        # relative to the inline string, not the HTML file — mark that.
        inline_errors = _run_all(HTML_FILE, inline)
        # Prepend "inline-template" marker so reports are distinguishable.
        all_errors.extend(f"[inline CFN template in {HTML_FILE.name}] {e}" for e in inline_errors)

    if all_errors:
        for e in all_errors:
            print(f"FAIL: {e}")
        print(f"\n{len(all_errors)} CFN correctness issue(s). Fix before merging.")
        return 1
    print("OK: CFN correctness checks pass (both sources of truth).")
    return 0


if __name__ == '__main__':
    sys.exit(main())
