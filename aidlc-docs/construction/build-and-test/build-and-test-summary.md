# Build and Test Summary — MAP 2.0 Auto-Tagger

## Build

```bash
npm install          # first time
npm run build        # assemble configurator.html from src/
npm run verify       # sanity-check built output
```

Build assembles modular `src/` into a single `configurator.html`, inlining CSS, JS modules, i18n, service definitions, and the Lambda handler.

## Unit Tests (Vitest)

```bash
npm test
```

| Test Suite | Coverage |
|---|---|
| `build.test.js` | Build output correctness |
| `services.test.js` | Service definition validity |
| `i18n.test.js` | Language pack completeness |
| `lambda.test.js` | Lambda handler logic |
| `deploy-script.test.js` | Generated deploy.sh structure |
| `upgrade-script.test.js` | Generated upgrade.sh structure |

## E2E Tests (Playwright + real AWS)

Chaos testing (CT3) across 9 AWS accounts:
```
1. create_resources.py — provision test resources of every supported type
2. Wait 90s for auto-tagging
3. verify_tags.py — assert every resource received map-migrated
4. teardown.py — clean up test resources
5. nightly_cleanup_guard.py — prevent orphaned resources
```

## CI Gates (.github/workflows/)

| Workflow | Purpose |
|---|---|
| `build.yml` | Build + verify configurator |
| `lint.yml` | CFN correctness, shell injection, event prefixes, batch size |
| `e2e.yml` | Full E2E tagging verification across accounts |
| `cleanup.yml` | Nightly resource cleanup |

## Key Lint Checks

| Linter | Checks |
|---|---|
| `lint_cfn_correctness.py` | Valid CloudFormation |
| `lint_shell_injection.py` | Generated scripts safe from injection |
| `audit_handler_coverage.py` | Every service definition has a Lambda handler |
| `lint_event_prefixes.py` | Event pattern naming consistency |

## Verification (post-deploy)

```bash
aws s3 mb s3://test-map-$(date +%s) && sleep 90
aws s3api get-bucket-tagging --bucket test-map-XXXXX
# Expected: {"TagSet": [{"Key": "map-migrated", "Value": "mig1234567890"}]}
```

## Test Results Summary
- ✅ Unit tests passing
- ✅ Coverage audit: 154/154 resource types have handlers
- ✅ E2E: validated across 9 accounts (CT3 chaos testing)
- ✅ Lint gates: CFN, shell injection, coverage parity
