# MAP 2.0 Auto-Tagger — Requirements Document

## Intent Analysis

| Field | Value |
|-------|-------|
| **Request Type** | New Project (greenfield build of an event-driven tagging system) |
| **Scope** | System-wide (configurator UI + Lambda tagger + IaC + CI/CD) |
| **Complexity** | High (154 resource types, multi-account, event-driven, self-service) |
| **Purpose** | Capture MAP 2.0 migration credits by auto-tagging AWS resources |
| **Target Users** | AWS SA/CSM (deployers), customer cloud engineers (beneficiaries) |

## Functional Requirements

### FR-01: Self-Service Configurator
- Browser-based single-file HTML app (no server, no install)
- Input: MAP Engagement ID (MPE), agreement start/end dates, scope
- Output: self-contained `deploy.sh` with embedded CloudFormation
- Multi-language support (en, ja, ko, th, vi, id, zh)
- Input validation before script generation

### FR-02: Automatic Resource Tagging
- Detect creation of any supported AWS resource via CloudTrail
- Apply `map-migrated` tag with value derived from MPE ID
- Complete tagging within 60–90 seconds of resource creation
- Cover 154 resource types across all major AWS service categories

### FR-03: Event-Driven Pipeline
- CloudTrail → EventBridge → SQS → Lambda architecture
- SQS buffer with 14-day retention and 5 retries (180s visibility)
- Dead Letter Queue for failed events
- CloudWatch alarm + SNS email alert on DLQ activity

### FR-04: Multi-Account Deployment
- Single-account (CloudFormation Stack) mode
- Multi-account (StackSet) mode from management account
- Scope by account IDs, VPC IDs, or organization
- Configuration persisted in SSM Parameter Store

### FR-05: Scope Management (Day-2)
- Add/remove accounts without full redeploy
- Update scope via StackSet update
- Full-replacement semantics for account list
- Retrieve current config from SSM

### FR-06: Lifecycle Operations
- Upgrade path: upgrade-safe (service coverage) vs full redeploy (new params)
- Change-set preview before applying upgrades
- Clean removal (`delete.sh`) preserving existing tags
- Backfill mode to catch resources created during deployment gaps

### FR-07: Per-Service Extensibility
- Each AWS service defined in its own module (`src/js/services/*.js`)
- Add new service by dropping a `.js` file following a standard format
- Per-service ARN extraction logic in Lambda handler

### FR-08: Observability
- CloudWatch metrics for Lambda invocations, failures
- DLQ depth monitoring
- SNS alerts to configured email
- Tag verification tooling

## Non-Functional Requirements

### NFR-01: Cost Efficiency
- Total operational cost < $2/month per account
- Serverless (pay-per-use) — no idle infrastructure

### NFR-02: Reliability
- No event loss (14-day SQS retention)
- Handle slow-provisioning resources (3-10 min taggable delay)
- Failed events preserved in DLQ, never silently dropped

### NFR-03: Security
- Least-privilege IAM (tagging permissions only)
- Generated scripts free of shell injection (linted in CI)
- Customer owns all deployed IAM roles/policies
- No credentials stored in configurator

### NFR-04: Portability
- Configurator is a single HTML file — runs in any browser, offline
- Deploy script runs in CloudShell or local AWS CLI
- No external template hosting dependency

### NFR-05: Maintainability
- Modular source structure (build assembles single file)
- Automated handler coverage audit (every service has a handler)
- Unit + E2E test coverage

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Configurator framework | Vanilla JS (no framework) | Single-file portability, zero runtime deps |
| Build approach | Modular src → single file | Maintainable source, portable output |
| Lambda runtime | Python 3 | boto3 tagging API maturity |
| Event capture | CloudTrail + EventBridge | Agentless, native |
| Buffering | SQS + DLQ | Retry slow resources, preserve failures |
| IaC | CloudFormation (embedded) | Self-contained deploy script |
| Multi-account | StackSet | Org-scale deployment |
| Config store | SSM Parameter Store | Day-2 operations |

## Extension Configuration

| Extension | Enabled | Decided At |
|---|---|---|
| Security Baseline | Yes | Requirements Analysis |
| Property-Based Testing | No | Requirements Analysis |

## Out of Scope

1. Tagging resources AWS APIs don't support (IoT Things, Lambda Layers, Glue Tables post-creation, CloudWatch Log Streams, API Gateway API Keys)
2. Back-dating tags on pre-existing resources (credits can't be back-dated)
3. Cost/credit reporting dashboard (separate concern)
4. Non-AWS cloud providers
