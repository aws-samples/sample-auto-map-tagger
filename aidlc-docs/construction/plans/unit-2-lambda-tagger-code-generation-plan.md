# Code Generation Plan — unit-2-lambda-tagger

**Date**: 2026-03-26
**Phase**: CONSTRUCTION — Code Generation (Part 1: Planning)
**Unit**: unit-2-lambda-tagger (Runtime tagging engine)
**Inputs**: functional-design, nfr-requirements, nfr-design artifacts for this unit

## Unit Generation Context

- **Stories implemented**: US-6 (scope precisely), US-13 (tags land within minutes)
- **Code location**: `src/templates/lambda-handler.py` (workspace root, per
  aidlc-state.md — standalone single file, embedded into the CFN template by the
  unit-1 build). Tests in `tests/unit/`, fixtures in `tests/unit/fixtures/`.
- **Dependencies**: unit-4 service-definition registry (extractor parity, FR-16);
  unit-3 queue/SSM/role contracts (180s×5 budget, config schema, least-privilege
  role). Extractor branches are generated against the unit-4 definition list
  current at generation time; the parity audit catches later drift.
- **Interfaces exposed**: `lambda_handler(event, context)` (SQS batch entry,
  partial batch response); importable helpers (`ci_get`, `is_wellformed_arn`,
  classifier) for tests.
- **Owned data**: none persisted — the unit reads SSM config and writes tags only.

## Generation Steps

- [x] Step 1: **Handler skeleton** — module docstring, version log line at cold start, `lambda_handler` batch loop returning `batchItemFailures`, per-record try/except boundary (no exception escapes a record). *(Stories: US-13; U2-NFR-2, U2-NFR-5)*
- [x] Step 2: **Defensive helpers** — `ci_get()` case-insensitive CloudTrail access; `is_wellformed_arn()`; ARN constructor (partition/service/region/account/name). *(R-8, R-9; U2-NFR-7)*
- [x] Step 3: **Config Loader** — SSM read of `/auto-map-tagger/{mpe_id}/config`, module-level TTL cache (5 min), last-known-good fallback, fail-batch-as-transient when never loaded; narrow exception wrapping incl. `strptime`. *(FR-10; U2-NFR-10)*
- [x] Step 4: **Scope Filter** — gate chain: agreement window → account allowlist → VPC scoping with fail-closed rule for VPC-bound services → `tag_non_vpc_services` switch; pure function returning ScopeDecision + rejected_by. *(Stories: US-6; R-1..R-6)*
- [x] Step 5: **Extractors — direct pattern** — services whose ARN is read from `responseElements` (RDS et al.), all access via `ci_get()`. *(Stories: US-13; FR-4)*
- [x] Step 6: **Extractors — constructed pattern** — S3, Lambda, and services whose events omit the ARN; also serves as the malformed-ARN fallback path. *(R-8)*
- [x] Step 7: **Extractors — multi-resource pattern** — EC2 `RunInstances` loop over instances + attached volumes + ENIs. *(FR-4)*
- [x] Step 8: **Extractors — dependent-resource pattern** — primary + cost-bearing dependents (e.g. RDS instance + storage). *(FR-4)*
- [x] Step 9: **Error Classifier** — three-path decision function: TRANSIENT_MARKER table (Aurora, ElastiCache Serverless, MSK Serverless), unified throttle predicate matching **both** `ThrottledException` and `ThrottlingException`, ignorable signatures, default actionable. *(R-10, R-11; U2-NFR-6; P-2/P-3/P-4)*
- [x] Step 10: **Tag Applier** — Resource Groups Tagging API default path + native-API branches where required; lazy cached boto3 clients; idempotent apply, no read-before-write. *(NFR-1/U2-NFR-4)*
- [x] Step 11: **Structured logging** — one classifiable line per outcome (TAGGED / IGNORED reason / TRANSIENT marker / ACTIONABLE code); cold-start version line. *(U2-NFR-11; NFR-12)*
- [x] Step 12: **Unit tests — helpers and rules** — `ci_get` casing matrix, ARN validation accept/reject sets, scope-filter table tests for R-1..R-6 (incl. fail-closed), classifier tests asserting both throttle spellings and default-actionable. *(U2-NFR-12)*
- [x] Step 13: **Unit tests — golden-event corpus replay** — every extractor branch driven by a real captured CloudTrail event fixture through the full pipeline; casing and malformed-ARN regressions locked in. *(P-6; U2-NFR-13, FR-16)*
- [x] Step 14: **Unit tests — batch semantics** — mixed-outcome batch returns exactly the transient+actionable message IDs; ignorable and tagged records consumed; timeout < visibility assertion on configured constants. *(U2-NFR-6)*
- [x] Step 15: **Code generation summary** — write `aidlc-docs/construction/unit-2-lambda-tagger/code/code-generation-summary.md`.

## Story Traceability

| Story | Delivered by steps |
|---|---|
| US-6 Scope precisely | 3, 4, 12 |
| US-13 Tags land within minutes | 1, 5–10, 13, 14 |

## Constraints carried into generation

- Zero external dependencies: stdlib + runtime boto3 only (tech-stack D-2).
- Single file: all helpers live in `lambda-handler.py` (D-3).
- No in-handler retry loops; SQS is the only retry authority (nfr-design Q1).
- Direct dict access on CloudTrail data is a review-blocking defect (R-9).
