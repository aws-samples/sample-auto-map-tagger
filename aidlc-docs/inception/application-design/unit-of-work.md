# Units of Work — MAP 2.0 Auto-Tagger

## Unit 1: Configurator

**Responsibility**: Browser-based self-service UI that generates deployment/delete/upgrade scripts

**Deliverables**:
- `src/html/configurator.html` — HTML skeleton
- `src/css/styles.css` — styling
- `src/js/app.js` — entry point
- `src/js/deploy/` — deploy flow + script generation
- `src/js/delete/`, `src/js/upgrade/`, `src/js/editor/` — other flows
- `src/js/i18n/` — 7 language packs + engine
- `src/js/shared/ui.js` — shared utilities
- `scripts/build.js` — assembles single-file `configurator.html`

**Key Decisions**:
- Vanilla JS (no framework) for portability
- Single-file build output
- 7 languages (en, ja, ko, th, vi, id, zh)

---

## Unit 2: Lambda Tagger

**Responsibility**: Event processing engine that extracts ARNs and applies tags

**Deliverables**:
- `src/templates/lambda-handler.py` — SQS handler + 154 ARN extractors
- Tag application via Resource Groups Tagging API
- Scope filtering from SSM config
- Retry/DLQ handling

**Key Decisions**:
- Python 3 (boto3 maturity)
- Per-service ARN extraction handlers
- Idempotent tagging (safe on retries)

---

## Unit 3: Infrastructure

**Responsibility**: CloudFormation templates and the event pipeline

**Deliverables**:
- `src/js/deploy/template-main.js` — single-account CFN
- `src/js/deploy/template-org.js` — StackSet CFN
- EventBridge rules, SQS + DLQ, Lambda, IAM roles, SSM parameters, CloudWatch alarms, SNS
- `.github/scripts/generate_iam.py` — least-privilege IAM generation

**Key Decisions**:
- Embedded CFN (self-contained deploy.sh)
- SQS buffer (14-day retention, 5 retries, 180s visibility)
- StackSet for multi-account

---

## Unit 4: Service Definitions

**Responsibility**: Define event patterns and coverage for 154 resource types

**Deliverables**:
- `src/js/services/*.js` — 85 service definition files
- `src/js/services/index.js` — registry aggregation
- `.github/scripts/audit_handler_coverage.py` — coverage parity audit

**Key Decisions**:
- One `.js` per service (independent addition)
- Standard definition format
- Automated audit ensures every service has a Lambda handler

---

## Unit 5: Lifecycle Operations

**Responsibility**: Day-2 operations — upgrade, delete, scope management, backfill

**Deliverables**:
- Delete flow + `delete.sh` generation (tag-preserving)
- Upgrade flow + `upgrade.sh` (change-set preview)
- Scope management via StackSet update + SSM
- `.github/scripts/deploy_stackset.py`, `delete_stackset.py`, `wait_stackset.py`
- Backfill capability

**Key Decisions**:
- Upgrade-safe vs full-redeploy paths
- Tag preservation on delete (credits intact)
- Full-replacement account list semantics

---

## Code Organization

```
sample-auto-map-tagger/
├── configurator.html          # Unit 1: built output
├── src/
│   ├── html/, css/            # Unit 1
│   ├── js/
│   │   ├── deploy/            # Unit 1 + Unit 3 (templates)
│   │   ├── delete/, upgrade/  # Unit 5
│   │   ├── editor/            # Unit 1/5
│   │   ├── i18n/              # Unit 1
│   │   └── services/          # Unit 4
│   └── templates/
│       └── lambda-handler.py  # Unit 2
├── scripts/build.js           # Unit 1
└── .github/scripts/           # Unit 3 + Unit 5 (ops)
```
