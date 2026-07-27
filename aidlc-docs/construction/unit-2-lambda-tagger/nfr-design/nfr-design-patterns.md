# NFR Design Patterns — unit-2-lambda-tagger

**Date**: 2026-03-26
**Stage**: NFR Design
**Traceability**: U2-NFR-1..13; NFR-1, NFR-2, NFR-3, NFR-9 (requirements.md)

Six patterns realize the unit's NFR envelope. Each names the NFR(s) it serves.

## P-1: Queue-buffered retry with partial batch failure
**Serves**: U2-NFR-1 (latency worst case), U2-NFR-5 (zero silent loss), U2-NFR-6

SQS is the single retry authority. The handler attempts each record once per
receive; failures are reported per message via `ReportBatchItemFailures`, and
redelivery (180 s visibility × 5 receives = 900 s) provides the retry cadence.

- No in-handler retry loops, no SDK retry tuning — one budget, verifiable
  end-to-end, matching the slow-provisioner timescale (minutes, not milliseconds).
- Partial batch response isolates failures: a slow Aurora cluster in position 3
  never causes positions 1–2 and 4–10 to be redelivered, so no record's receive
  budget is spent on a neighbor's failure.
- Exhaustion is *visible by design*: receive #5 failing lands the message in the
  DLQ (unit-3), which alarms — the "zero silent loss" terminal state.

## P-2: Three-path error classification
**Serves**: U2-NFR-5, U2-NFR-6; NFR-2

Every failure is routed to exactly one of **actionable** (return to queue → will
DLQ + alarm if persistent), **ignorable** (consume + classified log line), or
**transient** (return to queue, expected to succeed within budget). The classifier
is a single function with an exhaustive decision order (transient checks first,
then ignorable, default actionable) so no error can fall through unclassified —
"unknown" defaults to actionable, never to silence.

## P-3: Transient markers for slow provisioners
**Serves**: U2-NFR-6; US-12

An explicit TRANSIENT_MARKER table maps known not-yet-taggable error signatures
(Aurora clusters, ElastiCache Serverless, MSK Serverless — 3–10 min provisioning)
to the transient path. Properties:

- **Enumerable and reviewed**: adding a slow-provisioning service without its
  marker is a named defect class (premature DLQ inside the provisioning window),
  and each covered service's golden-event test exercises its marker.
- **Fail-loud default**: an unmatched error is actionable — masking a real failure
  as transient would delay its alarm by the full 15-minute budget per message.

## P-4: Throttle-retry unification
**Serves**: U2-NFR-6; NFR-2 (rule R-11)

One throttle predicate matches **both** spellings AWS uses —
`ThrottledException` and `ThrottlingException` — and routes them transient. The
predicate is a single shared function so no future extractor branch can
reintroduce a single-spelling match; a regression test asserts both spellings.

## P-5: TTL config cache with last-known-good fallback
**Serves**: U2-NFR-10; FR-10

`MapConfig` is loaded from the single SSM parameter into a module-level cache with
a 5-minute TTL.

| Condition | Behavior |
|---|---|
| Cache fresh | Serve cached config, zero SSM calls |
| TTL expired, refresh succeeds | Swap in new config |
| TTL expired, refresh fails | Serve last-known-good; log the failure |
| No config ever loaded | Fail the batch as transient → SQS redelivers |

The 5-minute TTL bounds scope-staleness after an upgrade to less than the retry
budget; last-known-good keeps tagging alive through SSM blips; the never-loaded
case refuses to guess (tagging with unknown scope could violate US-6).

## P-6: Golden-event fixture testing
**Serves**: U2-NFR-7, U2-NFR-12, U2-NFR-13

Every covered service/event type ships with a **real captured** CloudTrail event
replayed through the full handler pipeline in unit tests — not a hand-written
fixture, because hand-written fixtures encode our assumptions and AWS's actual
emissions are the thing that drifts (key casing, `resources`-array shapes,
malformed ARNs). The corpus:

- Locks in `ci_get()` behavior against real casing variance.
- Asserts `is_wellformed_arn()` rejection + construction fallback on known-bad
  shapes.
- Doubles as the reachability proof for the FR-16 parity audit: every extractor
  branch is hit by at least one fixture.

## Defensive-parsing invariants (cross-cutting, serve U2-NFR-7)

Not patterns so much as handler-wide coding rules, restated here because they gate
review:

1. `ci_get()` for every CloudTrail field access — direct dict access is a defect.
2. `is_wellformed_arn()` before any event-supplied ARN is trusted (discard →
   construct fallback per rule R-8).
3. Narrow try/except around every external parse (JSON, `strptime`, SSM); failure
   scope is one record, never the invocation.

## Pattern → NFR coverage matrix

| | P-1 | P-2 | P-3 | P-4 | P-5 | P-6 | Invariants |
|---|---|---|---|---|---|---|---|
| U2-NFR-1 latency | x | | x | | | | |
| U2-NFR-4 idempotency | x (enabled by) | | | | | | |
| U2-NFR-5 zero silent loss | x | x | | | | | x |
| U2-NFR-6 retry budget | x | x | x | x | | | |
| U2-NFR-7 defensive parsing | | | | | | x | x |
| U2-NFR-10 config caching | | | | | x | | |
| U2-NFR-12/13 testability/parity | | | | | | x | |

(U2-NFR-2/3 sizing, U2-NFR-8/9 security posture, and U2-NFR-11 observability are
realized as configuration values and logging conventions in `logical-components.md`
rather than as patterns.)
