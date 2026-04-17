#!/usr/bin/env python3
"""
audit_handler_coverage.py — Check E2E test coverage of the auto-tagger
Lambda's event handlers.

Why this exists:
  The Lambda handles 120+ CloudTrail events. The E2E test suite creates
  boto3 resources to trigger those events. If a handler exists but no
  resource-creation test exists, a regression in that handler ships
  undetected (PR #8 demonstrated this concretely).

  A separate check (`new-handler-coverage-check` in lint.yml) already
  warns on handlers added in the current PR. This script is the
  complement: it tracks the full coverage snapshot and fails CI if a
  previously-covered handler becomes uncovered.

Modes:
  --report       Print the current coverage snapshot (for humans / PR comments).
  --check        Exit non-zero if coverage regressed vs the baseline at
                 .github/handler_coverage_baseline.txt. Default mode.
  --update       Overwrite the baseline with the current state. Use from a
                 clean main branch after intentionally adding coverage.

Exit codes:
  0 — coverage met or exceeds baseline
  1 — coverage regressed vs baseline
  2 — argparse / setup error

The baseline file lists one entry per line, in sorted order:
  COVERED    <event_name>[|<event_source>]
  UNCOVERED  <event_name>[|<event_source>]

Regression = any line that was COVERED in baseline but is now UNCOVERED,
or any new UNCOVERED handler (i.e., handler was added without adding a
matching E2E resource creation).
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = REPO_ROOT / "map2-auto-tagger-optimized.yaml"
RESOURCE_GROUPS = REPO_ROOT / ".github" / "scripts" / "resource_groups"
BASELINE = REPO_ROOT / ".github" / "handler_coverage_baseline.txt"


def extract_handlers(yaml_text: str) -> list[tuple[str, str]]:
    """Return list of (event_name, event_source) pairs the Lambda handles.

    Covers three patterns:
      1. `event_name == 'Xxx' and event_source == 'yyy.amazonaws.com'`
      2. `event_name == 'Xxx'` (no source)
      3. `event_name in ('A', 'B', 'C')` — each event with same source below
    """
    pairs: list[tuple[str, str]] = []

    # Pattern 1 + 2: singular event_name
    singular = re.compile(
        r"event_name\s*==\s*'([A-Z][a-zA-Z0-9]+)'(?:\s*and\s*event_source\s*==\s*'([a-z0-9.-]+\.amazonaws\.com)')?"
    )
    for m in singular.finditer(yaml_text):
        pairs.append((m.group(1), m.group(2) or ""))

    # Pattern 3: `event_name in ('A', 'B')` — source may follow
    list_pat = re.compile(
        r"event_name\s+in\s*\(([^)]+)\)(?:\s*and\s*event_source\s*==\s*'([a-z0-9.-]+\.amazonaws\.com)')?"
    )
    for m in list_pat.finditer(yaml_text):
        inner, src = m.group(1), m.group(2) or ""
        for name in re.findall(r"'([A-Z][a-zA-Z0-9]+)'", inner):
            pairs.append((name, src))

    # De-dup
    return sorted(set(pairs))


def collect_e2e_calls() -> set[str]:
    """Return set of lowercased event-name keys triggered by E2E scripts.

    boto3 snake_case names map ambiguously to CloudTrail CamelCase
    (create_db_cluster → CreateDBCluster, NOT CreateDbCluster). Easier
    to compare both sides in a case-insensitive, underscore-free form.
    """
    if not RESOURCE_GROUPS.is_dir():
        return set()

    # Method prefixes that cover CloudTrail "Create*"/"Run*"/etc events
    # the auto-tagger Lambda keys on.
    _PREFIXES = (
        "create_", "run_", "put_", "issue_", "register_",
        "start_", "allocate_", "publish_", "restore_",
        "import_", "copy_", "request_", "activate_", "enable_",
    )

    method_re = re.compile(r"\.([a-z_][a-z0-9_]*)\(")
    names: set[str] = set()
    for py in RESOURCE_GROUPS.glob("*.py"):
        text = py.read_text()
        for m in method_re.findall(text):
            if any(m.startswith(p) for p in _PREFIXES):
                names.add(m.replace("_", "").lower())
    return names


def classify(handlers: list[tuple[str, str]], e2e_events: set[str]) -> list[tuple[str, str, bool]]:
    """Return list of (event_name, event_source, covered)."""
    return [(n, s, n.lower() in e2e_events) for (n, s) in handlers]


# ---------------------------------------------------------------------------

def _fmt_key(name: str, source: str) -> str:
    return f"{name}|{source}" if source else name


def _read_baseline() -> dict[str, bool]:
    """Return {event_key: covered_bool} from the baseline file."""
    if not BASELINE.is_file():
        return {}
    out: dict[str, bool] = {}
    for line in BASELINE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        if len(parts) != 2:
            continue
        status, key = parts
        out[key] = status == "COVERED"
    return out


def _write_baseline(rows: list[tuple[str, str, bool]]) -> None:
    lines = [
        "# Auto-tagger Lambda handler coverage baseline. Auto-generated by",
        "# audit_handler_coverage.py --update. CI enforces no regressions.",
        "#",
        "# Format: <STATUS> <event_name>[|<event_source>]",
        "#",
        "# Regeneration: python3 .github/scripts/audit_handler_coverage.py --update",
        "",
    ]
    for name, source, covered in sorted(rows):
        status = "COVERED  " if covered else "UNCOVERED"
        lines.append(f"{status} {_fmt_key(name, source)}")
    BASELINE.write_text("\n".join(lines) + "\n")


def cmd_report(rows: list[tuple[str, str, bool]]) -> int:
    covered = sum(1 for _, _, c in rows if c)
    total = len(rows)
    pct = (covered / total * 100) if total else 0.0

    print(f"Lambda handlers: {total}")
    print(f"E2E-covered:     {covered} ({pct:.1f}%)")
    print(f"Uncovered:       {total - covered}")
    print()
    print("UNCOVERED HANDLERS:")
    for name, source, covered in sorted(rows):
        if not covered:
            print(f"  {name}" + (f" [{source}]" if source else ""))
    return 0


def cmd_check(rows: list[tuple[str, str, bool]]) -> int:
    baseline = _read_baseline()
    if not baseline:
        print(f"ERROR: baseline {BASELINE.relative_to(REPO_ROOT)} does not exist.", file=sys.stderr)
        print("Run `python3 .github/scripts/audit_handler_coverage.py --update` from a", file=sys.stderr)
        print("clean branch to generate the initial baseline.", file=sys.stderr)
        return 2

    regressed: list[str] = []
    new_uncovered: list[str] = []
    current: dict[str, bool] = {_fmt_key(n, s): c for (n, s, c) in rows}

    for key, covered_now in current.items():
        was_covered = baseline.get(key)
        if was_covered is True and covered_now is False:
            regressed.append(key)
        elif was_covered is None and covered_now is False:
            new_uncovered.append(key)

    covered_now_count = sum(1 for c in current.values() if c)
    covered_baseline_count = sum(1 for c in baseline.values() if c)
    print(f"Coverage now:      {covered_now_count}/{len(current)}")
    print(f"Coverage baseline: {covered_baseline_count}/{len(baseline)}")
    print()

    fail = False
    if regressed:
        fail = True
        print(f"❌ REGRESSION: {len(regressed)} handler(s) lost E2E coverage:")
        for key in sorted(regressed):
            print(f"    - {key}")
        print()
        print("    These handlers were exercised by E2E in the baseline but are")
        print("    no longer. Either restore the resource-creation test, or, if")
        print("    the handler was intentionally removed, run `--update` to")
        print("    regenerate the baseline.")
        print()

    if new_uncovered:
        fail = True
        print(f"❌ NEW UNCOVERED: {len(new_uncovered)} new handler(s) without E2E tests:")
        for key in sorted(new_uncovered):
            print(f"    - {key}")
        print()
        print("    Add a matching resource-creation call in a resource_groups/*.py")
        print("    module. If the handler is truly untestable, add it to the")
        print("    baseline via `--update` with a clear justification in the PR.")
        print()

    if fail:
        return 1

    # Bonus: surface newly covered handlers (good news)
    newly_covered: list[str] = []
    for key, covered_now in current.items():
        if covered_now and baseline.get(key) is False:
            newly_covered.append(key)
    if newly_covered:
        print(f"✅ NEWLY COVERED: {len(newly_covered)} handler(s) gained E2E coverage:")
        for key in sorted(newly_covered):
            print(f"    + {key}")
        print("    (Run `--update` to record this in the baseline.)")

    print("✅ No coverage regression.")
    return 0


def cmd_update(rows: list[tuple[str, str, bool]]) -> int:
    _write_baseline(rows)
    covered = sum(1 for _, _, c in rows if c)
    print(f"Wrote {BASELINE.relative_to(REPO_ROOT)}: {covered}/{len(rows)} covered")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--report", action="store_true", help="Print coverage snapshot (default)")
    group.add_argument("--check", action="store_true", help="Fail if coverage regressed vs baseline")
    group.add_argument("--update", action="store_true", help="Overwrite baseline with current state")
    args = parser.parse_args()

    if not TEMPLATE.is_file():
        print(f"ERROR: template not found at {TEMPLATE}", file=sys.stderr)
        return 2

    handlers = extract_handlers(TEMPLATE.read_text())
    e2e_events = collect_e2e_calls()
    rows = classify(handlers, e2e_events)

    if args.update:
        return cmd_update(rows)
    if args.check:
        return cmd_check(rows)
    return cmd_report(rows)


if __name__ == "__main__":
    sys.exit(main())
