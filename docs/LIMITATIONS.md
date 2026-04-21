# MAP 2.0 Auto-Tagger — Limitations

Actual constraints that cannot be worked around. For tagging coverage gaps (what can't be tagged and why), see [MAP_TAGGING_GAP_ANALYSIS.md](MAP_TAGGING_GAP_ANALYSIS.md).

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
