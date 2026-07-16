# MAP 2.0 Auto-Tagger — Limitations

Actual constraints that cannot be worked around. For tagging coverage gaps (what can't be tagged and why), see [MAP_TAGGING_GAP_ANALYSIS.md](MAP_TAGGING_GAP_ANALYSIS.md).

---

## Supported Deployment Methodology

The supported deployment path is:

1. Generate a customer-specific `deploy.sh` from `configurator.html` (client-side; runs fully in the browser and requires no outbound network access).
2. Run the generated `deploy.sh` in the target management or single account.

This pipeline runs preflight checks — IAM `simulate-principal-policy`, SCP validation, CloudTrail delivery probe, stack-state inspection, and scope-overlap detection across existing `map-auto-tagger-mig*` stacks — before any CloudFormation resource is created.

**Running `aws cloudformation create-stack` or `create-stack-set` directly against `configurator.yaml (generated)` is unsupported.** Direct-YAML deploys skip every preflight check and have reproducibly surfaced bugs (scope collisions, cross-MPE contamination, missing IAM grants, malformed parameters) that do not occur through the configurator path. Issues reported against direct-YAML usage will be closed with a request to reproduce through the configurator.

`configurator.html` is checked into this repo. Open it in any modern browser — no server, no installation, no network call required.

---

## Management Account Not Covered in Multi-Account Mode

`SERVICE_MANAGED` StackSets cannot deploy to the management account (AWS hard constraint). Resources created in the management account will not be tagged. If needed, run an additional single-account deployment targeting the management account.

---

## Service Control Policies (SCPs)

Two scenarios require manual verification before deployment:

1. **Tagging SCPs** — if SCPs deny `tag:TagResources` or service-specific tagging actions for Lambda execution roles, the auto-tagger will silently fail and events will accumulate in the DLQ. `deploy.sh` runs IAM simulation but SCPs are not evaluated by IAM simulation — manual review in the AWS Organizations console is required.

2. **Mandatory creation-time tagging SCPs** — if SCPs require `map-migrated` at resource creation time, this solution will not satisfy that requirement (tags are applied 60–90s after creation). Either exempt `map-migrated` from creation-time enforcement or configure a grace period.

---

## EventBridge 256KB Event Limit

CloudTrail events exceeding 256KB are silently dropped by EventBridge and will never trigger the Lambda. This is an AWS platform hard limit. Extremely rare in practice — only possible for unusually complex resource creation events. No workaround exists.

---

## Tagging Latency

Tags are applied 60–90 seconds after resource creation under normal conditions. During high API activity (large Terraform/CDK deployments), CloudTrail delivery to EventBridge can take up to 15 minutes. Slow-provisioning resources (ElastiCache, Aurora, NAT Gateways) require 2–10 minutes before they become taggable — handled automatically via SQS retries.

Tags are always applied eventually — this is a latency variance, not a reliability issue. However, this means the solution **cannot satisfy SCPs that require tags at creation time** (see [SCPs](#service-control-policies-scps) above).

---

## Upgrading from a Previous Version

Prior versions used fixed resource names (`map-auto-tagger`, `/auto-map-tagger/config`). The current version uses MPE-ID-namespaced names (`map-auto-tagger-mig111`, `/auto-map-tagger/mig111/config`). CloudFormation treats these as entirely new resources — running `deploy.sh` on an existing deployment will deploy a **second stack alongside the old one**, with both Lambdas running simultaneously.

You must delete the old stack before deploying the new version. See [INSTRUCTIONS.md](INSTRUCTIONS.md#upgrading-from-a-previous-version) for steps.

---

## Global services — `us-east-1` only

MAP-eligible AWS global services emit CloudTrail management events exclusively to `us-east-1`, regardless of where the resource is logically "located." Because this auto-tagger installs its EventBridge rule in the region where the stack is deployed (typically `ap-northeast-2` for Korea customers), a single-region deployment outside `us-east-1` will **not** see create events for these services and will **not** tag them.

Affected services:

- Amazon CloudFront (distributions)
- Amazon Route 53 (hosted zones **and health checks**)
- AWS Global Accelerator (accelerators)
- AWS WAF Classic (global)
- AWS IAM (not MAP-eligible, but customers frequently ask)
- **AWS Network Manager (global networks) — us-west-2, not us-east-1.** Network Manager is homed in us-west-2; its `CreateGlobalNetwork` CloudTrail events land there exclusively (verified empirically 2026-07-15). A us-east-1 companion stack does NOT cover it — Network Manager coverage needs a us-west-2 deployment.

**Mitigation:** deploy a second instance of this stack in `us-east-1` using the **same `MpeId`**. The two instances tag disjoint resource sets (regional vs. global) and will not collide on the shared `map-migrated` tag value. Both stacks can share the same MAP period and account scope.

There is no automatic detection or sidecar deploy for this case — selecting whether to deploy the `us-east-1` companion stack is a deploy-time decision for the customer.

---

## Fargate tasks launched by ECS services need `propagateTags`

Fargate billing attributes usage to **tasks**, not services — a tagged ECS service with untagged tasks shows zero tagged Fargate spend. The auto-tagger tags **standalone** tasks (direct `RunTask` API calls, e.g. one-off jobs, EventBridge Scheduler targets) via the `RunTask` CloudTrail event.

Tasks launched **by an ECS service scheduler** (the normal `desiredCount` path) are a different story: the scheduler's internal launches do **not** emit a customer-visible `RunTask` management event (verified empirically 2026-07-15 — a `desiredCount=1` service launched tasks for 25+ minutes with zero RunTask events in CloudTrail), so no event-driven tagger can see them.

**Mitigation (customer-side, one flag):** create or update services with `--propagate-tags SERVICE` (or `TASK_DEFINITION`). ECS then copies the service's tags — including the `map-migrated` tag this solution applies to the service — onto every task it launches, keeping Fargate spend attributed with no tagger involvement. Existing services can be updated in place: `aws ecs update-service --cluster <c> --service <s> --propagate-tags SERVICE` (applies to tasks launched after the update).

---

## Unsupported MAP-eligible services (handler gap)

The services below appear on the MAP Included Services List (edition **18 June 2026**) but are **not** yet handled by this Lambda. Resources created in these services during the MAP period will not be auto-tagged and must be tagged by another means.

This list was last reconciled against the canonical list on **2026-06-30**. The previously-listed Tier 2/Tier 3 gaps (Mainframe Modernization, HealthImaging, FinSpace, Resilience Hub, Omics, Payment Cryptography, Cloud WAN, Aurora DSQL, Bedrock AgentCore, WorkSpaces Core Managed Instances) have since shipped handlers and IAM grants and are now covered — see [COVERAGE.md](COVERAGE.md).

**Recently added to the list, no handler yet:**

- **AWS End User Messaging** (`AmazonPinpoint`) — eligible since 2026-05-04. No `pinpoint`/`sms-voice` tagging grant.
- **Amazon GameLift Streams** (`AmazonGameLiftStreams`) — eligible since 2026-06-17. Distinct from Amazon GameLift (builds/scripts/fleets), which **is** handled.
- **AWS RTB Fabric** (`AWSRTBFabric`) — eligible since 2026-06-17.

**Long-standing gap:**

- **Amazon Cloud Directory** (`AmazonCloudDirectory`) — `CreateDirectory` is handled only for AWS Directory Service (`ds.amazonaws.com`); Cloud Directory (`clouddirectory.amazonaws.com`) has no handler or grant.

**Workaround:** tag affected resources manually via the AWS Resource Groups Tagging API (`tag-resources`) or the service-native console. Handler coverage is prioritized by customer demand — open a GitHub issue on this repo to request a specific service.

### Eligible-but-no-dedicated-handler-needed

- **Amazon Elastic VMware Service (Amazon EVS)** — on the list (added 2026-03-20) but has **no Product Service Code**. Per the list notes, MAP spend accrues only through the *"underlying use of Amazon EC2"* and the *EVS control plane is excluded*. Those EC2 resources are already auto-tagged, so no EVS-specific handler is required.

---

## Migration Type Prefix — Only `mig` Supported

This tagger only supports the general migration `mig` prefix. The CFN parameter `MpeId` enforces `AllowedPattern: ^mig[a-zA-Z0-9]+$`, which rejects non-`mig` prefixes at deploy time.

MAP 2.0 covers additional migration types (SAP `sap`, Oracle, Database & Analytics commercial `d-mig` / `comm_ec2_`, Windows `map-migrated-windows`) — none of these are supported. Customers with non-`mig` MAP agreements must use a `mig`-prefixed engagement ID or tag those resources through another mechanism.

---

## Standalone YAML Deploy — Agreement End-Date Defaults to 2099

Both the standalone YAML and the configurator-generated template include an `AgreementEndDate` CFN parameter. The standalone YAML defaults to `2099-12-31`, which effectively disables end-date enforcement. A direct-deploy without explicitly setting `AgreementEndDate` will tag resources indefinitely past the actual agreement expiry.

The configurator requires the end date to be set explicitly. Use the configurator path to ensure correct agreement boundaries.

---

## SSM Parameter Store Advanced tier (very large scopes)

When `ScopedAccountIds` contains more than approximately 235 explicitly-named AWS account IDs, the serialized config payload exceeds the 4 KB Standard-tier SSM parameter limit. This template declares the config parameter with `Tier: Intelligent-Tiering`, so SSM automatically promotes the parameter to Advanced tier when the payload crosses the threshold.

Customer-visible impact:

- **Cost:** Advanced-tier parameters are billed at $0.05 per parameter per month — approximately **$0.60/year** of incremental cost per tagger stack that crosses the threshold.
- **No manual action on promotion:** the upgrade from Standard to Advanced happens automatically during `deploy.sh`.
- **Downgrade is manual:** subsequently reducing `ScopedAccountIds` below the threshold does **not** automatically revert the parameter to Standard tier. If a customer wants to drop back to Standard pricing after shrinking scope, they must delete and recreate the parameter (or the stack) manually.

See the AWS documentation for [SSM Parameter Store Advanced tier](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-advanced-parameters.html) for authoritative pricing and limit details.

---

## Explicit account lists cap out at ~270 accounts (CloudFormation parameter limit)

`ScopedAccountIds` is a CloudFormation **String** parameter carrying a JSON array of account IDs. CloudFormation caps any parameter value at **4,096 bytes** (AWS hard quota, not raisable). Each explicitly-listed account ID costs 15 bytes serialized (`"123456789012",`), so the list stops fitting at approximately **270 accounts**. Beyond that, stack/StackSet creation fails at CloudFormation validation — there is currently no configurator-side or preflight guard for this, so the failure surfaces only at deploy time.

Note this is a *different* ceiling from the [SSM Advanced-tier threshold above](#ssm-parameter-store-advanced-tier-very-large-scopes): ~235 accounts triggers an automatic, harmless tier promotion; ~270 accounts is a hard deploy failure.

**Mitigation:** scope mode `["ALL"]` (the default) is immune — it is a 5-byte string regardless of organization size, and new accounts joining the org are covered automatically. Explicit account lists are intended for partial-org MAP agreements and are comfortably safe up to ~200 accounts. A customer needing to *exclude* only a handful of accounts from a very large org should prefer `ALL` scope and handle exclusions by other means (e.g., an SCP denying the tagger role in excluded accounts) rather than enumerating 270+ included accounts.

---

## In-Place Upgrade Limitations

In-place upgrades via `upgrade.sh` are supported for **upgrade-safe releases** (service coverage updates, bug fixes — no new CloudFormation parameters). The upgrade flow uses `UsePreviousValue=true` for all existing parameters, preserving scope configuration.

**When in-place upgrade is NOT safe:**

1. **New CFN parameters in the release:** CloudFormation cannot "use previous value" for parameters that didn't exist in the deployed stack. New parameters fall back to the template's `Default` value. If the default is expansive (e.g., `["ALL"]`), scope can silently blow out. These releases are marked **"Full redeploy required"** in the release notes.
2. **Pre-#95 legacy stacks:** Deployments created before the `ScopedAccountIds` parameter existed cannot be upgraded in-place — scope was baked directly into SSM config with no CFN parameter to carry forward. The upgrade script detects this and refuses (unless `--force` is passed). Delete and redeploy is the only safe path.

**Re-running `deploy.sh`** is always safe regardless of release type, because the configurator bakes the customer's exact values into the template defaults — no reliance on `UsePreviousValue`.

See [INSTRUCTIONS.md](INSTRUCTIONS.md) for step-by-step upgrade guidance.

---

## Reconciliation Lambda Removed

The daily reconciliation Lambda (introduced in v20.5.0) has been removed. The real-time tagger with SQS buffering (14-day retention, 5 retries) provides sufficient coverage. Reconciliation added risk of mass-tagging damage when SSM config was incorrect (e.g., after a scope blow-out) and provided minimal incremental value given the SQS retry guarantees.

Resources that exhaust all SQS retries land in the Dead Letter Queue and trigger the SNS alert (`map-auto-tagger-dlq-<mpe>`, which fires on DLQ depth regardless of failure class) — these should be tagged manually or investigated.

**Long-provisioning resources lose automatic recovery.** Without the reconciliation sweep, any resource whose provisioning exceeds the 900s retry budget (5 × 180s) is tagged only if it finishes provisioning within that window. The known case is **AWS Managed Microsoft AD**, which stays in `Creating` for 25–45 min: its tagging retries exhaust and the event lands in the DLQ. The DLQ alert still fires, but the tag does **not** land on its own — there is no longer a nightly sweep to re-tag it. Operators must redrive the DLQ (or tag the directory directly) once provisioning completes. Simple AD (5–10 min) finishes within the retry budget and is unaffected.
