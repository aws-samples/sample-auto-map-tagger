# MAP 2.0 Auto-Tagger — Coverage

Service and resource coverage for the MAP 2.0 Auto-Tagger, derived from the Lambda handler in `map2-auto-tagger-optimized.yaml`.

**Methodology.** This doc was reset on 2026-04-26 by cross-checking every claim against:

1. Handler inventory from `.github/scripts/audit_handler_coverage.py --report` (154 explicit `event_name == ...` branches).
2. IAM grants in the `AutoTaggerRole` policy (`Sid: ServiceSpecificTagging`).
3. The `_IGNORE_EVENTS` and `_TRANSIENT_MARKERS` constants in the Lambda source.

A claim is listed here only if (a) a specific handler exists OR (b) the universal ARN extractor + RGTA path is believed to cover it AND the service-specific IAM action is granted. Claims that fail both tests are flagged `**KNOWN GAP**`, `**UNVERIFIED**`, or removed.

**This doc is source of truth for "what is live-verified."** Unverified claims are marked as such — they are not silently counted as supported.

---

## Supported Services

All services below have an explicit handler in the Lambda function **and** the corresponding IAM grant. Tagging uses the universal Resource Groups Tagging API (RGTA) by default, with service-specific APIs for services that don't support RGTA (S3, SQS, Kinesis, API Gateway, CloudFront, Route53, Global Accelerator, DAX, Storage Gateway, Keyspaces, Directory Service, CloudHSM v2).

### Compute

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| EC2 | Instances, EBS volumes, ENIs, AMIs, snapshots, key pairs, placement groups, launch templates | EC2 CreateTags (fallback from RGTA) |
| Lambda | Functions (universal ARN scan — no explicit handler) | RGTA |
| ECS | Clusters, services | RGTA |
| EKS | Clusters, node groups, add-ons | RGTA |
| Auto Scaling | Auto Scaling groups | ASG-specific `create_or_update_tags` |
| EMR | Clusters (RunJobFlow) | RGTA |
| EMR Serverless | Applications | RGTA |
| Elastic Beanstalk | Applications, environments | RGTA |
| GameLift | Builds, scripts, fleets | RGTA |

### Storage

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| S3 | Buckets | S3-specific `put_bucket_tagging` |
| EFS | File systems | RGTA |
| FSx | File systems (Lustre/ONTAP/OpenZFS), backups, restores, snapshots | RGTA |
| ECR | Repositories | RGTA |
| EBS | Volumes, snapshots (standalone + attached) | EC2 CreateTags |
| Backup | Vaults, plans | RGTA |
| Storage Gateway | Tape pools | Native `storagegateway:AddTagsToResource` |

### Database

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| RDS | DB instances, clusters (Aurora), snapshots, cluster snapshots, read replicas, proxies | RGTA |
| DynamoDB | Tables, restores (from backup + point-in-time) | RGTA |
| DynamoDB DAX | Clusters | Native `dax:TagResource` |
| ElastiCache | Clusters, replication groups, serverless caches, snapshots | RGTA |
| MemoryDB | Clusters | Native `memorydb:TagResource` |
| DocumentDB | Clusters (via RDS handler, `rds.amazonaws.com` event source) | RGTA |
| Neptune | Clusters (via RDS handler, `rds.amazonaws.com` event source) | RGTA |
| Redshift | Clusters, serverless workgroups, namespaces, snapshots | RGTA |
| OpenSearch | Domains | RGTA |
| Timestream | Databases, tables | RGTA |
| Keyspaces (Cassandra) | Keyspaces | Native `keyspaces:TagResource` (requires `cassandra:Alter` — fixed v20.6.4) |

### Analytics

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| Kinesis Data Streams | Streams | Kinesis-specific `add_tags_to_stream` |
| Kinesis Data Firehose | Delivery streams | Firehose-specific `tag_delivery_stream` |
| Kinesis Video Streams | Streams | KVS-specific `tag_stream` |
| Kinesis Analytics | Applications (Flink) | RGTA |
| MSK | Clusters (provisioned + serverless) | RGTA |
| Glue | Databases, crawlers, jobs, triggers, workflows | RGTA |
| Glue DataBrew | Datasets, recipes | RGTA |
| Athena | Workgroups | RGTA |
| QuickSight | Resources | QuickSight-specific `tag_resource` |

### Networking

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| VPC | VPCs, subnets, security groups, route tables, internet gateways, NAT gateways, network ACLs, DHCP options, egress-only IGWs, carrier gateways, flow logs, network interfaces | EC2 CreateTags |
| ELB | Load balancers (ALB/NLB/CLB), target groups | RGTA |
| Transit Gateway | Transit gateways, VPC attachments | EC2 CreateTags |
| VPN | VPN connections, VPN gateways, customer gateways | EC2 CreateTags |
| VPC Endpoints | Endpoints | EC2 CreateTags |
| VPC Peering | Peering connections | EC2 CreateTags |
| Direct Connect | LAGs, Direct Connect gateways | RGTA |
| CloudFront | Distributions | CloudFront-specific `tag_resource` |
| Route53 | Hosted zones, health checks | Route53-specific `change_tags_for_resource` |
| Global Accelerator | Accelerators | GA-specific `tag_resource` |
| Network Firewall | Firewalls, firewall policies | RGTA |
| App Mesh | Meshes | RGTA |
| RAM | Resource shares | RGTA |

### Integration & Messaging

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| SNS | Topics | RGTA |
| SQS | Queues | SQS-specific `tag_queue` |
| Step Functions | State machines | RGTA |
| EventBridge | Rules | RGTA |
| API Gateway | REST APIs, HTTP APIs, WebSocket APIs, VPC links | API Gateway-specific `tag_resource` |
| AppSync | GraphQL APIs | RGTA |
| Amazon MQ | Brokers (ActiveMQ + RabbitMQ) — universal ARN scan + `mq:CreateTags` IAM | RGTA |

### AI / ML

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| SageMaker | Notebook instances, domains, pipelines, feature groups | RGTA |
| Bedrock | Agents, agent action groups, agent aliases, data sources, inference profiles, guardrails, flows, prompts, knowledge bases | Bedrock Agent-specific `tag_resource` |
| Comprehend | Document classifiers | RGTA |
| Kendra | Indexes, data sources | RGTA |
| HealthLake | Datastores (universal ARN scan) | RGTA |

### Security & Identity

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| KMS | Keys | RGTA |
| ACM | Certificates | RGTA |
| Private CA | Certificate authorities | RGTA |
| Cognito | User pools, identity pools | RGTA |
| Secrets Manager | Secrets | RGTA |
| Security Hub | Hub (EnableSecurityHub) | RGTA |
| WAFv2 | Web ACLs, IP sets | RGTA |
| Directory Service | Simple AD, Microsoft AD directories | Native `ds:AddTagsToResource` (transient markers fixed v20.8.1) |
| CloudHSM v2 | Clusters, HSMs | Native `cloudhsm:TagResource` — **UNVERIFIED** (see Retraction history) |

### Management & Governance

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| CloudWatch | Alarms, dashboards, log groups | RGTA (dashboard ARN region fix v20.7.3) |
| Systems Manager | Parameters, documents | RGTA |
| Service Catalog | Portfolios | RGTA |

### Developer Tools

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| CodeBuild | Projects | `codebuild:UpdateProject` (AWS routes tagging through UpdateProject) |
| CodePipeline | Pipelines | RGTA |
| CodeDeploy | Applications, deployment groups | RGTA |

### Migration & Transfer

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| Transfer Family | Servers, connectors, users | RGTA |
| DataSync | Tasks | RGTA |
| DMS | Replication instances, endpoints, tasks, serverless replication configs | RGTA |
| Elastic Disaster Recovery | Source servers | RGTA |

### IoT

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| IoT Core | Topic rules | IoT-specific `tag_resource` |
| IoT SiteWise | Assets, asset models, gateways, portals | RGTA |

### Media

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| MediaConvert | Jobs, queues (universal ARN scan) | RGTA |
| MediaLive | Channels (universal ARN scan) | RGTA |
| MediaPackage | Channels (universal ARN scan) | RGTA |

### Other

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| AppStream 2.0 | Fleets (universal ARN scan) | RGTA |
| WorkSpaces | WorkSpaces | RGTA |
| Deadline Cloud | Farms, queues, fleets | RGTA |

---

## Unverified Claims

These services have an IAM grant and/or universal ARN extraction coverage but no E2E test has exercised a live tag. Customers relying on these should manually verify.

| Service | Status | Reason |
|---------|--------|--------|
| VPC Lattice | **UNVERIFIED** | `vpc-lattice:TagResource` IAM grant added post-D7 fix. No explicit handler; relies on universal ARN scan + RGTA. Live-verification pending. |
| Location Service | **UNVERIFIED** | No handler, no service-specific IAM grant. Relies on RGTA via universal ARN scan. Not E2E-tested. |
| Supply Chain | **UNVERIFIED** | No handler, no service-specific IAM grant. Relies on RGTA via universal ARN scan. Not E2E-tested. |
| AppConfig | **UNVERIFIED** | No handler, no service-specific IAM grant. Relies on RGTA via universal ARN scan. Not E2E-tested. |
| Connect | **UNVERIFIED** | `connect:TagResource` IAM grant exists but no E2E coverage. |

---

## Known Gaps

Claims that appeared in earlier versions of this doc but are not actually supported by the current Lambda.

| Service | Status | Reason |
|---------|--------|--------|
| Cloud Map (HTTP namespaces) | **KNOWN GAP** | `CreateHttpNamespace` is in `_IGNORE_EVENTS` (§1.87 — async operationId resolution doesn't fit SQS 180s visibility timeout). Not tagged. |
| CloudWatch Logs Insights query definitions | **KNOWN GAP** | `PutQueryDefinition` is in `_IGNORE_EVENTS` (§1.86 — ARN shape rejected by RGTA and native APIs). |
| EventBridge Connections | **KNOWN GAP** | UUID suffix in ARN makes it invalid for tagging (see MAP_TAGGING_GAP_ANALYSIS.md). |
| EventBridge Schedules | **KNOWN GAP** | TagResource API only accepts schedule-group ARNs, not individual schedules (see MAP_TAGGING_GAP_ANALYSIS.md). |

---

## Not Taggable — AWS Platform Limitations

These resources cannot be tagged post-creation due to AWS API restrictions. Not a tool limitation.

| Resource | Reason |
|----------|--------|
| IoT Things | AWS API rejects `thing` as resource type in TagResource |
| Lambda Layers/Aliases/Versions | AWS explicitly blocks tagging of layers, aliases, and versions |
| Keyspaces Tables | Resource Groups API doesn't support Cassandra/Keyspaces |
| CloudWatch Log Streams | Inherit tags from parent Log Group by design |
| API Gateway API Keys | ARN format rejected by all tagging APIs |
| Glue Tables | Can only be tagged at creation time; post-creation tagging rejected |
| S3 Glacier Deep Archive | MAP ineligible — always excluded from credit calculations |
| Fargate on EKS | MAP ineligible (Fargate on ECS IS eligible) |

For detailed gap analysis (customer-side configuration required, timing-dependent resources, out-of-scope categories), see [MAP_TAGGING_GAP_ANALYSIS.md](MAP_TAGGING_GAP_ANALYSIS.md).

---

## Discontinued Services

| Service | Status |
|---------|--------|
| AWS IoT Events | No longer available to new customers |
| AWS IoT Analytics | No longer available to new customers |
| Amazon Lookout for Vision | Discontinued — removed from SDK |
| Amazon Lookout for Metrics | Discontinued — removed from SDK |
| Amazon QLDB | Discontinued July 2025 |

---

## E2E Coverage Snapshot

Current baseline (from `.github/handler_coverage_baseline.txt`): **106 of 154 handlers** E2E-covered (68.8%). The uncovered 48 are primarily handlers added without matching boto3 resource-creation in the E2E test suite; they are guarded against regression by the CI `audit_handler_coverage.py --check` gate rather than by positive E2E verification.

To regenerate the inventory:

```bash
python3 .github/scripts/audit_handler_coverage.py --report
```

---

## Retraction history

- **v20.3.0** claimed Tier 1 MAP handlers for Keyspaces, Directory Service, and CloudHSM v2. All three were documented as shipped in v20.3.0 but were subsequently found broken on live traffic:
  - **Keyspaces** — missing `cassandra:Alter` IAM (required by the service-authorization matrix for `keyspaces:TagResource`). Every tag call returned AccessDenied. Fixed in **v20.6.4** (§1.99).
  - **Directory Service (MS AD + Simple AD)** — missing `Directory Status: Creating` transient marker caused every AD creation to emit a false `permanent_actionable` SNS alert; retries were misclassified rather than redelivered. Fixed in **v20.8.1** (§1.98).
  - **CloudHSM v2** — handler + IAM (`cloudhsm:TagResource`) are in place, but has not been live-verified since the v20.3.0 ship. Marked `**UNVERIFIED**` above pending a direct-deploy smoke test.
- **v20.7.3** retracted the original `PutDashboard` ARN shape (region-scoped) — AWS dashboards are account-global, so RGTA rejected the region form with silent AccessDenied. The current ARN shape is `arn:aws:cloudwatch::<acct>:dashboard/<name>` and is live-verified.
- **VPC Lattice** was historically listed as "supported" while the Lambda's RGTA fallthrough silently AccessDenied'd every `CreateServiceNetwork` event (D7). The `vpc-lattice:TagResource` grant was added later. Moved to **Unverified** above until a live smoke test confirms the fix.
- **CloudFormation** (Stacks, StackSets) was listed under Management & Governance through v20.9.3. Removed in **v20.9.4** (§1.100): CloudFormation is NOT on the MAP Included Services List (6 April 2026 edition), so stack resources do not earn MAP credit and should not be advertised as covered. The `cloudformation:TagResource / UpdateStack / UpdateStackSet / ListStacks` IAM actions remain in the Lambda role — they support internal CFN TagResource routing (the AWS auth matrix maps `tag:TagResources` on CFN stacks through `UpdateStack`) and the peer-tagger detector at cold start (§1.108). The actions are not there to earn MAP credit on customer stacks.
