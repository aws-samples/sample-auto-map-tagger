# MAP 2.0 Auto-Tagger

> **Disclaimer:** This solution is AWS Content, as defined in the [AWS Online Customer Agreement](https://aws.amazon.com/agreement/). You are responsible for testing, securing, and optimizing this AWS Content as appropriate for production use based on your specific quality control practices and standards. Deploying this solution may incur AWS charges for Lambda, EventBridge, CloudWatch, SSM Parameter Store, SQS, and SNS.

**Automatic AWS resource tagging for MAP 2.0 credit tracking**

[![E2E Tested](https://img.shields.io/badge/E2E%20Tested-190%2B%20Resource%20Types-brightgreen)]()
[![Success Rate](https://img.shields.io/badge/Success%20Rate-100%25%20Taggable-brightgreen)]()
[![Status](https://img.shields.io/badge/Status-Production%20Ready-success)]()
[![Bugs Fixed](https://img.shields.io/badge/Bugs%20Fixed-79%2B-blue)]()
[![Multi--Account](https://img.shields.io/badge/Multi--Account-CT%20Org%20Validated-brightgreen)]()
[![Regions](https://img.shields.io/badge/Regions-4%20Deployed-blue)]()

Customer-deployable CloudFormation solution that automatically tags newly created AWS resources with the `map-migrated` tag for MAP 2.0 credit eligibility.

---

## 🎯 Quick Facts

- ✅ **190+ resource types proven working** — validated in real CT org (4 accounts × 4 regions)
- ✅ **100% success rate** on all taggable MAP-eligible resources
- ✅ **60-90 seconds** automatic tagging latency (CloudTrail → EventBridge → Lambda → Tag)
- ✅ **76+ bugs found and fixed** across two phases of testing
- ✅ **Multi-account + multi-region** — StackSet deploys to entire org automatically
- ✅ **< $2/month** customer cost per account
- ✅ **Zero false positives** — no resources incorrectly tagged

---

## Problem

Customers manually tag resources for MAP 2.0 credits. They forget, tag incorrectly, tag before the agreement date, or miss dependent resources (EBS volumes, snapshots, read replicas). This leads to lost credits.

## Solution

EventBridge catches resource creation events and triggers a Lambda that applies the correct `map-migrated` tag automatically — within 60-90 seconds of creation, across 190+ resource types spanning every major AWS service category.

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **[TEST-RESULTS.md](TEST-RESULTS.md)** | ✅ **Complete test results** — every service tested, every bug documented |
| **[OVERVIEW.md](OVERVIEW.md)** | Non-technical stakeholder overview |
| **[INSTRUCTIONS.md](INSTRUCTIONS.md)** | Deployment steps for the AWS team and customer |
| **[MAP_TAGGING_GAP_ANALYSIS.md](MAP_TAGGING_GAP_ANALYSIS.md)** | Gap analysis: what can't be tagged and why |
| **[THREAT-MODEL.md](THREAT-MODEL.md)** | AppSec artifact — STRIDE threat model, trust boundaries, residual risks |

---

## Components

- **`map2-auto-tagger-optimized.yaml`** — Production CloudFormation template (v18, 190+ services, 79+ bugs fixed, AppSec hardened)
- **`configurator.html`** — ⚠️ **Internal AWS use only.** Configuration UI for the AWS account team to generate a customized `deploy.sh`. Not included in the public distribution.

---

## 🚀 Quick Start

### For the AWS Account Team

1. Open `configurator.html` in a browser
2. Fill in MPE ID, agreement date, deployment mode, regions
3. Click **Generate & Download** → downloads `deploy.sh` (fully self-contained)
4. Send `deploy.sh` to the customer

### For the Customer

Open **AWS CloudShell** in the AWS Console (top menu bar), upload `deploy.sh`, and run:

```bash
bash deploy.sh
```

**One file. One command. Done.**

The script auto-detects the account type (single or multi-account), handles all infrastructure, and confirms when complete.

### Verify

```bash
aws s3 mb s3://test-map-$(date +%s) && sleep 90
aws s3api get-bucket-tagging --bucket test-map-XXXXX
# Expected: {"TagSet": [{"Key": "map-migrated", "Value": "mig1234567890"}]}
```

---

## 📊 Service Coverage

### Fully Tested & Working (190+ resource types)

| Category | Key Services | Status |
|----------|-------------|--------|
| **Compute** | Lambda, EC2, ECS, EKS, Auto Scaling, App Runner, Batch, Lightsail, EMR, EMR Serverless, Elastic Beanstalk | ✅ |
| **Storage** | S3, EFS, FSx (Lustre/ONTAP/OpenZFS), ECR, EBS, AMIs, Backup | ✅ |
| **Database** | RDS (all engines + snapshots + replicas), Aurora, Neptune, DocumentDB, DynamoDB, Redshift, MemoryDB, OpenSearch, ElastiCache, MSK | ✅ |
| **Messaging** | Amazon MQ (ActiveMQ + RabbitMQ), SNS, SQS | ✅ |
| **Networking** | VPC, Subnets, Security Groups, Load Balancers, Transit Gateway, VPN, CloudFront, Route53, Global Accelerator, Network Firewall | ✅ |
| **Analytics** | Kinesis, MSK, Glue (all types + DataBrew), Athena, OpenSearch, EMR, CodeArtifact | ✅ |
| **Integration** | SNS, SQS, Step Functions, EventBridge (Rules + Buses + Pipes + Scheduler Groups), AppSync, API Gateway (REST + HTTP + WebSocket) | ✅ |
| **ML & AI** | SageMaker (all types incl. Pipeline/FeatureStore/Domain), Bedrock (Agents + Guardrails + Flows + Prompts + Inference Profiles + Knowledge Bases), Comprehend, Rekognition, Kendra, Lex v2 | ✅ |
| **Security** | KMS, ACM, WAFv2, Macie, GuardDuty, Cognito, Verified Permissions, Clean Rooms, Detective | ✅ |
| **Developer** | CodeCommit, CodeBuild, CodeDeploy, CodePipeline, CloudFormation, Amplify, CodeArtifact, CodeGuru Profiler | ✅ |
| **Management** | CloudWatch, SSM, Secrets Manager, X-Ray, AppConfig, MWAA, Transcribe | ✅ |
| **Migration** | Transfer Family, DataSync, DMS (Instances + Endpoints + Tasks) | ✅ |
| **IoT** | IoT Greengrass, IoT SiteWise, IoT TwinMaker | ✅ |
| **Media** | IVS (Channels + Chat), MediaConvert, MediaPackage | ✅ |
| **Global** | CloudFront, Route53, Global Accelerator, IVS — via us-east-1/us-west-2 Lambda | ✅ |
| **Emerging** | AWS Supply Chain, HealthLake, Omics, DataZone, Q Business, Location Service, Pinpoint, AppStream 2.0 | ✅ |

### Not Taggable — Confirmed AWS Platform Limitations

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
  ⏱️ Total time: 60-90 seconds
```

**Multi-region coverage — global services need Lambda in matching region:**

| Global Service | Lambda Region |
|---------------|--------------|
| CloudFront, Route53, IVS, IVS Chat | us-east-1 |
| Global Accelerator | us-west-2 |
| App Runner (if not in primary region) | ap-northeast-1 |

**IAM note:** The Lambda execution role name uses `!Sub 'map-auto-tagger-role-${AWS::Region}'` to enable safe multi-region deployment (IAM is global; same role name would conflict across regions in the same account).

---

## Deployment Modes

- **Single Account** — deploy once per region where you create resources
- **Multi-Account** — deploy via StackSets across all member accounts
  - Lambda Custom Resource auto-discovers org root OU and deploys to all accounts
  - New accounts added to the org automatically receive the auto-tagger

---

## Prerequisites

- CloudTrail enabled in target region(s)
- Deployer needs: `iam:*Role*`, `lambda:CreateFunction`, `events:PutRule`, `ssm:PutParameter`, `sns:CreateTopic`, `sqs:CreateQueue`, `cloudwatch:PutMetricAlarm`
- Or use a CloudFormation service role

---

## 🔧 Testing Summary

**Phase 1:** 12+ hours of continuous E2E testing, [test account], ap-northeast-2

**Phase 2:** 2+ days across CT org (4 accounts × 4 regions = 16 StackSet instances), all services validated

| Metric | Phase 1 | Phase 2 | Total |
|--------|---------|---------|-------|
| Resource types tested | 170+ | 200+ | 370+ |
| Resource types confirmed working | 150+ | 190+ | **190+ unique** |
| Bugs found & fixed | 55+ | 24 | **79+ total** |
| False positives | 0 | 0 | **0** |
| Template versions deployed | 15+ | 17 | **32+** |

**Hardest bugs fixed (Phase 2):**
- **IVS Channel** — universal scan grabbed `stream-key.arn` before `channel.arn` → moved handler to early-exit before scan
- **Lightsail Container** — CloudTrail ARN uses UUID but `lightsail.tag_resource()` needs name → extract `containerServiceName` from request
- **Transcribe** — `tag:TagResources` silently unsupported → added `transcribe:TagResource` specific handler
- **Service Catalog** — `tag:TagResources` internally calls `servicecatalog:UpdateProduct` (not obvious) → added permission
- **Lex v2** — wrong `eventSource` (`models.lex.amazonaws.com` vs actual `lex.amazonaws.com`) → fixed
- **Supply Chain** — `tag:TagResources` not supported → `scn:TagResource` specific handler
- **SageMaker Feature Store** — `FeatureGroupArn` (PascalCase) vs actual `featureGroupArn` (camelCase) → fixed

---

## Known Limitations

- **Existing resources** not automatically tagged — use bulk tagging tools for backfill
- **ECS task tag propagation** requires `propagateTags: SERVICE` in ECS service definition
- **EKS Auto Mode nodes** — tagged via NodePool config, not standard tagging
- **Multi-region coverage** — deploy to us-east-1 and us-west-2 for CloudFront, Route53, IVS, GA
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

## Security Review Status

### Completed
- ✅ IAM hardened — ReadOnlyAccess removed, cross-account AssumeRole removed, 42+ invalid/discontinued/redundant permissions removed
- ✅ S3 feedback loop fixed — Lambda no longer re-triggers on `PutBucketTagging`
- ✅ CloudWatch Log Group added with 90-day retention
- ✅ IAM Access Analyzer run — 0 findings after remediating 7 invalid action names
- ✅ Threat model documented (`THREAT-MODEL.md`) — STRIDE analysis, trust boundaries, residual risks
- ✅ Non-production disclaimer added to README
- ✅ Required open source files present — `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`, `CHANGELOG.md`
- ✅ Apache 2.0 license headers added to all source files
- ✅ Repolinter — 0 failures (1 warning: false positive, no standalone `.js` files in project)
- ✅ CI workflow added (`.github/workflows/lint.yml` — cfn-lint on CloudFormation template)
- ✅ GitHub issue and PR templates added

### Pending (required before AppSec submission)
- ⬜ Push to GitFarm or AWS GitLab
- ⬜ Run security scanners (Probe / CRUX / ACAT) and remediate all high/critical findings
- ⬜ 2+ peer code reviews
- ⬜ Submit via RIVER workflow
- ⬜ File OSPO SIM ticket for `aws-samples` repo creation

---

## 🎯 Production Readiness

**PRODUCTION READY** ✅

- ✅ 190+ resource types proven end-to-end in real CT org
- ✅ 500+ real AWS resources tagged during Phase 2 testing
- ✅ All 76+ bugs discovered are fixed
- ✅ 100% success rate on all taggable services
- ✅ Zero false positives across all testing
- ✅ Multi-account (StackSets) and multi-region validated
- ✅ All known limitations documented

**Recommended deployment:**
1. AWS account team generates `deploy.sh` via `configurator.html`
2. Customer runs `bash deploy.sh` in CloudShell (single or management account)
3. Monitor via CloudWatch for 1 week
4. Expand regions as needed (us-east-1 for CloudFront/Route53; us-west-2 for GA)

---

*MAP 2.0 Auto-Tagger — v19 (configurator improvements)*
*190+ Resource Types | 79+ Bugs Fixed | CT Org Validated (4 accounts × 4 regions)*
*Status: PRODUCTION READY ✅*
