# Component Inventory — MAP 2.0 Auto-Tagger

## Frontend Components (Configurator)

| Component | File | Responsibility |
|---|---|---|
| App Entry | `src/js/app.js` | Initialize configurator, wire flows, load i18n |
| Constants | `src/js/constants.js` | Shared config, defaults, resource type registry |
| Deploy Flow | `src/js/deploy/deploy-flow.js` | Deployment form UI, input validation |
| Deploy Script Generator | `src/js/deploy/script-deploy.js` | Generate `deploy.sh` with embedded CFN |
| Template (Main) | `src/js/deploy/template-main.js` | Single-account CloudFormation template |
| Template (Org) | `src/js/deploy/template-org.js` | Multi-account StackSet template |
| Instructions | `src/js/deploy/instructions.js` | Post-deploy guidance text |
| Delete Flow | `src/js/delete/delete-flow.js` | Removal UI, generate `delete.sh` |
| Upgrade Flow | `src/js/upgrade/upgrade-flow.js` | Upgrade UI, generate `upgrade.sh` |
| Editor Flow | `src/js/editor/editor-flow.js` | Edit existing deployment config |
| i18n Engine | `src/js/i18n/engine.js` | Language switching, string resolution |
| Language Packs | `src/js/i18n/{en,ja,ko,th,vi,id,zh}.js` | Translated strings (7 languages) |
| Shared UI | `src/js/shared/ui.js` | Common UI helpers |
| Service Definitions | `src/js/services/*.js` | 85 files defining event patterns per AWS service |
| Service Index | `src/js/services/index.js` | Aggregates all service definitions |

## Backend Components

| Component | File | Responsibility |
|---|---|---|
| Lambda Handler | `src/templates/lambda-handler.py` | Process SQS events, extract ARNs, apply tags |

## Build & Scripts

| Component | File | Responsibility |
|---|---|---|
| Build | `scripts/build.js` | Assemble `configurator.html` from `src/` |
| Build YAML | `scripts/build-yaml.js` | Generate CFN YAML |
| Verify | `scripts/verify-build.js` | Sanity-check built output |
| Add Subscriber | `scripts/add_subscriber.sh` | Add SNS alert subscriber |

## CI/CD & Ops Scripts (.github/scripts/)

| Component | Responsibility |
|---|---|
| `deploy_stackset.py` | Deploy StackSet across accounts |
| `delete_stackset.py` | Remove StackSet |
| `wait_stackset.py` | Poll StackSet operation status |
| `verify_tags.py` | E2E verification that resources got tagged |
| `create_resources.py` | E2E: create test resources |
| `teardown.py` | E2E: clean up test resources |
| `audit_handler_coverage.py` | Ensure every service has a handler |
| `lint_cfn_correctness.py` | Validate CloudFormation |
| `lint_shell_injection.py` | Security lint for generated scripts |
| `generate_iam.py` | Generate least-privilege IAM policies |
| `nightly_cleanup_guard.py` | Prevent orphaned test resources |

## Component Count Summary

| Category | Count |
|---|---|
| Frontend flow modules | 4 (deploy, delete, upgrade, editor) |
| Service definitions | 85 files → 154 resource types |
| Language packs | 7 |
| Backend handlers | 1 Lambda (with 154 ARN extractors) |
| CI/CD scripts | ~19 |
| Unit test suites | 7 |
