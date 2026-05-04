#!/usr/bin/env python3
"""
lint_event_prefixes.py — enforce that every Lambda handler verb is in the
EventBridge rule's prefix list.

The EventBridge rule is the first-line filter. Anything not matching a prefix
is silently dropped before reaching SQS — no log, no DLQ, no alarm. If a
handler is added (e.g. `elif event_name == 'UpdateCluster'`) without adding
`"Update"` to the prefix list, the handler is unreachable.

This script runs as Layer 1 and gates merge on that one-way parity.

Scope note: we do NOT flag prefixes that have no matching explicit handler.
A prefix without a matching `event_name == '...'` handler is NOT dead — the
Lambda's universal ARN scanner tags any event whose responseElements carries
a recognized ARN shape, without needing an explicit handler. For example,
`IssueCertificate` (ACM) is tagged via the universal path even though no
handler string-matches it. The set of such implicit matches is not knowable
statically, so we only enforce the direction we can prove.

Checks both source-of-truth files:
  - map2-auto-tagger-optimized.yaml   (runtime template)
  - configurator.html                 (customer-generated template, inline)

Exit codes:
  0 — every handler verb is in the prefix list (in both files)
  1 — drift detected
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
YAML_FILE = ROOT / 'map2-auto-tagger-optimized.yaml'
HTML_FILE = ROOT / 'build' / 'configurator.html'


def extract_prefixes(text: str) -> set[str]:
    """Pull every `- prefix: "Verb"` inside the eventName block."""
    m = re.search(
        r'eventName:\s*\n((?:\s*- prefix:\s*"[A-Za-z]+".*\n)+)',
        text,
    )
    if not m:
        return set()
    return set(re.findall(r'- prefix:\s*"([A-Za-z]+)"', m.group(1)))


def extract_handler_verbs(text: str) -> tuple[set[str], set[str]]:
    """Pull every event_name compared by the Lambda handler dispatcher.

    Returns (all_event_names, leading_verbs).
    """
    events: set[str] = set()
    # `event_name == 'Foo'`
    events |= set(re.findall(r"event_name\s*==\s*['\"]([A-Z][A-Za-z0-9]+)['\"]", text))
    # `event_name in ('Foo', 'Bar', ...)`
    for group in re.findall(r"event_name\s+in\s+\(([^)]+)\)", text):
        events |= set(re.findall(r"['\"]([A-Z][A-Za-z0-9]+)['\"]", group))
    verbs = {m.group(1) for m in (re.match(r'([A-Z][a-z]+)', e) for e in events) if m}
    return events, verbs


def check(path: Path) -> list[str]:
    text = path.read_text()
    prefixes = extract_prefixes(text)
    events, verbs = extract_handler_verbs(text)
    if not prefixes:
        return [f"{path.name}: could not find EventBridge prefix list"]
    if not verbs:
        # No handlers in this file is legitimate (e.g., configurator.html has
        # UI-only sections). Treat as pass-through, not a failure.
        return []
    errors: list[str] = []
    missing = verbs - prefixes
    if missing:
        # Report which specific event names map to each missing verb, to make
        # the fix obvious at a glance.
        lines = [f"{path.name}: handler verb(s) NOT in EventBridge prefix list —"]
        lines.append("  events for these verbs are silently dropped at EventBridge:")
        for verb in sorted(missing):
            examples = sorted(e for e in events if re.match(rf'{verb}(?:[A-Z]|$)', e))
            sample = ', '.join(examples[:3]) + ('...' if len(examples) > 3 else '')
            lines.append(f"    - {verb!r}: handler(s) for {sample}")
        errors.append('\n'.join(lines))
    return errors


def main() -> int:
    failures: list[str] = []
    for path in (YAML_FILE, HTML_FILE):
        failures.extend(check(path))
    if failures:
        for f in failures:
            print(f"FAIL: {f}")
        print(
            "\nFix: add the missing verb(s) to the `- prefix:` block in the "
            "EventBridge rule (AutoTagEventRule.Properties.EventPattern.detail."
            "eventName). Both map2-auto-tagger-optimized.yaml and configurator."
            "html must carry every verb used by an explicit `event_name == ...` "
            "handler, otherwise EventBridge drops the event before it reaches "
            "SQS (silent failure — no DLQ, no alarm)."
        )
        return 1
    print("OK: every handler verb is in the EventBridge prefix list (both files).")
    return 0


if __name__ == '__main__':
    sys.exit(main())
