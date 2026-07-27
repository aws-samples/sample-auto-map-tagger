# Code Generation Plan — unit-5-lifecycle-ops

**Date**: 2026-03-26
**Phase**: CONSTRUCTION — Code Generation (Part 1: Planning)
**Unit**: unit-5-lifecycle-ops
**Inputs**: functional design at `aidlc-docs/construction/unit-5-lifecycle-ops/functional-design/`
**Code location**: workspace root — `src/js/deploy/`, `src/js/delete/`, `src/js/upgrade/`, `.github/scripts/`, `tests/unit/` (never `aidlc-docs/`)

## Unit Context

- **Stories implemented**: US-5 (deploy org-wide), US-8 (upgrade in place),
  US-9 (delete without losing credits), US-10 (preflight before mutation)
- **Dependencies / contracts**:
  - unit-1 assembles these generator modules into `configurator.html` and calls
    them from `generateAndDownload()`; unit-1 owns interpolation mechanics
    (single-quote containment helper), unit-5 owns script *content*.
  - unit-3 owns the CloudFormation template bodies (`template-main.js`,
    `template-org.js`); unit-5's scripts stage and operate on them.
  - Preflight scope-intersection logic reads other engagements' SSM config
    parameters (unit-3's `/auto-map-tagger/{mpe_id}/config` schema).
- **Hard rules carried by this unit**: BR-L-01 (delete never touches tags),
  BR-L-02 (no silenced mutations), BR-L-03 (quote containment), BR-L-04
  (preflight gate), BR-L-05 (poll-against-expected-count).
- **No API/repository/database layers** — this unit is script-generator modules
  plus CI lint tooling; those plan sections are intentionally absent.

## Generation Steps

- [x] **Step 1: Shared script scaffolding** — common generated-script preamble:
  strict shell mode (`set -euo pipefail`), loud-failure helpers, engagement
  banner (MPE ID + version from `TEMPLATE_VERSION`), count-then-poll helper
  taking an explicit expected count (zero-expected = error). *(US-5; BR-L-02/05)*
- [x] **Step 2: Preflight generator** — the read-only preflight suite emitted
  into deploy and upgrade scripts: peer-tagger collision detection (scan for
  other `map-auto-tagger-*` deployments), scope-intersection check across
  engagements' SSM configs, IAM capability check, stack-state check; aggregate
  all failures, refuse with named subjects, zero side effects. *(US-10; BR-L-04/40/41/42)*
- [x] **Step 3: `script-deploy.js` generator** — `deploy.sh` content: preflight →
  region-qualified staging bucket → mode branch (org StackSet with
  service-managed permissions + AutoDeployment + delegated-admin support, or
  single-account stack) → expected-count computation → instance/waiter polls →
  post-verify (outputs, SSM config, version) → per-step failure reporting.
  *(US-5; BR-L-10/11/12)*
- [x] **Step 4: `delete-flow.js` generator** — `delete.sh` content: engagement
  confirmation → closed-allowlist teardown enumeration (this MPE's namespace
  only) → ordered deletion with waiters → staging-bucket removal →
  post-teardown verification against the enumeration. **Structurally no
  untag/RemoveTags code path.** Log groups preserved per retention policy.
  *(US-9; BR-L-01/20/21/22)*
- [x] **Step 5: Upgrade flow generator** — `upgrade.sh` content: preflight
  (stack exists, state updateable, legacy-shape guard) → read deployed
  parameter set → update call with `UsePreviousValue=true` for every existing
  parameter, template defaults for new ones → waiter → post-verify version and
  parameter preservation. *(US-8; BR-L-30/31/32)*
- [x] **Step 6: Preflight support in the template** — PeerTaggerDetected
  detection hook surfaced to unit-3's alarm set; SSM version/config parameters
  the preflight reads (coordination step — resources owned by unit-3).
  *(US-10)*
- [x] **Step 7: Shell-injection lint** — `.github/scripts/lint_shell_injection.py`:
  verifies every user-value interpolation point in generated script content is
  single-quote contained; CI-blocking. *(BR-L-03; NFR-7)*
- [x] **Step 8: Mutation-silencing lint** — lint over generated scripts flagging
  error-suppression (`>/dev/null 2>&1 || true` and equivalents) on mutating CLI
  verbs; allowlisted cosmetic calls require an inline justification comment.
  *(BR-L-02)*
- [x] **Step 9: Tag-preservation regression test (hard)** — test scanning
  generated `delete.sh` and the delete generator source for every tag-removal
  API spelling (`untag`, `remove-tags`, `delete-tags`, `UntagResource(s)`, …);
  any hit fails. *(US-9 AC-2; BR-L-01; NFR-6)*
- [x] **Step 10: Unit tests (Vitest)** — generated-content tests per flow:
  preflight ordering before first mutating call, refusal paths mutate nothing,
  expected-count arithmetic (accounts × regions), `UsePreviousValue` present
  for every existing parameter, quote containment of hostile inputs, delete
  enumeration limited to the `map-auto-tagger-<mpeId>` namespace.
  *(US-5/8/9/10)*
- [x] **Step 11: Documentation** — lifecycle sections for `docs/INSTRUCTIONS.md`
  (deploy/upgrade/delete runbooks, refusal meanings); code-generation summary at
  `aidlc-docs/construction/unit-5-lifecycle-ops/code/code-generation-summary.md`.

## Story Traceability

| Story | Covered by steps |
|---|---|
| US-5 Deploy org-wide in one operation | 1, 3, 10 |
| US-8 Upgrade in place | 5, 10 |
| US-9 Delete without losing credits | 4, 9, 10 |
| US-10 Preflight before mutation | 2, 6, 10 |

- [x] US-5 — [x] US-8 — [x] US-9 — [x] US-10

## Completion Criteria

All steps [x]; both lints and the tag-preservation regression test green in CI;
generated scripts assemble cleanly through unit-1's build; refusal paths proven
side-effect-free by tests.
