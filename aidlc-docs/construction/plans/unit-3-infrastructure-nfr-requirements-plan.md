# NFR Requirements Plan — unit-3-infrastructure

**Date**: 2026-03-25
**Phase**: CONSTRUCTION — NFR Requirements
**Unit**: unit-3-infrastructure (Cloud infrastructure templates)
**Inputs**: `aidlc-docs/construction/unit-3-infrastructure/functional-design/`, `requirements.md`

## Context

The functional design fixes what the templates generate and how the pipeline is
wired. This stage quantifies the non-functional envelope of the *deployed
infrastructure*: durability, cost, scale, region behavior, and alarm-delivery
reliability. Baseline NFRs from requirements: NFR-4 (no outbound calls), NFR-5
(least-privilege IAM), NFR-8 (cost ceiling), NFR-9 (latency, shared with unit-2),
NFR-12 (observability).

## Plan Steps

- [x] Step 1: Analyze functional design and identify each quantifiable infrastructure property
- [x] Step 2: Resolve durability, cost, scale, and alerting questions (below)
- [x] Step 3: Quantify NFRs (retention, cost budget, account/region scale, alarm reliability) → `nfr-requirements.md`
- [x] Step 4: Record tech-stack decisions (CFN/StackSets, SQS decoupling, SNS topology) → `tech-stack-decisions.md`
- [x] Step 5: Cross-check coupled constants against unit-2's NFR requirements

## NFR Questions

## Question 1
How long must undelivered/failed events remain recoverable?

A) SQS default 4-day retention on both queues

B) 14 days on the main queue and the DLQ — the maximum SQS offers — so an unnoticed failure discovered late (over a two-week vacation, a fortnightly ops review) is still replayable

C) Indefinitely, via an S3 archive of every event

D) Other (please describe after [Answer]: tag below)

[Answer]: B — a missed tag is permanently lost credit, so the recovery window
should be the maximum the buffer offers at zero marginal cost. Four days (A)
assumes someone watches alarms daily; 14 days survives realistic ops cadences.
An S3 archive (C) adds cost, surface, and a data store to secure, for a marginal
gain over "fix within two weeks" — declined; the residual risk is documented.

## Question 2
What is the cost budget, and what does it exclude from the design?

A) No explicit budget — optimize later

B) < $2/month/account at typical enterprise event volumes — which structurally excludes: always-on compute (containers, provisioned concurrency), per-event SSM reads, KMS on high-volume queues, advanced-tier parameters, and log retention beyond need

C) < $50/month/account

D) Other (please describe after [Answer]: tag below)

[Answer]: B — NFR-8/US-15 verbatim. The ceiling is an *argument-remover*: cost
must never be a reason to not capture credits. It is enforced as design
exclusions (no always-on anything) rather than post-hoc billing review; US-15
AC-2 makes "no always-on compute" a reviewable design property.

## Question 3
What organizational scale must one deployment handle?

A) Up to 10 accounts

B) Full AWS Organizations scale via OU-targeted StackSets with AutoDeployment; the *explicit account allowlist* path is bounded by the CFN 4096-byte parameter ceiling at ~270 accounts, beyond which scope_mode ALL + OU targeting is the supported pattern

C) Unbounded explicit account lists via multiple config parameters

D) Other (please describe after [Answer]: tag below)

[Answer]: B — org-wide is the default posture (FR-8); the ~270-account ceiling on
*explicit* lists is a documented consequence of keeping config in a single CFN
parameter → single SSM value (functional rule R-3/R-4). Splitting across
parameters (C) would break the single-config-source rule for an audience better
served by OU targeting anyway.

## Question 4
What reliability standard must alarm delivery itself meet?

A) Best effort — alarms are advisory

B) Alarm delivery is a first-class NFR: no silent-delivery failure modes permitted (hence the hard no-`alias/aws/sns` rule), one subscription point per engagement per region (central topic), and every alarm tested for deliverability at deploy verification

C) Redundant delivery to email + ticketing + chat built into the template

D) Other (please describe after [Answer]: tag below)

[Answer]: B — the alarm chain is the *only* thing standing between a persistent
failure and permanently lost credit, so a silently-broken alarm is equivalent to
data loss. The known silent failure mode (CloudWatch cannot publish through the
AWS-managed SNS key) is designed out as a hard rule. Downstream fan-out (C) is
the customer's subscription choice, not template scope.

## Question 5
How should global-service events be handled across regions?

A) Ignore global services

B) Document and design for the regional emission points: CloudFront and Route 53 emit CloudTrail events only in us-east-1, Global Accelerator in us-west-2 — coverage of those services requires the pipeline deployed in those specific regions, and the deployment guidance says so explicitly

C) Deploy to every region unconditionally

D) Other (please describe after [Answer]: tag below)

[Answer]: B — this is an AWS emission fact, not a design choice; the NFR is that
the *limitation is explicit* in template outputs and documentation so a customer
who skips us-east-1 knows CloudFront resources will not be tagged. Deploying
everywhere unconditionally (C) multiplies cost against US-15 for customers with
regional footprints.

## Exit Criteria

- Both artifacts exist under `aidlc-docs/construction/unit-3-infrastructure/nfr-requirements/`.
- Every quantified NFR cites its requirements.md ID or is marked unit-local.
- Coupled constants shared with unit-2 are flagged as coupled.
- No open [Answer]: tags remain.
