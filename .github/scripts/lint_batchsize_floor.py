#!/usr/bin/env python3
"""
lint_batchsize_floor.py — regression guard for the Lambda SQS event source
mapping's BatchSize + ReportBatchItemFailures configuration.

v20.8.0 (plan-PR #57) raised BatchSize from 1 to 10 and added
FunctionResponseTypes=[ReportBatchItemFailures] to close the §1.123/§1.124
drain-rate regression (Phase 16: 1.3 msg/s per Lambda -> ~2.8hr backlog on a
15K-resource burst). A silent revert to BatchSize: 1 would restore the old
bottleneck without any Layer 2 signal because our E2E creates ~50 resources,
not 15K.

Rules enforced in both sources of truth:
  - EventQueueMapping.BatchSize must be present and >= 10.
  - EventQueueMapping.FunctionResponseTypes must include ReportBatchItemFailures.

If a future PR legitimately lowers BatchSize (e.g. under a new architecture),
raise this floor in the same PR and document the reason in the CHANGELOG.
This lint exists to catch accidental regressions, not to prohibit deliberate
re-architecture.

Exit codes:
  0 — both files pass.
  1 — at least one file is out of compliance.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
YAML_FILE = ROOT / 'map2-auto-tagger-optimized.yaml'
HTML_FILE = ROOT / 'build' / 'configurator.html'

MIN_BATCH_SIZE = 10


def extract_event_source_mapping(text: str, origin: str) -> tuple[str | None, list[str]]:
    """Return (block, errors) where block is the EventQueueMapping resource body."""
    errors: list[str] = []
    # Match the block from "EventQueueMapping:" until the next unindented
    # resource declaration. Works for both the YAML (2-space indent) and the
    # inline template inside the JS template literal.
    m = re.search(
        r'(?ms)^  EventQueueMapping:\n(.*?)(?=\n  [A-Z]\w+:\n    Type:|\n  # )',
        text,
    )
    if not m:
        errors.append(f'{origin}: EventQueueMapping resource block not found')
        return None, errors
    return m.group(1), errors


def check_batch_size(block: str, origin: str) -> list[str]:
    errors: list[str] = []
    bs = re.search(r'\n\s+BatchSize:\s*(\d+)', block)
    if not bs:
        errors.append(f'{origin}: BatchSize property missing from EventQueueMapping')
    else:
        n = int(bs.group(1))
        if n < MIN_BATCH_SIZE:
            errors.append(
                f'{origin}: BatchSize={n} is below the v20.8.0 floor '
                f'({MIN_BATCH_SIZE}). Drain rate regresses to ~1/BatchSize of '
                f'prior throughput. If this is a deliberate change, raise the '
                f'floor in lint_batchsize_floor.py and explain in CHANGELOG.'
            )

    frt = re.search(r'\n\s+FunctionResponseTypes:\s*\n((?:\s+-\s+\S+\n?)+)', block)
    if not frt:
        errors.append(
            f'{origin}: FunctionResponseTypes missing from EventQueueMapping. '
            f'BatchSize>1 without ReportBatchItemFailures means any transient '
            f'failure redelivers the whole batch, wasting ~10x throughput on '
            f'retries of already-tagged records.'
        )
    elif 'ReportBatchItemFailures' not in frt.group(1):
        errors.append(
            f'{origin}: FunctionResponseTypes is set but missing '
            f"'ReportBatchItemFailures'"
        )
    return errors


def main() -> int:
    all_errors: list[str] = []

    for label, path in (('YAML', YAML_FILE), ('configurator.html', HTML_FILE)):
        text = path.read_text()
        block, block_errors = extract_event_source_mapping(text, label)
        all_errors.extend(block_errors)
        if block is not None:
            all_errors.extend(check_batch_size(block, label))

    if all_errors:
        print('BatchSize floor lint FAILED:')
        for e in all_errors:
            print(f'  - {e}')
        return 1

    print(
        f'BatchSize floor lint OK — BatchSize >= {MIN_BATCH_SIZE} and '
        f'ReportBatchItemFailures present in both sources of truth.'
    )
    return 0


if __name__ == '__main__':
    sys.exit(main())
