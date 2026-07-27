# Code Generation Summary — unit-2-lambda-tagger

**Date**: 2026-03-26
**Phase**: CONSTRUCTION — Code Generation (Part 2: Generation)
**Plan**: `aidlc-docs/construction/plans/unit-2-lambda-tagger-code-generation-plan.md` (all steps [x])
**Stories**: US-6, US-13 — implemented

## Generated application code

### `src/templates/lambda-handler.py` (created)

Standalone Python 3.12 module — stdlib + runtime boto3 only, no external
dependencies, embedded into the CloudFormation template by the unit-1 build.
Structure, top to bottom:

| Section | Contents | Design source |
|---|---|---|
| Header + constants | Version log at cold start; TRANSIENT_MARKER table; throttle spellings tuple | U2-NFR-11; P-3/P-4 |
| Defensive helpers | `ci_get()` (case-insensitive CloudTrail access), `is_wellformed_arn()`, ARN constructor | R-8, R-9; U2-NFR-7 |
| Config Loader | `get_config()` — SSM `/auto-map-tagger/{mpe_id}/config`, module-level 5-min TTL cache, last-known-good fallback, transient batch-fail when never loaded | FR-10; P-5 |
| Scope Filter | Gate chain: agreement window → account allowlist → VPC scoping (fail-closed for VPC-bound services) → `tag_non_vpc_services` | US-6; R-1..R-6 |
| Extractor Registry | Per-service branches keyed by (eventSource, eventName), four patterns: direct / constructed / multi-resource (RunInstances: instances + volumes + ENIs) / dependent; malformed event ARNs discarded → construction fallback | FR-4, FR-16 |
| Error Classifier | Three-path decision: transient (markers + both throttle spellings) → ignorable signatures → default actionable | R-10, R-11; P-2 |
| Tag Applier | Resource Groups Tagging API default + native-API branches; lazy cached boto3 clients; idempotent apply | NFR-1 |
| `lambda_handler` | SQS batch loop, per-record exception boundary, `batchItemFailures` partial response | U2-NFR-5/6 |

Invariants held throughout: no direct dict access on CloudTrail data; no
in-handler retry loops (SQS is the sole retry authority); no outbound calls
beyond AWS service APIs (NFR-4); every outcome emits one classifiable log line
(TAGGED / IGNORED / TRANSIENT / ACTIONABLE).

## Generated tests

| File | Covers |
|---|---|
| `tests/unit/lambda.test.js` (created) | `ci_get` casing matrix; `is_wellformed_arn` accept/reject sets; scope-filter table tests R-1..R-6 incl. fail-closed VPC rule; classifier tests asserting **both** throttle spellings and default-actionable; mixed-batch `batchItemFailures` semantics |
| `tests/unit/lambda-golden-events.test.js` (created) | Golden-event corpus replay — each extractor branch driven by a real captured CloudTrail event through the full pipeline (P-6) |
| `tests/fixtures/` (created) | Captured CloudTrail event JSON, one per covered service/event type — real events, never hand-written (unit-4 contract) |

Tests execute the Python handler from the repo's vitest suite (subprocess
harness), keeping one `npm test` entry point across all units. Test *execution*
and the FR-16 parity audit run in the Build and Test stage.

## Story acceptance mapping

| Acceptance criterion | Realized by |
|---|---|
| US-6 AC-1 out-of-scope account not tagged | Scope Filter account gate + table test |
| US-6 AC-2 VPC allowlist honored | VPC gate (incl. fail-closed) + table test |
| US-6 AC-3 `tag_non_vpc_services=false` honored | Non-VPC switch gate + table test |
| US-13 AC-1 tag present ≤ 90 s typical | Single-pass pipeline; latency verified live in Build and Test (claim bar: live verification, not test-green) |
| US-13 AC-2 outside agreement window not tagged | Date-window gate + table test |

## Known deferred items

- **Live verification** of tag latency and per-service coverage claims happens in
  Build and Test — no service will be documented as "supported" until a real
  resource is observed to receive the tag.
- The extractor registry is generated against the unit-4 definition list as of
  this date; subsequent definition additions are gated by the parity audit
  (`audit_handler_coverage.py`), which fails CI on any gap in either direction.
