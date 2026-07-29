# Design Invariants

Rules this solution must never violate, and the reason each one exists.

Most were learned from a failure — the "why" column names the incident so the
rule reads as evidence rather than opinion. Before changing behaviour in any of
these areas, read the referenced entry in [CHANGELOG.md](../CHANGELOG.md) first.

Related: engineering rules for contributors and AI agents live in
`.kiro/steering/` (mirrored to `.claude/rules/`). This document is the shorter
"what must always hold true" list those rules protect.

---

## 1. Data safety (hard rules)

| Invariant | Why |
|---|---|
| **`delete.sh` never removes `map-migrated` tags.** Teardown removes infrastructure (EventBridge, SQS, Lambda, IAM, SSM, alarms) only. | MAP credits are permanent and irreversible. Removing the solution must never cost the customer credit already earned. Guarded by a regression test. |
| **Tag drift is detected, never auto-restored.** Out-of-band removal of `map-migrated` raises `TagDriftDetected` + an alarm carrying the customer-side fix; the tagger does not re-apply. | Auto-restoring against an IaC reconciler (Terraform `default_tags`/`tags_all`) creates a ping-pong loop we would own 100% of preventing. Alert-only is the deliberate choice (v22.2.0). |
| **Operational data survives teardown.** Log groups carry an explicit DeletionPolicy and retention. | Customers may need the audit history after removing the solution. |

## 2. Tagging correctness

| Invariant | Why |
|---|---|
| **Tagging is idempotent.** Re-applying the same tag to the same resource is a safe no-op. | This is what makes the 5-receive retry model correct rather than dangerous. |
| **Scoping fails closed.** If scope config is unreadable, unparseable, or invalid, nothing is tagged. | Tagging out-of-scope resources is worse than tagging none — it contaminates another engagement's credit attribution. |
| **A broken config is loud, not silent.** Unreadable/invalid config classifies *transient*: SQS redelivers, and a persistently broken config exhausts to the DLQ and fires the alarm. | Previously these events were acked as skipped — no retry, no DLQ, no alarm. A customer config typo silently cost every tag until someone noticed by accident (CT6-005). |
| **Every service definition has a matching Lambda handler**, verified in both directions by a CI audit. | The configurator once shipped 26 handlers while the template had 147 — 36 MAP-eligible resource types silently untagged on the documented deployment path (F012). |
| **No coverage claim without live verification.** A service is not "supported" until a real resource was created and observed receiving the tag; anything else is marked `UNVERIFIED`. | "Handler exists + E2E green" proved insufficient — two of three v20.3.0 Tier-1 coverage claims were live-broken. |

## 3. Failure handling

| Invariant | Why |
|---|---|
| **Every tagging failure classifies actionable / ignorable / transient.** Transient returns to the queue; ignorable is dropped with a log; actionable surfaces to the DLQ and alarm path. | A single "failed" bucket either DLQs slow provisioners prematurely or silently discards real errors. |
| **Both throttle spellings are handled** — `ThrottledException` *and* `ThrottlingException`. | AWS APIs return different spellings by service; a single-substring match misses one of them. |
| **Not-found errors are disambiguated by event age.** Within 10 minutes of the CloudTrail `eventTime` they are transient; past it, ignorable. | Tag calls can race their own resource's provisioning. Under burst load, `ResourceNotFoundException` was read as "deleted, skip" and 7 of 100 DynamoDB tables ended up permanently untagged (P3-C11-DDB). The 10-minute grace sits deliberately below the 15-minute SQS receive lifetime so genuinely deleted resources age out and are acked *before* reaching the DLQ. |
| **CloudTrail parsing is defensive.** Case-insensitive field access (`ci_get`), ARN well-formedness validated before use, external parsing wrapped in narrow exceptions. | CloudTrail returns inconsistent key casing (`aRN` vs `arn`) — direct access caused silent tag loss. AWS has also changed event shapes without notice: a malformed `resources`-array ARN caused 100% silent tag loss for Kinesis (#102). One malformed event must never crash the handler. |
| **New slow-provisioning services need a transient marker**, or they DLQ prematurely during their provisioning window. | Aurora, ElastiCache Serverless and MSK Serverless take 3–10 minutes to become taggable. |

## 4. Generated artifacts and scripts

| Invariant | Why |
|---|---|
| **`configurator.html` and `configurator.yaml` are generated, never hand-edited.** Edit `src/`, run the build; CI fails on a stale artifact. | Two hand-maintained copies of the same logic drifted silently for weeks (F012). Generating one from the other eliminated the bug class rather than the bug. |
| **The version lives in exactly one place** — `src/js/constants.js` → `TEMPLATE_VERSION`. | Both build outputs read it, so drift between them is impossible by construction. |
| **Single-quote containment for any user-supplied value interpolated into generated shell.** Gated by an injection lint. | Customers run these scripts with their own AWS credentials. |
| **State-mutating CLI calls are never silenced** with `>/dev/null 2>&1 \|\| true`. | A swallowed failure becomes a silent partial deploy. A preflight SCP check that swallowed `InvalidInput` printed "no security policies are blocking" to every role-based caller while the org's SCP denied tagging outright. |
| **Success polls distinguish "zero work found" from "all work done."** Count expected work first, then poll against that count. | A loop that exits on an empty result cannot tell "nothing was created" from "everything completed." |

## 5. Security and privacy

| Invariant | Why |
|---|---|
| **No outbound calls from the customer account.** No telemetry, no update checks, no phoning home. GitHub Releases is the only update channel. | Load-bearing design constraint. Any feature adding an outbound call is a design change requiring explicit sign-off, not a normal PR. |
| **No customer configuration data leaves the browser.** The configurator makes no network requests. | It is a static client-side file; MPE IDs, account IDs and dates stay local. |
| **Least-privilege IAM**, generated from the service definitions and gated by a completeness check. | Only the tagging actions covered services actually need — no broad wildcards. The customer owns every deployed role. |
| **Never use the AWS-managed KMS key (`alias/aws/sns`) on a topic receiving CloudWatch alarm actions.** | CloudWatch cannot publish through AWS-managed keys, so the alarm silently never delivers (CT6-003). |

## 6. Budgets

| Invariant | Why |
|---|---|
| **Under $2 per account per month** at typical event volumes. | The solution must be trivially approvable; cost can never be the reason a customer declines. |
| **Tag latency 60–90 seconds typical, ≤15 minutes worst case.** | The worst case is the SQS retry budget, not an aspiration. |
| **The SQS retry budget and the verify-poll budget are a coupled pair** (5 receives × 180s = 900s). Change both or neither. | The verification path assumes tags land inside the retry window. |
| **Relaxing any input validation requires auditing every name derived from it** against AWS length limits. | Raising the MPE field limit from 20 to 44 characters overflowed a 64-char IAM role name, region-dependently (CT6-006). |

## 7. Observability

| Invariant | Why |
|---|---|
| **The running version is discoverable three ways** — CloudFormation output, SSM parameter, and the Lambda cold-start log line. | Support cannot diagnose a deployment whose version is unknown. |
| **Every failure path emits a classifiable log line**, and alarm coverage exists for tagger errors, DLQ depth, sustained low-rate failures, peer-tagger conflict, and tag drift. | This product fails silently by nature — a missed tag throws no error. If a failure has no signal, it is invisible. |
