# NFR Design Plan — unit-2-lambda-tagger

**Date**: 2026-03-26
**Phase**: CONSTRUCTION — NFR Design
**Unit**: unit-2-lambda-tagger (Runtime tagging engine)
**Inputs**: `aidlc-docs/construction/unit-2-lambda-tagger/nfr-requirements/`, functional-design artifacts

## Context

NFR Requirements quantified the envelope (U2-NFR-1..13). This stage selects the
design patterns and logical components that realize those numbers: how the retry
budget, classifier, defensive parsing, config caching, and testability
requirements become structure in the handler.

## Plan Steps

- [x] Step 1: Analyze NFR requirements and identify pattern candidates per NFR
- [x] Step 2: Resolve resilience/performance/security pattern questions (below)
- [x] Step 3: Document the selected patterns and how each maps to its NFR → `nfr-design-patterns.md`
- [x] Step 4: Define the logical components inside and around the handler → `logical-components.md`
- [x] Step 5: Verify every U2-NFR maps to at least one pattern or component

## Design Questions

## Question 1
How should retries be structured — inside the handler, in the SDK, or in the queue?

A) In-handler retry loops with exponential backoff around each tag call

B) In the queue: the handler attempts once per receive; transient/actionable failures are reported per-message and SQS redelivery (180 s × 5) is the *only* retry mechanism; SDK retries stay at defaults

C) Aggressive SDK retry tuning (10+ attempts) so most transients resolve in-invocation

D) Other (please describe after [Answer]: tag below)

[Answer]: B — one retry authority. Slow provisioners need *minutes* between
attempts (3–10 min to become taggable); in-invocation backoff (A) or SDK stacking
(C) would burn Lambda duration waiting, still miss the window, and make the 900 s
coupled budget impossible to reason about. The queue's redelivery interval is the
right cadence for the dominant transient class, and idempotency (U2-NFR-4) makes
each re-attempt safe.

## Question 2
How should transient conditions be recognized reliably across ~80 services?

A) Treat any exception as transient

B) An explicit TRANSIENT_MARKER table — substrings of known not-yet-taggable error messages per slow-provisioning service — plus a unified throttle check matching both `ThrottledException` and `ThrottlingException`; anything unmatched is classified actionable (never silently transient)

C) Retry on error class (all ClientError = transient)

D) Other (please describe after [Answer]: tag below)

[Answer]: B — explicit and enumerable beats clever. "Everything transient" (A/C)
would cycle genuinely broken events through the whole budget and delay the alarm by
15 minutes per message while masking real failures. The marker table is a reviewed,
tested artifact: adding a slow-provisioning service without its marker is a defined
defect class (premature DLQ), caught by that service's golden-event test.

## Question 3
How should configuration freshness be balanced against SSM call volume?

A) No cache — read SSM per event

B) Module-level cache with 5-minute TTL; serve last-known-good on refresh failure; fail batch as transient only when no config has ever loaded

C) Cache forever per container, refresh only on cold start

D) Other (please describe after [Answer]: tag below)

[Answer]: B — per U2-NFR-10. Forever-caching (C) would leave long-lived warm
containers running stale scope for hours after an upgrade edits the parameter —
a scope-correctness issue, not just staleness. Five minutes bounds the exposure
window to less than the retry budget while keeping SSM traffic negligible.

## Question 4
What testing pattern locks in the defensive-parsing NFRs against AWS event-shape drift?

A) Hand-written minimal event fixtures per service

B) A golden-event corpus: one *real captured* CloudTrail event per covered service/event type, replayed through the full handler in unit tests; casing and malformed-ARN regressions asserted against it

C) Mock boto3 at the call site and test extractors in isolation only

D) Other (please describe after [Answer]: tag below)

[Answer]: B — hand-written fixtures (A) encode our assumptions, which is exactly
what drifts; real captured events encode AWS's actual behavior, including the
casing inconsistencies `ci_get()` exists for. Isolated extractor tests (C) are
included *in addition*, but the corpus replay through the full pipeline is the
static defense against shape drift between live verifications.

## Exit Criteria

- Both artifacts exist under `aidlc-docs/construction/unit-2-lambda-tagger/nfr-design/`.
- Every U2-NFR-1..13 maps to a named pattern or component.
- No open [Answer]: tags remain.
