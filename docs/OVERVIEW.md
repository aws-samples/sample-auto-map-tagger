# MAP 2.0 Auto-Tagger — Overview

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

The MAP Auto-Tagger **automatically applies the `map-migrated` tag to every new AWS resource within typically 60–90 seconds of creation** — with no action required from the customer's team.

It runs silently in the background. Engineers work normally. Credits are captured automatically.

---

## How It Works

```
  Customer creates any AWS resource
  (EC2, RDS, Lambda, S3, VPC, etc.)
          │
          ▼  (~5 seconds)
  ┌──────────────────────────┐
  │      AWS CloudTrail      │
  │  Records creation event  │
  └────────────┬─────────────┘
               │  (~30–60 seconds)
               ▼
  ┌──────────────────────────┐
  │    Amazon EventBridge    │
  │  Matches creation event  │
  └────────────┬─────────────┘
               │
               ▼
  ┌──────────────────────────┐
  │       Amazon SQS         │
  │  Buffers event (14-day   │
  │  retention, 5 retries)   │
  └────────────┬─────────────┘
               │
               ▼
  ┌──────────────────────────┐
  │    Auto-Tagger Lambda    │
  │  Extracts ARN → applies  │
  │  map-migrated tag        │
  └────────────┬─────────────┘
               │
               ▼
  ✅ Resource tagged. Credits captured.

  Failed after 5 retries?
               │
               ▼
  ┌──────────────────────────┐
  │     Dead Letter Queue    │──→ CloudWatch Alarm ──→ SNS Alert
  └──────────────────────────┘
```

**No code changes** required from the customer. **No agents** installed on servers. **No APIs** to integrate.

### Why SQS?

EventBridge → Lambda direct invocation has a 24-hour retry limit. Some resources (ElastiCache Serverless, Aurora clusters, MSK Serverless) take 3–10 minutes to become taggable after creation. The SQS buffer provides:

- **14-day message retention** — events are never lost
- **5 retries with 180s visibility timeout** — covers slow-provisioning resources
- **Dead Letter Queue** — failed events are preserved for investigation, not silently dropped

---

## What Gets Tagged

The auto-tagger covers **140 AWS resource types** across every major service category — all confirmed through real-world testing across 9 AWS accounts.

| Category | Examples |
|----------|---------|
| **Compute** | EC2, Lambda, ECS/EKS, Auto Scaling, EMR, Elastic Beanstalk |
| **Databases** | RDS (all engines), Aurora, DynamoDB, Neptune, Redshift, DocumentDB, MemoryDB, ElastiCache, OpenSearch |
| **Storage** | S3, EFS, FSx (all variants), EBS, AMIs, ECR |
| **Networking** | VPCs, Load Balancers, Transit Gateways, VPN, CloudFront, Route53, Global Accelerator |
| **Analytics** | Kinesis, MSK, Glue, Athena, OpenSearch, EMR, DataBrew |
| **Messaging** | SNS, SQS, Amazon MQ (ActiveMQ + RabbitMQ) |
| **AI / ML** | SageMaker (all types), Bedrock (Agents, Guardrails, Flows, Prompts, Knowledge Bases, AgentCore), Comprehend, Kendra |
| **Security** | KMS, ACM, Cognito, Security Hub |
| **Integration** | Step Functions, API Gateway (REST + HTTP + WebSocket), AppSync |
| **Developer Tools** | CodeBuild, CodePipeline, CloudFormation, Cloud9, Service Catalog |
| **Migration** | Transfer Family, DataSync, DMS (incl. Serverless), Elastic Disaster Recovery |
| **IoT** | IoT Core, IoT SiteWise, IoT Analytics, IoT Events |
| **Media** | MediaConvert, MediaLive, MediaPackage |
| **Emerging** | HealthLake, Omics, AppStream 2.0, Deadline Cloud, Kinesis Video Streams |

> **Not taggable** (AWS platform limitations): IoT Things, Lambda Layers, Glue Tables (only taggable at creation), CloudWatch Log Streams, API Gateway API Keys.

---

## Deployment

### Generate one file

Open `configurator.html` in a browser, fill in the MAP Engagement ID and details, and download `deploy.sh`. Everything is self-contained — templates are embedded in the script.

### Run one command

```
AWS CloudShell → upload deploy.sh → bash deploy.sh
```

The script handles everything automatically:
- Preflight checks (CloudTrail, permissions, StackSet trusted access)
- Deploys CloudFormation stack (single account) or StackSet (multi-account)
- Runs backfill if enabled
- Generates a deployment report

### What gets deployed

| Component | Purpose |
|-----------|---------|
| **Lambda function** | Extracts resource ARN and applies `map-migrated` tag |
| **EventBridge rule** | Catches resource creation events from CloudTrail |
| **SQS queue** | Buffers events with 14-day retention and 5 retries |
| **Dead Letter Queue** | Captures events that fail after all retries |
| **SSM parameter** | Stores MPE ID, agreement date, and scope configuration |
| **SNS topic** | Sends alert notifications on tagging failures |
| **CloudWatch alarms** | Fires on Lambda errors or DLQ activity |
| **S3 bucket** (multi-account only) | Stages CloudFormation templates for the StackSet. Retained after deployment — StackSets require a persistent template URL for new accounts. Contains only the per-account template (~40KB) with Block Public Access, AES-256 encryption, and HTTPS-only enforcement. |

All resources are namespaced by MPE ID (e.g., `map-auto-tagger-mig1234567890`) so multiple MAP engagements can coexist.

### Delegated administrator support

Running `deploy.sh` from a [delegated administrator](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/stacksets-orgs-delegated-admin.html) account is fully supported. The preflight check verifies the caller is either the management account or a registered delegated admin.

### Multi-region coverage

Global services require Lambda in specific regions:

| Service | Required Lambda Region |
|---------|----------------------|
| CloudFront, Route53 | us-east-1 |
| Global Accelerator | us-west-2 |

Deploy to these regions in addition to your primary workload regions.

### Tagging latency

Typically 60–90 seconds from resource creation to tagged. Up to 15 minutes during high API activity. Slow-provisioning resources (ElastiCache, Aurora, NAT Gateways) take 2–10 minutes — handled automatically via SQS retries. See [LIMITATIONS.md](LIMITATIONS.md#tagging-latency) for details.

### Day-2 operations

`configurator.html` provides three post-deployment flows as additional mode cards:

| Need | Mode | Output | What it does |
|---|---|---|---|
| Add/remove accounts from scope | Edit existing deployment | `update.sh` | Rewrites SSM config + StackSet per-account template. No CFN redeploy. |
| Upgrade to latest template version (PATCH/MINOR) | Upgrade to the latest template version | `upgrade.sh` | In-place `update-stack[-set]` with `--use-previous-parameters`. SemVer guard refuses cross-MAJOR. |
| Remove a deployment cleanly | Delete existing deployment | `delete.sh` | Deletes all or scoped MPE deployments in a region. Auto-handles S3 staging bucket. Preserves `map-migrated` tags. Requires typing `delete` to confirm. |

All three are self-contained shell scripts — no outbound calls from the customer's environment. See [INSTRUCTIONS.md](INSTRUCTIONS.md) for details.

---

## How Auto-Deployment Works with SSM Scope

The auto-tagger separates **deployment** (getting the Lambda into an account) from **behavior** (deciding what to tag).

### Deployment vs. behavior

The StackSet deploys the same CloudFormation stack to every account in the organization. Each stack creates a Lambda, EventBridge rule, SQS queue, and SSM parameter.

The SSM parameter (`/auto-map-tagger/{mpe_id}/config`) is the **single source of truth** for runtime behavior:

```json
{
  "mpe_id": "mig1234567890",
  "agreement_start_date": "2024-06-01",
  "scope_mode": "account",
  "scoped_account_ids": ["111111111111", "222222222222"],
  "scoped_vpc_ids": []
}
```

When the Lambda fires, it reads this parameter and checks:
1. Is the current date after the agreement start date? If not → skip.
2. Is this account in `scoped_account_ids`? If `ALL` → tag. If specific IDs and this account isn't listed → skip.
3. If VPC scoping, is this resource in a scoped VPC? If not → skip.

Only after passing all checks does the Lambda apply the `map-migrated` tag.

### New accounts are covered automatically

StackSet auto-deployment is enabled — when a new account joins the org, CloudFormation automatically deploys the stack. The Lambda starts running but defers to SSM for whether to act:

- **`ALL` scoping (default):** New accounts are tagged immediately with zero intervention.
- **Specific account scoping:** The Lambda deploys but no-ops. Use `update.sh` to add the account to scope when ready.

### Multiple MAP engagements

Each engagement deploys its own namespaced stack (`map-auto-tagger-mig111`, `map-auto-tagger-mig222`). Each Lambda reads its own SSM parameter and checks scope independently:

```
Account 333333333333 — resource created

  mig111 Lambda → reads /auto-map-tagger/mig111/config
    → scoped_account_ids: ["111111111111", "222222222222"]
    → 333333333333 not in list → skip

  mig222 Lambda → reads /auto-map-tagger/mig222/config
    → scoped_account_ids: ["333333333333", "444444444444"]
    → 333333333333 in list → tag with map-migrated=mig222
```

**Do not scope the same account to two MPE IDs** — the `map-migrated` tag can only hold one value.

### What each tool does

| Tool | What it does |
|------|-------------|
| `deploy.sh` | Creates StackSet + stack instances. Sets initial SSM parameter. Deploys Lambda to all accounts. |
| `update.sh` | Updates the SSM parameter (adds/removes accounts from scope). Does not deploy or remove Lambdas. |
| `upgrade.sh` | Upgrades an existing deployment to the current template version via `update-stack[-set] --use-previous-parameters`. Preserves scope, agreement dates, VPC config. Refuses cross-MAJOR. |
| `delete.sh` | Deletes all or specified `map-auto-tagger-mig*` Stacks/StackSets. Auto-handles S3 staging bucket (only when no deployments remain). Preserves `map-migrated` tags on resources. |
| Auto-deployment | CloudFormation deploys the stack when a new account joins the org. Lambda defers to SSM for behavior. |

A Lambda in an out-of-scope account has negligible cost — it fires, reads SSM, determines the account is out of scope, and returns in ~100ms.

---

## Cost

| Component | Monthly Cost |
|-----------|-------------|
| Lambda (100–1,000 invocations/day) | $0.10 – $2.00 |
| EventBridge events | $0.01 – $0.20 |
| CloudTrail (existing) | $0.00 |
| SSM Parameter Store | $0.00 |
| **Total per account** | **< $2/month** |

For a 50-account organization: **< $100/month** to protect potentially **millions in MAP credits**.

---

## Summary

| What | Detail |
|------|--------|
| **Purpose** | Auto-tag AWS resources for MAP 2.0 credits |
| **Coverage** | 140 resource types, all 88 MAP-eligible services |
| **Latency** | Typically 60–90 seconds from creation to tagged |
| **Deployment** | 1 file, 1 command in CloudShell |
| **Cost** | < $2/month per account |
| **Customer effort** | Run one script, zero ongoing maintenance |
| **Reliability** | SQS buffering with 14-day retention, DLQ, CloudWatch alarms, SNS alerts |
