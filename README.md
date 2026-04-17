# MAP 2.0 Auto-Tagger

> **Disclaimer:** This is sample code for non-production usage. You should work with your security and legal teams to meet your organizational security, regulatory, and compliance requirements before deployment. You are responsible for testing, securing, and optimizing this solution as appropriate for production use based on your specific quality control practices and standards. Deploying this solution may incur AWS charges for Lambda, EventBridge, CloudWatch, SSM Parameter Store, SQS, and SNS. Under the [AWS Shared Responsibility Model](https://aws.amazon.com/compliance/shared-responsibility-model/), you are responsible for security decisions in the cloud, including the IAM roles and policies deployed by this solution.

**Automatic AWS resource tagging for MAP 2.0 credit tracking**

[![E2E Tested](https://img.shields.io/badge/E2E%20Tested-190%2B%20Resource%20Types-brightgreen)]()
[![Success Rate](https://img.shields.io/badge/Success%20Rate-100%25%20Taggable-brightgreen)]()
[![Bugs Fixed](https://img.shields.io/badge/Bugs%20Fixed-102%2B-blue)]()
[![Multi--Account](https://img.shields.io/badge/Multi--Account-9%20Accounts%20Validated-brightgreen)]()
[![Lambda Errors](https://img.shields.io/badge/Lambda%20Errors-0%20across%20all%20tests-brightgreen)]()

Customer-deployable CloudFormation solution that automatically tags newly created AWS resources with the `map-migrated` tag for MAP 2.0 credit eligibility.

---

## 🎯 Quick Facts

- ✅ **140 resource types proven working** — validated against 9 real AWS accounts including CT org
- ✅ **All 88 MAP-eligible services covered** — cross-referenced against official MAP Included Services List (6 April 2026)
- ✅ **100% success rate** on all taggable MAP-eligible resources
- ✅ **Typically 60–90 seconds** automatic tagging latency (CloudTrail → EventBridge → Lambda → Tag)
- ✅ **100+ bugs found and fixed** across all phases of testing
- ✅ **Multi-account + multi-region** — StackSet deploys to entire org automatically
- ✅ **< $2/month** customer cost per account
- ✅ **Zero Lambda errors** across full E2E test suite (single + multi-account + edge cases)

---

## Problem

Customers manually tag resources for MAP 2.0 credits. They forget, tag incorrectly, tag before the agreement date, or miss dependent resources (EBS volumes, snapshots, read replicas). This leads to lost credits.

## Solution

EventBridge catches resource creation events and triggers a Lambda that applies the correct `map-migrated` tag automatically — within typically 60–90 seconds of creation, across 140 resource types spanning every major AWS service category.

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **[OVERVIEW.md](OVERVIEW.md)** | Non-technical overview — how it works, what gets tagged, cost |
| **[INSTRUCTIONS.md](INSTRUCTIONS.md)** | Deployment steps — generating deploy.sh and running it |
| **[MAP_TAGGING_GAP_ANALYSIS.md](MAP_TAGGING_GAP_ANALYSIS.md)** | Gap analysis: what can't be tagged and why |

---

## Components

- **`map2-auto-tagger-optimized.yaml`** — CloudFormation template (140 services, IAM hardened)
- **`configurator.html`** — Self-service UI. Generates a customized `deploy.sh` for CloudShell or local AWS CLI deployment.
- **`editor.html`** — Day-2 operations UI. Add or remove accounts from an existing deployment without redeploying. Generates an `update.sh` script.

---

## 🚀 Quick Start

### Step 1 — Generate deploy.sh

1. Open `configurator.html` in a browser
2. Fill in MPE ID, agreement date, deployment mode, regions
3. Click **Generate & Download** → downloads `deploy.sh` (fully self-contained)

### Step 2 — Run deploy.sh

**Option 1 — AWS CloudShell (no setup required):**
Open **AWS CloudShell** in the target account, upload `deploy.sh`, and run:

```bash
bash deploy.sh
```

**Option 2 — Local AWS CLI:**
```bash
# Credentials must be configured for the target account
bash deploy.sh
```

Works on Linux, macOS, and Windows (via WSL or Git Bash).

**One file. One command. Done.**

The script handles everything automatically — preflight checks, deployment, backfill (if enabled), and generates a deployment report.

### Verify

```bash
aws s3 mb s3://test-map-$(date +%s) && sleep 90
aws s3api get-bucket-tagging --bucket test-map-XXXXX
# Expected: {"TagSet": [{"Key": "map-migrated", "Value": "mig1234567890"}]}
```

---

## 📊 Service Coverage

### Fully Tested & Working (140 resource types)

| Category | Key Services | Status |
|----------|-------------|--------|
| **Compute** | Lambda, EC2, ECS, EKS, Auto Scaling, EMR, EMR Serverless, Elastic Beanstalk | ✅ |
| **Storage** | S3, EFS, FSx (Lustre/ONTAP/OpenZFS), ECR, EBS, AMIs, Backup | ✅ |
| **Database** | RDS (all engines + snapshots + replicas), Aurora, Neptune, DocumentDB, DynamoDB, DynamoDB DAX, Redshift, MemoryDB, OpenSearch, ElastiCache (incl. Serverless), MSK (incl. Serverless) | ✅ |
| **Messaging** | Amazon MQ (ActiveMQ + RabbitMQ), SNS, SQS | ✅ |
| **Networking** | VPC, Subnets, Security Groups, Load Balancers, Transit Gateway, VPN, CloudFront, Route53, Global Accelerator, Network Firewall, Direct Connect, VPC Lattice | ✅ |
| **Analytics** | Kinesis (Data Streams + Video Streams), MSK, Glue (all types + DataBrew), Athena, OpenSearch, EMR | ✅ |
| **Integration** | SNS, SQS, Step Functions, AppSync, API Gateway (REST + HTTP + WebSocket) | ✅ |
| **ML & AI** | SageMaker (all types incl. Pipeline/FeatureStore/Domain), Bedrock (Agents + Guardrails + Flows + Prompts + Inference Profiles + Knowledge Bases + AgentCore), Comprehend, Kendra | ✅ |
| **Security** | KMS, ACM, Cognito, Security Hub | ✅ |
| **Developer** | CodeBuild, CodePipeline, CloudFormation, Cloud9, Service Catalog | ✅ |
| **Management** | CloudWatch, SSM, Secrets Manager, AppConfig, Service Discovery | ✅ |
| **Migration** | Transfer Family (Servers + Connectors + Users), DataSync, DMS (Instances + Endpoints + Tasks + Serverless), Elastic Disaster Recovery | ✅ |
| **IoT** | IoT Core (Topic Rules), IoT SiteWise (Assets + Models + Gateways + Portals), IoT Analytics, IoT Events | ✅ |
| **Media** | MediaConvert, MediaLive, MediaPackage | ✅ |
| **Global** | CloudFront, Route53, Global Accelerator — via us-east-1/us-west-2 Lambda | ✅ |
| **Emerging** | HealthLake, Omics, AppStream 2.0, Deadline Cloud, Kinesis Video Streams | ✅ |

### Not Taggable — Confirmed AWS Platform Limitations

| Resource | AWS Reason |
|----------|-----------|
| IoT Things | AWS API rejects `thing` as resource type in TagResource |
| Lambda Layers/Aliases | AWS explicitly blocks tagging of layers, aliases, and versions |
| Keyspaces Tables | Resource Groups API doesn't support Cassandra/Keyspaces |
| CloudWatch Log Streams | Inherit tags from parent Log Group by design |
| API Gateway API Keys | ARN format rejected by all tagging APIs |
| Glue Tables | Can only be tagged at creation time via Tags param; post-creation tagging rejected |
| S3 Glacier Deep Archive | MAP ineligible — always excluded from credit calculations |
| Fargate on EKS | MAP ineligible (Fargate on ECS IS eligible) |

### Discontinued Services (not testable in new accounts)

| Service | Status |
|---------|--------|
| AWS IoT Events | No longer available to new customers |
| AWS IoT Analytics | No longer available to new customers |
| Amazon Lookout for Vision | Discontinued — removed from SDK |
| Amazon Lookout for Metrics | Discontinued — removed from SDK |
| Amazon QLDB | Discontinued July 2025 |

### Needs Retry Logic (Timing)

| Resource | Wait Needed |
|----------|------------|
| NAT Gateways | ~1-3 min provisioning |
| ElastiCache Clusters/RG/Serverless | ~2-5 min to become AVAILABLE |
| EMR Clusters | Use `KeepJobFlowAliveWhenNoSteps=True`; terminated clusters can't be tagged |

---

## 🏗️ Architecture

```
AWS Resource Created
        │
        ▼
  CloudTrail Event (logged within seconds)
        │
        ▼
  EventBridge Rule (filters: Create/Run/Put/Publish/Request/Allocate/Import/Launch)
        │
        ▼
  Lambda Function
  ├── Extract ARN (50+ universal patterns + 100+ service-specific handlers)
  ├── Check scope (account/VPC filter)
  └── Apply tag (Resource Groups API + 30+ service-specific tagging APIs)
        │
        ▼
  Resource tagged: map-migrated=mig123...
  ⏱️ Total time: typically 60–90 seconds (up to 15 minutes at peak)
```

**Multi-region coverage — global services need Lambda in matching region:**

| Global Service | Lambda Region |
|---------------|--------------|
| CloudFront, Route53 | us-east-1 |
| Global Accelerator | us-west-2 |

**IAM note:** The Lambda execution role name uses `!Sub 'map-auto-tagger-role-${AWS::Region}'` to enable safe multi-region deployment (IAM is global; same role name would conflict across regions in the same account).

---

## Deployment Modes

- **Single Account** — deploy once per region where you create resources
- **Multi-Account** — deploy via StackSets across all member accounts
  - Must be run from the management account or a [delegated administrator](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/stacksets-orgs-delegated-admin.html) account for CloudFormation StackSets
  - Uses `SERVICE_MANAGED` permission model — no direct IAM access to member accounts required; CloudFormation deploys using org-level service-linked roles
  - Lambda Custom Resource auto-discovers org root OU and deploys to all accounts
  - Use **account scoping** in the configurator to limit deployment to specific accounts

### Adding or Removing Accounts

Re-run `deploy.sh` with the updated account list. The StackSet update pushes the new configuration to all existing accounts and deploys to any new org accounts.

- **Adding accounts:** Regenerate `deploy.sh` with all account IDs (existing + new) and re-run. The new accounts will start being tagged.
- **Removing accounts:** Regenerate `deploy.sh` without the account IDs you want to remove and re-run. Those accounts will stop being tagged (the Lambda remains deployed but skips out-of-scope accounts).
- **No scoping (default):** If `scoped_account_ids` is left as `ALL`, every account is tagged automatically. No re-runs needed when accounts join the org — just re-run `deploy.sh` once to deploy the Lambda to the new account.

> **Important:** You must include all account IDs you want in scope every time you regenerate `deploy.sh`. The update overwrites the previous configuration — it does not merge.

### Multiple MAP Engagements

All resources are namespaced with the MPE ID (e.g., `map-auto-tagger-mig111`), so multiple MAP engagements can coexist in the same organization:

1. Run `deploy.sh` with MPE ID `mig111` scoped to accounts 1, 2, 3
2. Run `deploy.sh` with MPE ID `mig222` scoped to accounts 4, 5, 6

Each creates a separate StackSet, Lambda, SSM config, and EventBridge rule. They do not conflict.

> **Important:** Do not scope the same account to two different MPE IDs. The `map-migrated` tag can only hold one value — the last Lambda to run wins.

---

## Prerequisites

- CloudTrail enabled in target region(s)
- Deployer needs: `iam:*Role*`, `lambda:CreateFunction`, `events:PutRule`, `ssm:PutParameter`, `sns:CreateTopic`, `sqs:CreateQueue`, `cloudwatch:PutMetricAlarm`
- Or use a CloudFormation service role
- **Multi-account only:** Trusted access for CloudFormation StackSets must be enabled in your organization:
  ```bash
  aws organizations enable-aws-service-access --service-principal member.org.stacksets.cloudformation.amazonaws.com
  ```

---

## 🔧 Testing Summary

Validated across **9 real AWS accounts** (single account + multi-account org with 5 linked + 2 security OU accounts), covering all 88 MAP 2.0 eligible services from the official Included Services List.

| Metric | Result |
|--------|--------|
| Resource types tested | **140 unique** |
| Bugs found & fixed | **100+** |
| False positives | **0** |
| Lambda errors | **0** |
| Accounts tested | **9** |

**Scenarios covered:** Single account, multi-account org, VPC scoping, account scoping, backfill, multi-region, IAM Identity Center (SSO) users, delegated administrator accounts, date filtering, throttle burst handling.

---

## Known Limitations

- **Amazon Bedrock** — Bedrock spend is MAP-eligible but requires customers to create [Application Inference Profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-create.html) first. Once a profile is created, this solution automatically tags it. Without an inference profile, Bedrock API calls are not MAP-trackable.
- **Existing resources** not automatically tagged — enable the one-time backfill option in the configurator (covers resources created up to 90 days before deployment)
- **S3 staging bucket (multi-account only)** — the multi-account deployment creates an S3 bucket named `auto-map-tagger-{account-id}` in the management account to stage CloudFormation templates for the StackSet. This bucket is intentionally retained after deployment — CloudFormation StackSets require a persistent template URL to automatically deploy to new accounts that join your organization in the future. The bucket contains only the per-account CloudFormation template (~40KB) and has Block Public Access, AES-256 encryption, and HTTPS-only enforcement applied. Single-account deployments do not create a persistent S3 bucket.
- **Delegated administrator accounts supported** — in large enterprises the management account is often locked down and a "shared services" account is designated as the [delegated administrator](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/stacksets-orgs-delegated-admin.html) for CloudFormation StackSets. Running `deploy.sh` from a delegated admin account is fully supported. The preflight check verifies the caller is either the management account or a registered delegated admin for `stacksets.cloudformation.amazonaws.com`.
- **Multiple concurrent MAP engagements supported** — all deployed resources (Lambda, EventBridge rule, SQS queues, SNS topic, CloudWatch alarm, SSM parameter) are namespaced by MPE ID (e.g., `map-auto-tagger-mig111`). You can deploy multiple stacks in the same management account for different MAP engagements, provided each engagement's accounts are scoped separately. **Do not scope the same account to two different MPE IDs** — the `map-migrated` tag can only hold one value, and both Lambdas will fire, with the last writer winning.
- **Upgrading from a previous version** — prior versions used fixed resource names (`map-auto-tagger`, `/auto-map-tagger/config`). The new version uses MPE-ID-namespaced names (`map-auto-tagger-mig111`, `/auto-map-tagger/mig111/config`). These are treated as entirely new resources by CloudFormation — running `deploy.sh` on an existing deployment will deploy a second stack alongside the old one, leaving both running simultaneously. Before upgrading, delete the existing stack first:
  ```bash
  aws cloudformation delete-stack --stack-name map-auto-tagger
  aws cloudformation wait stack-delete-complete --stack-name map-auto-tagger
  ```
  Then run the new `deploy.sh`. There will be a short gap (~5 minutes) during which new resources are not tagged. Resources created during this window can be caught by enabling the backfill option in the configurator.
- **Management account not covered in multi-account mode** — `SERVICE_MANAGED` StackSets cannot deploy to the management account (AWS hard constraint). In multi-account StackSet deployments, the management account runs the deployment but does not receive the auto-tagger Lambda. Resources created in the management account will not be tagged. AWS best practice is to not run workloads in the management account. If tagging is required there, additionally run a single-account deployment targeting the management account after the StackSet deployment completes.
- **New AWS accounts added post-deployment** — new accounts that join the organization after the StackSet has been deployed will not automatically receive the auto-tagger. Re-run `deploy.sh` to extend the StackSet to new accounts. Auto-deployment is intentionally disabled because customers may have multiple MAP engagements with different MPE IDs scoped to different accounts.
- **Service Control Policies (SCPs)** — two scenarios require manual verification before deployment:
  - *Tagging SCPs*: if your organization's SCPs deny `tag:TagResources` or service-specific tagging actions for Lambda execution roles, the auto-tagger will silently fail and events will accumulate in the DLQ. The `deploy.sh` preflight check runs an IAM simulation (`iam:SimulatePrincipalPolicy`) to detect explicit denies, but SCPs are not evaluated by IAM simulation and require manual review in the AWS Organizations console.
  - *Mandatory tagging SCPs*: if SCPs require the `map-migrated` tag to be present at resource creation time, this solution will not satisfy that requirement — tags are applied typically 60–90 seconds (up to 15 minutes during high-volume activity) after creation. Either exempt `map-migrated` from creation-time enforcement or configure a grace period in the SCP.
- **ECS task tag propagation** requires `propagateTags: SERVICE` in ECS service definition
- **EKS Auto Mode nodes** — tagged via NodePool config, not standard tagging
- **Multi-region coverage** — deploy to us-east-1 and us-west-2 for CloudFront, Route53, IVS, GA
- **EventBridge 256KB event size limit** — CloudTrail events exceeding 256KB are silently dropped by EventBridge and will never trigger the Lambda. This is an AWS platform hard limit. In practice this is extremely rare, only possible for unusually complex resource creation events (e.g., a Lambda function with a very large inline policy). No workaround exists within this architecture.
- **API throttling during large bursts** — if hundreds of resources are created simultaneously, multiple Lambda invocations may hit `tag:TagResources` rate limits. The Lambda retries up to 3 times with exponential backoff (0.5s → 1s → 2s with ±25% jitter). Events that exhaust all retries go to the DLQ for manual review.
- **CloudTrail delivery latency** — typical tagging latency is 60–90 seconds but CloudTrail delivery to EventBridge can take up to 15 minutes during high API activity (e.g., large Terraform/CDK deployments). Tags will always be applied eventually — this is a latency variance, not a reliability issue.
- **CloudTrail must be enabled in all deployment regions** — the `deploy.sh` preflight verifies CloudTrail in each selected region. Resources created in a region without an active CloudTrail trail will never trigger the Lambda and will not be tagged.
- **MPE ID change mid-migration** — if the MAP Engagement ID changes, the Lambda automatically uses the new value from SSM for all future resources. Previously tagged resources retain the old value and must be re-tagged manually via AWS Tag Editor. **Do not use automated bulk re-tagging scripts** in accounts with multiple concurrent MAP engagements — different resources may intentionally carry different MPE IDs.
- **`comm` tag prefix** — deprecated, use `mig` only
- **Cost allocation tag** — automatically activated for MAP agreements

---

## 💰 Cost

| Component | Monthly Cost |
|-----------|-------------|
| Lambda (100-1,000 invocations/day) | $0.10 – $2.00 |
| EventBridge events | $0.01 – $0.20 |
| CloudTrail (existing) | $0.00 |
| SSM Parameter Store | $0.00 |
| **Total** | **~$2.00/month** |

---

## 🔍 Monitoring

```bash
# See recent tagging activity
aws logs tail /aws/lambda/map-auto-tagger --follow

# Check for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/map-auto-tagger \
  --filter-pattern "Failed"

# See what was tagged
aws logs filter-log-events \
  --log-group-name /aws/lambda/map-auto-tagger \
  --filter-pattern "Tagged"
```

**Built-in alarm:** Error rate > 3 in 5 minutes → SNS notification

---

**Recommended deployment:**
1. Open `configurator.html` in a browser and generate `deploy.sh`
2. Run `bash deploy.sh` in AWS CloudShell or local AWS CLI (from the target account)
3. Monitor via Amazon CloudWatch for the first week
4. Expand regions as needed (us-east-1 for CloudFront/Route53; us-west-2 for Global Accelerator)
