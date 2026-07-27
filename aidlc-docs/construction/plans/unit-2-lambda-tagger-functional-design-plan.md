# Functional Design Plan — unit-2-lambda-tagger

**Date**: 2026-03-25
**Phase**: CONSTRUCTION — Functional Design
**Unit**: unit-2-lambda-tagger (Runtime tagging engine)
**Inputs**: `aidlc-docs/inception/application-design/unit-of-work.md`, `unit-of-work-story-map.md`, `requirements.md`

## Unit Context

unit-2-lambda-tagger will deliver the runtime plane's core: a standalone Python 3.12
Lambda handler (`src/templates/lambda-handler.py`) that consumes SQS batches of
EventBridge-wrapped CloudTrail events, extracts the created resource ARN(s) per
service, evaluates scope and agreement-window rules against SSM config, and applies
the `map-migrated` tag idempotently (FR-4, FR-7, FR-10, FR-16; NFR-1, NFR-2, NFR-3,
NFR-9). The file will stay standalone and independently testable; the unit-1 build
embeds it into the CloudFormation template.

**Stories**: US-6 (scope precisely), US-13 (tags land within minutes).

**Dependencies**: consumes the SQS queue and SSM config parameter delivered by
unit-3; must implement one ARN extractor per service definition in unit-4's
registry (the handler-coverage parity audit, FR-16, will gate CI on both directions).

## Plan Steps

- [x] Step 1: Analyze unit definition, assigned stories, and FR/NFR traceability (FR-4, FR-7, FR-10, FR-16; NFR-1, NFR-2, NFR-3, NFR-9)
- [x] Step 2: Model the event-processing pipeline (batch → per-record → classify → tag → partial-failure report) → `business-logic-model.md`
- [x] Step 3: Design the three-path error classifier and its interaction with the SQS retry budget
- [x] Step 4: Define tagging, scoping, and defensive-parsing business rules → `business-rules.md`
- [x] Step 5: Define domain entities (TaggingEvent, ExtractionResult, ErrorClassification, MapConfig, ScopeDecision) → `domain-entities.md`
- [x] Step 6: Resolve embedded design questions (below) and reconcile answers into the artifacts

## Design Questions

## Question 1
How should ARN extraction be organized across ~80 services and 150+ event types?

A) One generic extractor that scans the CloudTrail `resources` array for anything ARN-shaped

B) A per-service extractor registry — one dedicated branch per service, each choosing among four extraction patterns (direct from `responseElements`, constructed from account+region+name, multi-resource, dependent-resource), with a validated `resources`-array suffix-match as last-resort fallback only

C) Regex over the raw event JSON

D) Other (please describe after [Answer]: tag below)

[Answer]: B — a dedicated extractor per service. A generic `resources`-array scan
trusts whatever AWS emits, and event shapes change without notice; a per-service
branch pins the known-good field for each event and can construct the ARN when the
event omits it. Every event-supplied ARN passes `is_wellformed_arn()` before use,
and every field access goes through `ci_get()` because CloudTrail key casing is
inconsistent (`aRN` vs `arn` would otherwise cause silent tag loss). This structure
also makes the FR-16 parity audit mechanical: one definition ↔ one extractor branch.

## Question 2
How should tagging failures be classified and handled?

A) Retry everything until the SQS budget is exhausted, then DLQ

B) A three-path classifier: **actionable** (real failure → let the message retry and ultimately DLQ so an alarm fires), **ignorable** (resource untaggable/out of scope/already deleted → drop with a log line), **transient** (resource not yet taggable or API throttled → return the message to the queue for redelivery)

C) Fail the whole batch on any error

D) Other (please describe after [Answer]: tag below)

[Answer]: B — three paths, because the three cases need three different outcomes.
Transient detection will use explicit TRANSIENT_MARKER substrings for slow
provisioners (Aurora, ElastiCache Serverless, MSK Serverless take 3–10 minutes to
become taggable) plus **both** throttle spellings (`ThrottledException` and
`ThrottlingException` — AWS services disagree). Without markers, a slow provisioner
would be classified actionable and DLQ prematurely inside its provisioning window.
Option C would let one bad event poison a batch — partial batch response
(`ReportBatchItemFailures`) isolates failures per message (NFR-2).

## Question 3
In what order should scope and eligibility checks run for each event?

A) Tag first, then check scope and untag if out of scope

B) Cheapest-and-most-decisive first: agreement date window → account allowlist → VPC scoping (fail closed for VPC-bound services when VPC scoping is on; `tag_non_vpc_services` switch for the rest) → then and only then extract + tag

C) Scope checks after ARN extraction only

D) Other (please describe after [Answer]: tag below)

[Answer]: B — evaluate scope before mutating anything. Untagging is forbidden
territory (adjacent to the NFR-6 hard rule) and tag-then-untag would create
transient mistags visible to cost tooling. Date window and account are decidable
from the event envelope alone; the VPC check runs where VPC identity is known, and
when it cannot be determined for a VPC-bound service under VPC scoping the decision
is **fail closed — do not tag** (US-6: only genuinely migrated workloads get credit;
a false tag is worse than a miss here because scope was explicitly restricted).

## Question 4
How should the Lambda obtain its configuration from `/auto-map-tagger/{mpe_id}/config`?

A) Call SSM GetParameter on every event

B) Read once per cold start, cache in a module-level global with a TTL; on refresh failure keep serving the last-known-good config and log; on first-load failure fail the batch (transient) so SQS redelivers

C) Bake config into the Lambda environment variables at deploy time

D) Other (please describe after [Answer]: tag below)

[Answer]: B — module-level cache with TTL. Per-event GetParameter would dominate
cost and add a throttle surface (NFR-8); environment variables would require a
Lambda update on every config change and split config across two sources (FR-10
mandates SSM as the sole source). The TTL bounds staleness after an upgrade edits
the parameter; last-known-good on refresh failure keeps tagging alive through SSM
blips, and failing the batch when no config has ever loaded is safe because the
retry budget redelivers.

## Question 5
What does the handler return to SQS for a mixed-outcome batch?

A) Success only if every record succeeded; otherwise raise and let the whole batch redeliver

B) `batchItemFailures` listing exactly the message IDs classified transient or actionable; ignorable and successfully tagged records are consumed

C) Always return success and rely on alarms to catch losses

D) Other (please describe after [Answer]: tag below)

[Answer]: B — per-message partial batch response. Whole-batch redelivery would
re-tag the successful records (safe, because tagging is idempotent per NFR-1, but
wasteful) and — worse — burn retry receives for messages that already succeeded,
shrinking the effective budget for the slow provisioner that actually needs it.
Idempotency remains the backstop that makes any redelivery safe.

## Exit Criteria

- All three functional-design artifacts exist under
  `aidlc-docs/construction/unit-2-lambda-tagger/functional-design/`.
- Every US-6 and US-13 acceptance criterion maps to a rule, entity, or flow in the artifacts.
- The three-path classifier, `ci_get()`, and ARN-validation invariants are stated as rules, not implementation notes.
- No open [Answer]: tags remain.
