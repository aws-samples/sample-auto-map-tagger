# Business Rules — unit-2-lambda-tagger

**Date**: 2026-03-25
**Stage**: Functional Design
**Traceability**: FR-4, FR-7, FR-10; NFR-1, NFR-2, NFR-3, NFR-9; US-6, US-13

Rules are numbered R-1..R-12. Each will land with at least one unit test; rules
marked **hard** are non-negotiable design constraints.

## Eligibility rules

### R-1 — Tag only within the agreement window
A resource is tagged only if its creation event time falls within
[agreement_start, agreement_end] from `MapConfig`. Outside the window the event is
**ignorable** (logged, consumed, not tagged). MAP credit rules make out-of-window
tags meaningless at best and audit findings at worst (US-13 AC-2).

### R-2 — Tag only in-scope accounts
With an explicit `scoped_account_ids` list, an event whose `recipientAccountId` is
not in the list is **ignorable** — never tagged (US-6 AC-1). `scope_mode = ALL`
admits every account the pipeline is deployed to.

### R-3 — Ignore read-only and irrelevant events
Only resource-creation events named in the service definitions are processed.
Anything else that arrives (unknown eventName, read-only call, malformed envelope)
is **ignorable** with a distinct log line — never an error, never a retry.

## Scoping rules (US-6)

### R-4 — VPC allowlist for VPC-bound resources
When `scoped_vpc_ids` is non-empty, a VPC-bound resource is tagged only if its VPC
ID is in the list (US-6 AC-2).

### R-5 — **Hard**: fail closed for VPC-bound services under VPC scoping
When VPC scoping is active and the resource is VPC-bound but its VPC identity
cannot be determined from the event, the decision is **do not tag**. The customer
explicitly restricted scope; an unverifiable tag is a scope violation, not a missed
credit.

### R-6 — Non-VPC services follow the independent switch
When `tag_non_vpc_services = false` and VPC scoping is active, non-VPC-bound
resources (e.g. S3 buckets) are not tagged (US-6 AC-3). When `true`, they are
tagged subject to R-1/R-2.

## Tagging rules

### R-7 — **Hard**: tagging is idempotent; re-applying the same tag is safe
Applying `map-migrated=<mpe/server id>` to a resource that already carries exactly
that tag is a safe no-op (NFR-1). This property is load-bearing: it is what makes
5-receive redelivery, whole-batch replays, and DLQ re-drives correct by
construction. The handler never needs to check-before-tag.

### R-8 — Malformed event-supplied ARN → discard and construct
Every ARN taken from the event passes `is_wellformed_arn()` first. A malformed ARN
is discarded — never passed to a tag API — and the extractor falls back to
constructing the ARN from partition + service + region + account + resource name
where the service's shape permits; otherwise the record is classified per R-10.
CloudTrail shapes change without notice; event-supplied ARNs are input, not truth
(NFR-3).

### R-9 — **Hard**: all CloudTrail field access is case-insensitive
Every read from a CloudTrail structure goes through `ci_get()`. CloudTrail returns
inconsistent key casing across services (`aRN` vs `arn`); direct key access
produces silent tag loss — a `None` that quietly skips tagging with no error.
Direct dict access on CloudTrail data is a review-blocking defect.

## Error-handling rules (NFR-2, NFR-3)

### R-10 — Every failure takes exactly one of three paths
Actionable → return to queue (will DLQ + alarm if persistent). Ignorable → drop
with a classifiable log line. Transient → return to queue for redelivery within the
15-minute budget. No fourth path; no silent swallow; every non-ignorable failure is
ultimately alertable (NFR-12).

### R-11 — Both throttle spellings are transient
`ThrottledException` **and** `ThrottlingException` both classify transient. AWS
APIs use either spelling depending on the service; matching only one silently
misroutes the other to the actionable path.

### R-12 — One malformed event never crashes the handler
All parsing of external input (SQS body, EventBridge envelope, CloudTrail fields,
SSM config, `strptime` on dates) is wrapped in narrow exception handling. A parse
failure affects only its own record (ignorable, logged); the rest of the batch
proceeds.

## Explicitly out of scope for this unit

- **Untagging / tag removal** — no code path in this handler removes or rewrites a
  `map-migrated` tag. (Teardown tag preservation is unit-5's NFR-6 hard rule; this
  unit simply never mutates existing tags beyond the idempotent re-apply in R-7.)
- **Retro-tagging / reconciliation sweeps** — the handler is strictly event-driven;
  it tags only resources whose creation event it receives.
