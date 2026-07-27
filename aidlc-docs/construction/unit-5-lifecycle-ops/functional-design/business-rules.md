# Business Rules — unit-5-lifecycle-ops

**Date**: 2026-03-25 | **Stories**: US-5, US-8, US-9, US-10
**Traceability**: FR-8, FR-13, FR-14, FR-15; NFR-6, NFR-7

Rules are numbered `BR-L-*` (Lifecycle). The first block are **HARD RULES** —
blocking constraints with automated guards; violating one is a defect regardless
of any other consideration.

## Hard Rules

| ID | Rule | Guard |
|---|---|---|
| BR-L-01 | **`delete.sh` must NEVER remove `map-migrated` tags.** MAP credits are permanent and irreversible; teardown removes solution infrastructure only (EventBridge, SQS, Lambda, IAM, SSM, alarms, SNS, staging bucket). The guarantee is *structural*: no untag / RemoveTags / DeleteTags / UntagResource(s) code path exists anywhere in the delete flow or its generated output. (NFR-6, FR-14, US-9) | Hard regression test scans generated `delete.sh` (and the generator source) for every tag-removal API spelling; any hit fails the build. |
| BR-L-02 | **No silenced state-mutating CLI calls.** A mutating call (create/update/delete/put) may never be wrapped in `>/dev/null 2>&1 \|\| true` or any equivalent that swallows its exit status — a swallowed failure becomes a silent partial deploy (US-5 AC-3). Only genuinely optional/cosmetic calls may ignore errors, and each such case carries an inline comment explaining why. | Script lint over generated output flagging error-suppression on mutating CLI verbs. |
| BR-L-03 | **Single-quote containment for every user-supplied value.** Any value originating from configurator input (MPE ID, customer name, account lists, dates) that is interpolated into shell text is single-quote contained with embedded quotes escaped (`'\''`). No user value may appear in an unquoted, double-quoted, or command-substitution shell context. (NFR-7) | `lint_shell_injection.py` gates all generated script content in CI. |
| BR-L-04 | **Preflight before mutation — hard gate.** Deploy and upgrade run the full preflight suite (peer-tagger collision, scope intersection, IAM capability, stack state) using read-only calls before ANY mutating call. Any failure → abort with a named, explained refusal and zero side effects. (FR-15, US-10) | Flow structure + tests asserting refusal paths issue no mutating calls. |
| BR-L-05 | **Poll against expected count.** Every success/completion poll first counts the expected work (e.g., in-scope accounts × regions = expected stack instances), then polls completion against that count. A loop that exits on an empty result set cannot distinguish "zero work found" (failure) from "all work done" (success). | Generator code review + tests: polls take an expected-count input; zero-expected is an explicit error path. |

## Deploy Rules

| ID | Rule |
|---|---|
| BR-L-10 | **Two target modes, one behavior.** `deploy.sh` supports org-wide StackSets (service-managed permissions, AutoDeployment, delegated-admin) and single-account plain stack; runtime behavior is identical in both (FR-8, US-5 AC-2). The generated script contains only the configured mode's path. |
| BR-L-11 | **Region-qualified staging.** The template staging S3 bucket is namespaced by engagement and qualified by region; staging failures are loud (BR-L-02 applies). |
| BR-L-12 | **Report the failure point.** On any partial failure the script exits non-zero stating exactly which step failed and what was already created, so the operator can act (US-5 AC-3). |

## Delete Rules

| ID | Rule |
|---|---|
| BR-L-20 | **Teardown scope is a closed allowlist**, enumerated before deletion: only resources under this engagement's `map-auto-tagger-<mpeId>` namespace. Other engagements and all customer resources are outside the enumeration by construction (FR-9, FR-14). |
| BR-L-21 | **Preserve operational data.** Log groups follow their explicit retention/deletion policy; teardown never silently destroys data the customer may need. |
| BR-L-22 | **Verify teardown against the enumeration.** After deletion, every enumerated item is re-checked; anything remaining is reported explicitly (BR-L-05 pattern). |

## Upgrade Rules

| ID | Rule |
|---|---|
| BR-L-30 | **`UsePreviousValue=true` for every parameter already in the deployed stack.** The stack, not the freshly generated script, is the source of truth for configured values (FR-13, US-8 AC-1). |
| BR-L-31 | **New parameters require safe template defaults.** A newly added parameter falls through to its template `Default`; if no safe default exists, the release is classified "full redeploy required" and `upgrade.sh` refuses. |
| BR-L-32 | **Refuse incompatible stacks.** Preflight rejects upgrade when stack state is not updateable or the deployed stack's parameter shape predates what the in-place path can handle safely — refusal with explanation, never best-effort (US-8 AC-2). |

## Preflight Rules

| ID | Rule |
|---|---|
| BR-L-40 | **Read-only preflight.** Preflight checks use describe/list/get calls exclusively. |
| BR-L-41 | **Name the conflict.** A peer-tagger or scope-intersection refusal names the conflicting engagement/stack and the overlapping accounts (US-10 AC-1); an IAM/stack-state refusal names the missing capability or the offending state. |
| BR-L-42 | **Run all checks, report all failures together**, then exit non-zero — an operator fixes the full list once rather than discovering refusals serially. |
