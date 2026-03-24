# MAP 2.0 Auto-Tagger: Comprehensive Gap Analysis

**Date:** 2026-03-19
**Sources:** MAP 2.0 Included Services List, customer field observations, and auto-tagger source code review.

---

## Executive Summary

Our auto-tagger (`map2-auto-tagger.yaml`) currently handles **12 CloudTrail event types** across **9 AWS event sources**. The research reveals **at least 30 distinct gaps** — services, resources, or scenarios where tagging is missed or incorrect. These gaps fall into 6 categories:

1. **Missing Services** — MAP-eligible services with no EventBridge rule
2. **Sub-Resource Gaps** — Child/dependent resources not tagged
3. **Service-Specific Edge Cases** — Unique tagging quirks per service
4. **Architectural Gaps** — Fundamental design limitations
5. **Operational Gaps** — Tag propagation, limits, enforcement issues
6. **Out-of-Scope Scenarios** — Things our tagger cannot address

---

## GAP 1: Missing MAP-Eligible Services (No EventBridge Rule)

Our EventBridge rule only matches 9 sources. The MAP Included Services List has 100+ eligible services. The following high-spend services are COMPLETELY MISSING from our auto-tagger:

### GAP 1.1: Amazon EKS (Elastic Kubernetes Service)
- **What gets missed:** EKS cluster creation, managed node groups, and all EC2 instances launched by EKS Auto Mode or managed node groups
- **CloudTrail events:** `CreateCluster` (eks.amazonaws.com), `CreateNodegroup`, `CreateFargateProfile`
- **Tagging API:** `eks:TagResource`
- **Can auto-tagger address?** PARTIALLY. We can tag EKS clusters and node groups on creation. However, EKS Auto Mode nodes are created by the EKS service itself and use a different mechanism. For managed node groups, tags must be in the Launch Template to propagate to EC2 instances.
- **Critical nuance:** Fargate on EKS is MAP-INELIGIBLE. Fargate on ECS IS eligible. MAP credit calculation tool docs confirm: "Fargate should be excluded from Eligible ARR calculations when used with EKS."

### GAP 1.2: Amazon Bedrock
- **What gets missed:** Bedrock inference spend via Application Inference Profiles, model customization jobs, agents
- **CloudTrail events:** `CreateInferenceProfile`, `CreateProvisionedModelThroughput`, `CreateModelCustomizationJob`
- **Tagging API:** `bedrock:TagResource`
- **Can auto-tagger address?** YES for Application Inference Profiles and Provisioned Throughput. However, standard model invocations (InvokeModel) have NO taggable resource — they require the user to route calls through a tagged Application Inference Profile. This is a PROCESS issue, not a tagging API issue.
- **Critical nuance:** Cross-Region Inference (CRIS) complicates this further — inference routes to other regions but the profile tag in the source region should still capture spend.

### GAP 1.3: Amazon CloudWatch (Logs only)
- **What gets missed:** CloudWatch Log Groups — MAP eligible (Logs portion only, per Included Services List)
- **CloudTrail event:** `CreateLogGroup`
- **Tagging API:** `logs:TagResource` (CloudWatch Logs)
- **Can auto-tagger address?** YES — add `aws.logs` source and `CreateLogGroup` event

### GAP 1.4: Amazon ElastiCache
- **What gets missed:** ElastiCache clusters/replication groups
- **CloudTrail events:** `CreateCacheCluster`, `CreateReplicationGroup`
- **Tagging API:** `elasticache:AddTagsToResource`
- **Can auto-tagger address?** YES

### GAP 1.5: Amazon OpenSearch Service
- **What gets missed:** OpenSearch domains
- **CloudTrail event:** `CreateDomain` (es.amazonaws.com)
- **Tagging API:** `es:AddTags`
- **Can auto-tagger address?** YES

### GAP 1.6: Amazon Kinesis (Data Streams, Firehose)
- **What gets missed:** Kinesis streams and Firehose delivery streams
- **CloudTrail events:** `CreateStream`, `CreateDeliveryStream`
- **Tagging API:** `kinesis:AddTagsToStream`, `firehose:TagDeliveryStream`
- **Can auto-tagger address?** YES

### GAP 1.7: AWS Step Functions
- **What gets missed:** State machines
- **CloudTrail event:** `CreateStateMachine`
- **Tagging API:** `states:TagResource`
- **Can auto-tagger address?** YES

### GAP 1.8: Amazon API Gateway
- **What gets missed:** REST APIs and HTTP APIs
- **CloudTrail events:** `CreateRestApi`, `CreateApi`
- **Tagging API:** `apigateway:TagResource`
- **Can auto-tagger address?** YES

### GAP 1.9: Amazon EFS (Elastic File System)
- **What gets missed:** EFS file systems
- **CloudTrail event:** `CreateFileSystem`
- **Tagging API:** `elasticfilesystem:TagResource`
- **Can auto-tagger address?** YES

### GAP 1.10: Amazon FSx (all variants)
- **What gets missed:** FSx file systems (NetApp ONTAP, Windows, Lustre, OpenZFS)
- **CloudTrail event:** `CreateFileSystem` (fsx.amazonaws.com)
- **Tagging API:** `fsx:TagResource`
- **Can auto-tagger address?** YES for file systems. SVMs and volumes may also need tagging.

### GAP 1.11: Amazon Redshift
- **What gets missed:** Redshift clusters and serverless workgroups/namespaces
- **CloudTrail events:** `CreateCluster` (redshift.amazonaws.com), `CreateWorkgroup`, `CreateNamespace`
- **Tagging API:** `redshift:CreateTags`, `redshift-serverless:TagResource`
- **Can auto-tagger address?** YES

### GAP 1.12: Amazon SageMaker
- **What gets missed:** Notebook instances, training jobs, endpoints, HyperPod clusters
- **CloudTrail events:** `CreateNotebookInstance`, `CreateEndpoint`, `CreateTrainingJob`
- **Tagging API:** `sagemaker:AddTags`
- **Can auto-tagger address?** PARTIALLY. Some SageMaker resources (HyperPod, Foundation Model Training) may not support tagging.

### GAP 1.13: Amazon CloudFront
- **What gets missed:** CloudFront distributions (eligible after Jan 16, 2023 per Included Services List, excludes data transfer costs)
- **CloudTrail event:** `CreateDistribution`
- **Tagging API:** `cloudfront:TagResource`
- **Can auto-tagger address?** YES

### GAP 1.14: AWS Glue
- **What gets missed:** Glue jobs, crawlers, databases
- **CloudTrail events:** `CreateJob`, `CreateCrawler`, `CreateDatabase`
- **Tagging API:** `glue:TagResource`
- **Can auto-tagger address?** YES

### GAP 1.15: Amazon EMR
- **What gets missed:** EMR clusters
- **CloudTrail event:** `RunJobFlow`
- **Tagging API:** `elasticmapreduce:AddTags`
- **Can auto-tagger address?** YES, but note EMR-to-EC2 tag propagation behavior

### GAP 1.16: Amazon VPC Resources (NAT Gateways, Transit Gateways, Endpoints)
- **What gets missed:** NAT Gateways, Transit Gateways, VPC Endpoints, Elastic IPs
- **CloudTrail events:** `CreateNatGateway`, `CreateTransitGateway`, `CreateVpcEndpoint`, `AllocateAddress`
- **Tagging API:** `ec2:CreateTags`
- **Can auto-tagger address?** YES — these all use the EC2 tagging API

### GAP 1.17: Amazon WorkSpaces
- **What gets missed:** WorkSpaces instances
- **CloudTrail event:** `CreateWorkspaces`
- **Tagging API:** `workspaces:CreateTags`
- **Can auto-tagger address?** YES

### GAP 1.18: Amazon QuickSight
- **What gets missed:** QuickSight users, dashboards, and related resources
- **Tagging API:** `quicksight:TagResource`
- **Can auto-tagger address?** PARTIALLY — QuickSight uses identity-based resources, not standard CloudTrail create events

### GAP 1.19: Amazon Comprehend
- **What gets missed:** Comprehend custom classifiers and entity recognizers
- **CloudTrail events:** `CreateDocumentClassifier`, `CreateEntityRecognizer`
- **Tagging API:** `comprehend:TagResource`
- **Can auto-tagger address?** YES for persistent resources. CANNOT address standard API calls — they have no taggable resource.

---

## GAP 2: Sub-Resource / Child Resource Gaps

### GAP 2.1: EBS Snapshots Not Tagged
- **What gets missed:** EBS snapshots created from tagged volumes (manual, automated, or AMI-based)
- **How it manifests:** Customer tags EC2 + EBS volumes, but snapshots accumulate untagged. Snapshot storage costs are not credited.
- **CloudTrail event:** `CreateSnapshot`, `CreateSnapshots`
- **Tagging API:** `ec2:CreateTags`
- **Can auto-tagger address?** YES — add these events. Note: snapshots created by AWS Backup also need handling.

### GAP 2.2: AMIs Not Tagged
- **What gets missed:** AMIs created from tagged instances
- **CloudTrail event:** `CreateImage`
- **Tagging API:** `ec2:CreateTags`
- **Can auto-tagger address?** YES

### GAP 2.3: RDS Snapshots / Read Replicas Not Tagged
- **What gets missed:** RDS automated snapshots, manual snapshots, read replicas, restored instances
- **How it manifests:** Customer restores from snapshot — new instance is untagged
- **CloudTrail events:** `CreateDBSnapshot`, `CreateDBClusterSnapshot`, `RestoreDBInstanceFromDBSnapshot`, `CreateDBInstanceReadReplica`
- **Tagging API:** `rds:AddTagsToResource`
- **Can auto-tagger address?** YES — add these events

### GAP 2.4: ECS Service/Task Tag Propagation
- **What gets missed:** ECS tasks launched from services do NOT inherit tags by default
- **How it manifests:** Customer tags ECS cluster and service, but Fargate tasks have no tags. Cost Explorer shows ECS spend as untagged.
- **Can auto-tagger address?** PARTIALLY. We can tag ECS services on creation, but `propagateTags` must be set to `SERVICE` or `TASK_DEFINITION` in the ECS service definition itself. Our tagger cannot retroactively enable propagation.
- **Critical:** ECS is one of the most commonly missed high-spend services.

### GAP 2.5: Auto Scaling Group Launched Instances
- **What gets missed:** EC2 instances launched by Auto Scaling Groups without MAP tag in Launch Template
- **How it manifests:** New instances from scale-out events are untagged
- **CloudTrail event:** `RunInstances` (but by AutoScaling service, not user)
- **Can auto-tagger address?** YES for the RunInstances event — our tagger should catch these if the event fires. BUT the better solution is to ensure the Launch Template has the tag. Our tagger is a backstop, not a replacement.

### GAP 2.6: Elastic IP Addresses
- **What gets missed:** EIPs allocated but not tagged; EIPs associated with tagged instances
- **CloudTrail event:** `AllocateAddress`
- **Can auto-tagger address?** YES — add this event

---

## GAP 3: Service-Specific Edge Cases

### GAP 3.1: Bedrock — Application Inference Profiles Required
- **What gets missed:** All Bedrock InvokeModel API calls that do NOT go through a tagged Application Inference Profile
- **How it manifests:** Customer uses Bedrock models directly (not through an inference profile). Spend is not attributed to any tagged resource. 100% of that spend is lost.
- **Can auto-tagger address?** NO. This requires the customer to change their application architecture to use inference profiles. Our tagger can only tag the profiles when they are created.

### GAP 3.2: Bedrock — Cross-Region Inference (CRIS)
- **What gets missed:** When CRIS routes inference to other regions, the tag is on the source region's inference profile
- **Can auto-tagger address?** YES — tag the inference profile in the source region. MAP credit calculation service should handle cross-region attribution.

### GAP 3.3: S3 — Bucket-Level Tags Only
- **What gets missed:** Nothing, if the bucket is tagged. S3 costs are attributed at the bucket level.
- **Can auto-tagger address?** YES — we already handle CreateBucket

### GAP 3.4: S3 Glacier Deep Archive — MAP INELIGIBLE
- **What gets missed:** N/A — this storage class is explicitly excluded from MAP
- **Evidence:** MAP credit calculation tool Known Limitations: "Amazon S3 Glacier Deep Archive" is an "Always Excluded Service"
- **Can auto-tagger address?** N/A. Tagging it does no harm (MAP credit calculation service excludes it), but it will not generate credits.

### GAP 3.5: Oracle Database@AWS — MAP INELIGIBLE
- **What gets missed:** N/A — procured through Marketplace, not taggable
- **Can auto-tagger address?** NO

### GAP 3.6: EVS (Elastic VMware Service) — Baseline Service
- **What gets missed:** N/A — EVS is a baseline service, not taggable
- **Can auto-tagger address?** NO — baseline services are tracked differently

### GAP 3.7: QuickSight — Must Tag Users AND Dashboards
- **What gets missed:** QuickSight resources are not standard AWS resources. Users (readers/admins) and dashboards all need tags.
- **Can auto-tagger address?** PARTIALLY — this requires QuickSight-specific API calls

### GAP 3.8: EKS Auto Mode — Tagging Not Straightforward
- **What gets missed:** EC2 instances managed by EKS Auto Mode cannot easily be tagged with MAP tags
- **Can auto-tagger address?** UNCLEAR — EKS Auto Mode manages node lifecycle. Tags may need to be set via NodePool configuration, not standard EC2 tagging.

### GAP 3.9: Multiple MAP IDs on Shared Resources
- **What gets missed:** A resource can only have ONE value for the `map-migrated` key. Customers with multiple MAP engagements sharing a cluster cannot attribute to both.
- **Can auto-tagger address?** NO — this is a fundamental MAP program limitation. One resource = one MAP ID.

---

## GAP 4: Architectural / Design Gaps in Our Auto-Tagger

### GAP 4.1: Single-Region Deployment
- **What gets missed:** Resources created in regions where the auto-tagger is not deployed
- **How it manifests:** Customer deploys EC2 in us-west-2 but our tagger is only in us-east-1
- **Can auto-tagger address?** YES — deploy via StackSets across all active regions

### GAP 4.2: No Multi-Account Support
- **What gets missed:** Resources in linked accounts under the same payer
- **How it manifests:** Tagger deployed in management account misses resources in member accounts
- **Can auto-tagger address?** YES — use CloudFormation StackSets or Organization-level EventBridge rules

### GAP 4.3: Tag Limit (50 Tags Per Resource)
- **What gets missed:** Resources that already have 50 tags — our tagger will FAIL silently
- **How it manifests:** API error "tag limit exceeded" — resource remains untagged
- **Can auto-tagger address?** YES — add pre-check for existing tag count; add error handling and alerting for tag-limit failures

### GAP 4.4: No Idempotency / Duplicate Tag Check
- **What gets missed:** Nothing (duplicate tags just overwrite), but wastes API calls
- **Can auto-tagger address?** YES — check if tag already exists before writing

### GAP 4.5: No Handling of Service-Linked / Service-Created Resources
- **What gets missed:** Resources created by AWS services on behalf of users (e.g., RDS creates EC2 instances for Custom DB, EKS creates ENIs, Lambda creates ENIs for VPC functions)
- **How it manifests:** These resources incur costs but may appear under different service codes in CUR
- **Can auto-tagger address?** PARTIALLY — some of these fire CloudTrail events with `invokedBy: internal.amazonaws.com`. We could detect and tag them if we don't filter on user identity.

### GAP 4.6: No Retry / DLQ for Failed Tags
- **What gets missed:** Transient failures (throttling, eventual consistency, resource not yet available)
- **How it manifests:** Tag attempt fails, resource is permanently untagged
- **Can auto-tagger address?** YES — add SQS DLQ on Lambda; add retry with backoff

### GAP 4.7: CloudFormation-Created Resources
- **What gets missed:** Nothing, IF CloudFormation fires standard CloudTrail events (it does). Our tagger should catch them.
- **Can auto-tagger address?** YES — already handled. CloudFormation resource creation events are standard CloudTrail events. HOWEVER, if CloudFormation already applies tags (via stack-level tags), our tagger may conflict. Add logic to NOT overwrite existing `map-migrated` tags.

### GAP 4.8: Terraform-Created Resources
- **What gets missed:** Nothing for CloudTrail purposes — Terraform calls AWS APIs which generate CloudTrail events. Our tagger will catch them.
- **Evidence:** Field experience confirms Terraform users still have tagging gaps, primarily due to not configuring `default_tags` at the provider level
- **Can auto-tagger address?** YES — our tagger is a backstop for Terraform users who forget `default_tags`

### GAP 4.9: Resources Imported into Terraform/CloudFormation
- **What gets missed:** Resources imported into IaC state were already created — no new CloudTrail creation event fires
- **Can auto-tagger address?** NO — the creation event already happened. Need a separate "sweep" function to find and tag existing untagged resources.

---

## GAP 5: Operational / Policy Gaps

### GAP 5.1: SCP Blocking Tag Operations
- **What gets missed:** If an Organization SCP restricts `tag:TagResources` or `ec2:CreateTags`, our Lambda will fail
- **How it manifests:** Lambda gets AccessDenied errors
- **Can auto-tagger address?** YES — document SCP requirements; add pre-flight SCP check; ensure our Lambda role is exempt from restrictive SCPs

### GAP 5.2: Tag Value Prefix Mismatch (mig vs comm vs dba)
- **What gets missed:** Resources tagged with wrong prefix (e.g., `mig` instead of `comm` for DB&A workloads)
- **Can auto-tagger address?** PARTIALLY — we use a single MpeId. For customers with specialized workloads (DB&A, SAP, Windows), we need configurable prefix mapping per resource type.

### GAP 5.3: Wrong Tag Applied — No Retroactive Fix
- **What gets missed:** Once tagged incorrectly, past spend is permanently lost
- **Can auto-tagger address?** NO for past periods. YES for preventing future errors if the tagger is configured correctly from day one.

### GAP 5.4: Case Sensitivity of Tag Key
- **What gets missed:** `Map-Migrated`, `MAP-MIGRATED`, `map_migrated` are all WRONG — must be exactly `map-migrated`
- **Can auto-tagger address?** YES — our tagger hardcodes the correct key

### GAP 5.5: Tag Activation in Billing Console — RESOLVED
- Cost allocation tag activation for `map-migrated` is now automated by MAP credit service for MAP agreements. No manual step needed.

---

## GAP 6: Always-Excluded / Cannot-Be-Tagged Scenarios

These are scenarios our auto-tagger CANNOT and SHOULD NOT address, because they are inherently outside the tagging paradigm:

### GAP 6.1: Baseline Services (Connect, AMS, VMC)
- Amazon Connect, AWS Managed Services, VMware Cloud on AWS are tracked via BASELINE spend, not tags
- The MAP agreement captures baseline spend at signing; new spend above baseline generates credits
- **No tagging required or possible**

### GAP 6.2: Data Transfer Costs
- ALL data transfer costs are excluded from MAP 2.0
- This includes data transfer associated with specific services
- **Evidence:** MAP Included Services List: "All data transfer costs are excluded from MAP 2.0"

### GAP 6.3: AWS Marketplace Spend
- Third-party Marketplace purchases are NOT MAP eligible
- EC2/ECS compute running Marketplace AMIs/containers IS eligible (the compute portion)
- **Evidence:** Large Migrations FAQ: "the AWS ARR must meet MAP threshold... AWS spend can be tagged and counted towards MAP, while the software spend through AWS Marketplace is not included"

### GAP 6.4: Reserved Instances and Savings Plans
- RIs and SPs spend IS eligible for MAP — credits calculated at the effective hourly rate after RI/SP discounts
- RIs/SPs themselves are NOT taggable resources — the UNDERLYING resources (EC2 instances, etc.) must be tagged
- **Can auto-tagger address?** YES — tag the underlying resources; MAP credit calculation service handles RI/SP pricing math

### GAP 6.5: GovCloud and China Regions
- MAP is available in GovCloud but with different processes
- China regions (BJS/ZHY) have separate partition — standard tagging works but the auto-tagger template would need partition-aware ARN construction
- **Can auto-tagger address?** NEEDS MODIFICATION for GovCloud ARN partition (`aws-us-gov`)

### GAP 6.6: Wavelength, Local Zones, Outposts
- Resources in Local Zones are partially eligible (noted in Included Services List per service)
- Outposts resources use standard APIs — tagging should work
- Wavelength — limited service availability, but EC2 in Wavelength zones should be taggable
- **Can auto-tagger address?** YES for all — they use standard CloudTrail events

### GAP 6.7: Opt-In Regions
- Regions that are not enabled by default (e.g., af-south-1, ap-east-1) need to be opted in before use
- CloudTrail and EventBridge work normally in opted-in regions
- **Can auto-tagger address?** YES — deploy tagger via StackSets to opted-in regions

---

## Answers to Specific Research Questions

### a) Reserved Instances and Savings Plans
RIs and SPs are NOT tagged directly. The underlying resources (EC2, RDS, etc.) must be tagged. MAP credit calculation service calculates credits based on the effective hourly rate (post-RI/SP discount). Our auto-tagger handles this correctly by tagging the underlying resources.

### b) Service-Linked Resources
Resources created by AWS on behalf of the user (e.g., RDS custom instance EC2, EKS-managed ENIs) generally DO fire CloudTrail events. Our tagger can catch them, but we need to ensure we don't filter on user identity (`invokedBy`).

### c) Opt-In Regions
Standard CloudTrail/EventBridge works in opted-in regions. Deploy tagger via StackSets.

### d) Services Tracked Without Tags (Besides Connect, AMS, VMC)
EVS (Elastic VMware Service) is confirmed as a baseline service. S3 uses bucket-level tagging (not object-level). No additional CCS-backend-only services discovered beyond Connect, AMS, VMC, and EVS.

### e) Marketplace AMIs/Containers on EC2/ECS
The COMPUTE portion (EC2/ECS) IS MAP eligible and should be tagged. The Marketplace SOFTWARE cost is excluded. Our tagger handles this correctly — it tags the EC2 instance regardless of what AMI it runs.

### f) CloudFormation-Created Resources
YES, CloudTrail events still fire for CloudFormation-created resources. Our tagger catches them. CloudFormation can also apply stack-level tags which may conflict — add idempotency check.

### g) Resources Imported into Terraform/CloudFormation
NO new creation event fires. These resources must be tagged separately (via a sweep function).

### h) Services Where tag:TagResources Does NOT Work
Most services support the unified `tag:TagResources` API, but some require service-specific APIs (S3, SQS, CloudWatch Logs). Our tagger already uses service-specific APIs where needed. Some services (SageMaker HyperPod, Comprehend standard API calls) have resources that CANNOT be tagged at all.

### i) Tag Limit (50 Tags)
YES, our auto-tagger will FAIL if a resource already has 50 tags. We need to add pre-check logic and error handling.

### j) GovCloud / China Regions
GovCloud: Works with ARN partition modification. China: Works but separate partition. Need to parameterize partition in ARN construction.

### k) SCPs Restricting Tagging
YES, SCPs can block our Lambda. We need to document SCP requirements and potentially add SCP compatibility testing.

### l) Wavelength, Local Zones, Outposts
All use standard APIs and CloudTrail events. Our tagger works in these environments.

---

## Priority Ranking

| Priority | Gap | Est. Revenue Impact | Effort |
|----------|-----|-------------------|--------|
| P0 | GAP 1.1 EKS (inc. Auto Mode) | Very High ($millions missed) | High |
| P0 | GAP 2.4 ECS Tag Propagation | Very High | Medium |
| P0 | GAP 1.2 Bedrock (Inference Profiles) | High (growing fast) | Medium |
| P0 | GAP 4.6 No Retry/DLQ | High (any failed tag) | Low |
| P1 | GAP 1.16 VPC (NAT GW, TGW, EIP) | High | Low |
| P1 | GAP 2.1 EBS Snapshots | Medium-High | Low |
| P1 | GAP 2.3 RDS Snapshots/Replicas | Medium-High | Low |
| P1 | GAP 2.5 Auto Scaling instances | Medium-High | Low |
| P1 | GAP 1.4 ElastiCache | Medium | Low |
| P1 | GAP 1.5 OpenSearch | Medium | Low |
| P1 | GAP 1.9 EFS | Medium | Low |
| P1 | GAP 1.11 Redshift | Medium | Low |
| P1 | GAP 4.1 Multi-Region | High | Medium |
| P1 | GAP 4.2 Multi-Account | High | Medium |
| P2 | GAP 1.3 CloudWatch Logs | Low-Medium | Low |
| P2 | GAP 1.6 Kinesis | Low-Medium | Low |
| P2 | GAP 1.7 Step Functions | Low | Low |
| P2 | GAP 1.8 API Gateway | Low-Medium | Low |
| P2 | GAP 1.10 FSx | Medium | Low |
| P2 | GAP 1.13 CloudFront | Low-Medium | Low |
| P2 | GAP 1.14 Glue | Low-Medium | Low |
| P2 | GAP 1.15 EMR | Medium | Low |
| P2 | GAP 4.3 Tag Limit Check | Low (rare) | Low |
| P2 | GAP 5.2 Prefix Mapping | Medium | Medium |
| P3 | GAP 1.12 SageMaker | Low | Medium |
| P3 | GAP 1.17 WorkSpaces | Low | Low |
| P3 | GAP 1.18 QuickSight | Low | Medium |
| P3 | GAP 1.19 Comprehend | Low | Low |
| P3 | GAP 2.2 AMIs | Low | Low |
| P3 | GAP 2.6 Elastic IPs | Low | Low |

---

## Recommended Next Steps

1. **Immediate (P0):** Add EKS, Bedrock, and VPC resource event handling. Fix ECS tag propagation documentation/guidance. Add DLQ and retry to Lambda.

2. **Short-term (P1):** Expand EventBridge rule to cover all 20+ missing MAP-eligible services. Add snapshot/replica/AMI tagging. Deploy multi-region via StackSets.

3. **Medium-term (P2):** Build a "sweep" function for existing untagged resources. Add tag-limit pre-check. Add prefix mapping for DB&A/SAP workloads.

4. **Documentation:** Create a customer-facing guide covering services our tagger CANNOT handle (Bedrock inference profiles, ECS propagateTags, EKS Auto Mode node pool config, QuickSight).

---

## Files Referenced
