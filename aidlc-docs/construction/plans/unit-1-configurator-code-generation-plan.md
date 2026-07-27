# Code Generation Plan — unit-1-configurator

**Date**: 2026-03-26
**Phase**: CONSTRUCTION — Code Generation (Part 1: Planning)
**Unit**: unit-1-configurator
**Inputs**: functional design at `aidlc-docs/construction/unit-1-configurator/functional-design/`
**Code location**: workspace root (greenfield monolith layout per `unit-of-work.md` Code Organization Strategy — `src/`, `scripts/`, `tests/unit/`; never `aidlc-docs/`)

## Unit Context

- **Stories implemented**: US-1, US-2, US-3, US-17, US-18
- **Dependencies**: consumes unit-4's `src/js/services/` registry and unit-5's
  script-content modules (`src/js/deploy/script-deploy.js`, `src/js/delete/delete-flow.js`)
  at build-assembly time; embeds unit-2's `src/templates/lambda-handler.py`.
  Interfaces are file-shaped: unit-1's build concatenates whatever those units
  place in the agreed paths.
- **Contracts exposed**: the `BUILD:CSS` / `BUILD:JS` placeholder convention;
  dependency-ordered JS concatenation; `TEMPLATE_VERSION` in `src/js/constants.js`
  as the version source both build outputs read.
- **No database, no API layer, no repository layer** — this unit is a
  client-side application plus its build tooling; those plan sections are
  intentionally absent.

## Generation Steps

- [x] **Step 1: Project structure setup** — create `src/html/`, `src/css/`,
  `src/js/{shared,i18n,deploy,delete,upgrade,editor}/`, `src/templates/`,
  `scripts/`, `tests/unit/`; add `package.json` with `build`, `build:yaml`,
  `test`, `verify` scripts. *(US-17)*
- [x] **Step 2: Constants module** — `src/js/constants.js` with
  `TEMPLATE_VERSION` as the sole version literal in the codebase. *(US-2, US-17; BR-C-11)*
- [x] **Step 3: HTML skeleton + styles** — `src/html/configurator.html` with
  `<!-- BUILD:CSS -->` / `<!-- BUILD:JS -->` placeholders and the static wizard
  markup with `data-testid` attributes per `frontend-components.md`;
  `src/css/styles.css`. *(US-1)*
- [x] **Step 4: Build script** — `scripts/build.js`: inline CSS, concatenate JS
  in dependency order (constants → i18n → services → shared/ui → flows → app),
  embed `lambda-handler.py` indented for YAML embedding, emit single
  `configurator.html`; deterministic output (BR-C-32). *(US-17)*
- [x] **Step 5: Wizard UI + navigation** — `src/js/shared/ui.js`
  (`selectMode()`, step navigation, gating per BR-C-08) and step wiring for
  Engagement Details / Scope / Review per `frontend-components.md`. *(US-1)*
- [x] **Step 6: Validation module** — field validators implementing BR-C-01…08
  (MPE ID, date ordering + plausibility warning, account IDs, scope
  mutual-exclusivity, VPC format, non-VPC switch forcing); wired blur +
  step-gate + final revalidation. *(US-1)*
- [x] **Step 7: i18n engine + 7 locales** — `src/js/i18n/engine.js` (`t()`,
  en fallback) and locale files `en.js, id.js, ja.js, ko.js, th.js, vi.js, zh.js`
  with the full key set. *(US-3; BR-C-20/21/22)*
- [x] **Step 8: Generation orchestration** — `src/js/app.js`:
  `generateAndDownload()` (final revalidation → generator fan-out → version
  stamping → full-package rule BR-C-13) and `downloadFile()` Blob download;
  single-quote containment helper applied at every interpolation point
  (BR-C-10). Script/template *content* generators are consumed from unit-5 and
  unit-3/deploy modules. *(US-2, US-18)*
- [x] **Step 9: Review table rendering** — HTML-escaped review table +
  confirm-and-generate flow (`DRAFT → CONFIRMED`). *(US-1, US-18)*
- [x] **Step 10: Verify script** — `scripts/verify-build.js`: no unresolved
  placeholders, entry functions present, zero external URL / fetch references
  (the auditable no-network check). *(US-17, US-18; BR-C-31)*
- [x] **Step 11: Unit tests (Vitest)** — `tests/unit/`: validation-rule tests
  (each BR-C-0x rule, valid + invalid cases), i18n completeness test (BR-C-21),
  quoting/injection tests for the containment helper, build-output tests
  (placeholders resolved, version stamped, determinism). *(US-1, US-2, US-3, US-17)*
- [x] **Step 12: Frontend component tests** — DOM-level tests against
  `data-testid` selectors: step gating, review-table escaping, locale switch
  preserving data (BR-C-23). *(US-1, US-3)*
- [x] **Step 13: Documentation** — code-generation summary at
  `aidlc-docs/construction/unit-1-configurator/code/code-generation-summary.md`;
  build/extension notes destined for `docs/DEVELOPMENT.md`.
- [x] **Step 14: Deployment artifact** — run the build to produce the committed
  `configurator.html` at repo root; verify + tests green. *(US-17)*

## Story Traceability

| Story | Covered by steps |
|---|---|
| US-1 Configure in browser | 3, 5, 6, 9, 11, 12 |
| US-2 Generate package | 2, 8, 11 |
| US-3 Customer's language | 7, 11, 12 |
| US-17 Trust built artifacts | 1, 2, 4, 10, 11, 14 |
| US-18 Trust with customer data | 8, 9, 10 |

- [x] US-1 — [x] US-2 — [x] US-3 — [x] US-17 — [x] US-18

## Completion Criteria

All steps [x]; `npm run build && npm test && npm run verify` green; committed
artifact matches a fresh build (staleness check passes).
