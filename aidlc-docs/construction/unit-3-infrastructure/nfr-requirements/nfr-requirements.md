# NFR Requirements — unit-3-infrastructure

**Date**: 2026-03-25
**Stage**: NFR Requirements
**Traceability**: NFR-4, NFR-5, NFR-8, NFR-9, NFR-12 (requirements.md); US-4, US-11, US-12, US-14, US-15

Quantified NFRs for the deployed infrastructure. IDs are unit-local (`U3-NFR-n`).

## Durability and recovery

### U3-NFR-1 — 14-day event durability (parent: FR-5, FR-6; US-12, US-14)
- Main queue **and** DLQ: message retention **14 days** (SQS maximum).
- Rationale: a missed tag is permanently lost credit; the recovery window must
  survive realistic ops cadences (vacation, fortnightly review), and 14 days is
  free. The DLQ retention is the manual-replay window after a fix (US-14 AC-2).

### U3-NFR-2 — Retry budget (coupled constant; parent: NFR-9, US-12)
- Visibility timeout **180 s** × maxReceiveCount **5** = **900 s** worst-case
  retry budget — sized to cover the 3–10-minute provisioning window of the
  slowest covered resources (Aurora, ElastiCache Serverless, MSK Serverless).
- **Coupled** with unit-2's U2-NFR-1 (worst-case latency) and with any
  verify-poll tooling: all change together or none.

### U3-NFR-3 — No event loss between capture and buffer
EventBridge → SQS delivery uses the rule's DLQ-capable target semantics; the
queue is the durability boundary. There is no window where a captured event
exists only in volatile state under normal operation.

## Cost

### U3-NFR-4 — Cost ceiling: < $2/month/account (parent: NFR-8; US-15)
At typical enterprise create-event volumes (tens to low hundreds/hour/account).
Enforced as structural exclusions, reviewable in the template (US-15 AC-2):
- **No always-on compute** — no containers, instances, or provisioned concurrency.
- **No per-event SSM reads** (unit-2 caches; this unit uses standard-tier
  parameters — free).
- **No KMS on the high-volume main queue** (per-request KMS charges).
- **Explicit log retention** on every log group — no unbounded default (R-10).
- Alarm count fixed and small (4 per account + composite/central wiring).

## Scale

### U3-NFR-5 — Organizational scale (parent: FR-8)
- Org-wide via SERVICE_MANAGED StackSets, OU-targeted, **AutoDeployment on**;
  scales to AWS Organizations limits without per-account operator action, and
  accounts created after deployment are covered automatically.
- **Explicit account allowlist ceiling**: the CFN parameter value cap (4096
  bytes) bounds `ScopedAccountIds` to **~270 accounts**; beyond that,
  `scope_mode=ALL` + OU targeting is the supported pattern. The ceiling is
  documented, not worked around (single-config-source rule R-3).

### U3-NFR-6 — Multi-engagement coexistence (parent: FR-9; US-4)
Any number of concurrent engagements per organization, each fully disjoint under
`map-auto-tagger-<mpeId>` namespacing, with derived-name length audited against
AWS limits at generation (44-char MPE ID vs e.g. 64-char IAM role names).

## Regions and global services

### U3-NFR-7 — Multi-region deployment; explicit global-service constraints
- The pipeline deploys per region; StackSet region list is customer-chosen.
- **Global-service emission points are facts to surface, not solve**: CloudFront
  and Route 53 emit CloudTrail events **only in us-east-1**; Global Accelerator
  in **us-west-2**. Coverage of those services requires the pipeline in those
  regions, and template outputs + deployment guidance must state this explicitly
  so the gap is a known decision, never a silent one.

## Alerting reliability

### U3-NFR-8 — No silent alarm-delivery failure (parent: NFR-12; US-11, US-14) — hard
- Alarm topics **never** use the AWS-managed KMS key `alias/aws/sns` — CloudWatch
  cannot publish through it and the failure is silent (rule R-7). Customer-managed
  key or none.
- Org mode: one central topic per region per engagement
  (`auto-map-tagger-alerts-central-<mpe>`, management account), publish scoped by
  `aws:SourceOrgID` — one subscription point a team can actually watch.
- Every notification carries MPE namespace + alarm type (actionable from the page).
- Alarm coverage spans every persistent failure mode, including sustained
  low-rate leakage (TrickleFailure, US-11 AC-3).

## Security

### U3-NFR-9 — Least-privilege by derivation (parent: NFR-5; US-7)
IAM policies are the generated union of unit-4 `permissions[]` — every action
traces to a covered service, no broad wildcards, machine-checked in CI
(IAM-completeness gate). The customer owns all deployed roles.

### U3-NFR-10 — No outbound calls (parent: NFR-4) — hard
Nothing in the deployed infrastructure calls out of the customer's account or
organization: no telemetry, no update checks. Cross-account flows are limited to
org-internal alarm publishes (U3-NFR-8) and StackSet administration.

## Observability

### U3-NFR-11 — Version and state visibility (parent: NFR-12)
Deployed version visible via CFN Output `TemplateVersion`, SSM parameter
`/auto-map-tagger/{mpe_id}/version`, and the Lambda cold-start log line — three
independent checks for support and upgrade tooling.
