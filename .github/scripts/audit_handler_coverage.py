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
  --parity       Subscription parity: every event subscribed in
                 src/js/services/*.js must have a dedicated extractor branch
                 in lambda-handler.py, be in _IGNORE_EVENTS, or be explicitly
                 baselined in .github/subscription_parity_baseline.txt as
                 relying on the universal ARN scan. Fails on new gaps.
  --parity-update  Overwrite the parity baseline with the current gap set.

Why --parity exists (the RunTask blind spot, 2026-07-14):
  ecs.js subscribed to RunTask but no extractor existed; the universal
  ARN scan only walks top-level keys + one-level dicts, and RunTask's
  ARN lives in a list (responseElements.tasks[].taskArn) → every
  Fargate task was silently dropped. Neither this script's E2E-coverage
  view (which inventories only explicit event_name== branches) nor any
  other gate could see it: a subscribed event with no branch was simply
  invisible. The parity check makes that class of gap a CI failure —
  new subscribed events must either get an extractor or be consciously
  baselined as universal-scan-reliant (reviewer sees the diff).

Exit codes:
  0 — coverage met or exceeds baseline
  1 — coverage regressed vs baseline (or parity gap)
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
TEMPLATE = REPO_ROOT / "configurator.yaml"
RESOURCE_GROUPS = REPO_ROOT / ".github" / "scripts" / "resource_groups"
BASELINE = REPO_ROOT / ".github" / "handler_coverage_baseline.txt"
SERVICES_DIR = REPO_ROOT / "src" / "js" / "services"
LAMBDA_HANDLER = REPO_ROOT / "src" / "templates" / "lambda-handler.py"
PARITY_BASELINE = REPO_ROOT / ".github" / "subscription_parity_baseline.txt"


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


# ---------------------------------------------------------------------------
# Subscription parity (--parity / --parity-update)

def collect_subscribed_events() -> dict[str, list[str]]:
    """Return {event_name: [service_file, ...]} from src/js/services/*.js."""
    events: dict[str, list[str]] = {}
    for js in sorted(SERVICES_DIR.glob("*.js")):
        text = js.read_text()
        m = re.search(r"events:\s*\[([^\]]*)\]", text, re.S)
        if not m:
            continue
        for name in re.findall(r"'([A-Za-z0-9]+)'", m.group(1)):
            events.setdefault(name, []).append(js.stem)
    return events


def collect_handler_events() -> tuple[set[str], set[str]]:
    """Return (explicit_branch_events, ignored_events) from lambda-handler.py.

    Explicit = any `event_name == 'X'` / `event_name in ('A','B')`
    comparison anywhere in the handler (extract_arn, extract_arns_multi,
    is_in_scope special cases — all count: the point is that SOMEONE
    consciously wrote code for the event).
    """
    text = LAMBDA_HANDLER.read_text()
    explicit = set(re.findall(r"event_name\s*==\s*'([A-Za-z0-9]+)'", text))
    for m in re.finditer(r"event_name\s+in\s*\(([^)]+)\)", text):
        explicit |= set(re.findall(r"'([A-Za-z0-9]+)'", m.group(1)))
    ign_m = re.search(r"_IGNORE_EVENTS = frozenset\(\[(.*?)\]\)", text, re.S)
    ignored = set(re.findall(r"'([A-Za-z0-9]+)'", ign_m.group(1))) if ign_m else set()
    return explicit, ignored


def _compute_parity_gaps() -> dict[str, list[str]]:
    """Subscribed events with no explicit branch and not ignored."""
    subscribed = collect_subscribed_events()
    explicit, ignored = collect_handler_events()
    return {e: svcs for e, svcs in sorted(subscribed.items())
            if e not in explicit and e not in ignored}


def _read_parity_baseline() -> set[str]:
    if not PARITY_BASELINE.is_file():
        return set()
    out: set[str] = set()
    for line in PARITY_BASELINE.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            out.add(line.split()[0])
    return out


def cmd_parity() -> int:
    gaps = _compute_parity_gaps()
    baselined = _read_parity_baseline()
    if not PARITY_BASELINE.is_file():
        print(f"ERROR: parity baseline {PARITY_BASELINE.relative_to(REPO_ROOT)} does not exist.", file=sys.stderr)
        print("Run `--parity-update` from a clean branch to generate it.", file=sys.stderr)
        return 2

    new_gaps = {e: svcs for e, svcs in gaps.items() if e not in baselined}
    stale = sorted(baselined - set(gaps))

    print(f"Subscribed events relying on the universal ARN scan: {len(gaps)} "
          f"({len(baselined)} baselined)")
    if stale:
        print(f"ℹ️  {len(stale)} baselined event(s) now have an explicit branch "
              f"(run --parity-update to prune): {', '.join(stale)}")
    if new_gaps:
        print()
        print(f"❌ NEW SUBSCRIPTION GAP: {len(new_gaps)} subscribed event(s) have no "
              "dedicated extractor branch and are not baselined:")
        for e, svcs in new_gaps.items():
            print(f"    - {e}  (subscribed by: {', '.join(svcs)})")
        print()
        print("    A subscribed event with no extractor silently relies on the")
        print("    universal ARN scan — which cannot reach ARNs inside lists")
        print("    (the RunTask/Fargate silent-loss class, 2026-07-14). Either:")
        print("      1. add a dedicated extractor branch in lambda-handler.py")
        print("         (with a real captured CloudTrail fixture, per rule 06), or")
        print("      2. verify the universal scan reaches the ARN for this event's")
        print("         real CloudTrail shape, then add the event to")
        print(f"         {PARITY_BASELINE.relative_to(REPO_ROOT)} with a comment.")
        return 1
    print("✅ No new subscription gaps.")
    return 0


def cmd_parity_update() -> int:
    gaps = _compute_parity_gaps()
    lines = [
        "# Subscription-parity baseline. Auto-generated by",
        "# audit_handler_coverage.py --parity-update; CI (--parity) fails on",
        "# any subscribed event that has no explicit lambda-handler.py branch,",
        "# is not in _IGNORE_EVENTS, and is not listed here.",
        "#",
        "# Every event below is ASSUMED to be reachable by the universal ARN",
        "# scan (top-level responseElements keys + one-level dicts). If an",
        "# event's ARN sits deeper (e.g. inside a list), the scan misses it",
        "# and the resource is silently untagged — verify before baselining",
        "# (the RunTask/Fargate lesson, 2026-07-14).",
        "#",
        "# Format: <event_name>  # optional comment",
        "",
    ]
    for e, svcs in gaps.items():
        lines.append(f"{e}  # {', '.join(svcs)}")
    PARITY_BASELINE.write_text("\n".join(lines) + "\n")
    print(f"Wrote {PARITY_BASELINE.relative_to(REPO_ROOT)}: {len(gaps)} baselined events")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--report", action="store_true", help="Print coverage snapshot (default)")
    group.add_argument("--check", action="store_true", help="Fail if coverage regressed vs baseline")
    group.add_argument("--update", action="store_true", help="Overwrite baseline with current state")
    group.add_argument("--parity", action="store_true", help="Fail on subscribed events lacking an extractor branch")
    group.add_argument("--parity-update", action="store_true", help="Overwrite the subscription-parity baseline")
    args = parser.parse_args()

    if args.parity or args.parity_update:
        for p in (SERVICES_DIR, LAMBDA_HANDLER):
            if not p.exists():
                print(f"ERROR: {p} not found", file=sys.stderr)
                return 2
        return cmd_parity_update() if args.parity_update else cmd_parity()

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
