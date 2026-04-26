# MAP 2.0 Auto-Tagger — Limitations

Actual constraints that cannot be worked around. For tagging coverage gaps (what can't be tagged and why), see [MAP_TAGGING_GAP_ANALYSIS.md](MAP_TAGGING_GAP_ANALYSIS.md).

---

## Supported Deployment Methodology

The supported deployment path is:

1. Generate a customer-specific `deploy.sh` from `configurator.html` (client-side; runs fully in the browser and requires no outbound network access).
2. Run the generated `deploy.sh` in the target management or single account.

This pipeline runs preflight checks — IAM `simulate-principal-policy`, SCP validation, CloudTrail delivery probe, stack-state inspection, and scope-overlap detection across existing `map-auto-tagger-mig*` stacks — before any CloudFormation resource is created.

**Running `aws cloudformation create-stack` or `create-stack-set` directly against `map2-auto-tagger-optimized.yaml` is unsupported.** Direct-YAML deploys skip every preflight check and have reproducibly surfaced bugs (scope collisions, cross-MPE contamination, missing IAM grants, malformed parameters) that do not occur through the configurator path. Issues reported against direct-YAML usage will be closed with a request to reproduce through the configurator.

`configurator.html` is checked into this repo at the root. Open it in any modern browser — no server, no installation, no network call required.

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
- Amazon Route 53 (hosted zones)
- AWS Global Accelerator (accelerators)
- AWS WAF Classic (global)
- AWS IAM (not MAP-eligible, but customers frequently ask)

**Mitigation:** deploy a second instance of this stack in `us-east-1` using the **same `MpeId`**. The two instances tag disjoint resource sets (regional vs. global) and will not collide on the shared `map-migrated` tag value. Both stacks can share the same MAP period and account scope.

There is no automatic detection or sidecar deploy for this case — selecting whether to deploy the `us-east-1` companion stack is a deploy-time decision for the customer.

---

## Unsupported MAP-eligible services (handler gap)

The services below appear on the MAP Included Services List but are **not** yet handled by this Lambda. Resources created in these services during the MAP period will not be auto-tagged and must be tagged by another means.

**Tier 2 — vertical-specific, deferred until customer demand:**

- AWS Mainframe Modernization (M2)
- AWS HealthImaging
- Amazon FinSpace
- AWS Resilience Hub
- Amazon Omics
- AWS Payment Cryptography

**Tier 3 — newer services with low current adoption:**

- AWS Cloud WAN
- Aurora DSQL
- Amazon Bedrock AgentCore (RunTime, BrowserCustom, CodeInterpreterCustom)
- Amazon WorkSpaces Core Managed Instances

**Workaround:** tag affected resources manually via the AWS Resource Groups Tagging API (`tag-resources`) or the service-native console. Handler coverage is prioritized by customer demand — open a GitHub issue on this repo to request a specific service.

---

## SSM Parameter Store Advanced tier (very large scopes)

When `ScopedAccountIds` contains more than approximately 235 explicitly-named AWS account IDs, the serialized config payload exceeds the 4 KB Standard-tier SSM parameter limit. This template declares the config parameter with `Tier: Intelligent-Tiering`, so SSM automatically promotes the parameter to Advanced tier when the payload crosses the threshold.

Customer-visible impact:

- **Cost:** Advanced-tier parameters are billed at $0.05 per parameter per month — approximately **$0.60/year** of incremental cost per tagger stack that crosses the threshold.
- **No manual action on promotion:** the upgrade from Standard to Advanced happens automatically during `deploy.sh`.
- **Downgrade is manual:** subsequently reducing `ScopedAccountIds` below the threshold does **not** automatically revert the parameter to Standard tier. If a customer wants to drop back to Standard pricing after shrinking scope, they must delete and recreate the parameter (or the stack) manually.

See the AWS documentation for [SSM Parameter Store Advanced tier](https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-advanced-parameters.html) for authoritative pricing and limit details.
