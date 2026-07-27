# Unit Test Execution

**Stage**: Build and Test (Construction)
**Date**: 2026-03-27
**Framework**: Vitest (`vitest run`), tests in `tests/unit/`, fixtures in `tests/fixtures/`

Unit tests were generated per unit during Code Generation. This document covers running the consolidated suite. Per the Requirements Analysis extension decisions, property-based testing is **not** used — the tagger is a thin event-routing layer, so example-based tests plus a golden CloudTrail event corpus give better coverage per effort.

## Run Unit Tests

### 1. Execute All Unit Tests

```bash
npm test          # vitest run — single pass, CI mode
npm run test:watch  # vitest watch mode, for local iteration
```

The build must be current first (`npm run build && npm run build:yaml`) because several suites assert against the **built artifacts**, not just the sources.

### 2. Review Test Results

- **Expected**: 63 tests pass across 9 test files, 0 failures
- **Test Coverage**: coverage is tracked by area (below) rather than a line-percentage gate — the highest-risk logic (Lambda extraction, script generation, delete-safety) has dedicated suites. Do not hardcode test counts in docs elsewhere; they change on every PR.
- **Test Report Location**: console output (Vitest default reporter). CI surfaces the same output in the `build.yml` workflow logs.

### Coverage areas (one file per concern)

| Test file | What it locks in |
|---|---|
| `build.test.js` | Built `configurator.html` is well-formed: no unresolved placeholders, all functions present, Lambda handler embedded |
| `services.test.js` | Every service definition has the standard shape (`source`, `events`, `permissions`); registry (`index.js`) completeness |
| `i18n.test.js` | All 7 locales (en, ja, ko, th, vi, id, zh) have every key — no missing translations (hard requirement: APJ field teams are primary users) |
| `deploy-script.test.js` | Generated `deploy.sh` correctness incl. single-quote containment of user input (shell-injection defense) |
| `delete-script.test.js` | Generated `delete.sh` removes infrastructure only — **asserts it can never remove `map-migrated` tags** (non-negotiable data-safety rule) |
| `upgrade-script.test.js` | Generated `upgrade.sh` correctness (`UsePreviousValue` handling) |
| `lambda.test.js` | Lambda handler logic: `ci_get()` case-insensitive access, ARN extraction/validation, three-path error classifier (actionable / ignorable / transient), throttle-spelling matching |
| `lambda-golden-events.test.js` | Golden-event corpus: real captured CloudTrail events from `tests/fixtures/*.json` replayed through the Python extractor |
| `lambda-runtask.test.js` | Multi-resource extraction (e.g., ECS RunTask) — one event yielding multiple ARNs |

### Golden-event fixture policy (mandatory)

Every new service handler **lands with a real captured CloudTrail event fixture** in `tests/fixtures/` — not a hand-written one. AWS changes event shapes without notice; a golden-event corpus replayed through the actual extractor is the only static defense against that drift. To add one:

1. Create the resource in a test account with CloudTrail enabled.
2. Capture the raw CloudTrail event JSON verbatim (redact account IDs consistently).
3. Save as `tests/fixtures/<service>-<event>-cloudtrail-event.json`.
4. Add the replay case to `lambda-golden-events.test.js` asserting the exact ARNs extracted.

The Python Lambda tests work by invoking the real `src/templates/lambda-handler.py` (the same file embedded into the template at build time), so what is tested is what ships.

### 3. Fix Failing Tests

If tests fail:

1. Review the Vitest output — it names the file, the assertion, and the diff.
2. Identify failing test cases and classify:
   - **Build-output tests failing** → the artifact is stale; run `npm run build && npm run build:yaml` and re-test before touching code.
   - **Service/i18n tests failing** → a definition or locale file is incomplete; fix the source file, not the test.
   - **Golden-event tests failing** → either your extractor change broke a real event shape (fix the extractor), or AWS genuinely changed the shape (capture a fresh fixture and treat as an incident — check whether the old shape must still be supported).
   - **`delete-script.test.js` failing** → **stop.** This test guards the hard rule that deletion never removes `map-migrated` tags. Never weaken this test to make a change pass; redesign the change.
3. Fix the code issue at the root cause (look for sibling bugs of the same class).
4. Rerun `npm test` until all pass, then run the full verify loop:

```bash
npm run build && npm run build:yaml && npm test && npm run verify
```

Every bug fix lands with a regression test that locks in the corrected behavior.
