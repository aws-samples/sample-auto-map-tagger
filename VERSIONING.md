# Versioning policy

`sample-auto-map-tagger` uses **Semantic Versioning** with a relaxed "MAJOR = customer must take action" definition. Versions are written `vMAJOR.MINOR.PATCH` (for example, `v20.1.0`).

## Bump rules

| Change | Bump |
|---|---|
| Customer must delete/redeploy, migrate scripts, or regenerate `deploy.sh` for this change to work safely | **MAJOR** (`v20.x.y` → `v21.0.0`) |
| New capability, new CFN output, new behavior; safe in-place update for existing deployments | **MINOR** (`v20.0.0` → `v20.1.0`) |
| Bug fix, defensive hardening, CI-only change, documentation | **PATCH** (`v20.1.0` → `v20.1.1`) |

### Examples from recent history

- PR #17 (RGTA throttle fix), PR #19 (SSM slash), PR #20 (4 audit fixes), PR #21 (advisory scanners) — all PATCH
- PR #14 (E2E expansion), PR #15 (WAFv2 + CodeDeploy handlers), PR #22 (AutoDeployment flip + services grid) — all MINOR
- PR #24 (version visibility + preflight) — MINOR (new SSM param and CFN Output are new capabilities, safe in-place update)
- Pre-namespacing → namespaced (v-old → v19) — would be MAJOR (customer must delete old stack first)

## Source of truth

The version lives in exactly two places:

1. **`configurator.html`** — `const TEMPLATE_VERSION = 'v20.1.0';` (one occurrence)
2. **`map2-auto-tagger-optimized.yaml`** — Description header, `MapVersion` SSM parameter default, Lambda `TEMPLATE_VERSION` constant, `TemplateVersion` CFN output (all four must equal the configurator constant)

`.github/scripts/sync-check.py` enforces this invariant. Any drift between references is a sync-check failure.

## Where customers see it

- **CFN Output `TemplateVersion`** — surfaces in the CloudFormation console after deploy.
- **SSM Parameter `/auto-map-tagger/${MpeId}/version`** — readable via `aws ssm get-parameter`. Used by `upgrade.sh` for version-guard checks (SemVer comparison).
- **CloudWatch Logs** — every Lambda cold start prints `auto-map-tagger vN.N.N cold start`.

## Post-deployment tooling and the SemVer policy

The configurator generates three post-deployment scripts. Each maps to a different transition:

| Customer need | Script | What it does | Version behavior |
|---|---|---|---|
| Change account scope (add/remove accounts) | `update.sh` (Editor mode) | Rewrites SSM config + StackSet per-account template | Version-agnostic |
| New template version available (PATCH/MINOR) | `upgrade.sh` (Update mode) | `update-stack[-set]` with `--use-previous-parameters` | Reads SSM version, refuses cross-MAJOR |
| Engagement ended / failed deployment / preparing for MAJOR | `destroy.sh` (Destroy mode) | `delete-stack[-set]`, preserves tags | Version-agnostic |

**MAJOR upgrades cannot be handled by `upgrade.sh`.** Resource names change at MAJOR boundaries (e.g. v18 → v19 added MPE-ID namespacing), and CloudFormation's `update-stack` cannot bridge those renames safely. Customers run `destroy.sh` → regenerate `deploy.sh` → `bash deploy.sh` instead.

## Release tagging

After a PR merges to `aws-samples/sample-auto-map-tagger` main:

```
git tag vN.N.N <squash-commit-sha>
git push aws-samples vN.N.N
gh release create vN.N.N --title "vN.N.N — <summary>" --notes-from-tag
```

Customers who "Watch → Releases only" on the GitHub repository get an email when we publish. This is the notification channel for version updates — it doesn't require any outbound calls from the customer's deployed Lambda.

## Not covered by this policy

- Lambda runtime does **not** branch on version. The version string is metadata for humans and external tooling only.
- Per-resource versioning (Lambda versions, Lambda Layers, etc.) is never used.
