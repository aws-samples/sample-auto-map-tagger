# Changelog

All notable changes to the MAP 2.0 Auto-Tagger.

---

## v20 — Resilient SQS Pipeline + Open Source

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
