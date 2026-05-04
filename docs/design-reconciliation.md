# Reconciliation Lambda — Design (Wave 12 / PR #39)

**Status:** design LOCKED 2026-04-24 after user review of the §10 open questions. This document describes the agreed-upon shape. Implementation PR (code) will follow the Q3 Option D preflight PR per the locked ordering (see §4).

**Prerequisites before coding:**
- Q3 Option D preflight must land first (prevents overlapping-scope deploys → makes wrong-MPE overwrite safe).
- PR #37 (v20.4.0 three-path classifier + `cloudwatch:PutMetricData` IAM) — shipped 2026-04-24. Reconciliation reuses the classifier's metric-emission pattern.

---

## 1. Why a reconciliation Lambda

The live Lambda is the primary tagger. It listens to EventBridge, tags within ~60–90 s of resource creation, retries transiently via SQS for ~15 min, and post PR #37 classifies permanent errors into actionable / ignorable / transient paths. Once SQS gives up on a permanent-actionable failure, the event lands in `EventDLQ` and SNS alerts fire.

Reconciliation closes the **long tail** of silent-failure classes the live path cannot catch:

- IAM gap for a rare service — live Lambda silently AccessDenies, post PR #37 emits `TagFailureByClass` metric, but nobody subscribes (or customers under the soft-warn path don't notice)
- Missing TRANSIENT_MARKER for a new service — live Lambda classifies as permanent_actionable prematurely, DLQs
- Burst × stack-count amplification where events fall off the 14-day SQS retention (§1.125)
- Customer deployed mid-burst; events pre-dating install weren't captured (BackfillFunction covers this within 90-day CloudTrail window)
- Any new failure class not yet named — defense against the unknown

Primary tagging is best-effort real-time. Reconciliation is the safety net.

## 2. What reconciliation does

Once per day (default), in each account this Lambda runs in:

1. Read scope config from SSM: `scope_mode`, `scoped_account_ids`, `scoped_vpc_ids`, `agreement_start_date`, `mpe_id`.
2. Use `resourcegroupstaggingapi:GetResources` to enumerate every taggable resource in-region in-account whose `CreationTime` is within the agreement window (`>= agreement_start_date`).
3. For each resource: check whether it has `map-migrated=<expected_MPE>`.
4. Split into three buckets:
   - **Correctly tagged** → no action, emit `ReconciliationResourcesScanned` counter
   - **Missing** → synthesize a CloudTrail-shaped event, inject into `EventQueue` SQS → live Lambda tags via normal path → emit `ReconciliationMissingTag` counter
   - **Wrong-MPE value** → inject into `EventQueue` the same way → live Lambda overwrites → emit `WrongMpeCorrected` counter with `ExpectedMpe` + `FoundMpe` dimensions

Reconciliation **reuses the live Lambda's tagging codepath** via SQS injection. Reconciliation never calls RGTA `TagResources` directly. Single tagging codepath, single retry model, single error-classifier. Any live-path improvement applies automatically.

## 3. Wrong-MPE overwrite — why it's safe

AWS tag keys are unique per resource — a resource has exactly one `map-migrated` tag at any time. Whoever writes last wins. Reconciliation's job on a wrong-MPE resource in-scope is to make our value the "last write."

Overwriting is safe because of **Q3 Option D preflight** (will ship as Sprint 3's first PR before reconciliation). Preflight prevents any new deploy from introducing a second tagger whose scope overlaps ours. Therefore a resource in our scope cannot also legitimately be in another active tagger's scope. No peer tagger can flap our value back.

Legitimate sources of wrong-MPE on an in-scope resource (all cases where overwriting is correct):

| Source | Example |
|---|---|
| MPE rotation lag | Customer rotated `migABC` → `migDEF`; old resources carry `migABC` |
| Pre-Q3 legacy contamination | Overlapping tagger existed before Q3 preflight; has since been removed but tag residue remains |
| Manual or external tagging | Customer or third-party tool wrote `map-migrated=whatever` |
| Partner tagger that was decommissioned | Former peer tagger's last-writer-wins value still present |

For all of these, overwriting is the intended behavior. Reconciliation emits `WrongMpeCorrected` with dimensions for observability — high counts in a fresh account warrant investigation (likely legacy contamination), low counts are routine (rotation cleanup).

### Theoretical flapping failure mode (post-Q3, cannot occur in new deploys)

If a pre-Q3 customer (deployed before Q3 preflight existed) has an active overlapping peer tagger in their account, reconciliation's overwrite would flap daily against the peer's live-tagging. **This is documented as a known edge case, not a runtime concern.** Mitigation path:

- Q3 preflight does NOT retroactively check existing deploys
- Pre-Q3 customers should remove or re-scope the peer tagger before enabling reconciliation
- INSTRUCTIONS.md will carry a one-line note to this effect

No code in reconciliation handles this case — contamination is a deployment-architecture problem, not a runtime one.

## 4. PR ordering — decided

Sprint 3 ships in this order:

1. **Q3 Option D preflight first** (separate PR). Small, tightly-scoped, zero runtime change. ~130 LOC. Prevents new overlapping-scope deploys via `SimulatePrincipalPolicy` + `ListStacks` + scope-intersection math.
2. **Reconciliation Lambda second** (this design's PR). Ships into a world where overlapping scope is impossible for new deploys; wrong-MPE overwrite is architecturally safe.

Reconciliation is blocked on Q3 shipping cleanly.

## 5. What reconciliation deliberately does NOT do

- **No re-tagging out-of-scope resources.** Same `is_in_scope` gate as the live Lambda.
- **No replacement for live tagging.** Live Lambda stays the fast path (~60–90 s latency). Reconciliation is the 24-hour catch-up. Both can run in the same stack.
- **No BackfillFunction replacement** (per Q2-3 decision). Backfill owns the first-install <90-day window; reconciliation owns ongoing daily catch-up. Both ship in the same stack, no deprecation.
- **No cross-account tagging.** Each account has its own Lambda (StackSet architecture). Reconciliation runs in the account it lives in (consistent with PR #35).
- **No DDB checkpoint / pagination state** (per Q2-1 decision — deferred until a real >100K-resource customer surfaces). Canary metric fires when a run exceeds 13 minutes; covers the detection half of the problem until we implement resume semantics.

## 6. Architecture

```
  CloudWatch Events (cron: 1× daily default, configurable via CFN param)
          │
          ▼
  ┌────────────────────────────┐
  │  ReconciliationFunction    │
  │   (new Lambda resource)    │
  └────────────┬───────────────┘
               │
               ├─► SSM: GetParameter /auto-map-tagger/<mpe>/config
               │
               ├─► RGTA: GetResources (paginated, filter by CreationTime)
               │       + optional per-resource describe_* for VPC-scope
               │
               ├─► For missing tag     → SQS SendMessage → EventQueue
               ├─► For wrong-MPE value → SQS SendMessage → EventQueue
               │         │
               │         ▼
               │   (live Lambda tags normally via its Q1 classifier)
               │
               └─► CloudWatch: PutMetricData on MapAutoTagger namespace
                      - ReconciliationResourcesScanned
                      - ReconciliationMissingTag
                      - WrongMpeCorrected (dims: ExpectedMpe, FoundMpe)
                      - ReconciliationTimeoutCanary (if >13 min in)
```

**Existing resources reused (no new CFN resource needed):**
- `EventQueue` (SQS) — SendMessage target
- `AlertTopic` (SNS) — not published directly; live Lambda's classifier uses it on failures downstream
- `/auto-map-tagger/<mpe>/config` SSM — read-only

**New CFN resources:**
- `ReconciliationFunction` — Lambda
- `ReconciliationSchedule` — EventBridge rule, `rate(24 hours)` default
- `ReconciliationRole` — IAM role
- `ReconciliationLogGroup` — CW log group, `RetentionInDays: 14` (matches PR #29)
- **NO** DynamoDB, NO second SNS, NO second DLQ.

## 7. IAM

| Action | Resource | Purpose |
|---|---|---|
| `ssm:GetParameter` | `arn:aws:ssm:*:*:parameter/auto-map-tagger/<mpe>/config` | Read scope config |
| `tag:GetResources` | `*` (RGTA does not support resource-scoping) | Enumerate resources |
| `ec2:DescribeInstances`, `ec2:DescribeVpcs`, `ec2:DescribeVolumes`, etc. | `*` | Resolve VPC membership for VPC-scope mode (when RGTA omits it) |
| `sqs:SendMessage` | `!GetAtt EventQueue.Arn` | Enqueue missing / wrong-MPE resources |
| `cloudwatch:PutMetricData` | `*` | Emit observability metrics |
| (condition) `cloudwatch:namespace: MapAutoTagger` | | Scope PutMetricData to our namespace only (consistent with PR #37) |
| `logs:CreateLogStream`, `logs:PutLogEvents` | `!GetAtt ReconciliationLogGroup.Arn` | Lambda runtime logging |

No `sts:AssumeRole` (consistent with PR #35 cross-account rip-out). No write access to SSM, RGTA, or DDB.

## 8. Failure modes

| Failure | Handling |
|---|---|
| RGTA `ThrottledException` | Backoff in-function, retry 3× with jitter (same as live Lambda THROTTLE_CODES). If still failing, abort this run; emit `ReconciliationRunAborted` metric; next day's run retries from scratch. |
| RGTA pagination budget exceeded | Lambda 15-min timeout fires; some resources uncovered; canary metric reports. See §9 scale limits. |
| SSM config missing | Cold-fail with log message; emit `ReconciliationConfigMissing` metric. The stack is misconfigured — no point enqueueing. |
| SQS SendMessage fails | Retry 3× in-function. On persistent failure, skip that resource; next day's run re-discovers and retries. |
| Event enqueued but live Lambda permanent-actionable fails | Live Lambda's Q1 classifier handles it (SNS alert + DLQ). Reconciliation did its job (enqueue); failure downstream is not reconciliation's concern. |
| Scope expands mid-run (SSM config edited) | Read-at-start snapshot; resources that became in-scope after snapshot caught on tomorrow's run. Acceptable 24-hour lag. |

## 9. Scale limits and the Q2-1 decision

**Decided: ship with 15-min Lambda ceiling, no pagination resume state. Emit canary metric `ReconciliationTimeoutCanary` when a run is >13 min in.**

- Pilot customers are well under 20K resources per account; 15-min budget is ample
- Canary fires before the cliff, so we see the trend in CW metrics
- If a real customer surfaces a large-account case, follow-up PR adds DynamoDB checkpoint
- This PR stays scoped; no DDB table, no resume-token IAM, no checkpoint-recovery logic

Per-account resource count to budget: ~50K resources comfortably in 10 min at RGTA pagination + SQS SendMessage rates. Beyond that, canary fires and we know to act.

## 10. What shipped prior that reconciliation depends on

- **PR #37 (v20.4.0, shipped):** Three-path error classifier + `cloudwatch:PutMetricData` IAM on the *live Lambda's* role. Reconciliation will define its own role with the same IAM pattern (scoped via Condition to `MapAutoTagger` namespace). Reconciliation does not reuse the live Lambda's role.
- **PR #35 (shipped):** Cross-account machinery removed. Reconciliation's design — per-account Lambda, no cross-account assume — is consistent.
- **PR #33 (shipped):** Scope-fix YAML. Reconciliation reads the same SSM config and uses the same scope semantics (VPC-scope returns False when vpc_id is None).
- **Q3 Option D preflight (not yet shipped, blocks this):** Prevents future overlapping-scope deploys. Makes wrong-MPE overwrite safe-by-construction for new deploys.

## 11. Open questions — ALL RESOLVED 2026-04-24

Retained for the record:

| Question | Decision | Rationale |
|---|---|---|
| Q2-1 Timeout strategy for >100K-resource accounts | **Defer** (D) | Pilot customers are far below the ceiling; ship canary metric to detect trend, solve when forced |
| Q2-2 Wrong-MPE handling | **Always overwrite via SQS re-enqueue** (A') | Q3 preflight prevents legitimate overlap; remaining wrong-MPE sources (rotation, legacy, manual) all want overwriting |
| Q2-3 BackfillFunction fate | **Keep as-is** (A) | User aligned: most customers deploy within 90 days of agreement date, so backfill's CloudTrail window covers them; reconciliation adds daily catch-up value without needing to subsume backfill |
| Q2-4 PR ordering | **Q3 preflight first, reconciliation after** (B) | Locks wrong-MPE overwrite safety before reconciliation ships |

## 12. Scope of the eventual implementation PR

When Q3 ships and reconciliation goes into implementation:

- **New Lambda inline** in `map2-auto-tagger-optimized.yaml` (matches existing pattern)
- **Mirror into `build/configurator.html`** (sync-check enforced)
- **CFN resources:** ReconciliationFunction, ReconciliationSchedule, ReconciliationRole, ReconciliationLogGroup (4 new resources)
- **New CFN parameter:** `ReconciliationInterval` default `24 hours`, min `1 hour` (configurable for customers who want tighter catch-up)
- **IAM additions** to canonical list (`.github/sync/tagging-permissions.txt` unchanged — reconciliation's IAM is operational, not tagging)
- **New CloudWatch metrics** emitted: `ReconciliationResourcesScanned`, `ReconciliationMissingTag`, `WrongMpeCorrected`, `ReconciliationTimeoutCanary`, `ReconciliationConfigMissing`, `ReconciliationRunAborted`
- **E2E test:** create 3 resources, stop live Lambda (event source mapping disabled), run reconciliation manually, verify tags applied via live Lambda's tagging path
- **Docs:** add to `INSTRUCTIONS.md` "Monitoring" (note the new metrics + the interval parameter + the edge-case warning about pre-Q3 peer taggers); add to `OVERVIEW.md` safety-net section
- **Estimated scope:** ~180 LOC Lambda + ~40 LOC CFN + ~20 LOC configurator mirror + ~30 LOC E2E + ~20 LOC docs = ~290 LOC total

## 13. Version bump plan

Reconciliation adds new behavior and new CFN resources without changing existing behavior. Per VERSIONING.md: **MINOR bump** (v20.4.x → v20.5.0). No breaking change to deploy flow, no customer action required on upgrade.

---

## Appendix: decisions trail

- 2026-04-24 original draft published as design-only PR #36 with 5 open questions in prior §10
- 2026-04-24 user review: locked all 5 decisions (see §11)
- Document rewritten to reflect locked state; PR #36 updated in place
- Awaiting Q3 Option D preflight PR to ship; reconciliation implementation follows after
