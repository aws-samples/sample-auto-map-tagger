# Business Rules — unit-1-configurator

**Date**: 2026-03-25 | **Stories**: US-1, US-2, US-3, US-17, US-18
**Traceability**: FR-1, FR-2, FR-11; NFR-7, NFR-10, NFR-11

Rules are numbered `BR-C-*` (Configurator). Each rule states its enforcement
point. All validation error messages are localized keys through the i18n engine
(US-1 AC-2).

## 1. Input Validation Rules

Enforced on field blur, again at step transition, and once more in the final
pre-generation revalidation (defense-in-depth — see business-logic-model §2).

| ID | Rule | Detail |
|---|---|---|
| BR-C-01 | **MPE ID format** | Required. Must match the MAP identifier shape: the `mig` prefix followed by alphanumerics (pattern `^mig[A-Za-z0-9]+$`), or a bare server ID where the program allows it. Length bounded (min 5, max 44 chars) — the upper bound exists because the MPE ID is interpolated into downstream AWS resource names with their own length ceilings (e.g., 64-char IAM role names); the bound must be validated against the longest derived name, not chosen in isolation. |
| BR-C-02 | **Date ordering** | Agreement start and end dates are both required, ISO `YYYY-MM-DD`. End date must be strictly after start date. Reject non-existent calendar dates. |
| BR-C-03 | **Date plausibility** | Warn (not block) if the agreement window does not include today — a window entirely in the past will tag nothing, which is almost always operator error. |
| BR-C-04 | **Account ID format** | Each entry in an explicit account list must be exactly 12 digits (`^\d{12}$`). List entries are de-duplicated; an empty list in explicit mode is invalid. |
| BR-C-05 | **Scope mutual-exclusivity** | `scope_mode` is either `ALL` or `EXPLICIT` — never both. If `ALL`, the explicit account list must be empty/ignored. If `EXPLICIT`, at least one valid account ID is required. |
| BR-C-06 | **VPC ID format** | Optional VPC list entries must match `^vpc-[0-9a-f]{8,17}$`. A non-empty VPC list requires the user to explicitly set the `tag_non_vpc_services` switch (no silent default), because that switch decides whether S3-class resources are tagged at all. |
| BR-C-07 | **Customer name** | Optional free text, length ≤ 64. No character class is *rejected* (names legitimately contain quotes and unicode) — instead the value is neutralized at generation time by BR-C-10. Validation and quoting are separate defenses. |
| BR-C-08 | **Step gating** | A wizard step's "Next" is disabled until every field in the step passes its rules. The Review step renders every collected value verbatim for confirmation (US-1 AC-3). |

## 2. Generation Rules

Enforced inside the generation pipeline; violations are build/test failures, not
user errors.

| ID | Rule | Detail |
|---|---|---|
| BR-C-10 | **Single-quote containment (hard rule)** | Every user-supplied value interpolated into generated shell content is wrapped in single quotes with embedded single quotes escaped as `'\''`. No user value may ever appear in an unquoted or double-quoted shell context. Gated by the shell-injection lint (NFR-7, US-2 AC-2; the lint itself is a unit-5 deliverable). |
| BR-C-11 | **Version stamping** | Every generated artifact (scripts and templates) carries the version read from `TEMPLATE_VERSION` in `src/js/constants.js`. No other version literal may exist anywhere in `src/` (US-2 AC-3, US-17 AC-3). |
| BR-C-12 | **Valid-input precondition** | Generators run only on a `CONFIRMED` configuration that passed final revalidation. A generator must never re-prompt, silently correct, or guess a missing value. |
| BR-C-13 | **Complete package** | One generation action produces the full set: `deploy.sh`, `delete.sh`, `upgrade.sh`, and the mode-appropriate CloudFormation template. Partial packages are not offered — a customer holding `deploy.sh` without `delete.sh` is an operational hazard. |
| BR-C-14 | **No network at generation time** | Generation uses only data compiled into the artifact at build time. Any code path that would fetch at runtime is a blocking defect (NFR-11, US-18 AC-1). |

## 3. i18n Rules

| ID | Rule | Detail |
|---|---|---|
| BR-C-20 | **Everything through `t()`** | Every user-visible string — including validation error messages and download-panel text — resolves through the i18n engine. A hardcoded UI string is a defect (FR-11). |
| BR-C-21 | **Locale completeness (test-enforced)** | Every key present in the `en` reference dictionary must be present in all 6 other locales (id, ja, ko, th, vi, zh). The completeness test fails the build on any missing or extra key (US-3 AC-2). |
| BR-C-22 | **Fallback** | A lookup miss at runtime falls back to `en` and must never render a raw key to the user — but BR-C-21 makes runtime misses a should-never-happen path. |
| BR-C-23 | **Locale never gates data** | Switching locale re-renders text only; it must not reset, revalidate, or invalidate any entered configuration value. |

## 4. Build Integrity Rules

| ID | Rule | Detail |
|---|---|---|
| BR-C-30 | **Never hand-edit built artifacts** | `configurator.html` (and the YAML distribution) are generated only. CI rebuilds from `src/` and fails on any diff against the committed artifact (US-17 AC-2). |
| BR-C-31 | **Verify after build** | `verify-build.js` must pass on every build: no unresolved `BUILD:` placeholders, required entry functions present, zero external URL references. |
| BR-C-32 | **Deterministic assembly** | Given identical `src/`, the build produces byte-identical output — a precondition for the staleness check to be meaningful. |
