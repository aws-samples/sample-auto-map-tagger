# Business Rules — unit-3-infrastructure

**Date**: 2026-03-25
**Stage**: Functional Design
**Traceability**: FR-5, FR-8, FR-9, FR-10, FR-12; NFR-5, NFR-8, NFR-12; US-4, US-11, US-12, US-15

Rules R-1..R-10 govern template generation and resource configuration. Rules
marked **hard** are non-negotiable.

## Namespacing and coexistence

### R-1 — **Hard**: every resource name carries the MPE namespace
All generated resource names — stack, StackSet, queues, DLQ, Lambda functions,
IAM roles, SNS topics, alarms, log groups, SSM parameter paths — follow
`map-auto-tagger-<mpeId>` naming. Two engagements with different MPE IDs must be
completely disjoint deployments (US-4 AC-1). No shared resources between
engagements, ever.

### R-2 — Derived names are audited against AWS length limits
The MPE ID may be up to 44 characters. Every name derived from it is checked at
generation time against the tightest downstream AWS limit it feeds (e.g. IAM role
names cap at 64 chars, SNS topic names at 256). A name that would overflow fails
generation loudly — never silently truncates (two truncated engagements could
collide, violating R-1).

## Configuration

### R-3 — **Hard**: SSM is the single config source, written only by the stack
Runtime configuration lives in exactly one SSM parameter,
`/auto-map-tagger/{mpe_id}/config`, whose JSON value the template assembles via
`!Sub` from CFN parameters (`ScopedAccountIds`, `ScopedVpcIds`,
`TagNonVpcServices`, agreement dates, MPE ID). No second config channel (env
vars, files, hardcoded values) may exist. Scope changes are stack updates, so
upgrade tooling can preserve values parameter-by-parameter.

### R-4 — Explicit account lists respect the CFN value ceiling
A CFN parameter value caps at 4096 bytes, bounding an explicit `ScopedAccountIds`
list to roughly ~270 accounts. The template documents this ceiling; beyond it the
supported pattern is `scope_mode=ALL` with OU-level StackSet targeting. Generation
does not attempt to work around the ceiling (splitting across parameters would
break the single-source rule R-3).

## Deployment topology

### R-5 — AutoDeployment is always on in org mode
The StackSet is created with AutoDeployment enabled and retain-stacks-on-removal
disabled: accounts joining a targeted OU are deployed to automatically. A new
account that silently starts life untagged is permanently lost credit — this is
not an option to expose, it is the point of org mode (FR-8).

### R-6 — The retry budget is a coupled constant
Queue visibility timeout (180 s) × maxReceiveCount (5) = the 900 s retry budget.
These values are coupled to unit-2's latency NFR and to any verify-poll tooling
that assumes tags land within the budget. They change together everywhere or not
at all; a lone change to either value is a review-blocking defect.

## Alerting

### R-7 — **Hard**: no AWS-managed KMS key on alarm topics
An SNS topic that receives CloudWatch alarm actions must never use
`alias/aws/sns` (the AWS-managed key): CloudWatch cannot publish through
AWS-managed keys, so the alarm *silently never delivers* — the worst possible
failure mode for a safety net. Alert topics use a customer-managed key or no KMS.

### R-8 — Central topics accept publishes by org membership only
The central per-region topic's policy scopes cross-account `sns:Publish` with
`aws:SourceOrgID` — organization membership, never a wildcard principal and never
a maintained list of hundreds of account IDs.

### R-9 — Every non-ignorable failure path has an alarm
The alarm set (TaggerError, DLQFillingUp, TrickleFailure, PeerTaggerDetected)
must cover every way tagging can fail persistently, including the sustained
low-rate pattern that never spikes (TrickleFailure exists precisely because
per-period counts can stay under a spike threshold while credits leak, US-11
AC-3). Adding a new failure mode without an alarm path violates NFR-12.

## Data retention

### R-10 — Log groups get explicit retention and DeletionPolicy
Every log group is declared in the template with an explicit retention period —
never unbounded default retention (cost, NFR-8) — and an explicit DeletionPolicy
so teardown does not silently destroy operational history the customer may need
(supports unit-5's delete-safety posture). The DLQ's 14-day retention is likewise
load-bearing: it is the manual-replay window after a fix (US-14 AC-2).

## Least privilege (with unit-4)

### R-11 — Every IAM action traces to a covered service
The tagger role's policy is the generated union of service-definition
`permissions[]` — no broad wildcards, nothing hand-added (NFR-5, US-7). The
IAM-completeness CI check fails on any covered service whose permissions are
missing, and review fails on any action with no owning service definition.
