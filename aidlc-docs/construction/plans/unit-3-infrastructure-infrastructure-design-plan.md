# Infrastructure Design Plan — unit-3-infrastructure

**Date**: 2026-03-26
**Phase**: CONSTRUCTION — Infrastructure Design
**Unit**: unit-3-infrastructure (Cloud infrastructure templates)
**Inputs**: functional-design and nfr-design artifacts for this unit

## Context

The NFR design fixed the patterns and logical components. This stage maps them to
concrete AWS resources with final configuration values (retention, visibility,
thresholds, sizing), the IAM model, and the deployment topologies. unit-3 is the
only unit with an Infrastructure Design stage — it owns all cloud infrastructure
for the solution (per the execution plan; units 1/2/4/5 have this stage skipped).

## Plan Steps

- [x] Step 1: Analyze logical components and enumerate every physical resource each requires
- [x] Step 2: Resolve deployment-environment, compute, messaging, monitoring, and shared-infrastructure questions (below)
- [x] Step 3: Produce the full resource inventory with configuration values, IAM model, and architecture diagram → `infrastructure-design.md`
- [x] Step 4: Document single-account and org StackSet topologies, delegated admin, staging, and region strategy → `deployment-architecture.md`
- [x] Step 5: Reconcile all values against coupled constants (unit-2) and the cost ceiling (U3-NFR-4)

## Design Questions

## Question 1
What is the deployment environment model?

A) Our AWS accounts host shared infrastructure; customers connect to it

B) 100% customer-owned: every resource deploys into the customer's own accounts via CloudFormation; we host nothing, and no environment of ours exists at runtime

C) Hybrid — customer pipeline, our central monitoring

D) Other (please describe after [Answer]: tag below)

[Answer]: B — the no-outbound-calls hard rule (NFR-4) and the customer-ownership
posture make anything else a non-starter. There are no dev/staging/prod
environments *of ours* to design; the customer's org is the only environment, and
"staging" for us means test deployments during Build and Test.

## Question 2
What compute does the solution use?

A) A small ECS service polling SQS

B) Two on-demand Lambda functions only: the Auto-Tagger (256 MB / 60 s, SQS event source, batch size 10, `ReportBatchItemFailures`) and the Preflight custom-resource Lambda (128 MB / 60 s, invoked only at stack create/update)

C) Lambda with provisioned concurrency for latency

D) Other (please describe after [Answer]: tag below)

[Answer]: B — always-on compute is structurally excluded by the cost ceiling
(U3-NFR-4, US-15 AC-2), and provisioned concurrency buys nothing when the
latency target is 60–90 s against a pipeline whose CloudTrail leg alone takes
tens of seconds. Batch size 10 amortizes cold starts without letting one bad
batch grow large.

## Question 3
What are the final messaging values?

A) Defaults everywhere

B) Main queue: 14-day retention, 180 s visibility (derived 900/5), maxReceiveCount 5, no KMS; DLQ: 14-day retention; EventBridge rule targets the queue with the standard resource policy allowing events.amazonaws.com scoped to the rule ARN

C) FIFO queues for ordering

D) Other (please describe after [Answer]: tag below)

[Answer]: B — every value traces to an NFR (U3-NFR-1/2/4). FIFO (C) solves an
ordering problem tagging does not have (idempotent, order-independent) and caps
throughput while adding cost.

## Question 4
What are the alarm thresholds and monitoring configuration?

A) Alarm on any nonzero error metric instantly

B) TaggerError: Lambda Errors ≥ 5 in 5 min (spike detection); DLQFillingUp: DLQ ApproximateNumberOfMessagesVisible ≥ 1 (any parked message is lost credit in progress); TrickleFailure: errors ≥ 1 across 3 consecutive 1-hour periods (sustained low-rate leakage); PeerTaggerDetected: collision metric ≥ 1; log retention 90 days on both Lambdas

C) Weekly digest instead of alarms

D) Other (please describe after [Answer]: tag below)

[Answer]: B — thresholds are asymmetric by design: the DLQ alarms on a *single*
message because that message is already an unrecoverable-if-ignored credit loss,
while TaggerError tolerates isolated transient errors (they are the classifier's
normal path) and catches spikes. TrickleFailure exists for the leak that never
spikes (US-11 AC-3). 90-day log retention balances trickle-analysis needs against
the cost ceiling.

## Question 5
Is any infrastructure shared between engagements or accounts?

A) A shared queue/topic layer per organization to save cost

B) Nothing shared between engagements (full `map-auto-tagger-<mpeId>` disjointness, US-4); within one engagement in org mode, only the management-account pieces are shared: the central alert topics (per region) and the staging bucket

C) Shared IAM roles across engagements

D) Other (please describe after [Answer]: tag below)

[Answer]: B — engagement disjointness is hard rule R-1; the per-account cost of
duplication is cents (U3-NFR-4 headroom), while shared plumbing couples
engagement lifecycles (one delete tearing down another's alert path). The two
management-account components are engagement-scoped too — shared only *across the
engagement's member accounts*, never across engagements.

## Exit Criteria

- Both artifacts exist under `aidlc-docs/construction/unit-3-infrastructure/infrastructure-design/`.
- Every logical component maps to concrete resources with final values.
- All values reconciled against coupled constants and the cost ceiling.
- No open [Answer]: tags remain.
