# MAP 2.0 Auto-Tagger
### Automatic Resource Tagging for AWS Migration Credits

---

## The Problem

AWS MAP 2.0 gives customers **migration credits** for workloads they move to AWS — but only if those resources are properly tagged with a `map-migrated` label.

In practice, customers miss credits because:

- Engineers forget to tag when creating resources
- Resources are created by scripts, pipelines, or third-party tools with no tagging
- Dependencies (databases, storage, networking) are created automatically and go untagged
- One missed tag = credits lost — and **tags cannot be back-dated**

> **Example:** A customer migrates 200 EC2 instances but forgets to tag 30 of them. At $0.15/hour per instance, that's **~$32,000 in missed credits over 6 months.**

---

## The Solution

The MAP Auto-Tagger is a lightweight tool that **automatically applies the `map-migrated` tag to every new AWS resource within typically 60–90 seconds (up to 15 minutes during high-volume activity) of creation** — with no action required from the customer's team.

It runs silently in the background. Engineers work normally. Credits are captured automatically.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                   │
│   Customer creates any AWS resource                               │
│   (EC2, RDS, Lambda, S3 bucket, VPC, etc.)                       │
│                           │                                       │
│                           ▼  (~5 seconds)                        │
│   ┌───────────────────────────────────────┐                      │
│   │           AWS CloudTrail              │                      │
│   │   Records the creation event          │                      │
│   └──────────────────┬────────────────────┘                      │
│                      │  (~30–60 seconds)                         │
│                      ▼                                           │
│   ┌───────────────────────────────────────┐                      │
│   │           Amazon EventBridge          │                      │
│   │   Detects the creation event and      │                      │
│   │   triggers the auto-tagger            │                      │
│   └──────────────────┬────────────────────┘                      │
│                      │  (~1 second)                              │
│                      ▼                                           │
│   ┌───────────────────────────────────────┐                      │
│   │        Auto-Tagger (Lambda)           │                      │
│   │   Applies: map-migrated = migXXXXXXXXXX    │                      │
│   └──────────────────┬────────────────────┘                      │
│                      │                                           │
│                      ▼                                           │
│   ✅ Resource tagged. Credits captured.                           │
│                                                                   │
│   Total time from creation to tagged:  typically 60–90 seconds (up to 15 minutes during high-volume activity)             │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**No code changes** required from the customer.
**No agents** installed on servers.
**No APIs** to integrate.

It works by listening to AWS's own audit log (CloudTrail) and reacting automatically.

---

## What Gets Tagged

The auto-tagger covers **190+ AWS resource types** across every major service category — all confirmed through real-world testing across 9 AWS accounts.

| Category | Examples |
|----------|---------|
| **Compute** | EC2 instances, Lambda, ECS/EKS containers, Auto Scaling, EMR, Lightsail, App Runner, Elastic Beanstalk |
| **Databases** | RDS (all engines), Aurora, DynamoDB, Neptune, Redshift, DocumentDB, MemoryDB, ElastiCache, OpenSearch |
| **Storage** | S3 buckets, EFS, FSx (all variants), EBS snapshots, AMIs, ECR |
| **Networking** | VPCs, Load Balancers, Transit Gateways, VPN, CloudFront, Route53, Global Accelerator |
| **Analytics** | Kinesis, MSK (Kafka), Glue, Athena, OpenSearch, EMR, DataBrew, CodeArtifact |
| **Messaging** | SNS, SQS, Amazon MQ (ActiveMQ + RabbitMQ), EventBridge |
| **AI / ML** | SageMaker (all types), Bedrock (Agents, Guardrails, Flows, Prompts, Knowledge Bases), Comprehend, Rekognition, Kendra, Lex v2 |
| **Security** | KMS, ACM, WAFv2, Macie, Cognito, GuardDuty, Verified Permissions, Detective |
| **Integration** | Step Functions, EventBridge, API Gateway (REST + HTTP + WebSocket), AppSync |
| **Developer Tools** | CodeBuild, CodeDeploy, CodePipeline, Amplify, CodeArtifact, CodeGuru |
| **Migration** | Transfer Family, DataSync, DMS |
| **IoT** | IoT Greengrass, IoT SiteWise, IoT TwinMaker |
| **Media** | IVS (Channels + Chat), MediaConvert, MediaPackage |
| **Emerging** | AWS Supply Chain, HealthLake, Omics, DataZone, Q Business, Location Service, Pinpoint |
| **Other** | AppStream 2.0, WorkSpaces Web, MWAA, GameLift, Service Catalog, Clean Rooms |

> **Not taggable** (AWS platform limitations, not a tool issue): IoT Things, Lambda Layers, Glue Tables (only taggable at creation), Individual EventBridge Schedules, CloudWatch Log Streams.

---

## Deployment

### The customer generates one file

The customer opens `configurator.html` in a browser, fills in the MAP Engagement ID and details, and downloads a single `deploy.sh` script. Everything is self-contained inside it.

### The customer runs one command

```
Customer opens AWS CloudShell → uploads deploy.sh → runs: bash deploy.sh
```

That's it. CloudShell is built into the AWS Console — already authenticated, no setup needed.

### What happens automatically

```
┌────────────────────────────────────────────────────┐
│  bash deploy.sh                                    │
│                                                    │
│  ├── Creates S3 bucket (in customer's account)     │
│  ├── Discovers organization structure              │
│  ├── Deploys CloudFormation stack                  │
│  └── Rolls out to all accounts via StackSet        │
│                          ↓                         │
│         Account A    Account B    Account C        │
│         own Lambda   own Lambda   own Lambda       │
│         tags own     tags own     tags own         │
│         resources    resources    resources        │
└────────────────────────────────────────────────────┘
```

New accounts added to the organization automatically receive the auto-tagger.

### Multi-Region Coverage

Global services like CloudFront and Route53 require a Lambda in us-east-1. The deploy script handles this automatically by deploying to the necessary regions.

---

## Cost

| Component | Monthly Cost |
|-----------|-------------|
| Lambda (runs ~100–1,000×/day) | $0.10 – $2.00 |
| EventBridge events | $0.01 – $0.20 |
| CloudTrail (existing) | $0.00 |
| SSM Parameter Store | $0.00 |
| **Total per account** | **< $2/month** |

For a 50-account organization: **< $100/month** to protect potentially **millions in MAP credits**.

---

## What the Customer Needs to Do

1. **Open** `configurator.html` in a browser, fill in their MAP Engagement ID and details, and download `deploy.sh`
2. **Open CloudShell** in the AWS Console and upload the file
3. **Run** `bash deploy.sh` — that's it
4. **Nothing else** — the tool runs automatically from that point forward

Optional: Subscribe an email address to the alert topic to receive notifications if any tagging errors occur.

---

## Proven & Tested

The tool has been validated through **extensive multi-phase end-to-end testing**:

**Phase 1** — 12+ hours of continuous testing in a single AWS account (ap-northeast-2):
- **150+ resource types** created and tags verified
- **384 unique AWS resources** tagged
- **55+ bugs** discovered and fixed

**Phase 2 & 3** — Multi-account org validation across 9 AWS accounts (single account + org with 5 linked + 2 security OU accounts):
- **190+ resource types** confirmed working
- **500+ resources** tagged across all accounts
- All 88 MAP 2.0 eligible services verified against the official Included Services List
- All MAP 2.0 eligible services tested (including Bedrock KBs, EMR Serverless, IoT, Media, Emerging)
- Discontinued/new-account-gated services documented

**Total: 100+ bugs fixed | Zero false positives**

---

## Known Limitations

| Limitation | Impact | Notes |
|-----------|--------|-------|
| Only tags **new** resources | Existing untagged resources are not affected | Use a separate bulk-tagging tool for backfill |
| 60–90 second delay | Resources are not tagged instantly | Acceptable for MAP credit purposes |
| ElastiCache, NAT Gateways | 2-5 min provisioning delay | Tag applied once resource becomes available |
| ECS tasks | Require `propagateTags: SERVICE` in ECS service config | Customer setting, not auto-configurable |
| EKS Auto Mode nodes | Node tagging requires NodePool configuration | Customer architecture change needed |
| Global services | CloudFront/Route53/IVS require Lambda in us-east-1 | Handled automatically by deploy script |

---

## How to Generate a Deployment Script

Open **`configurator.html`** in a browser:

1. Enter the **MAP Engagement ID** and **agreement start date** from AWS Investments
2. Select **Single Account** or **Multiple Accounts**
3. For multiple accounts, the tool automatically targets all accounts in the org
4. Click **Generate & Download** → downloads a ready-to-deploy `deploy.sh`

The configurator takes ~2 minutes and produces a fully self-contained script with the MAP Engagement ID pre-filled.

---

## Summary

| What | Detail |
|------|--------|
| **Purpose** | Auto-tag AWS resources for MAP 2.0 credits |
| **Coverage** | 190+ resource types, all major AWS services |
| **Latency** | typically 60–90 seconds (up to 15 minutes during high-volume activity) from creation to tagged |
| **Deployment** | 1 command in CloudShell (single or org-wide) |
| **Cost** | < $2/month per account |
| **Customer effort** | Run one script, zero ongoing maintenance |
| **Testing** | Multi-account org validation, 100+ bugs fixed, zero false positives |
