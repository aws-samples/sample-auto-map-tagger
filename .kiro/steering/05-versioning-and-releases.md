# 05 — Versioning and Releases

> ⚠️ Canonical copy: `.kiro/steering/`. Edit there, then run `npm run sync-rules` — the sync is **one-way** (kiro → claude) and overwrites `.claude/rules/`.

Full policy in `VERSIONING.md`. Summary below.

## Semantic versioning with "MAJOR = customer must take action"

Versions are `vMAJOR.MINOR.PATCH` (e.g., `v22.0.0`).

| Change | Bump |
|---|---|
| Customer must delete/redeploy, migrate scripts, or regenerate `deploy.sh` for the change to work safely | **MAJOR** |
| New capability, new CFN output, new behavior — safe in-place update for existing deployments | **MINOR** |
| Bug fix, defensive hardening, CI-only change, docs — **even a CRITICAL bug fix stays PATCH** | **PATCH** |

The classifier is *customer impact*, not code size. A critical scope bug fix is still PATCH if it's a safe in-place update.

## Single source of truth for the version

`src/js/constants.js` → `const TEMPLATE_VERSION = 'vN.N.N';` — the only place the version lives. Both build outputs (`npm run build` → HTML, `npm run build:yaml` → YAML) read it, so drift is impossible.

Customers see the version via: CFN Output `TemplateVersion`, SSM parameter `/auto-map-tagger/${MpeId}/version`, and the Lambda cold-start log line.

## Release notes must state the upgrade path

Every release note classifies the upgrade for customers:

> **Upgrade-safe** (use `upgrade.sh` or re-run `deploy.sh`): additive changes — new service coverage, or new CFN parameters **with safe defaults**. `upgrade.sh` sets `UsePreviousValue=true` only for parameters that already exist in the deployed stack; a newly added parameter falls through to its template `Default` (e.g. #108's `CentralAlertAccountId`, `Default: ''`).
>
> **Full redeploy required** (delete + `deploy.sh`): structural template changes, or new parameters that need a customer-supplied value to work correctly.

## Release tagging (after PR merges to main)

```bash
git tag vN.N.N <squash-commit-sha>
git push aws-samples vN.N.N
gh release create vN.N.N --title "vN.N.N — <summary>" --notes-from-tag
```

Customers who "Watch → Releases only" get notified — this is the update channel (no outbound calls from the deployed Lambda).
