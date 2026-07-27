# NFR Requirements Plan — unit-2-lambda-tagger

**Date**: 2026-03-25
**Phase**: CONSTRUCTION — NFR Requirements
**Unit**: unit-2-lambda-tagger (Runtime tagging engine)
**Inputs**: `aidlc-docs/construction/unit-2-lambda-tagger/functional-design/`, `requirements.md`

## Context

The functional design fixes the pipeline (batch → gate → extract → tag → classify)
and its hard rules. This stage quantifies the non-functional envelope the handler
must operate within — latency, throughput, failure budget, security posture — and
records the tech-stack decisions that follow from it. Baseline NFRs from
requirements: NFR-1 (idempotency), NFR-2 (three-path classification), NFR-3
(defensive parsing), NFR-4 (no outbound calls), NFR-9 (latency), NFR-12
(observability).

## Plan Steps

- [x] Step 1: Analyze functional design artifacts and map each hard rule to a quantified NFR
- [x] Step 2: Resolve throughput, latency, failure-budget, and security questions (below)
- [x] Step 3: Quantify NFRs (latency targets, retry budget, memory/timeout sizing, parsing guarantees) → `nfr-requirements.md`
- [x] Step 4: Record tech-stack decisions (runtime, SDK, packaging model, dependency policy) → `tech-stack-decisions.md`
- [x] Step 5: Cross-check every NFR against requirements.md IDs and unit-3's coupled constants

## NFR Questions

## Question 1
What throughput should the handler be sized for?

A) Real-time stream scale — thousands of events/second, provisioned concurrency

B) Enterprise resource-creation scale — bursty but low absolute volume (typically tens to low hundreds of create events/hour/account, with occasional migration-wave bursts), served by default on-demand Lambda concurrency and SQS batching

C) Fixed single-threaded worker

D) Other (please describe after [Answer]: tag below)

[Answer]: B — resource *creation* events are inherently low-volume even in large
organizations; migration cutover waves are the burst case and SQS absorbs them (the
queue is the buffer, not Lambda concurrency). Provisioned concurrency would violate
the "no always-on compute" cost posture (US-15/NFR-8, owned by unit-3). Default
account concurrency with batch size tuned by unit-3 is sufficient by a wide margin.

## Question 2
What is the latency requirement, precisely?

A) Best effort, no target

B) Typical 60–90 s from resource creation to tag applied; hard worst case ≤ 15 minutes, equal to the SQS retry budget (5 receives × 180 s visibility)

C) Sub-second tagging via synchronous invocation

D) Other (please describe after [Answer]: tag below)

[Answer]: B — this is NFR-9/US-13 verbatim. Sub-second is impossible (CloudTrail
delivery alone takes seconds-to-minutes) and unnecessary; what matters is that the
worst case equals the retry budget so slow provisioners (3–10 min) land inside it.
The 900 s budget is a **coupled constant** with unit-3's queue configuration and
must never be changed unilaterally.

## Question 3
What is the acceptable failure budget, given that a missed tag is permanently lost credit?

A) 99% of eligible resources tagged; losses accepted silently

B) Zero *silent* loss: every eligible event either results in a tag or ends in an alertable state (DLQ + alarm). Transient conditions get the full 15-minute budget; nothing is dropped without a classifiable log line

C) At-most-once processing to avoid duplicate tags

D) Other (please describe after [Answer]: tag below)

[Answer]: B — the business constraint is irreversibility (tags cannot be
back-dated), so the design goal is not a percentage but the elimination of *silent*
loss paths. At-most-once (C) optimizes the wrong thing: duplicate tagging is a safe
no-op (NFR-1), so the model is at-least-once delivery + idempotent application.
Every known silent-loss mechanism identified in design (casing, malformed ARNs,
single throttle spelling) gets a named defensive invariant.

## Question 4
What security posture must the handler itself satisfy?

A) Broad tagging permissions (`tag:*` on `*`) for simplicity

B) Least-privilege execution role generated from the covered service definitions (unit-3/unit-4 contract); **zero outbound network calls** other than AWS service APIs within the customer's account/partition; no secrets; no dynamic code loading

C) VPC-attached Lambda with egress filtering

D) Other (please describe after [Answer]: tag below)

[Answer]: B — least-privilege IAM is NFR-5 (machine-checked, owned by unit-3/4);
the no-outbound-calls rule is NFR-4 and is a **hard rule**: no telemetry, no update
checks, no phoning home — GitHub Releases is the only update channel. VPC
attachment (C) adds ENI cost and cold-start latency without a threat it mitigates
here; the handler touches no customer data beyond ARNs and tag values.

## Exit Criteria

- Both artifacts exist under `aidlc-docs/construction/unit-2-lambda-tagger/nfr-requirements/`.
- Every quantified NFR cites its requirements.md ID or is marked unit-local.
- Coupled constants shared with unit-3 are explicitly flagged as coupled.
- No open [Answer]: tags remain.
