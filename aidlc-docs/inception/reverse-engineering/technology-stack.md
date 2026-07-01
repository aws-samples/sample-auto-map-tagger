# Technology Stack — MAP 2.0 Auto-Tagger

## Frontend (Configurator)

| Component | Technology | Rationale |
|---|---|---|
| Language | Vanilla JavaScript (ES modules) | No framework — single-file portability, zero runtime deps |
| Markup | HTML5 | Static skeleton assembled at build |
| Styling | CSS3 | `src/css/styles.css` |
| Build | Node.js (`scripts/build.js`) | Assembles modular `src/` → single `configurator.html` |
| i18n | Custom engine (`src/js/i18n/engine.js`) | 7 languages, no external i18n library |
| Testing | Vitest | Unit tests for build, services, i18n |
| E2E | Playwright | Browser automation for configurator flows |

## Backend (Auto-Tagger)

| Component | Technology | Rationale |
|---|---|---|
| Runtime | Python 3 (Lambda) | AWS SDK (boto3) maturity for tagging APIs |
| Handler | `src/templates/lambda-handler.py` | Single handler, service-specific ARN extractors |
| Tagging | Resource Groups Tagging API + service APIs | Unified tagging where supported, fallback per-service |

## Infrastructure

| Component | Technology | Rationale |
|---|---|---|
| IaC | CloudFormation (embedded in deploy.sh) | Self-contained, no external template hosting |
| Multi-account | CloudFormation StackSet | Org-wide or scoped account deployment |
| Event capture | CloudTrail + EventBridge | Native, agentless resource creation detection |
| Buffering | Amazon SQS + DLQ | Retry slow-provisioning resources, preserve failures |
| Compute | AWS Lambda | Serverless, event-driven, low cost |
| Config store | SSM Parameter Store | Persist scope config for day-2 operations |
| Alerting | CloudWatch Alarms + SNS | DLQ monitoring, email alerts |
| Permissions | IAM roles/policies | Least-privilege tagging permissions |

## CI/CD

| Component | Technology |
|---|---|
| Pipeline | GitHub Actions (`.github/workflows/`) |
| Workflows | build, lint, e2e, cleanup |
| Linting | Custom Python linters (CFN correctness, shell injection, event prefixes) |
| E2E testing | Playwright across multiple AWS accounts (CT3 chaos testing) |

## Repository Structure

```
sample-auto-map-tagger/
├── configurator.html          # Built output (single file)
├── src/
│   ├── html/                  # HTML skeleton
│   ├── css/                   # Styles
│   ├── js/
│   │   ├── app.js             # Entry point
│   │   ├── constants.js       # Shared constants
│   │   ├── deploy/            # Deploy flow + CFN template generators
│   │   ├── delete/            # Delete flow
│   │   ├── upgrade/           # Upgrade flow
│   │   ├── editor/            # Editor flow
│   │   ├── i18n/              # 7 language files + engine
│   │   ├── services/          # 85 service definition files
│   │   └── shared/            # Shared UI utilities
│   └── templates/
│       └── lambda-handler.py  # Auto-tagger Lambda
├── scripts/                   # build.js, verify-build.js, build-yaml.js
├── tests/unit/                # Vitest unit tests
└── .github/                   # CI/CD workflows and lint scripts
```
