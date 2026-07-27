# Functional Design Plan — unit-1-configurator

**Date**: 2026-03-25
**Phase**: CONSTRUCTION — Functional Design
**Unit**: unit-1-configurator (Browser configuration application)
**Inputs**: `aidlc-docs/inception/application-design/unit-of-work.md`, `unit-of-work-story-map.md`, `requirements.md`

## Unit Context

unit-1-configurator will deliver the client-side plane: a single self-contained
`configurator.html` (built from modular `src/` sources) that collects an engagement
configuration through a multi-step wizard, validates everything client-side, and
generates the full deployment package (`deploy.sh`, `delete.sh`, `upgrade.sh`,
CloudFormation template) as browser downloads. Zero backend; no data leaves the
browser (FR-1, FR-2, FR-11, NFR-7, NFR-10, NFR-11).

**Stories**: US-1 (configure in browser), US-2 (generate deployment package),
US-3 (7-locale i18n), US-17 (trust the built artifacts), US-18 (trust with customer data).

**Dependencies**: consumes unit-4's service-definition registry (embedded at build
time) and unit-5's script-content logic (generation functions live in `src/js/deploy/`
and `src/js/delete/` and are assembled into the same artifact).

## Plan Steps

- [x] Step 1: Analyze unit definition, assigned stories, and FR/NFR traceability (FR-1, FR-2, FR-11; NFR-7, NFR-10, NFR-11)
- [x] Step 2: Model the wizard step flow and the configuration object lifecycle → `business-logic-model.md`
- [x] Step 3: Model the generation pipeline (config → scripts + template → download) and the build-time assembly model (`src/` → single HTML)
- [x] Step 4: Define validation and generation business rules (MPE ID, dates, account IDs, scope exclusivity, quoting, version stamping, i18n completeness) → `business-rules.md`
- [x] Step 5: Define domain entities (Configuration, ScopeDefinition, GeneratedArtifact, LocaleBundle, ServiceSelection) → `domain-entities.md`
- [x] Step 6: Design frontend component hierarchy, state, interactions, and `data-testid` conventions → `frontend-components.md`
- [x] Step 7: Resolve embedded design questions (below) and reconcile answers into the artifacts

## Design Questions

## Question 1
How granular should the wizard UI flow be?

A) Single long form — all fields on one page, one validation pass

B) Multi-step wizard — mode select → engagement details → scope → review → download, with per-step validation gating "Next"

C) Two pages — inputs page and a combined review/download page

D) Other (please describe after [Answer]: tag below)

[Answer]: B — a multi-step wizard with per-step validation. US-1 requires a
distinct review/summary step before any artifact is generated, and workshop use
(Priya walking a customer through it) needs small, explainable steps. Step
navigation will live in `src/js/shared/ui.js`.

## Question 2
How will the deployment scripts and CloudFormation template be generated?

A) String-template functions in JS — each artifact produced by a generator function that interpolates the validated config into a template literal

B) A client-side templating library (e.g., Handlebars) bundled into the HTML

C) Fetch templates from a CDN at generation time and fill placeholders

D) Other (please describe after [Answer]: tag below)

[Answer]: A — plain generator functions over template literals, one per artifact
(`script-deploy.js`, `delete-flow.js`, `template-main.js`, `template-org.js`).
No framework and no CDN is a hard constraint (NFR-10, NFR-11, US-18); option C
violates the no-network rule outright. Every interpolation point must go through
the single-quote containment rule (NFR-7).

## Question 3
What i18n strategy will the configurator use?

A) Key-based lookup engine — `t('key')` against per-locale dictionaries, all 7 locales shipped inside the single HTML file, completeness test-enforced

B) Separate HTML file per locale, built 7 times

C) Browser/machine translation of a single English UI

D) Other (please describe after [Answer]: tag below)

[Answer]: A — one `engine.js` with `t(key)` lookup and 7 locale dictionaries
(en, id, ja, ko, th, vi, zh) inlined at build. One artifact keeps distribution
single-file (NFR-10); a vitest completeness test will fail if any locale is
missing any key (US-3 acceptance criterion). `en` is the fallback locale and
the reference key set.

## Question 4
Where should input validation rules execute, and how strictly?

A) Validate on field blur and again on step transition; block "Next" until the step is valid; re-validate the whole config before generation

B) Validate only at final generation time

C) Validate on every keystroke for all fields

D) Other (please describe after [Answer]: tag below)

[Answer]: A — blur + step-gate + final pre-generation revalidation. US-1 requires
specific, localized, per-field rejection at the point of entry, and the final
revalidation is defense-in-depth so no invalid value can ever reach a generator
function (which is the shell-injection boundary, NFR-7). Exact rules are
enumerated in `business-rules.md`.

## Question 5
How is the artifact version stamped into generated outputs?

A) A single `TEMPLATE_VERSION` constant in `src/js/constants.js`; every generator and the build read it — no version literal anywhere else

B) Version maintained in package.json and injected by the build

C) Each generator carries its own version string

D) Other (please describe after [Answer]: tag below)

[Answer]: A — single source of truth in `src/js/constants.js` (US-2, US-17
acceptance criteria). The build and both output planes (HTML, YAML) will read the
same constant, making version drift structurally impossible.

## Exit Criteria

- All four functional-design artifacts exist under
  `aidlc-docs/construction/unit-1-configurator/functional-design/`.
- Every US-1/2/3/17/18 acceptance criterion maps to a rule, entity, or flow in the artifacts.
- No open [Answer]: tags remain.
