# Architecture — MAP 2.0 Auto-Tagger

## System Overview

A serverless, event-driven AWS resource tagging system with a browser-based self-service configurator. Two distinct planes:

1. **Configuration plane** (client-side): `configurator.html` — a self-contained browser app that generates deployment scripts
2. **Runtime plane** (AWS cloud): event-driven tagging pipeline running in the customer's account

## Runtime Architecture (Event-Driven Tagging Pipeline)

```
+-------------------------------------------------------------------+
|                     CUSTOMER AWS ACCOUNT                           |
|                                                                    |
|   Resource created (EC2, RDS, S3, Lambda, VPC, ...154 types)      |
|          │                                                         |
|          ▼  (~5s)                                                  |
|   +------------------+                                             |
|   |   CloudTrail     |  Records creation API call                  |
|   +--------+---------+                                             |
|            │  (~30-60s)                                            |
|            ▼                                                       |
|   +------------------+                                             |
|   |   EventBridge    |  Rule matches creation events               |
|   +--------+---------+                                             |
|            │                                                       |
|            ▼                                                       |
|   +------------------+                                             |
|   |   Amazon SQS     |  Buffer (14-day retention, 5 retries)       |
|   +--------+---------+                                             |
|            │                                                       |
|            ▼                                                       |
|   +------------------+     +------------------+                    |
|   | Auto-Tagger      |---->| Resource Groups  |                    |
|   | Lambda (Python)  |     | Tagging API      |                    |
|   +--------+---------+     +------------------+                    |
|            │ (fail x5)                                             |
|            ▼                                                       |
|   +------------------+     +-----------+     +-----------+         |
|   | Dead Letter Queue|---->| CloudWatch|---->|    SNS    |         |
|   +------------------+     |   Alarm   |     |  (email)  |         |
|                            +-----------+     +-----------+         |
|                                                                    |
|   +------------------+                                             |
|   | SSM Parameter    |  Stores scope config (accounts, VPCs)      |
|   | Store            |                                             |
|   +------------------+                                             |
+-------------------------------------------------------------------+

Multi-account: deployed via CloudFormation StackSet from management account
```

## Configuration Plane (Configurator)

```
+-------------------------------------------------------------------+
|                  configurator.html (browser)                       |
|  Built from src/ via scripts/build.js (single-file output)        |
|                                                                    |
|  +------------+  +------------+  +------------+  +------------+   |
|  | Deploy     |  | Delete     |  | Upgrade    |  | Editor     |   |
|  | Flow       |  | Flow       |  | Flow       |  | Flow       |   |
|  +------------+  +------------+  +------------+  +------------+   |
|                                                                    |
|  +----------------------------------------------------------+    |
|  | i18n Engine (en, ja, ko, th, vi, id, zh)                 |    |
|  +----------------------------------------------------------+    |
|                                                                    |
|  +----------------------------------------------------------+    |
|  | Service Definitions (85 service .js files → 154 types)   |    |
|  +----------------------------------------------------------+    |
|                                                                    |
|  Output: deploy.sh / delete.sh / upgrade.sh (CFN embedded)        |
+-------------------------------------------------------------------+
```

## Key Components

### Configurator (Frontend — Vanilla JS)
- **Technology**: Vanilla JavaScript, HTML, CSS — no framework (portability, single-file)
- **Build**: `scripts/build.js` assembles modular `src/` into single `configurator.html`
- **Flows**: deploy, delete, upgrade, editor
- **i18n**: 7 languages (en, ja, ko, th, vi, id, zh)
- **Service definitions**: One `.js` per AWS service under `src/js/services/`

### Auto-Tagger Lambda (Backend — Python)
- **File**: `src/templates/lambda-handler.py`
- **Trigger**: SQS event source
- **Logic**: Parse CloudTrail event → extract ARN → call Resource Groups Tagging API
- **Coverage**: 154 resource types with per-service ARN extraction handlers

### Infrastructure (CloudFormation)
- **Templates**: generated by `template-main.js` and `template-org.js`
- **Resources**: EventBridge rules, SQS + DLQ, Lambda, IAM roles, SSM parameters, CloudWatch alarms, SNS
- **Deployment**: single-account (Stack) or multi-account (StackSet)

## Data Flow

1. Customer creates any AWS resource
2. CloudTrail records the creation API call (~5s)
3. EventBridge rule matches the event pattern (~30-60s)
4. Event pushed to SQS (buffered, retryable)
5. Lambda polls SQS, extracts resource ARN via service-specific handler
6. Lambda calls Resource Groups Tagging API to apply `map-migrated` tag
7. On success: resource tagged. On 5x failure: event → DLQ → CloudWatch alarm → SNS email

## Why SQS Buffer?

EventBridge → Lambda direct has a 24h retry limit. Slow-provisioning resources (ElastiCache Serverless, Aurora, MSK Serverless) take 3-10 min to become taggable. SQS provides 14-day retention, 5 retries with 180s visibility timeout, and a DLQ for failed events.
