# MAP 2.0 Auto-Tagger — Coverage

Service and resource coverage for the MAP 2.0 Auto-Tagger, derived from the Lambda handler in `map2-auto-tagger-optimized.yaml`.

---

## Supported Services

All services below have explicit handlers in the Lambda function. Resources are tagged via the universal Resource Groups Tagging API where possible, with service-specific tagging APIs for services that require them (S3, SQS, Kinesis, API Gateway, CloudFront, Route53, Global Accelerator, etc.).

### Compute

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| EC2 | Instances, EBS volumes, ENIs, AMIs, snapshots, key pairs, placement groups, launch templates | EC2 CreateTags (fallback from RGTA) |
| Lambda | Functions | RGTA |
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
| FSx | File systems (Lustre/ONTAP/OpenZFS), backups, restores | RGTA |
| ECR | Repositories | RGTA |
| EBS | Volumes, snapshots (standalone + attached) | EC2 CreateTags |
| Backup | Vaults, plans | RGTA |
| Storage Gateway | Tape pools | RGTA |

### Database

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| RDS | DB instances, clusters (Aurora), snapshots, cluster snapshots, read replicas, proxies, restores | RGTA |
| DynamoDB | Tables, restores (from backup + point-in-time) | RGTA |
| DynamoDB DAX | Clusters | RGTA |
| ElastiCache | Clusters, replication groups, serverless caches, snapshots | RGTA |
| MemoryDB | Clusters | MemoryDB-specific `tag_resource` |
| DocumentDB | Clusters (via RDS handler) | RGTA |
| Neptune | Clusters (via RDS handler) | RGTA |
| Redshift | Clusters, workgroups (Serverless) | RGTA |
| OpenSearch | Domains | RGTA |
| Timestream | Databases, tables | RGTA |

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
| Cloud Map | HTTP namespaces | RGTA |
| VPC Lattice | Service networks | RGTA |
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
| Amazon MQ | Brokers (ActiveMQ + RabbitMQ) | RGTA |

### AI / ML

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| SageMaker | Notebook instances, domains, pipelines, feature groups | RGTA |
| Bedrock | Agents, agent action groups, agent aliases, data sources, inference profiles, guardrails, flows, prompts, knowledge bases | Bedrock Agent-specific `tag_resource` |
| Comprehend | Document classifiers | RGTA |
| Kendra | Indexes, data sources | RGTA |
| HealthLake | Datastores | RGTA |

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

### Management & Governance

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| CloudWatch | Alarms, dashboards, log groups, query definitions | RGTA |
| Systems Manager | Parameters, documents | RGTA |
| CloudFormation | Stacks, StackSets | RGTA |
| Service Catalog | Portfolios | RGTA |
| AppConfig | Applications | RGTA |

### Developer Tools

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| CodeBuild | Projects | RGTA |
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
| MediaConvert | Jobs, queues | RGTA |
| MediaLive | Channels | RGTA |
| MediaPackage | Channels | RGTA |

### Other

| Service | Resource Types | Tagging Method |
|---------|---------------|----------------|
| AppStream 2.0 | Fleets | RGTA |
| WorkSpaces | WorkSpaces | RGTA |
| Deadline Cloud | Farms, queues, fleets | RGTA |
| Location Service | Resources | RGTA |
| Supply Chain | Instances | RGTA |

---

## Not Taggable — AWS Platform Limitations

These resources cannot be tagged post-creation due to AWS API restrictions. This is not a tool limitation.

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

## E2E Test Coverage

The following matrix shows which services have end-to-end test coverage (resource created → tag verified in a real AWS account).

**Legend:** ✅ = E2E tested | ⚠️ = Partial/indirect | ❌ = Handler exists, no E2E test

### Compute

| Service | E2E | Notes |
|---------|:---:|-------|
| EC2 | ✅ | Instances + attached EBS + ENI |
| Auto Scaling | ✅ | ASG + launch template |
| Lambda | ✅ | |
| ECS | ✅ | Cluster only (no Fargate tasks) |
| EKS | ✅ | Cluster (no node groups in E2E) |
| Fargate | ⚠️ | Indirect — ECS cluster created, no Fargate task |
| EMR | ✅ | Cluster |
| EMR Serverless | ✅ | Application |
| Elastic Beanstalk | ✅ | Application + environment |
| GameLift | ✅ | Build + script + fleet |
| Batch | ❌ | |
| App Runner | ❌ | |

### Storage

| Service | E2E | Notes |
|---------|:---:|-------|
| S3 | ✅ | |
| EBS | ✅ | Standalone + attached |
| EFS | ✅ | |
| FSx | ✅ | |
| ECR | ✅ | |
| Backup | ✅ | Vault + plan |
| DataSync | ✅ | |
| Storage Gateway | ❌ | |

### Database

| Service | E2E | Notes |
|---------|:---:|-------|
| RDS | ✅ | MySQL instance |
| Aurora | ✅ | Cluster + writer instance |
| DynamoDB | ✅ | |
| DynamoDB DAX | ✅ | |
| ElastiCache | ✅ | Redis RG + Serverless |
| MemoryDB | ✅ | |
| DocumentDB | ✅ | |
| Neptune | ⚠️ | |
| Redshift | ✅ | |
| OpenSearch | ✅ | |
| MSK | ✅ | Provisioned + Serverless |
| Timestream | ❌ | |

### Analytics

| Service | E2E | Notes |
|---------|:---:|-------|
| Kinesis Data Streams | ✅ | |
| Kinesis Firehose | ✅ | |
| Kinesis Video Streams | ✅ | |
| Kinesis Analytics | ✅ | |
| Glue | ✅ | Database + crawler + job |
| Glue DataBrew | ✅ | Dataset + recipe |
| Athena | ✅ | Workgroup |
| QuickSight | ⚠️ | Partial — identity-based |

### Networking

| Service | E2E | Notes |
|---------|:---:|-------|
| VPC (full suite) | ✅ | VPC, subnets, SGs, route tables, IGW, NAT GW, etc. |
| ELB | ✅ | ALB + target group |
| Transit Gateway | ✅ | |
| VPN | ✅ | |
| Direct Connect | ✅ | LAG |
| CloudFront | ✅ | Distribution |
| Route53 | ✅ | Hosted zone + health check |
| Global Accelerator | ✅ | |
| Network Firewall | ⚠️ | Handler exists, E2E unclear |
| App Mesh | ❌ | |

### Integration & Messaging

| Service | E2E | Notes |
|---------|:---:|-------|
| SNS | ✅ | |
| SQS | ✅ | |
| Step Functions | ✅ | |
| EventBridge | ⚠️ | Handler exists |
| API Gateway | ✅ | REST + HTTP |
| AppSync | ✅ | |
| Amazon MQ | ✅ | ActiveMQ + RabbitMQ |

### AI / ML

| Service | E2E | Notes |
|---------|:---:|-------|
| SageMaker | ✅ | Notebook, endpoint, pipeline, feature group |
| Bedrock | ✅ | Inference profile, agent, guardrail |
| Comprehend | ✅ | |
| Kendra | ✅ | Index + data source |
| HealthLake | ✅ | |

### Security & Identity

| Service | E2E | Notes |
|---------|:---:|-------|
| KMS | ✅ | |
| ACM | ✅ | |
| Cognito | ✅ | User pool + identity pool |
| Secrets Manager | ✅ | |
| WAFv2 | ✅ | Web ACL + IP set |
| Security Hub | ❌ | Handler exists |
| Private CA | ⚠️ | Handler exists |

### Management & Developer Tools

| Service | E2E | Notes |
|---------|:---:|-------|
| CloudWatch | ✅ | Alarm |
| CloudWatch Logs | ✅ | Log group |
| Systems Manager | ✅ | Parameter |
| CloudFormation | ⚠️ | Indirect via deploy.sh |
| Service Catalog | ✅ | Portfolio |
| CodeBuild | ✅ | |
| CodePipeline | ✅ | |
| CodeDeploy | ✅ | Application + deployment group |

### Migration & Transfer

| Service | E2E | Notes |
|---------|:---:|-------|
| Transfer Family | ✅ | Server + connector + user |
| DMS | ✅ | Instance + endpoint + task + serverless |
| Elastic Disaster Recovery | ✅ | Source server |

### IoT & Media

| Service | E2E | Notes |
|---------|:---:|-------|
| IoT Core | ✅ | Topic rule |
| IoT SiteWise | ✅ | Asset + model + gateway + portal |
| MediaConvert | ✅ | |
| MediaLive | ❌ | |
| MediaPackage | ❌ | |

### Other

| Service | E2E | Notes |
|---------|:---:|-------|
| AppStream 2.0 | ✅ | Fleet |
| Deadline Cloud | ✅ | Farm + queue + fleet |
| Location Service | ✅ | |
| Supply Chain | ✅ | |
| WorkSpaces | ❌ | Handler exists |
| Connect | ❌ | |

---

## E2E Test Summary

| Metric | Result |
|--------|--------|
| Services with E2E coverage | ~65 |
| Services with handler but no E2E | ~15 |
| Total resource types in handler | 140+ |
| Accounts tested | 9 |
| Lambda errors across all tests | 0 |
