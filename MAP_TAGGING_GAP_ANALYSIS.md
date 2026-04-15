# MAP 2.0 Auto-Tagger: Comprehensive Gap Analysis

**Last updated:** 2026-04-13
**Sources:** MAP 2.0 Included Services List, customer field observations, and auto-tagger source code review.

---

## Executive Summary

The auto-tagger covers **190+ resource types** across **120+ CloudTrail event types** and **60+ AWS event sources**, with multi-account StackSet deployment, retry queues, dead letter queues, and SNS alerting.

The original gap analysis (2026-03-19) identified **30+ gaps** during the early design phase. **All actionable gaps have since been resolved.** The remaining gaps are either **AWS platform limitations** that no auto-tagging solution can address, or **customer-side configuration requirements** that must be documented as guidance.

This document now serves as:
1. A record of what was identified and resolved
2. A reference for **remaining AWS platform limitations** customers should be aware of
3. Guidance for **customer-side actions** required for full MAP credit coverage

---

## Resolved Gaps

All of the following were identified during the design phase and have been implemented in the current version.

### Previously Missing Services — Now Covered

| Gap | Service | Events Added | Status |
|-----|---------|-------------|--------|
| GAP 1.1 | Amazon EKS | `CreateCluster`, `CreateNodegroup`, `CreateFargateProfile`, `CreateAddon` | ✅ Resolved |
| GAP 1.2 | Amazon Bedrock | `CreateInferenceProfile`, `CreateAgent`, `CreateKnowledgeBase`, `CreateGuardrail`, `CreateFlow`, `CreatePrompt`, `CreateProvisionedModelThroughput`, `CreateModelCustomizationJob`, `CreateModelImportJob`, `CreateModelInvocationJob`, `CreateEvaluationJob`, `CreatePromptRouter`, `CreateAgentAlias`, `CreateDataSource`, `CreateAgentActionGroup` | ✅ Resolved |
| GAP 1.3 | Amazon CloudWatch Logs | `CreateLogGroup` | ✅ Resolved |
| GAP 1.4 | Amazon ElastiCache | `CreateCacheCluster`, `CreateReplicationGroup` | ✅ Resolved |
| GAP 1.5 | Amazon OpenSearch | `CreateDomain` | ✅ Resolved |
| GAP 1.6 | Amazon Kinesis | `CreateStream`, `CreateDeliveryStream` | ✅ Resolved |
| GAP 1.7 | AWS Step Functions | `CreateStateMachine`, `CreateActivity` | ✅ Resolved |
| GAP 1.8 | Amazon API Gateway | `CreateRestApi`, `CreateApi` | ✅ Resolved |
| GAP 1.9 | Amazon EFS | `CreateFileSystem` | ✅ Resolved |
| GAP 1.10 | Amazon FSx | `CreateFileSystem`, `CreateStorageVirtualMachine` | ✅ Resolved |
| GAP 1.11 | Amazon Redshift | `CreateCluster`, `CreateWorkgroup`, `CreateNamespace`, `CreateClusterSnapshot`, `RestoreFromClusterSnapshot` | ✅ Resolved |
| GAP 1.12 | Amazon SageMaker | `CreateNotebookInstance`, `CreateEndpoint`, `CreateTrainingJob`, `CreateProcessingJob`, `CreateTransformJob`, `CreateModel`, `CreateEndpointConfig` | ✅ Resolved |
| GAP 1.13 | Amazon CloudFront | `CreateDistribution` | ✅ Resolved |
| GAP 1.14 | AWS Glue | `CreateJob`, `CreateCrawler`, `CreateDatabase` | ✅ Resolved |
| GAP 1.15 | Amazon EMR | `RunJobFlow` | ✅ Resolved |
| GAP 1.16 | VPC Resources | `CreateNatGateway`, `CreateTransitGateway`, `CreateTransitGatewayVpcAttachment`, `CreateVpcEndpoint`, `AllocateAddress`, `CreateClientVpnEndpoint`, `CreateVpnGateway`, `CreateVpnConnection`, `CreateVpc`, `CreateSubnet`, `CreateFlowLogs` | ✅ Resolved |
| GAP 1.17 | Amazon WorkSpaces | `CreateWorkspaces` | ✅ Resolved |
| GAP 1.18 | Amazon QuickSight | `CreateDashboard`, `CreateAnalysis`, `CreateDataSet`, `RegisterUser` | ✅ Partially resolved (identity-based resources are non-standard) |
| GAP 1.19 | Amazon Comprehend | `CreateDocumentClassifier`, `CreateEntityRecognizer` | ✅ Resolved |

### Previously Missing Sub-Resources — Now Covered

| Gap | Resource | Events Added | Status |
|-----|----------|-------------|--------|
| GAP 2.1 | EBS Snapshots | `CreateSnapshot`, `CreateSnapshots`, `CopySnapshot` | ✅ Resolved |
| GAP 2.2 | AMIs | `CreateImage`, `CopyImage`, `ImportImage`, `ImportSnapshot` | ✅ Resolved |
| GAP 2.3 | RDS Snapshots/Replicas | `CreateDBSnapshot`, `CreateDBClusterSnapshot`, `CopyDBSnapshot`, `CopyDBClusterSnapshot`, `RestoreDBInstanceFromDBSnapshot`, `RestoreDBInstanceToPointInTime`, `RestoreDBClusterFromSnapshot`, `RestoreDBClusterToPointInTime`, `CreateDBInstanceReadReplica`, `CreateGlobalCluster` | ✅ Resolved |
| GAP 2.5 | Auto Scaling instances | `RunInstances` catches ASG-launched instances | ✅ Resolved |
| GAP 2.6 | Elastic IPs | `AllocateAddress` | ✅ Resolved |

### Previously Missing Architectural Features — Now Implemented

| Gap | Feature | Implementation | Status |
|-----|---------|---------------|--------|
| GAP 4.1 | Multi-region | StackSet deployment across regions; global service Lambdas in us-east-1 / us-west-2 | ✅ Resolved |
| GAP 4.2 | Multi-account | CloudFormation StackSets with `SERVICE_MANAGED` permission model | ✅ Resolved |
| GAP 4.6 | Retry / DLQ | SQS `RetryQueue` (3 retries) → `DeadLetterQueue` (14-day retention) + SNS alarm | ✅ Resolved |
| GAP 4.7 | CloudFormation-created resources | Caught via standard CloudTrail events; idempotent tag application | ✅ Resolved |
| GAP 4.8 | Terraform-created resources | Caught via standard CloudTrail events | ✅ Resolved |
| GAP 5.4 | Tag key case sensitivity | Hardcoded as `map-migrated` | ✅ Resolved |
| GAP 5.5 | Cost allocation tag activation | Automated by MAP credit service for MAP agreements | ✅ N/A |

---

## Remaining Gaps — AWS Platform Limitations

These cannot be addressed by any auto-tagging solution. They are inherent to how AWS services and the MAP program work.

### ECS Task Tag Propagation (GAP 2.4)
- **Issue:** ECS tasks launched from services do not inherit tags by default.
- **Why it can't be fixed:** The `propagateTags` setting must be `SERVICE` or `TASK_DEFINITION` in the ECS service definition. No external API can retroactively enable this.
- **Customer action required:** Set `propagateTags: SERVICE` in all ECS service definitions.

### Bedrock Standard InvokeModel (GAP 3.1)
- **Issue:** Bedrock API calls via `InvokeModel` without an Application Inference Profile have no taggable resource. 100% of that spend is unattributed.
- **Why it can't be fixed:** This is a Bedrock architecture requirement — inference must be routed through a tagged Application Inference Profile.
- **Customer action required:** Create [Application Inference Profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-create.html) and route all inference calls through them. The auto-tagger will tag the profiles automatically when created.

### EKS Auto Mode Nodes (GAP 3.8)
- **Issue:** EC2 instances managed by EKS Auto Mode cannot be tagged via standard EC2 tagging APIs.
- **Why it can't be fixed:** EKS Auto Mode manages node lifecycle internally. Tags must be set via NodePool configuration.
- **Customer action required:** Configure MAP tags in EKS NodePool definitions.

### Multiple MAP IDs on Shared Resources (GAP 3.9)
- **Issue:** A resource can only have one value for the `map-migrated` tag key. Customers with multiple concurrent MAP engagements sharing resources cannot attribute to both.
- **Why it can't be fixed:** Fundamental AWS tag model — one key = one value per resource.
- **Customer action required:** Separate resources by MAP engagement where possible, or accept single-engagement attribution.

### Tag Limit — 50 Tags Per Resource (GAP 4.3)
- **Issue:** Resources that already have 50 tags will fail to receive the `map-migrated` tag.
- **Why it can't be fixed:** AWS hard limit of 50 tags per resource.
- **Impact:** Rare in practice. Failed tags go to the DLQ for manual review.

### Resources Imported into Terraform/CloudFormation (GAP 4.9)
- **Issue:** Resources imported into IaC state were already created — no new CloudTrail creation event fires.
- **Why it can't be fixed:** The creation event already happened. No trigger for the auto-tagger.
- **Customer action required:** Tag imported resources manually or use the one-time backfill option (if within 90-day CloudTrail window).

### SCP Blocking Tag Operations (GAP 5.1)
- **Issue:** Organization SCPs that restrict `tag:TagResources` or service-specific tagging actions will cause the Lambda to fail silently.
- **Why it can't be fixed:** SCPs are not evaluated by IAM simulation and require manual review.
- **Customer action required:** Verify SCPs in the AWS Organizations console before deployment. The `deploy.sh` preflight runs `iam:SimulatePrincipalPolicy` but cannot detect SCP-level denies.

---

## Out-of-Scope Scenarios

These are not gaps — they are explicitly outside the MAP tagging paradigm.

| Scenario | Reason |
|----------|--------|
| **Baseline services** (Connect, AMS, VMC, EVS) | Tracked via baseline spend at agreement signing, not tags |
| **Data transfer costs** | All data transfer costs are excluded from MAP 2.0 |
| **AWS Marketplace software spend** | Third-party purchases are not MAP eligible (compute portion IS eligible and is tagged) |
| **Oracle Database@AWS** | Procured through Marketplace, not taggable |
| **S3 Glacier Deep Archive** | Always excluded from MAP credit calculations |
| **Fargate on EKS** | MAP ineligible (Fargate on ECS IS eligible) |
| **Reserved Instances / Savings Plans** | Not taggable resources — underlying resources (EC2, RDS, etc.) must be tagged; MAP credit service handles RI/SP pricing math |
| **GovCloud / China regions** | Supported but requires partition-aware ARN construction (`aws-us-gov` / `aws-cn`); not currently implemented |

---

## Discontinued Services

These services are no longer available to new customers and cannot be tested:

| Service | Status |
|---------|--------|
| AWS IoT Events | No longer available to new customers |
| AWS IoT Analytics | No longer available to new customers |
| Amazon Lookout for Vision | Discontinued — removed from SDK |
| Amazon Lookout for Metrics | Discontinued — removed from SDK |
| Amazon QLDB | Discontinued July 2025 |

---

## Not Taggable — Confirmed AWS API Limitations

These resources cannot be tagged post-creation due to AWS API restrictions:

| Resource | AWS Reason |
|----------|-----------|
| IoT Things | AWS API rejects `thing` as resource type in TagResource |
| Lambda Layers/Aliases | AWS explicitly blocks tagging of layers, aliases, and versions |
| Keyspaces Tables | Resource Groups API doesn't support Cassandra/Keyspaces |
| CloudWatch Log Streams | Inherit tags from parent Log Group by design |
| API Gateway API Keys | ARN format rejected by all tagging APIs |
| EventBridge Connections | UUID suffix in ARN makes it invalid for tagging |
| Glue Tables | Can only be tagged at creation time via Tags param; post-creation tagging rejected |
| Individual EventBridge Schedules | TagResource API only accepts schedule-group ARNs |
