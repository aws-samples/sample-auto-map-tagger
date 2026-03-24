# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
- Prerequisite checkboxes replaced with a disclaimer info box — preflight checks in `deploy.sh` now enforce requirements at runtime
- `configurator.html` marked as internal AWS BD tool only — not for customer use

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
