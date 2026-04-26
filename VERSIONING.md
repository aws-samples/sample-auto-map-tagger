# Versioning policy

`sample-auto-map-tagger` uses **Semantic Versioning** with a relaxed "MAJOR = customer must take action" definition. Versions are written `vMAJOR.MINOR.PATCH` (for example, `v20.1.0`).

## Bump rules

| Change | Bump |
|---|---|
| Customer must delete/redeploy, migrate scripts, or regenerate `deploy.sh` for this change to work safely | **MAJOR** (`v20.x.y` → `v21.0.0`) |
| New capability, new CFN output, new behavior; safe in-place update for existing deployments | **MINOR** (`v20.0.0` → `v20.1.0`) |
| Bug fix, defensive hardening, CI-only change, documentation | **PATCH** (`v20.1.0` → `v20.1.1`) |

### Examples from recent history

- PR #17 (RGTA throttle fix), PR #19 (SSM slash), PR #20 (4 audit fixes), PR #21 (advisory scanners), #29 (log-group retention), #30 (date pattern), #33 (scope fixes — CRITICAL bug-fixes, still PATCH per policy), #34 (SNS backfill helper), #35 (cross-account rip-out), #38 (scope-intersection preflight) — all PATCH
- PR #14 (E2E expansion), PR #15 (WAFv2 + CodeDeploy handlers), PR #22 (AutoDeployment flip + services grid), PR #37 (three-path error classifier — new runtime behavior, new CloudWatch metric, new IAM, safe in-place update), PR #40 (reconciliation Lambda — new Lambda + schedule + metrics + CFN parameter, safe in-place update) — all MINOR
- PR #24 (version visibility + preflight) — MINOR (new SSM param and CFN Output are new capabilities, safe in-place update)
- Pre-namespacing → namespaced (v-old → v19) — would be MAJOR (customer must delete old stack first)

## Source of truth

The version lives in exactly two places:

1. **`configurator.html`** — `const TEMPLATE_VERSION = 'v20.8.0';` (one occurrence)
2. **`map2-auto-tagger-optimized.yaml`** — Description header, `MapVersion` SSM parameter default, Lambda `TEMPLATE_VERSION` constant, `TemplateVersion` CFN output (all four must equal the configurator constant)

`.github/scripts/sync-check.py` enforces this invariant. Any drift between references is a sync-check failure.

## Where customers see it

- **CFN Output `TemplateVersion`** — surfaces in the CloudFormation console after deploy.
- **SSM Parameter `/auto-map-tagger/${MpeId}/version`** — readable via `aws ssm get-parameter`. Used by `upgrade.sh` for version-guard checks.
- **CloudWatch Logs** — every Lambda cold start prints `auto-map-tagger vN.N.N cold start`.

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
- Cross-version compatibility checks in `upgrade.sh` are out of scope for this policy document — see `upgrade.sh` documentation when that PR lands.
