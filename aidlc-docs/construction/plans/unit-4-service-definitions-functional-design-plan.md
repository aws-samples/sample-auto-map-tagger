# Functional Design Plan — unit-4-service-definitions

**Date**: 2026-03-25
**Phase**: CONSTRUCTION — Functional Design
**Unit**: unit-4-service-definitions (Coverage contract)
**Inputs**: `aidlc-docs/inception/application-design/unit-of-work.md`, `unit-of-work-story-map.md`, `requirements.md`

## Unit Context

unit-4 will own the coverage contract: one definition module per covered AWS
service, shaped `{source, events[], permissions[]}`, aggregated into a single
registry. The registry is consumed in three directions — EventBridge event
patterns (unit-3), generated least-privilege IAM (unit-3, NFR-5), and the
handler-parity audit against unit-2's ARN extractors (FR-16). Coverage target
is the MAP Included Services List: ~80 services, 150+ create events, list
edition pinned.

**Story**: US-16 (add a covered service safely).
**Requirements**: FR-3, FR-16; NFR-5.

## Plan Steps

- [x] Step 1: Analyze unit definition, US-16 acceptance criteria, and the three consumer contracts (event patterns, IAM, parity audit)
- [x] Step 2: Model the definition module contract and the aggregate registry → `business-logic-model.md`
- [x] Step 3: Model the fan-out: registry → EventBridge patterns, → IAM policy generation, → parity audit
- [x] Step 4: Define coverage business rules (one module per service, create-events only, least-privilege permissions, MAP-list eligibility, parity-or-fail) → `business-rules.md`
- [x] Step 5: Define domain entities (ServiceDefinition, CoverageRecord, ParityReport) → `domain-entities.md`
- [x] Step 6: Resolve embedded design questions (below) and reconcile answers

## Design Questions

## Question 1
What schema should a service definition module use?

A) Minimal literal object — `{source: 'aws.<svc>', events: [...], permissions: [...]}`, one `const` per file

B) Rich schema with per-event metadata (ARN pattern, transient markers, resource types) in the definition itself

C) A single JSON/YAML data file listing all services

D) Other (please describe after [Answer]: tag below)

[Answer]: A — the minimal three-field literal. Per-event extraction detail
(ARN shape, transient behavior) belongs in the Lambda handler (unit-2) where it
executes; duplicating it in the definition would create a second source of truth
that drifts. One module per service (not one big data file) keeps diffs
reviewable, keeps `git blame` per-service, and lets the build auto-discover
files. The parity audit — not schema richness — is what keeps the two sides
honest.

## Question 2
How should definitions be registered into the aggregate registry?

A) Explicit registration — each module is listed in an `ALL_SERVICES` array in `src/js/services/index.js`

B) Build-time filesystem auto-discovery only, no explicit index

C) Each module self-registers into a global at load time

D) Other (please describe after [Answer]: tag below)

[Answer]: A — explicit `ALL_SERVICES` array in `index.js`. An explicit list
makes "is this service live?" a one-file question and makes accidental
inclusion/exclusion a visible diff. The build additionally cross-checks that
every file in `src/js/services/` is registered (a defined-but-unregistered
module is a CI failure), giving auto-discovery's safety without its implicitness.

## Question 3
How strictly should definition↔handler parity be enforced?

A) Documentation convention — contributors are told to add both

B) CI-blocking audit script, one direction — every definition must have a handler

C) CI-blocking audit script, both directions — definition without handler fails AND handler without definition fails

D) Other (please describe after [Answer]: tag below)

[Answer]: C — bidirectional, CI-blocking (`audit_handler_coverage.py`).
US-16 AC-2 requires the mismatch to fail in either direction: a definition
without a handler is a silent tag-loss gap (events matched, nothing extracted);
a handler without a definition is dead code whose events never arrive and whose
IAM permission is never granted — both are defects. FR-16 makes this a build
gate, not a review convention.

## Question 4
How should MAP Included Services List eligibility be governed?

A) Any AWS service a contributor finds useful may be added

B) Only services on the MAP Included Services List, with the list edition date pinned in docs and whole-list diffs on every revision

C) MAP list plus a documented exceptions annex

D) Other (please describe after [Answer]: tag below)

[Answer]: B — MAP-list-only, edition pinned. Tagging non-eligible services
inflates the customer's tag surface with no credit benefit and widens IAM for
nothing. On each list revision the whole list is diffed against the registry in
both directions (newly eligible services missing, covered services dropped) —
spot-checking individual services misses whole-service gaps.

## Exit Criteria

- Three functional-design artifacts exist under
  `aidlc-docs/construction/unit-4-service-definitions/functional-design/`.
- Every US-16 acceptance criterion maps to a rule or flow.
- No open [Answer]: tags remain.
