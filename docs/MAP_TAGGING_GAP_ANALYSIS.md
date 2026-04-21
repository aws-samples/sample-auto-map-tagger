# MAP 2.0 Auto-Tagger: Gap Analysis

**Last updated:** 2026-04-21

What can't be tagged, why, and what customers need to do about it.

---

## How the Auto-Tagger Catches Resources

The Lambda uses two mechanisms:

1. **Explicit handlers** — `if event_name == 'CreateCluster' and event_source == 'eks.amazonaws.com'` — 140+ resource types with specific ARN extraction logic
2. **Universal ARN extractor** — scans CloudTrail `responseElements` for any ARN-like field (50+ patterns). This catches events without explicit handlers, including `Copy*`, `Restore*`, `Import*` operations

EventBridge matches on prefixes: `Create`, `Run`, `Put`, `Activate`, `Register`, `Start`, `Request`, `Allocate`, `Launch`, `Import`, `Publish`, `Copy`, `Restore`, `Enable`. Any CloudTrail event matching these prefixes reaches the Lambda, which attempts to extract and tag the ARN.

---

## AWS Platform Limitations

These cannot be addressed by any auto-tagging solution.

### Not Taggable — AWS API Restrictions

| Resource | Reason |
|----------|--------|
| IoT Things | AWS API rejects `thing` as resource type in TagResource |
| Lambda Layers/Aliases/Versions | AWS explicitly blocks tagging |
| Keyspaces Tables | Resource Groups API doesn't support Cassandra/Keyspaces |
| CloudWatch Log Streams | Inherit tags from parent Log Group by design |
| API Gateway API Keys | ARN format rejected by all tagging APIs |
| Glue Tables | Only taggable at creation time; post-creation tagging rejected |
| EventBridge Connections | UUID suffix in ARN makes it invalid for tagging |
| EventBridge Schedules | TagResource API only accepts schedule-group ARNs, not individual schedules |

### Customer-Side Configuration Required

| Issue | Why It Can't Be Auto-Fixed | Customer Action |
|-------|---------------------------|-----------------|
| **ECS task tag propagation** | `propagateTags` must be set in the ECS service definition. No external API can enable this retroactively. | Set `propagateTags: SERVICE` in all ECS service definitions |
| **Bedrock InvokeModel without Inference Profile** | Bedrock API calls without an Application Inference Profile have no taggable resource. 100% of that spend is unattributed. | Create [Application Inference Profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-create.html) and route inference through them. The auto-tagger tags profiles automatically. |
| **EKS Auto Mode nodes** | EC2 instances managed by EKS Auto Mode can't be tagged via standard EC2 APIs. | Configure MAP tags in EKS NodePool definitions |
| **Multiple MAP IDs on shared resources** | `map-migrated` tag can only hold one value. | Separate resources by MAP engagement. Don't scope the same account to two MPE IDs. |
| **50-tag limit** | AWS hard limit. Resources at 50 tags will fail to receive `map-migrated`. | Rare in practice. Failed tags go to DLQ for manual review. |
| **SCP blocking tag operations** | SCPs denying `tag:TagResources` cause silent failures. Not detectable by IAM simulation. | Verify SCPs in AWS Organizations console before deployment. |
| **Mandatory creation-time tagging SCPs** | Auto-tagger applies tags 60–90s after creation, not at creation time. | Exempt `map-migrated` from creation-time enforcement or add a grace period. |

### Timing-Dependent Resources

These resources are tagged successfully but require SQS retries due to provisioning delays:

| Resource | Typical Wait | Handled By |
|----------|-------------|------------|
| NAT Gateways | 1–3 min | SQS retry (5 attempts × 180s visibility) |
| ElastiCache Clusters/Serverless | 2–8 min | SQS retry |
| Aurora Clusters | 5–10 min | SQS retry |
| MSK Serverless | 3–5 min | SQS retry |
| EMR Clusters | Varies | Must use `KeepJobFlowAliveWhenNoSteps=True`; terminated clusters can't be tagged |

---

## Out of Scope — Not MAP Taggable

These are not gaps — they are outside the MAP tagging paradigm.

| Scenario | Reason |
|----------|--------|
| Baseline services (Connect, AMS, VMC, EVS) | Tracked via baseline spend at agreement signing, not tags |
| Data transfer costs | Excluded from MAP 2.0 |
| AWS Marketplace software spend | Third-party purchases not MAP eligible (compute portion IS eligible and tagged) |
| Oracle Database@AWS | Procured through Marketplace |
| S3 Glacier Deep Archive | Always excluded from MAP credit calculations |
| Fargate on EKS | MAP ineligible (Fargate on ECS IS eligible) |
| Reserved Instances / Savings Plans | Not taggable resources — underlying resources must be tagged; MAP credit service handles pricing math |
| GovCloud / China regions | Requires partition-aware ARN construction; not currently implemented |

---

## Operational Limitations

| Limitation | Impact | Mitigation |
|-----------|--------|------------|
| **Only tags new resources** | Existing untagged resources not affected | Enable backfill option in configurator (covers 90-day CloudTrail window) |
| **60–90s tagging latency** | Resources not tagged instantly | Acceptable for MAP credit purposes. Up to 15 min during high-volume activity. |
| **EventBridge 256KB event limit** | Extremely large CloudTrail events silently dropped | AWS platform hard limit. Extremely rare in practice. |
| **Resources imported into IaC** | No CloudTrail creation event fires for imports | Tag manually or use backfill if within 90-day window |
| **Management account (multi-account)** | SERVICE_MANAGED StackSets can't deploy to management account | Run additional single-account deployment in management account if needed |
| **CloudTrail must be enabled** | No CloudTrail = no events = no tagging | `deploy.sh` preflight verifies CloudTrail in each region |

---

## Discontinued Services

| Service | Status |
|---------|--------|
| AWS IoT Events | No longer available to new customers |
| AWS IoT Analytics | No longer available to new customers |
| Amazon Lookout for Vision | Discontinued — removed from SDK |
| Amazon Lookout for Metrics | Discontinued — removed from SDK |
| Amazon QLDB | Discontinued July 2025 |
