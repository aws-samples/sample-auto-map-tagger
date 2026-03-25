# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [v19.1] - 2026-03-25

### Fixed (configurator.html + map2-auto-tagger-optimized.yaml) — E2E test findings

**Configurator-generated template bugs:**
- EventBridge rule exceeded 2048 char limit (explicit event list) → switched to prefix matching (`Create*`, `Run*`, `Put*`, etc.)
- `scoped_account_ids` stored as `["111,222"]` instead of `["111","222"]` → fixed JSON embedding
- VPC scope: `RunInstances` VPC ID not extracted (nested in `responseElements.instancesSet.items[0].vpcId`) → added nested lookup
- `ssm:GetParameters` (plural) permission missing → added to `MinimalReads` IAM Sid
- Lambda tried to tag its own config SSM parameter → added skip for `CONFIG_PARAM`
- `cloudformation:ListStackSetOperations` missing from deploy role → added
- SERVICE_MANAGED StackSet `Accounts` targeting not supported by AWS (hard constraint) → always use root OU; account filtering via Lambda `scoped_account_ids` config
- 15+ ARN field names missing from `ARN_FIELDS` (fileSystemArn, repositoryArn, etc.) → synced with standalone YAML
- Transit Gateway: CloudTrail response sometimes wraps in `CreateTransitGatewayResponse` → added fallback
- Glue Database, Workflow, Crawler, Trigger: no ARN construction → added handlers
- API Gateway REST: `apigateway:PATCH` permission missing → added
- ALB, NLB: ARN in `resp.loadBalancers[0]` (list) not scanned → added `CreateLoadBalancer` handler
- CodeDeploy App, Athena Workgroup, Glue Job, CodeArtifact Domain: no ARN construction → added handlers
- ENI (CreateNetworkInterface): nested response structure → added handler
- Deploy Lambda race condition (`OperationInProgressException`) → added wait loop for in-progress operations
- `CreateAutoScalingGroup` ARN construction missing (ASG doesn't return ARN in response) → added handler

**Both templates:**
- VPC scope: `RunInstances` VPC detection fixed (same bug in standalone YAML)

**THREAT-MODEL.md updated:**
- EventBridge prefix pattern justified (AWS 2048-char hard limit)
- StackSet all-accounts deployment documented as AWS architectural constraint with Lambda-level mitigation
- `apigateway:PATCH` — MAP Taggr precedent noted (they grant all 5 methods; we grant only PUT+PATCH)
- Residual risks updated

---

## [v19.1] - 2026-03-25

### Security
- Fixed ACAT finding: added `KmsMasterKeyId: alias/aws/sns` to SNS topic in both templates (commit 050d303)

### Process
- TALOS security engagement submitted (Review Requested) — SIM V2151667500
- THREAT-MODEL.md updated: EventBridge prefix justification, StackSet all-accounts constraint documented, apigateway:PATCH MAP Taggr precedent noted

---

## [v19] - 2026-03-24

### Added (configurator.html)
- **Agreement End Date** field — Lambda skips tagging after end date (`is_within_agreement` checks both start and end)
- **Alert Email** field — creates `AWS::SNS::Subscription` automatically if provided (customer ops team email only)
- **Retry Queue** — SQS-based retry mechanism for failed tagging attempts; retries up to 3x at 5/10/15 min delays; exhausted retries go to DLQ → SNS alert. Solves timing failures for ElastiCache, NAT Gateway, EMR
- **Preflight checks** in `deploy.sh` — verifies AWS credentials, CloudTrail, CloudFormation permissions before deploying; multi-account also checks Organizations access and StackSets trusted access
- `.gitattributes` — `configurator.html` marked `export-ignore` (internal AWS use only, excluded from public distribution)

### Fixed (configurator.html)
- **Multi-account targeting** — StackSet now correctly uses `Accounts` targeting when specific account IDs are entered; falls back to root OU for all-accounts mode. Previously, entered account IDs were ignored and always deployed to entire org
- **Account scope filter** — `scoped_account_ids` in SSM now stored as proper JSON array `["111","222"]` instead of broken `["111,222"]`. `is_in_scope` now correctly filters by account ID
- **VPC scope** — fixed same JSON array bug for `scoped_vpc_ids`; added actual VPC scope logic to configurator Lambda (was stored in SSM but never checked); VPC scope card now hidden in multi-account mode (VPC IDs are account-specific and cannot be shared across accounts)
- **SSM parameter** — removed `!Sub` + CloudFormation variable approach for `scoped_account_ids` and `scoped_vpc_ids`; values now embedded directly as proper JSON at template generation time
- Removed `ScopedAccountIds` and `ScopedVpcIds` CF parameters and `IsAccountAll`/`IsVpcNone` conditions (no longer needed)

### Changed (configurator.html)
- Prerequisite checkboxes replaced with red disclaimer info box, moved to Step 3 (Download)
- MAP Engagement ID label → "MAP 2.0 Tag Value (ex. migA1B2C3D4E5)"
- Agreement start/end dates have descriptive hints
- Customer Name moved to first field, hint "(used for filename generation only)"
- Customer Name + MPE ID used in downloaded filenames (e.g. `deploy-acme-corp-migA1B2.sh`)
- Alert email input full-width, hint text updated
- VPC scope moved inside deployment mode card as collapsible (Single Account only)
- Non-VPC services checkbox moved to top of VPC scope section for visibility
- Email input height fixed (added `input[type="email"]` to CSS selector)
- `configurator.html` marked as internal AWS BD tool only — excluded from public distribution via `.gitattributes`

---

## [v18] - 2026-03-24

### Security
- Removed `sts:AssumeRole` on wildcard accounts from default template (not needed for StackSet deployment)
- Removed 10 permissions for discontinued/retired services (QLDB, RoboMaker, Data Pipeline, OpsWorks, SWF, Lookout services, Forecast, Lake Formation)
- Removed 7 invalid IAM action names identified by IAM Access Analyzer (`emr:AddTags`, `kinesisanalyticsv2:TagResource`, `mwaa:TagResource`, `acm-pca:TagResource`, `servicecatalog:UpdateTagsForResource`, `catalog:TagResource`, `bedrock-agent:TagResource`)
- Added SECURITY NOTE comments on permissions that appear broad but are required by AWS platform design (`apigateway:PUT`, `cloudformation:UpdateStack`, `servicecatalog:UpdateProduct`, `codebuild:UpdateProject`)
- Added explicit CloudWatch Log Group with 90-day retention

### Added
- `THREAT-MODEL.md` — STRIDE threat model, trust boundaries, residual risks (AppSec artifact)
- Non-production disclaimer in README
- Apache 2.0 license headers in all source files
- IAM Access Analyzer run — 0 findings after remediation

---

## [v17] - 2026-03-22

### Fixed
- IAM regression fixes — added `glue:GetDatabase`, `codebuild:BatchGetProjects`, `iam:TagRole` (removed in v16 security pass)

---

## [v16] - 2026-03-21

### Security
- Removed `ReadOnlyAccess` managed policy — replaced with scoped `MinimalReads` Sid
- Removed `apigateway:PATCH` and `apigateway:POST`
- Removed 32 duplicate IAM permission entries
- Fixed S3 `PutBucketTagging` feedback loop — Lambda now checks existing tag before applying
- Fixed CloudWatch logger bug

---

## [v15] - 2026-03-20

### Added
- Bedrock Agent Aliases (`agentAliasArn`)
- Bedrock Agent Action Groups (construct ARN from IDs)
- Bedrock Knowledge Base Data Sources
- Bedrock Prompt Versions (`promptVersionArn`)
- Bedrock Provisioned Throughput (`provisionedModelArn`)

---

## [v14] - 2026-03-18

### Fixed
- Added `servicecatalog:UpdateProduct` permission (required for Service Catalog tagging)

---

## [v1–v13] - 2026-02 to 2026-03

### Summary
- Initial implementation and iterative bug fixes across 190+ resource types
- Full E2E testing in CT org (4 accounts × 4 regions = 16 StackSet instances)
- 79+ bugs found and fixed across two test phases
