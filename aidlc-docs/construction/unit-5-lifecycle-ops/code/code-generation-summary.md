# Code Generation Summary — unit-5-lifecycle-ops

**Date**: 2026-03-26
**Plan**: `aidlc-docs/construction/plans/unit-5-lifecycle-ops-code-generation-plan.md` (all steps complete)
**Stories**: US-5, US-8, US-9, US-10

This unit produced the generator modules whose output is the three customer-run
lifecycle scripts, plus the CI tooling that guards their hard rules. The
generators are assembled into `configurator.html` by unit-1's build; the
customer never edits the scripts by hand.

## Files Created

### Script generator modules

| File | Purpose |
|---|---|
| `src/js/deploy/script-deploy.js` | Generates `deploy.sh`: strict-mode preamble, read-only preflight suite, region-qualified staging bucket, mode branch (org StackSet with service-managed permissions + AutoDeployment + delegated-admin, or single-account stack), expected-count computation (accounts × regions) feeding the count-then-poll helper, post-verify of outputs/SSM config/version, per-step loud failure reporting (BR-L-02/05/10/11/12) |
| `src/js/delete/delete-flow.js` | Generates `delete.sh`: engagement confirmation, closed-allowlist teardown enumeration scoped to `map-auto-tagger-<mpeId>` only, ordered deletion with waiters, staging-bucket removal, post-teardown verification against the enumeration. **Contains no untag/RemoveTags/DeleteTags code path of any kind** — customer resources and `map-migrated` tags are unreachable by construction (BR-L-01/20/22, NFR-6). Log groups preserved per retention policy (BR-L-21) |
| `src/js/upgrade/` (upgrade flow module) | Generates `upgrade.sh`: preflight (stack exists, state updateable, legacy-shape guard → refusal with explanation), reads the deployed parameter set, issues the update with `UsePreviousValue=true` for every existing parameter and template defaults for new ones, post-verifies version and parameter preservation (BR-L-30/31/32) |

### Shared generated-script scaffolding

Common preamble emitted into all three scripts: `set -euo pipefail`,
loud-failure helpers (no silenced mutating calls), engagement banner stamped
with MPE ID and `TEMPLATE_VERSION`, and the count-then-poll helper that takes
an explicit expected count and treats zero-expected as an error — a poll can
never mistake "nothing was created" for "everything completed" (BR-L-05).

### Preflight suite (emitted into deploy + upgrade)

Four read-only checks run before any mutating call, with all failures
aggregated and reported together (BR-L-04/40/41/42):

- **Peer-tagger collision** — detects other `map-auto-tagger-*` deployments;
  refusal names the conflicting engagement (US-10 AC-1)
- **Scope intersection** — compares this engagement's account/VPC scope against
  other engagements' SSM configs; refusal names both engagements and the
  overlapping accounts
- **IAM capability** — verifies the caller can perform the operation; refusal
  names the missing capability
- **Stack state** — name free (deploy) / updateable (upgrade); refusal names the
  offending state

A refusal exits non-zero with zero side effects (US-10 AC-2).

### CI guards — `.github/scripts/` and tests

| File / test | Purpose |
|---|---|
| `lint_shell_injection.py` | CI-blocking: every user-value interpolation point in generated script content is single-quote contained with `'\''` escaping (BR-L-03, NFR-7, US-2 AC-2) |
| Mutation-silencing lint | Flags `>/dev/null 2>&1 \|\| true` and equivalents on mutating CLI verbs in generated output; cosmetic exceptions require inline justification (BR-L-02, US-5 AC-3) |
| Tag-preservation regression test (hard) | Scans generated `delete.sh` and the delete generator source for every tag-removal API spelling; any hit fails the build (BR-L-01, NFR-6, US-9 AC-2) |
| `tests/unit/` lifecycle suites | Preflight-before-first-mutation ordering; refusal paths mutate nothing; expected-count arithmetic; `UsePreviousValue` for every existing parameter; hostile-input quoting; teardown enumeration confined to this engagement's namespace |

### Documentation

Deploy / upgrade / delete runbooks and refusal-message meanings added to
`docs/INSTRUCTIONS.md`.

## Verification

Shell-injection lint, mutation-silencing lint, and the tag-preservation
regression test green in CI; generator modules assemble through unit-1's build
with `npm run build && npm test && npm run verify` passing.
