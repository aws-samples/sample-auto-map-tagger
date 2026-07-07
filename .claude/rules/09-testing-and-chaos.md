# 09 — Testing and Chaos Engineering

> ⚠️ Canonical copy: `.kiro/steering/`. Edit there, then run `npm run sync-rules` — the sync is **one-way** (kiro → claude) and overwrites `.claude/rules/`.

## The F-finding taxonomy

Bugs found in chaos testing are catalogued as `F###` findings. **Every fix references its finding ID, the version it shipped in, and lands with a regression test.** Example commit: `fix: F034, F031, F017, F026, F041 — validation and lifecycle UX (v21.0.4)`.

When you fix a chaos-test finding, follow the pattern: cite the F-number, add the regression test, note the version.

(Context: the project is hardened through multi-account chaos-test waves run against real AWS resources by the maintainers — that infrastructure is not in this repo, but the F-findings it produces are cited throughout the git history.)

## Unit tests (Vitest) — run every change

```bash
npm test    # build output, service defs, i18n completeness, Lambda logic
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
