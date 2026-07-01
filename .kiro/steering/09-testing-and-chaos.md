# 09 — Testing and Chaos Engineering

> ⚠️ Mirrored in `.kiro/steering/` and `.claude/rules/`. Run `npm run sync-rules` after edits.

## The F-finding taxonomy

Bugs found in chaos testing are catalogued as `F###` findings. **Every fix references its finding ID, the version it shipped in, and lands with a regression test.** Example commit: `fix: F034, F031, F017, F026, F041 — validation and lifecycle UX (v21.0.4)`.

When you fix a chaos-test finding, follow the pattern: cite the F-number, add the regression test, note the version.

## Chaos-testing discipline (CT waves)

The project is hardened through chaos-test waves (CT2–CT5) run against **real AWS resources across a 9-account pool**. The final wave (CT5) ran 708 tests across 25 phases. The pattern:

1. Create resources of every supported type (`create_resources.py`)
2. Wait ~90 seconds
3. Verify every resource received `map-migrated` (`verify_tags.py`)
4. Tear down (`teardown.py`); `nightly_cleanup_guard.py` prevents orphans

## Unit tests (Vitest) — run every change

```bash
npm test    # 35 tests: build output, service defs, i18n completeness, Lambda logic
```

## CI lint layers — respect all of them

| Linter | Gate |
|---|---|
| `lint_cfn_correctness.py` | Valid CloudFormation |
| `lint_shell_injection.py` | Generated scripts safe from injection |
| `audit_handler_coverage.py` | Every service definition has a Lambda handler (parity) |
| `lint_event_prefixes.py` | Event pattern naming consistency |
| `lint_batchsize_floor.py` | SQS batch size floor |
| cfn-guard / cfn-nag / bandit | Advisory security scanners |

## Post-deploy verification pattern

```bash
aws s3 mb s3://test-map-$(date +%s) && sleep 90
aws s3api get-bucket-tagging --bucket test-map-XXXXX
# Expect: {"TagSet": [{"Key": "map-migrated", "Value": "mig..."}]}
```

## Rule

A change that touches tagging logic or a service handler is not done until it's verified end-to-end (or has a clear reason it can't be, stated explicitly).
