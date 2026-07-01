# 01 — Project Overview

> ⚠️ These rules are mirrored in `.kiro/steering/` (Kiro) and `.claude/rules/` (Claude Code). Edit one, then run `npm run sync-rules` to sync the other.

## What this project is

The **MAP 2.0 Auto-Tagger** automatically applies the `map-migrated` tag to newly created AWS resources so customers capture AWS Migration Acceleration Program (MAP) credits they would otherwise lose. Tags cannot be back-dated — a missed tag is permanently lost credit.

## Two planes

1. **Configuration plane (client-side)**: `configurator.html` — a self-contained browser app that generates deployment scripts (`deploy.sh`, `delete.sh`, `upgrade.sh`). Built from modular sources in `src/`.
2. **Runtime plane (AWS cloud)**: an event-driven pipeline that runs in the customer's account.

## Runtime flow

```
Resource created → CloudTrail → EventBridge → SQS → Lambda → Resource Groups Tagging API
                                                      │ (fail x5)
                                                      ▼
                                              DLQ → CloudWatch Alarm → SNS
```

SQS buffers events (14-day retention, 5 retries × 180s) to handle slow-provisioning resources (Aurora, ElastiCache Serverless, MSK Serverless take 3–10 min to become taggable).

## Directory map — where things live

```
src/
├── html/configurator.html      HTML skeleton (BUILD:CSS / BUILD:JS placeholders)
├── css/styles.css              All styles
├── js/
│   ├── constants.js            TEMPLATE_VERSION (single source of truth for version)
│   ├── app.js                  Entry: generateAndDownload(), downloadFile()
│   ├── shared/ui.js            selectMode(), step navigation
│   ├── i18n/                   engine.js + 7 locale files (en, ja, ko, th, vi, id, zh)
│   ├── services/               ~85 per-service definition files + index.js
│   ├── deploy/                 deploy-flow.js, template-main.js, template-org.js, script-deploy.js
│   ├── delete/                 delete-flow.js
│   ├── editor/ upgrade/        flow files (some disabled — kept for reference)
└── templates/lambda-handler.py Auto-tagger Lambda (standalone Python, embedded at build)

scripts/          build.js, verify-build.js, build-yaml.js
.github/scripts/  ops + lint (deploy_stackset, verify_tags, audit_handler_coverage, lint_*)
docs/             all documentation (OVERVIEW, INSTRUCTIONS, COVERAGE, LIMITATIONS, ...)
tests/unit/       Vitest unit tests
```

## Golden rule

`configurator.html` and `configurator.yaml` are **generated build artifacts**. Never edit them directly — edit `src/` and run `npm run build`. See `02-build-system`.
