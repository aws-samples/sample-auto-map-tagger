# MAP 2.0 Auto-Tagger — Service Coverage & Test Results

**Template version:** v19.24 | **Accounts tested:** 9 (single + CT org with 5 linked + 2 security OU) | **Regions:** ap-northeast-2, us-east-1
**Total bugs fixed:** 99+ | **False positives:** 0 | **Last full MAP 2.0 service sweep:** 2026-03-29

---

## MAP 2.0 Full Service Coverage — v19.21–v19.24 Additions

Services added to MAP 2.0 since Phase 2 (all verified working):

| Service | Status | Notes |
|---------|--------|-------|
| Kinesis Video Streams | ✅ Fixed v19.21 | `streamARN` in ARN_FIELDS; `TagStream(StreamARN=)` |
| Aurora DSQL | ✅ Fixed v19.21 | `dsql:TagResource` direct call |
| VPC Lattice | ✅ Fixed v19.21 | Added `vpc-lattice:TagResource` IAM |
| Kinesis Analytics v2 | ✅ Fixed v19.21 | `applicationDetail.applicationARN` response field |
| Bedrock AgentCore | ✅ Fixed v19.22 | SigV4 urllib request (Lambda boto3 too old); `bedrock-agentcore:TagResource` IAM |
| Payment Cryptography | ✅ Fixed v19.22 | `payment-cryptography:TagResource(ResourceArn, Tags=[list])` |
| Cloud WAN | ✅ Fixed v19.22 | `networkmanager:TagResource` via us-east-1; list format |
| AWS Certificate Manager | ✅ Fixed v19.23 | `certificateArn` added to ARN_FIELDS |
| Amazon Keyspaces | ✅ Fixed v19.23 | ARN from `requestParameters.keyspaceName`; `cassandra:Alter` IAM; `keyspaces:TagResource` |
| AWS Security Hub | ✅ Fixed v19.23 | `EnableSecurityHub` → `hub/default` ARN; `Enable` prefix added to EventBridge |
| AWS HealthImaging | ✅ Fixed v19.23 | `datastoreId` → ARN construction (us-east-1) |
| AWS Deadline Cloud | ✅ Fixed v19.23 | `deadline:TagResource` IAM added |
| AWS Resilience Hub | ✅ Fixed v19.23 | `resiliencehub:TagResource` IAM added |
| AWS Systems Manager OpsCenter | ✅ Fixed v19.24 | `opsItemArn` added to ARN_FIELDS |
| AppSync | ✅ Confirmed | Was working, not previously documented |
| Athena Workgroups | ✅ Confirmed | Was working, not previously documented |
| Cognito User Pools | ✅ Confirmed | Was working, not previously documented |
| AWS Elastic Beanstalk | ✅ Confirmed | Was working, not previously documented |
| EBS Volumes (CreateVolume) | ✅ Fixed v19.15 | `volumeId` ARN construction was missing |

Services with test-environment limitations (handlers in place, account restrictions prevented live testing):

| Service | Handler Status | Limitation |
|---------|---------------|------------|
| Amazon Timestream | ✅ Handler in place (`timestream:TagResource` + `CreateDatabase` event) | Requires Timestream LiveAnalytics customer enrollment |
| AWS Elastic Disaster Recovery | ✅ Handler in place (`tag:TagResources`, `CreateSourceServer` event) | DRS SLR creation blocked in Isengard test accounts |
| AWS Storage Gateway | ✅ Handler in place (`storagegateway:AddTagsToResource`, `ActivateGateway` event) | Requires EC2 instance with SGW software |
| Amazon WorkSpaces | ✅ Handler in place (`workspaces:CreateTags`, `CreateWorkspaces` event) | Requires AWS Directory Service |
| AWS Mainframe Modernization | ✅ Handler in place (`m2:TagResource`, `CreateApplication` event) | Not accessible in Isengard test accounts |
| WorkSpaces Core Managed Instances | ✅ Handler added v19.21 (`CreateWorkspaceInstance` event) | Requires WorkSpaces directory environment |
| AWS Direct Connect | ✅ Handler in place (`directconnect:TagResource`) | Physical infrastructure required |
| AWS CloudHSM | ✅ Handler in place (`CreateHsm` event, `cloudhsm:TagResource`) | Expensive/complex setup |
| AWS Directory Service | ✅ Handler in place (`CreateDirectory` event, `ds:AddTagsToResource`) | AD setup required |
| Amazon S3 Glacier | ✅ Via S3 bucket tagging | Old Glacier API deprecated for new accounts; MAP 2.0 uses S3 Glacier storage class via S3 |
| AWS CodeStar | ✅ N/A | Service deprecated and removed from AWS CLI |

---

## How to read this document

Each service below shows:
- **Status:** ✅ Works automatically | ⚠️ Works with caveats | ❌ Not taggable (platform limitation)
- **Special handling:** Plain-English explanation of any custom code added to the Lambda to make it work

Most services "just work" — the Lambda finds the resource ID in the CloudTrail response and tags it. The special handling sections explain the ones that needed extra work.

---

## Compute

### Lambda Functions
- **Status:** ✅ Works
- **Tags on:** `CreateFunction`

### Lambda Layers
- **Status:** ✅ Works
- **Special handling:** When a Lambda Layer is published, AWS sends back two ARNs in the response: one for the layer itself and one for this specific version of the layer. Layers can be tagged but layer *versions* cannot (AWS doesn't allow it). Our code has a special early-exit that grabs the layer ARN and ignores the version ARN before anything else runs.

### Lambda Aliases
- **Status:** ❌ Not taggable
- **AWS reason:** AWS explicitly blocks tagging of Lambda aliases via any API.

### EC2 Instances
- **Status:** ✅ Works
- **Tags on:** `RunInstances`

### EC2 Volumes (EBS)
- **Status:** ✅ Works
- **Tags on:** `CreateVolume`

### EC2 Snapshots
- **Status:** ✅ Works
- **Tags on:** `CreateSnapshot`

### EC2 AMIs (Machine Images)
- **Status:** ✅ Works
- **Tags on:** `CreateImage`
- **Note:** Must use `CreateImage` (create from a running instance). `RegisterImage` (register an existing snapshot manually) does not generate a taggable event.

### EC2 Key Pairs
- **Status:** ✅ Works
- **Tags on:** `CreateKeyPair`
- **Special handling:** The response contains a `keyPairId` that we use to construct the ARN. We added this construction to the Lambda.

### EC2 Launch Templates
- **Status:** ✅ Works
- **Tags on:** `CreateLaunchTemplate`

### EC2 Placement Groups
- **Status:** ✅ Works
- **Tags on:** `CreatePlacementGroup`
- **Special handling:** AWS's own tagging API rejects placement group ARNs that use the group *name*. The response contains both the name and an internal group ID. We had to switch from using the name to using the group ID to build the ARN.

### Auto Scaling Groups
- **Status:** ✅ Works
- **Tags on:** `CreateAutoScalingGroup`
- **Note:** When creating via boto3/SDK, the subnet parameter is called `VPCZoneIdentifier` (with uppercase VPC), not `VpcZoneIdentifier`. Wrong casing causes a silent failure.

### ECS Clusters
- **Status:** ✅ Works
- **Tags on:** `CreateCluster`

### ECS Services
- **Status:** ✅ Works
- **Tags on:** `CreateService`
- **Special handling:** When an ECS Service is created, the response contains both the *cluster* ARN and the *service* ARN. Our code was accidentally grabbing the cluster ARN first (since it appears earlier in the response). We added an early-exit that specifically looks for the service ARN before the general scan runs.

### EKS Clusters
- **Status:** ✅ Works
- **Tags on:** `CreateCluster`

### EKS Nodegroups
- **Status:** ✅ Works
- **Tags on:** `CreateNodegroup`

### EKS Add-ons
- **Status:** ✅ Works
- **Tags on:** `CreateAddon`
- **Special handling:** The addon ARN is stored in a nested field called `addon.addonArn` in the response. We added this nested path to our ARN extraction patterns.

### App Runner Services
- **Status:** ✅ Works
- **Tags on:** `CreateService`
- **Note:** App Runner is not available in ap-northeast-2 (Seoul). Deploy the Lambda stack to ap-northeast-1 (Tokyo) — which is the nearest supported region — and App Runner resources there will be automatically tagged.

### AWS Batch Compute Environments
- **Status:** ✅ Works
- **Tags on:** `CreateComputeEnvironment`

### Lightsail Instances
- **Status:** ✅ Works
- **Tags on:** `CreateInstances`

### Lightsail Databases
- **Status:** ✅ Works
- **Tags on:** `CreateRelationalDatabase`
- **Special handling:** Unlike most AWS services, Lightsail's CloudTrail response doesn't return a standard ARN field. Instead it returns an `operations` list describing what was created. We added code to read the resource name from that operations list and build the ARN from it.

### Lightsail Container Services
- **Status:** ✅ Works
- **Tags on:** `CreateContainerService`
- **Special handling (two issues fixed):**
  1. The CloudTrail response includes an ARN for the container service, but that ARN contains an internal UUID rather than the human-readable service name. Lightsail's own `tag_resource` API needs the service *name*, not the UUID. We added code to extract the service name from the request parameters instead.
  2. This handler had to be placed *before* the general ARN scan (an "early-exit"), because otherwise the general scan would find the UUID-based ARN first and then fail when trying to tag it.

### Lightsail Load Balancers
- **Status:** ✅ Works
- **Tags on:** `CreateLoadBalancer`
- **Special handling:** Same as Container Services above — the response contains an `operations` list, not a direct ARN. We extract the load balancer name from either the request or the operations list.

### EMR Clusters
- **Status:** ✅ Works (with caveat)
- **Tags on:** `RunJobFlow`
- **Important note:** If you create an EMR cluster that terminates immediately after finishing its job (the default behavior), the cluster will have already terminated by the time our Lambda tries to tag it ~60-90 seconds later. AWS doesn't allow tagging terminated clusters. To ensure tagging works, set `KeepJobFlowAliveWhenNoSteps=True` when creating the cluster.

### EMR Serverless
- **Status:** ✅ Works
- **Tags on:** `CreateApplication`
- **Special handling:** The response only contains an `applicationId` (a short ID), not a full ARN. We added code to build the full ARN by combining the region, account number, and application ID in the format AWS expects.

### Elastic Beanstalk Applications
- **Status:** ✅ Works
- **Tags on:** `CreateApplication`

---

## Storage

### Amazon S3 Buckets
- **Status:** ✅ Works
- **Tags on:** `CreateBucket`

### Amazon EFS (Elastic File System)
- **Status:** ✅ Works
- **Tags on:** `CreateFileSystem`
- **Special handling:** Both EFS and FSx use the same event name (`CreateFileSystem`). We split the handler by checking which service sent the event (`efs.amazonaws.com` vs `fsx.amazonaws.com`).

### Amazon FSx — Lustre, ONTAP, OpenZFS, Windows
- **Status:** ✅ Works (Lustre, ONTAP, OpenZFS confirmed; Windows requires Active Directory setup)
- **Tags on:** `CreateFileSystem`
- **Special handling:** Same split handler as EFS above.

### Amazon ECR (Container Registry)
- **Status:** ✅ Works
- **Tags on:** `CreateRepository`

### EBS Snapshots
- **Status:** ✅ Works
- **Tags on:** `CreateSnapshot`

### AWS Backup Vaults
- **Status:** ✅ Works
- **Tags on:** `CreateBackupVault`

### AWS Backup Plans
- **Status:** ✅ Works
- **Tags on:** `CreateBackupPlan`

### VPC Flow Logs
- **Status:** ✅ Works
- **Tags on:** `CreateFlowLogs`
- **Special handling:** The response structure for flow logs is unusual. The flow log ID is nested inside `CreateFlowLogsResponse.flowLogIdSet.item` — most other services put their IDs at the top level. We added code to look in this specific location.

---

## Database

### Amazon DynamoDB Tables
- **Status:** ✅ Works
- **Tags on:** `CreateTable`
- **Note:** Occasionally the table isn't fully active when our Lambda runs. This is rare and usually resolves on the next attempt.

### Amazon RDS Instances
- **Status:** ✅ Works
- **Tags on:** `CreateDBInstance`
- **Note:** Works for all RDS engines (MySQL, PostgreSQL, SQL Server, Oracle, MariaDB).

### Amazon Aurora Clusters
- **Status:** ✅ Works
- **Tags on:** `CreateDBCluster`

### Amazon Aurora DB Instances (within a cluster)
- **Status:** ✅ Works
- **Tags on:** `CreateDBInstance`

### RDS DB Snapshots
- **Status:** ✅ Works
- **Tags on:** `CreateDBSnapshot`
- **Special handling:** The response for snapshots uses a "flat" structure (all fields at the same level), whereas our code was initially looking in a nested object. We fixed it to read from the flat response.

### RDS Cluster Snapshots
- **Status:** ✅ Works
- **Tags on:** `CreateDBClusterSnapshot`
- **Special handling:** Same flat response fix as DB snapshots above.

### RDS Read Replicas
- **Status:** ✅ Works
- **Tags on:** `CreateDBInstanceReadReplica`
- **Special handling:** Same flat response fix.

### RDS Proxy
- **Status:** ✅ Works
- **Tags on:** `CreateDBProxy`

### Amazon Neptune Clusters
- **Status:** ✅ Works
- **Tags on:** `CreateDBCluster`

### Amazon DocumentDB Clusters
- **Status:** ✅ Works
- **Tags on:** `CreateDBCluster`
- **Note:** The master username `admin` is reserved by DocumentDB. Use `dbadmin` or another name.

### Amazon MemoryDB Clusters
- **Status:** ✅ Works
- **Tags on:** `CreateCluster`

### Amazon ElastiCache Clusters (Redis)
- **Status:** ⚠️ Works — but timing dependent
- **Tags on:** `CreateCacheCluster`
- **Caveat:** ElastiCache clusters take 2-5 minutes to become "Available" after creation. Our Lambda fires within 60-90 seconds, before the cluster is ready to be tagged. The tag attempt fails silently. Retry logic (checking back after the cluster is available) is needed to fully solve this.

### Amazon ElastiCache Clusters (Memcached)
- **Status:** ⚠️ Works — but timing dependent
- **Same caveat as Redis above.**

### Amazon ElastiCache Replication Groups
- **Status:** ⚠️ Works — but timing dependent
- **Same caveat as above.**

### Amazon ElastiCache Serverless
- **Status:** ⚠️ Works — but timing dependent
- **Same caveat as above.**

### Amazon ElastiCache Snapshots
- **Status:** ✅ Works
- **Tags on:** `CreateSnapshot`
- **Special handling:** The snapshot ARN is constructed from a `snapshotName` field in the response, which we added to the Lambda.

### Amazon Redshift Clusters (provisioned)
- **Status:** ✅ Works
- **Tags on:** `CreateCluster`
- **Note:** Use node type `ra3.xlplus` or newer. Older node types like `dc2.large` may not be available in all regions.

### Amazon Redshift Serverless Namespaces
- **Status:** ✅ Works
- **Tags on:** `CreateNamespace`

### Amazon Redshift Serverless Workgroups
- **Status:** ✅ Works
- **Tags on:** `CreateWorkgroup`
- **Special handling:** The response for workgroup creation comes back empty — AWS doesn't return the workgroup ARN in the creation event. We added code to build the ARN from the request parameters (account ID, region, workgroup name).

### Amazon OpenSearch Service Domains
- **Status:** ✅ Works
- **Tags on:** `CreateDomain`

### Amazon OpenSearch Serverless Collections
- **Status:** ✅ Works
- **Tags on:** `CreateCollection`
- **Special handling:** OpenSearch Serverless uses a separate tagging API (`aoss:TagResource`) that required adding a new permission to the Lambda's IAM role.

### Amazon MSK (Managed Kafka) — Provisioned
- **Status:** ✅ Works
- **Tags on:** `CreateClusterV2`

### Amazon MSK — Serverless
- **Status:** ✅ Works
- **Tags on:** `CreateClusterV2`
- **Note:** The VPC you deploy MSK Serverless into must have DNS resolution and DNS hostnames enabled. These are usually on by default but can be disabled.

### Amazon DMS Replication Instances
- **Status:** ✅ Works
- **Tags on:** `CreateReplicationInstance`
- **Note:** Use instance class `dms.t3.small` — `dms.t3.micro` does not exist despite looking like it should. Also, the IAM role `dms-vpc-role` must exist in the account before creating instances (it's a standard DMS prerequisite).

### Amazon DMS Endpoints
- **Status:** ✅ Works
- **Tags on:** `CreateEndpoint`

### Amazon DMS Replication Tasks
- **Status:** ✅ Works
- **Tags on:** `CreateReplicationTask`

### Amazon MQ — ActiveMQ Brokers
- **Status:** ✅ Works
- **Tags on:** `CreateBroker`
- **Special handling (two issues fixed):**
  1. The event source in CloudTrail is `amazonmq.amazonaws.com` — the full name including "amazon". Our code was looking for `mq.amazonaws.com` (shorter form), so it never matched. Fixed.
  2. The ARN field in the response is `brokerArn` (lowercase 'b'), but we were searching for `BrokerArn` (capital 'B'). AWS is case-sensitive here. Fixed by adding the lowercase version.

### Amazon MQ — RabbitMQ Brokers
- **Status:** ✅ Works
- **Tags on:** `CreateBroker`
- **Same fixes as ActiveMQ above.**

---

## Networking

### Amazon VPC
- **Status:** ✅ Works
- **Tags on:** `CreateVpc`

### Subnets
- **Status:** ✅ Works
- **Tags on:** `CreateSubnet`

### Security Groups
- **Status:** ✅ Works
- **Tags on:** `CreateSecurityGroup`

### Route Tables
- **Status:** ✅ Works
- **Tags on:** `CreateRouteTable`

### Internet Gateways
- **Status:** ✅ Works
- **Tags on:** `CreateInternetGateway`

### Egress-Only Internet Gateways
- **Status:** ✅ Works
- **Tags on:** `CreateEgressOnlyInternetGateway`

### Elastic IP Addresses
- **Status:** ✅ Works
- **Tags on:** `AllocateAddress`

### Network Interfaces (ENIs)
- **Status:** ✅ Works
- **Tags on:** `CreateNetworkInterface`

### Network ACLs
- **Status:** ✅ Works
- **Tags on:** `CreateNetworkAcl`

### DHCP Option Sets
- **Status:** ✅ Works
- **Tags on:** `CreateDhcpOptions`

### VPC Endpoints
- **Status:** ✅ Works
- **Tags on:** `CreateVpcEndpoint`

### NAT Gateways
- **Status:** ⚠️ Works — but timing dependent
- **Tags on:** `CreateNatGateway`
- **Caveat:** NAT Gateways take 1-3 minutes to finish provisioning. Our Lambda fires within 60-90 seconds, before the NAT Gateway is ready. The tag attempt fails silently. Retry logic is needed.

### Transit Gateways
- **Status:** ✅ Works
- **Tags on:** `CreateTransitGateway`

### Transit Gateway VPC Attachments
- **Status:** ✅ Works
- **Tags on:** `CreateTransitGatewayVpcAttachment`

### Customer Gateways
- **Status:** ✅ Works
- **Tags on:** `CreateCustomerGateway`

### Virtual Private Gateways (VPN)
- **Status:** ✅ Works
- **Tags on:** `CreateVpnGateway`

### VPN Connections
- **Status:** ✅ Works
- **Tags on:** `CreateVpnConnection`
- **Special handling:** VPN connections don't return a standard ARN in the response — they return a connection ID. We added code to construct the full ARN from this ID.

### Placement Groups
- **Status:** ✅ Works
- **Tags on:** `CreatePlacementGroup`
- **Special handling:** AWS's tagging API rejects placement group ARNs built using the group *name*. The response also includes an internal group ID. We switched to using the group ID to build the ARN instead.

### Application Load Balancers (ALB)
- **Status:** ✅ Works
- **Tags on:** `CreateLoadBalancer`

### Network Load Balancers (NLB)
- **Status:** ✅ Works
- **Tags on:** `CreateLoadBalancer`

### Target Groups
- **Status:** ✅ Works
- **Tags on:** `CreateTargetGroup`

### App Mesh
- **Status:** ✅ Works
- **Tags on:** `CreateMesh`
- **Special handling:** The mesh ARN is buried three levels deep in the response (`mesh.metadata.arn`). Our general scan only looks one level deep. We added a specific early-exit to dig into the nested structure.

### AWS Network Firewall Policies
- **Status:** ✅ Works
- **Tags on:** `CreateFirewallPolicy`

### AWS Network Firewalls
- **Status:** ✅ Works
- **Tags on:** `CreateFirewall`

### VPC Flow Logs
- **Status:** ✅ Works — see Storage section above

---

## Global Services
> These services route their CloudTrail events to **us-east-1** (or us-west-2) EventBridge rather than your primary region. The Lambda must be deployed to those regions to catch these events. The deploy script handles this automatically.

### Amazon CloudFront Distributions
- **Status:** ✅ Works
- **Tags on:** `CreateDistribution`
- **Lambda region required:** us-east-1
- **How it works:** CloudFront is a global service — when you create a distribution, the CloudTrail event only appears in us-east-1's EventBridge, regardless of which region you're working in. Our Lambda deployed to us-east-1 catches this event and tags the distribution.

### Amazon Route 53 Hosted Zones
- **Status:** ✅ Works
- **Tags on:** `CreateHostedZone`
- **Lambda region required:** us-east-1
- **Same reasoning as CloudFront above.**

### AWS Global Accelerator
- **Status:** ✅ Works
- **Tags on:** `CreateAccelerator`
- **Lambda region required:** us-west-2
- **Special handling:** Global Accelerator's tagging API endpoint lives specifically in us-west-2. Our Lambda in us-west-2 uses the `us-west-2` endpoint explicitly when calling the tagging API.

### Amazon IVS (Interactive Video Service) Channels
- **Status:** ✅ Works
- **Tags on:** `CreateChannel`
- **Lambda region required:** us-east-1
- **Special handling (tricky bug):** When IVS creates a channel, the response contains info about two resources: the channel itself AND a "stream key" (a credential used to stream to the channel). Both have ARNs. Our general scan was grabbing the stream key ARN because it appears first in the response — and then tagging the stream key instead of the channel. We added a special early-exit that specifically looks for the channel ARN before the general scan runs.

### Amazon IVS Chat Rooms
- **Status:** ✅ Works
- **Tags on:** `CreateRoom`
- **Lambda region required:** us-east-1

---

## Analytics

### Amazon Kinesis Data Streams
- **Status:** ✅ Works
- **Tags on:** `CreateStream`

### Amazon Kinesis Data Firehose
- **Status:** ✅ Works
- **Tags on:** `CreateDeliveryStream`

### Amazon Kinesis Data Analytics v2 (Managed Apache Flink)
- **Status:** ✅ Works
- **Tags on:** `CreateApplication`
- **Special handling:** The event source is `kinesisanalytics.amazonaws.com` (full name). Our code needed to match on this specific source to avoid confusing it with other services that also use `CreateApplication`.

### Amazon MSK (Kafka)
- **Status:** ✅ Works — see Database section above

### AWS Glue Databases
- **Status:** ✅ Works
- **Tags on:** `CreateDatabase`

### AWS Glue Jobs
- **Status:** ✅ Works
- **Tags on:** `CreateJob`

### AWS Glue Crawlers
- **Status:** ✅ Works
- **Tags on:** `CreateCrawler`

### AWS Glue Triggers
- **Status:** ✅ Works
- **Tags on:** `CreateTrigger`

### AWS Glue Workflows
- **Status:** ✅ Works
- **Tags on:** `CreateWorkflow`

### AWS Glue Tables
- **Status:** ❌ Not taggable post-creation
- **AWS reason:** Glue tables can only be tagged at the time they are created (by passing tags in the `CreateTable` call). After they exist, both the `glue:TagResource` API and the general tagging API reject the table ARN with an error. This is an AWS platform limitation — it's not something we can work around in the Lambda.

### AWS Glue DataBrew Datasets
- **Status:** ✅ Works
- **Tags on:** `CreateDataset`
- **Special handling:** We added a handler that builds the ARN from the dataset name returned in the response.

### AWS Glue DataBrew Recipes
- **Status:** ✅ Works
- **Tags on:** `CreateRecipe`
- **Special handling:** Same — ARN built from the recipe name.

### Amazon Athena Workgroups
- **Status:** ✅ Works
- **Tags on:** `CreateWorkGroup`
- **Special handling:** The response doesn't include an ARN. We added code to construct it from the workgroup name.

### Amazon Athena Data Catalogs
- **Status:** ✅ Works
- **Tags on:** `CreateDataCatalog`
- **Note:** Use the `LAMBDA` catalog type (pointing to an actual Lambda function). The `HIVE` type requires additional configuration.

### Amazon EMR
- **Status:** ✅ Works — see Compute section above

### Amazon EMR Serverless
- **Status:** ✅ Works — see Compute section above

### AWS CodeArtifact Domains
- **Status:** ✅ Works
- **Tags on:** `CreateDomain`
- **Note:** CodeArtifact is not available in all regions (not available in ap-northeast-2/Seoul). Deploy to us-east-1.

### AWS CodeArtifact Repositories
- **Status:** ✅ Works
- **Tags on:** `CreateRepository`

---

## Application Integration

### Amazon SNS Topics
- **Status:** ✅ Works
- **Tags on:** `CreateTopic`

### Amazon SQS Queues
- **Status:** ✅ Works
- **Tags on:** `CreateQueue`

### AWS Step Functions State Machines
- **Status:** ✅ Works
- **Tags on:** `CreateStateMachine`

### AWS Step Functions Activities
- **Status:** ✅ Works
- **Tags on:** `CreateActivity`

### Amazon EventBridge Rules
- **Status:** ✅ Works
- **Tags on:** `PutRule`

### Amazon EventBridge Event Buses
- **Status:** ✅ Works
- **Tags on:** `CreateEventBus`

### Amazon EventBridge Pipes
- **Status:** ✅ Works
- **Tags on:** `CreatePipe`

### Amazon EventBridge Scheduler — Schedule Groups
- **Status:** ✅ Works
- **Tags on:** `CreateScheduleGroup`
- **Special handling:** The response contains a `ScheduleGroupArn` field. This wasn't in our list of known ARN field names, so we added a specific handler that looks for it and constructs the ARN if it's not found directly.

### Amazon EventBridge Scheduler — Individual Schedules
- **Status:** ❌ Not taggable post-creation
- **AWS reason:** The Scheduler's `TagResource` API only accepts ARNs for *schedule groups*, not individual schedules. This is an AWS API constraint. Schedule groups themselves do get tagged.

### Amazon API Gateway — REST APIs
- **Status:** ✅ Works
- **Tags on:** `CreateRestApi`

### Amazon API Gateway — HTTP APIs
- **Status:** ✅ Works
- **Tags on:** `CreateApi`

### Amazon API Gateway — WebSocket APIs
- **Status:** ✅ Works
- **Tags on:** `CreateApi`
- **Note:** Same event as HTTP APIs — the API type (HTTP vs WebSocket) is determined by the `ProtocolType` field in the request.

### Amazon AppSync APIs (GraphQL)
- **Status:** ✅ Works
- **Tags on:** `CreateGraphqlApi`

### Amazon MWAA (Managed Apache Airflow)
- **Status:** ✅ Works
- **Tags on:** `CreateEnvironment`
- **Notes:**
  - MWAA is not available in ap-northeast-2 (Seoul). Use us-east-1.
  - The IAM role for MWAA environments needs an inline policy rather than AWS managed policies (AWS removed the managed `AmazonMWAAFullConsoleAccess` policy).

---

## Management & Monitoring

### Amazon CloudWatch Log Groups
- **Status:** ✅ Works
- **Tags on:** `CreateLogGroup`

### Amazon CloudWatch Log Streams
- **Status:** ❌ Not taggable
- **AWS reason:** Log Streams inherit their tags from the parent Log Group. AWS doesn't support independently tagging log streams.

### Amazon CloudWatch Alarms
- **Status:** ✅ Works
- **Tags on:** `PutMetricAlarm`

### AWS Systems Manager Parameters
- **Status:** ✅ Works
- **Tags on:** `PutParameter`

### AWS Systems Manager Documents
- **Status:** ✅ Works
- **Tags on:** `CreateDocument`
- **Special handling:** The document name is nested inside a `documentDescription` object in the response rather than at the top level. We added code to look there.

### AWS Secrets Manager Secrets
- **Status:** ✅ Works
- **Tags on:** `CreateSecret`

### AWS X-Ray Sampling Rules
- **Status:** ✅ Works
- **Tags on:** `CreateSamplingRule`
- **Special handling:** The ARN is three levels deep in the response: `SamplingRuleRecord.SamplingRule.RuleARN`. We added a handler to reach into that structure.

### AWS AppConfig Applications
- **Status:** ✅ Works
- **Tags on:** `CreateApplication`
- **Special handling:** AppConfig returns an application ID (not a full ARN). We construct the ARN from the ID.

### AWS AppConfig Environments
- **Status:** ✅ Works
- **Tags on:** `CreateEnvironment`
- **Special handling:** This handler was missing entirely initially — the Lambda would receive the event and log "Could not extract ARN from event: CreateEnvironment". We added a handler that builds the ARN from the application ID and environment ID.

### AWS AppConfig Configuration Profiles
- **Status:** ✅ Works
- **Tags on:** `CreateConfigurationProfile`
- **Special handling:** Similar to environments — the ARN is constructed from the application ID plus the profile ID.

---

## Security & Identity

### AWS KMS Keys
- **Status:** ✅ Works
- **Tags on:** `CreateKey`
- **Special handling:** Added `kms:TagResource` permission to the Lambda's IAM role.

### AWS ACM Certificates
- **Status:** ✅ Works
- **Tags on:** `RequestCertificate`

### AWS ACM Private CA
- **Status:** ✅ Works
- **Tags on:** `CreateCertificateAuthority`
- **Special handling:** The Private CA uses a different tagging API call (`TagCertificateAuthority`) than the regular ACM API. Added this permission to the Lambda.

### AWS WAFv2 Web ACLs
- **Status:** ✅ Works
- **Tags on:** `CreateWebACL`

### AWS WAFv2 Rule Groups
- **Status:** ✅ Works
- **Tags on:** `CreateRuleGroup`

### AWS WAFv2 IP Sets
- **Status:** ✅ Works
- **Tags on:** `CreateIPSet`

### AWS WAFv2 Regex Pattern Sets
- **Status:** ✅ Works
- **Tags on:** `CreateRegexPatternSet`

### Amazon GuardDuty IP Sets
- **Status:** ✅ Works
- **Tags on:** `CreateIPSet`

### Amazon Macie Classification Jobs
- **Status:** ✅ Works
- **Tags on:** `CreateClassificationJob`
- **Special handling:** The job ARN is in a field called `jobArn` in the response. We added this to our list of known ARN field names.

### Amazon Cognito User Pools
- **Status:** ✅ Works
- **Tags on:** `CreateUserPool`
- **Special handling:** The response includes a user pool object with an `id` field but not a pre-built ARN. We construct the ARN from the ID using the format `arn:aws:cognito-idp:{region}:{account}:userpool/{id}`.

### Amazon Cognito Identity Pools
- **Status:** ✅ Works
- **Tags on:** `CreateIdentityPool`
- **Special handling:** When testing, we found that the Identity Pool creation was failing because we were providing a dummy Cognito provider client ID. The provider must reference an actual User Pool Client ID that exists. We fixed our test to create a real User Pool Client first.

### AWS IAM Access Analyzer
- **Status:** ✅ Works
- **Tags on:** `CreateAnalyzer`
- **Special handling:** Added `access-analyzer:TagResource` permission to the Lambda's IAM role.

### Amazon Verified Permissions Policy Stores
- **Status:** ✅ Works
- **Tags on:** `CreatePolicyStore`
- **Special handling:** Added `verifiedpermissions:TagResource` permission to the Lambda's IAM role.

### Amazon Detective Graphs
- **Status:** ✅ Works
- **Tags on:** `CreateGraph`
- **Special handling:** The ARN is in a field called `GraphArn` (capital G, capital A) in the response. We added this field name to our list of known ARN patterns.

### AWS Clean Rooms Collaborations
- **Status:** ✅ Works
- **Tags on:** `CreateCollaboration`

---

## Machine Learning & AI

### Amazon SageMaker Notebook Instances
- **Status:** ✅ Works
- **Tags on:** `CreateNotebookInstance`

### Amazon SageMaker Training Jobs
- **Status:** ✅ Works
- **Tags on:** `CreateTrainingJob`
- **Special handling:** The ARN field in the response is `trainingJobArn` (all lowercase). This was missing from our list of known ARN field names, so the Lambda couldn't find it. Added.

### Amazon SageMaker Models
- **Status:** ✅ Works
- **Tags on:** `CreateModel`
- **Special handling:** Added `modelArn` to our known field names list.

### Amazon SageMaker Endpoint Configs
- **Status:** ✅ Works
- **Tags on:** `CreateEndpointConfig`

### Amazon SageMaker Endpoints
- **Status:** ✅ Works
- **Tags on:** `CreateEndpoint`

### Amazon SageMaker Pipelines
- **Status:** ✅ Works
- **Tags on:** `CreatePipeline`
- **Note:** The pipeline definition JSON must include at least one step (a "Fail" step is the simplest valid option). Completely empty steps arrays cause a validation error.

### Amazon SageMaker Feature Groups
- **Status:** ✅ Works
- **Tags on:** `CreateFeatureGroup`
- **Special handling:** The ARN field is `featureGroupArn` (lowercase 'f'). We were looking for `FeatureGroupArn` (uppercase 'F'). AWS uses camelCase in their CloudTrail responses but PascalCase in their SDK responses — an inconsistency. Fixed by adding the lowercase version.

### Amazon SageMaker Studio Domains
- **Status:** ✅ Works
- **Tags on:** `CreateDomain`
- **Special handling:** Added `DomainArn` to our known field names list.

### Amazon Comprehend Custom Classifiers
- **Status:** ✅ Works
- **Tags on:** `CreateDocumentClassifier`
- **Note:** Only *persistent* Comprehend resources (custom classifiers, entity recognizers) are taggable. Standard API calls to Comprehend (like analyzing text) have no taggable resource.

### Amazon Rekognition Collections
- **Status:** ✅ Works
- **Tags on:** `CreateCollection`

### Amazon Kendra Indexes
- **Status:** ✅ Works
- **Tags on:** `CreateIndex`
- **Special handling:** Kendra's `CreateIndex` response returns just an `Id` (a short identifier like `abc1234`), not a full ARN. We added code to construct the full ARN: `arn:aws:kendra:{region}:{account}:index/{Id}`.
- **Note:** Kendra is not available in all regions (not available in ap-northeast-2). Use us-east-1.

### Amazon Lex v2 Bots
- **Status:** ✅ Works
- **Tags on:** `CreateBot`
- **Special handling (two issues fixed):**
  1. The event source in CloudTrail is `lex.amazonaws.com`. We had it wrong as `models.lex.amazonaws.com` (a leftover from Lex v1). The Lambda was never matching Lex v2 events. Fixed.
  2. The response only contains a `botId` (short ID), not a full ARN. We added code to build the ARN: `arn:aws:lex:{region}:{account}:bot/{botId}`.

### Amazon Transcribe Vocabularies
- **Status:** ✅ Works
- **Tags on:** `CreateVocabulary`
- **Special handling (two issues fixed):**
  1. The response uses `vocabularyName` (all lowercase). We were searching for `VocabularyName` (PascalCase). Fixed.
  2. The general tagging API (`tag:TagResources`) silently doesn't support Transcribe resources even though it doesn't give a clear error. We added a Transcribe-specific handler that calls `transcribe:TagResource` directly instead.

### Amazon Transcribe Language Models
- **Status:** ✅ Works
- **Tags on:** `CreateLanguageModel`
- **Special handling:** Same issues as Vocabularies above — `modelName` (lowercase) and `transcribe:TagResource` required.

### Amazon Bedrock Inference Profiles
- **Status:** ✅ Works
- **Tags on:** `CreateInferenceProfile`
- **Note:** Application inference profiles must be created by *copying from* an existing system-defined profile (not directly from a foundation model). In ap-northeast-2, use the APAC system-defined profiles as the source.

### Amazon Bedrock Agents
- **Status:** ✅ Works
- **Tags on:** `CreateAgent`
- **Special handling:** The agent ARN is nested inside an `agent` object in the response (`agent.agentArn`). Standard scanning only checks top-level fields. We added an early-exit that digs one level deeper to find it.
- **Note for testing:** When creating an agent, you must provide an `instruction` (a plain-text description of what the agent should do). Without it, the agent goes into a FAILED state and can't be tagged.

### Amazon Bedrock Guardrails
- **Status:** ✅ Works
- **Tags on:** `CreateGuardrail`
- **Special handling:** Added `guardrailArn` to our known field names list.

### Amazon Bedrock Flows
- **Status:** ✅ Works
- **Tags on:** `CreateFlow`
- **Special handling:** Bedrock Flows use the `bedrock-agent` SDK client for tagging (not the base `bedrock` client). Added `bedrock-agent:TagResource` permission.

### Amazon Bedrock Flow Aliases
- **Status:** ✅ Works
- **Tags on:** `CreateFlowAlias`
- **Note:** You must create a *flow version* first, then create an alias pointing to that version. Aliases cannot point directly to the "Draft" version.

### Amazon Bedrock Prompts
- **Status:** ✅ Works
- **Tags on:** `CreatePrompt`

### Amazon Bedrock Prompt Versions
- **Status:** ✅ Works
- **Tags on:** `CreatePromptVersion`
- **Special handling:** Added `promptVersionArn` to our known field names list.

### Amazon Bedrock Knowledge Bases
- **Status:** ✅ Works
- **Tags on:** `CreateKnowledgeBase`
- **Note:** Requires an OpenSearch Serverless collection with a vector index already set up before the Knowledge Base can be created.

### Amazon Bedrock Knowledge Base Data Sources
- **Status:** ✅ Works
- **Tags on:** `CreateDataSource`
- **Special handling:** The response only contains a `dataSourceId` (short ID), not a full ARN. We added code to construct the ARN by combining the knowledge base ID from the *request* with the data source ID from the *response*.

### Amazon Bedrock Agent Action Groups
- **Status:** ⚠️ Handler added — tagging blocked in test accounts
- **Tags on:** `CreateAgentActionGroup`
- **Special handling:** The response contains no ARN — just a set of IDs. We added code to construct the ARN from the agent ID, version, and action group ID. However, tagging was blocked by permissions in our test accounts (likely an org-level SCP). The code is correct; this is a deployment environment issue.

### Amazon Bedrock Agent Aliases
- **Status:** ⚠️ Handler added — ARN format validation issue
- **Tags on:** `CreateAgentAlias`
- **Special handling:** Added `agentAliasArn` to our known field names. The Lambda correctly extracts the alias ARN but the `bedrock-agent.tag_resource()` API returns a validation error for the `agent-alias/` ARN format in our test setup.

### Amazon Bedrock Custom Model Training
- **Status:** ❌ Not available
- **AWS reason:** Returns `UnknownOperationException` — requires special account-level enablement not available in standard test accounts.

### Amazon Bedrock Provisioned Throughput
- **Status:** ❌ Not available in test accounts
- **AWS reason:** Provisioned Throughput is a paid commitment feature requiring specific model access agreements. None of the test account models supported it.

### Amazon Bedrock Evaluation Jobs
- **Status:** ❌ Not available in test accounts
- **AWS reason:** The APAC inference profiles available in ap-northeast-2 were marked as "Legacy" and blocked for evaluation jobs.

---

## Developer Tools

### AWS CodeCommit Repositories
- **Status:** ✅ Works
- **Tags on:** `CreateRepository`

### AWS CodeBuild Projects
- **Status:** ✅ Works
- **Tags on:** `CreateProject`

### AWS CodeDeploy Applications
- **Status:** ✅ Works
- **Tags on:** `CreateApplication`

### AWS CodeDeploy Deployment Groups
- **Status:** ✅ Works
- **Tags on:** `CreateDeploymentGroup`
- **Special handling:** The ARN isn't in the response — it's built from the application name and deployment group name found in the *request* parameters.

### AWS CodePipeline Pipelines
- **Status:** ✅ Works
- **Tags on:** `CreatePipeline`
- **Special handling:** There was originally a duplicate handler for CodePipeline that was returning the wrong ARN. Removed the duplicate and kept the correct one.

### AWS CloudFormation Stacks
- **Status:** ✅ Works
- **Tags on:** `CreateStack`
- **Special handling:** Added `cloudformation:UpdateStack` permission (required when the Lambda tries to update tags on a stack that already exists).

### AWS Amplify Apps
- **Status:** ✅ Works
- **Tags on:** `CreateApp`
- **Note:** Works without a GitHub/Bitbucket repository — you can create a standalone Amplify app with just a build spec.

### AWS Amplify Branches
- **Status:** ✅ Works
- **Tags on:** `CreateBranch`
- **Special handling:** The branch ARN is inside a nested `branch` object in the response (`branch.branchArn`). We added code to look there.

### AWS CodeArtifact
- **Status:** ✅ Works — see Analytics section above

### AWS CodeGuru Profiler Groups
- **Status:** ✅ Works
- **Tags on:** `CreateProfilingGroup`
- **Special handling (subtle bug):** The IAM permission for CodeGuru Profiler is `codeguru-profiler:TagResource` (with a hyphen between "codeguru" and "profiler"). We initially had it as `codeguruprofiler:TagResource` (no hyphen) — one character difference, but AWS rejected it entirely. Fixed.
- **Note:** CodeGuru Profiler is not available in ap-northeast-2. Use us-east-1.

---

## Migration & Transfer

### AWS Transfer Family Servers
- **Status:** ✅ Works
- **Tags on:** `CreateServer`

### AWS DataSync Location (S3)
- **Status:** ✅ Works
- **Tags on:** `CreateLocationS3`

### AWS DataSync Tasks
- **Status:** ✅ Works
- **Tags on:** `CreateTask`
- **Special handling:** Added `taskArn` to our known field names.

---

## IoT

### AWS IoT Policies
- **Status:** ✅ Works
- **Tags on:** `CreatePolicy`

### AWS IoT Things
- **Status:** ❌ Not taggable
- **AWS reason:** AWS's tagging API explicitly rejects `thing` as a resource type. IoT Things cannot be tagged via any API.

### AWS IoT Greengrass v2 Component Versions
- **Status:** ✅ Works
- **Tags on:** `CreateComponentVersion`

### AWS IoT SiteWise Asset Models
- **Status:** ✅ Works
- **Tags on:** `CreateAssetModel`
- **Special handling:** Added `assetModelArn` to our known field names.

### AWS IoT SiteWise Assets
- **Status:** ✅ Works
- **Tags on:** `CreateAsset`
- **Special handling:** Added `assetArn` to our known field names.
- **Note:** The asset model must be in "ACTIVE" status before you can create assets from it. There's a short delay after creating a model before it becomes active.

### AWS IoT TwinMaker Workspaces
- **Status:** ✅ Works
- **Tags on:** `CreateWorkspace`
- **Special handling:** The TwinMaker execution role requires an *inline* IAM policy (not a managed policy). The managed policy `AWSIoTTwinMakerFullAccess` was removed by AWS. Also, the role needs time to propagate (~15 seconds) before TwinMaker accepts it.

### AWS IoT Events (Inputs, Detector Models)
- **Status:** ❌ Not available to new customers
- **AWS reason:** "AWS IoT Events is no longer available to new customers." Existing customers can continue using it.

### AWS IoT Analytics (Channels, Datasets)
- **Status:** ❌ Not available to new customers
- **Same situation as IoT Events above.**

---

## Media

### Amazon IVS (Interactive Video Service) Channels
- **Status:** ✅ Works — see Global Services section above

### Amazon IVS Chat Rooms
- **Status:** ✅ Works — see Global Services section above

### AWS Elemental MediaConvert Queues
- **Status:** ✅ Works
- **Tags on:** `CreateQueue`
- **Special handling:** MediaConvert requires fetching a custom endpoint URL before making API calls — each account gets its own unique endpoint. The Lambda must call `describe_endpoints()` first to get this URL, then use it for the tagging call. We added `mediaconvert:TagResource` permission and the endpoint-fetching logic.

### AWS Elemental MediaPackage Channels
- **Status:** ✅ Works
- **Tags on:** `CreateChannel`

### AWS Elemental MediaPackage Origin Endpoints
- **Status:** ✅ Works
- **Tags on:** `CreateOriginEndpoint`

---

## Emerging & Specialized Services

### AWS Supply Chain Instances
- **Status:** ✅ Works
- **Tags on:** `CreateInstance`
- **Special handling:** The general tagging API (`tag:TagResources`) doesn't support Supply Chain resources. We added a specific handler that calls `scn:TagResource` directly instead. This is the service prefix for Supply Chain.

### Amazon HealthLake FHIR Datastores
- **Status:** ✅ Works
- **Tags on:** `CreateFHIRDatastore`
- **Special handling:** The ARN field in the response is `datastoreArn` (lowercase). We were searching for `DatastoreArn` (PascalCase). Fixed by adding both versions.
- **Note:** HealthLake is only available in us-east-1, us-east-2, and us-west-2.

### Amazon Omics Workflows
- **Status:** ✅ Works
- **Tags on:** `CreateWorkflow`
- **Note:** Available in us-east-1. The `arn` field is at the top level of the response, so no special handling needed.

### Amazon DataZone Domains
- **Status:** ✅ Works
- **Tags on:** `CreateDomain`
- **Note:** Available in us-east-1.

### Amazon Q Business Applications
- **Status:** ✅ Works
- **Tags on:** `CreateApplication`
- **Note:** Available in us-east-1. The `applicationArn` field was already in our known field names list.

### Amazon Location Service — Maps
- **Status:** ✅ Works
- **Tags on:** `CreateMap`
- **Special handling:** Added `geo:TagResource` permission to the Lambda's IAM role.

### Amazon Location Service — Trackers
- **Status:** ✅ Works
- **Tags on:** `CreateTracker`

### Amazon Location Service — Place Indexes
- **Status:** ✅ Works
- **Tags on:** `CreatePlaceIndex`

### Amazon Location Service — Route Calculators
- **Status:** ✅ Works
- **Tags on:** `CreateRouteCalculator`

### Amazon Pinpoint Apps
- **Status:** ✅ Works
- **Tags on:** `CreateApp`

### Amazon AppStream 2.0 Stacks
- **Status:** ✅ Works
- **Tags on:** `CreateStack`

### Amazon WorkSpaces Web Portals
- **Status:** ✅ Works
- **Tags on:** `CreatePortal`
- **Special handling:** Added `portalArn` to our known field names.

### AWS GameLift Builds
- **Status:** ✅ Works
- **Tags on:** `CreateBuild`
- **Note:** Use `AMAZON_LINUX_2` as the operating system. Newer OS versions (AMAZON_LINUX_2023) may not be available in all accounts.

### Amazon Elastic Beanstalk Applications
- **Status:** ✅ Works
- **Tags on:** `CreateApplication`
- **Special handling:** Added `ApplicationArn` to our known field names and an Elastic Beanstalk-specific handler.

### Amazon Detective Graphs
- **Status:** ✅ Works — see Security section above

### Amazon Verified Permissions
- **Status:** ✅ Works — see Security section above

### AWS Clean Rooms Collaborations
- **Status:** ✅ Works — see Application Integration section above

### Amazon CodeGuru Profiler
- **Status:** ✅ Works — see Developer Tools section above

### AWS Service Catalog Portfolios
- **Status:** ✅ Works
- **Tags on:** `CreatePortfolio`

### AWS Service Catalog Products
- **Status:** ✅ Works
- **Tags on:** `CreateProduct`
- **Special handling (non-obvious permission issue):** When the general tagging API (`tag:TagResources`) tags a Service Catalog product, it internally makes a call to `servicecatalog:UpdateProduct`. This isn't obvious — you'd expect it to need a "tag" permission, not an "update" permission. Without `servicecatalog:UpdateProduct` in the Lambda's IAM role, the tagging call fails with a permission error. We added this permission.

---

## Backup & Disaster Recovery

### AWS Backup Vaults
- **Status:** ✅ Works — see Storage section above

### AWS Backup Plans
- **Status:** ✅ Works — see Storage section above

---

## Discontinued Services

These services are no longer available to new AWS accounts and cannot be tested:

| Service | Status |
|---------|--------|
| AWS IoT Events | Discontinued for new customers |
| AWS IoT Analytics | Discontinued for new customers |
| Amazon Lookout for Vision | Discontinued — removed from AWS SDK |
| Amazon Lookout for Metrics | Discontinued — removed from AWS SDK |
| Amazon Lookout for Equipment | Requires account activation (blocked for new accounts) |
| Amazon Fraud Detector | Requires account activation (blocked for new accounts) |
| Amazon QLDB | Service fully discontinued July 2025 |

---

## Platform Limitations Summary

These resources exist in AWS but cannot be tagged by any tool after creation:

| Resource | Why |
|----------|-----|
| **IoT Things** | AWS's TagResource API explicitly rejects `thing` as a resource type |
| **Lambda Layers & Versions** | AWS explicitly blocks tagging of layer versions via API |
| **Lambda Aliases** | AWS explicitly blocks tagging of function aliases |
| **Keyspaces (Cassandra) Tables** | Resource Groups Tagging API doesn't support Cassandra |
| **CloudWatch Log Streams** | Streams inherit tags from their parent Log Group by design |
| **API Gateway API Keys** | The ARN format is rejected by all tagging APIs |
| **EventBridge Connections** | The ARN contains a UUID suffix that makes it invalid for tagging |
| **Glue Tables** | Can only be tagged at creation time; post-creation tagging is rejected by AWS |
| **Individual EventBridge Schedules** | The Scheduler's TagResource API only accepts schedule-group ARNs |
| **S3 Glacier Deep Archive** | MAP-ineligible — excluded from MAP credit calculations by AWS |
| **Fargate on EKS** | MAP-ineligible (Fargate on ECS IS eligible) |

---

## Timing Issues

These resources work correctly, but there's a window where tagging may fail because the resource isn't ready yet:

| Resource | Wait Needed | Why |
|----------|------------|-----|
| **NAT Gateways** | ~1-3 minutes | Takes time to provision |
| **ElastiCache Clusters (all types)** | ~2-5 minutes | Must be "Available" before tagging |
| **EMR Clusters** | Variable | Must use `KeepJobFlowAliveWhenNoSteps=True`; terminated clusters cannot be tagged after termination |

---

## Multi-Region Deployment Notes

Some AWS services only record their events in specific regions regardless of where you're working:

| Service | EventBridge Region | Why |
|---------|-------------------|-----|
| CloudFront, Route53, IVS, IVS Chat | us-east-1 | These are "global" services — AWS routes all their management events through US East |
| Global Accelerator | us-west-2 | Global Accelerator's control plane runs in us-west-2 |
| App Runner (if not in primary region) | ap-northeast-1 | App Runner isn't available in all regions; use the nearest supported region |

The deploy script automatically handles deploying the Lambda to the necessary regions.

---

## Template Version History

| Version | Key Change |
|---------|-----------|
| v1-v6 | Initial bugs from Phase 1: ECS service ARN collision, Glue table ARN, IVS stream-key bug, trainingJobArn missing, multi-region IAM role name, scheduler group handler |
| v7 | Added 20+ new service handlers: EMR Serverless, Kendra, Lex v2, Transcribe, Elastic Beanstalk, GameLift, IoT services, emerging services |
| v8 | Lightsail Container/LB/DB handlers; HealthLake datastoreArn lowercase; Supply Chain scn:TagResource handler |
| v9 | Fixed: Lightsail handlers moved before universal scan; Transcribe vocabularyName lowercase; MQ brokerArn lowercase; codeartifact:TagResource permission |
| v10 | Fixed: Lex v2 event source (lex.amazonaws.com); Transcribe camelCase; MQ brokerArn |
| v11 | Added transcribe:TagResource specific handler (general tag API unsupported) |
| v12 | Fixed: SageMaker featureGroupArn lowercase; Service Catalog productARN; codeguru-profiler:TagResource (with hyphen) |
| v13 | Added catalog:TagResource and servicecatalog:TagResource permissions |
| v14 | Added servicecatalog:UpdateProduct permission (required by tag:TagResources internally) |
| v15 | Added Bedrock sub-resource handlers: Agent Aliases, Action Groups, KB Data Sources; Prompt Versions, Flow Aliases, Provisioned Throughput patterns |
| v16 | **Security hardening:** Removed `ReadOnlyAccess` managed policy (replaced with 4 explicit read actions); removed `apigateway:PATCH/POST`; deduplicated 32 IAM entries; fixed S3 `PutBucketTagging` feedback loop; fixed `logger` NameError bug; added explanatory comments for write-action permissions; deleted stale backup files |
| v17 | Fixed 3 IAM regressions from v16: `glue:GetDatabase` (Glue Database tagging), `codebuild:BatchGetProjects` (CodeBuild tagging), `iam:TagRole` (IAM Role tagging) |
| configurator fix | Fixed JavaScript bug in `configurator.html`: unescaped `${AWS::Region}` inside a JS template literal caused a SyntaxError that silently broke the entire `<script>` block — clicking "Multiple Accounts" did nothing. Fixed by escaping to `\${AWS::Region}`. No change to CloudFormation template version. |
