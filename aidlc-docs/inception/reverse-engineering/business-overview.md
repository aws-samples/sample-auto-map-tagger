# Business Overview — MAP 2.0 Auto-Tagger

## Business Domain

**Industry**: AWS Cloud Migration / FinOps (Migration Acceleration Program)
**Users**: AWS Solutions Architects, Customer Solutions Managers, and customer cloud engineering teams
**Purpose**: Automatically apply `map-migrated` tags to AWS resources so customers capture MAP 2.0 migration credits they would otherwise lose.

## The Business Problem

AWS MAP 2.0 grants migration credits for workloads moved to AWS — but only for resources tagged with `map-migrated`. Customers routinely lose credits because:

- Engineers forget to tag resources at creation time
- Resources created by scripts, pipelines, or IaC tools are untagged
- Dependent resources (EBS volumes, snapshots, read replicas) are auto-created untagged
- Tags cannot be back-dated — a missed tag is permanently lost credit

**Example impact**: A customer migrating 200 EC2 instances but missing tags on 30 loses ~$32,000 in credits over 6 months.

## Business Transactions

### 1. Self-Service Deployment
- SA/CSM opens `configurator.html`, enters MAP Engagement ID and scope
- Generates a self-contained `deploy.sh` (CloudFormation embedded)
- Customer runs one command in CloudShell — solution deploys

### 2. Automatic Tagging (core value)
- Any AWS resource created → CloudTrail event → EventBridge → SQS → Lambda
- Lambda extracts the resource ARN and applies the `map-migrated` tag
- Typically completes within 60–90 seconds, no human action required

### 3. Scope Management (Day-2)
- Add/remove accounts via StackSet update
- Scope by account, VPC, or organization
- Configuration persisted in SSM Parameter Store

### 4. Lifecycle Operations
- Upgrade to new service coverage (upgrade-safe or full redeploy)
- Clean removal (delete.sh) — preserves existing tags (credits intact)
- Backfill mode — catch resources created during deployment gaps

## Value Proposition

- Captures MAP credits that would otherwise be lost (direct financial value)
- Zero engineering effort for the customer — runs silently in background
- No agents, no code changes, no API integration required
- Covers 154 AWS resource types across all major service categories
- < $2/month operational cost per account

## Key Stakeholders

| Stakeholder | Interest |
|---|---|
| AWS SA / CSM | Deploy for customers, maximize captured credits |
| Customer cloud engineers | Zero-effort tagging, no workflow disruption |
| Customer finance/FinOps | Maximize MAP credit realization |
| AWS MAP program | Accurate credit attribution |
