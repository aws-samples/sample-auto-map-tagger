# Changelog

All notable changes to the MAP 2.0 Auto-Tagger.

---

## v20 — Resilient SQS Pipeline + Open Source

### v20.4.0 — upgrade.sh + destroy.sh configurator modes

Two new self-service flows in `configurator.html` for post-deployment lifecycle operations. Both are in-place, scope-preserving where applicable, and ship as self-contained shell scripts (no outbound calls from the customer's environment).

**New: Update mode → `upgrade.sh`**

- Upgrades an existing deployment to the current template version without redeploying.
- Uses `aws cloudformation update-stack` / `update-stack-set` with `--use-previous-parameters` — scope, agreement dates, VPC config all preserved.
- Reads `/auto-map-tagger/<mpe>/version` from SSM and compares to target (SemVer).
  - **PATCH / MINOR** → applied in place, parallel rollout for StackSets.
  - **Cross-MAJOR** → refused with explicit delete+redeploy guidance. `--force` no longer overrides this (MAJOR bumps require customer action per versioning policy).
  - **Downgrade** → refused unless `--force`.
- Auto-detects single-account stacks and multi-account StackSets matching `map-auto-tagger-mig*`.
- Detects backfill Lambda presence in the existing stack and picks the matching baked template variant.
- Legacy (pre-v19) unnamespaced `map-auto-tagger` stacks cannot be upgraded in place — script detects and emits explicit migration steps.

**New: Destroy mode → `destroy.sh`**

- Clean removal of a MAP Auto-Tagger deployment. Use before MAJOR upgrades, when an engagement ends, or to recover from a failed deployment.
- Auto-detects Stack vs StackSet. StackSet path: `delete-stack-instances` (parallel, 100% tolerance) → wait → `delete-stack-set`.
- Typed MPE-ID confirmation required in the configurator UI (not a checkbox) — customer must type the full `mig...` ID.
- Three opt-in destructive actions (all default-off):
  - Delete S3 staging bucket (guarded — verifies no other MPE deployments share the bucket before deleting).
  - Delete CloudWatch Log Groups (default: retain for audit history).
  - Remove legacy pre-namespacing `map-auto-tagger` stack.
- **Never** deletes the `map-migrated` tags on already-tagged AWS resources — MAP credits remain intact.
- **Never** touches `AWSCloudFormationStackSetAdministrationRole` or `ExecutionRole` — shared org scaffolding.
- Idempotent: missing resources reported as skipped, not failed.

**Changed**

- Update-mode output filename renamed from `update-<mpe>.sh` → `upgrade-<mpe>.sh` to eliminate collision with Editor-mode `update-<mpe>.sh` (account-scope changes).
- Scoped window globals: Editor tab uses `_editorScript` / `_editorMpe`; Upgrade tab uses new `_upgradeScript` / `_upgradeMpe`; Destroy tab uses new `_destroyScript` / `_destroyMpe`. Prevents cross-tab data contamination.
- `upgrade.sh` emits targeted guidance when a bare legacy `map-auto-tagger` stack is detected with no namespaced siblings.
- i18n: new keys added across all 7 locales for Upgrade-mode and Destroy-mode UI.

---

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
