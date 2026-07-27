# Unit of Work Plan — MAP 2.0 Auto-Tagger

## Objective
Decompose the designed system (10 components, 2 planes) into units of work for the CONSTRUCTION per-unit loop, with dependency ordering and full story assignment.

## Execution Checklist

### Part 1 — Planning
- [x] Load application design artifacts (components, methods, services, dependencies)
- [x] Load stories.md (US-1..US-18) and requirements.md
- [x] Confirm decomposition approach with user (questions below)
- [x] Analyze answers for ambiguities (none found)

### Part 2 — Generation
- [x] Generate `aidlc-docs/inception/application-design/unit-of-work.md` with unit definitions and responsibilities
- [x] Generate `aidlc-docs/inception/application-design/unit-of-work-dependency.md` with dependency matrix and build order
- [x] Generate `aidlc-docs/inception/application-design/unit-of-work-story-map.md` mapping stories to units
- [x] Document code organization strategy in `unit-of-work.md` (greenfield requirement)
- [x] Validate unit boundaries and dependencies
- [x] Ensure all stories are assigned to units (18/18 assigned, each to exactly one unit)

## Decomposition Questions

## Question 1
How should stories and components be grouped into units of work?

A) Domain-Based — group by capability domain: configurator (browser app + i18n), Lambda tagger, cloud infrastructure, service definitions, lifecycle operations

B) Plane-Based — two units: configuration plane and runtime plane

C) Persona-Based — one unit per persona's stories

D) One unit — build the whole system as a single unit

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 2
In what order should the units be constructed?

A) Contract-first: service definitions → Lambda tagger (parity with definitions) → infrastructure (embeds handler, derives rules/IAM) → configurator (embeds templates) → lifecycle ops (consumes configurator outputs)

B) UI-first: configurator, then everything behind it

C) Parallel — no ordering

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 3
How do units map to the team?

A) Two maintainers sharing all units — units are logical modules within a single repository, not team ownership boundaries; automation (parity audits, staleness checks, lints) substitutes for per-unit review headcount

B) One owner per unit

C) Separate repos per unit

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 4
What deployment/code-organization model should the units use? (Greenfield multi-unit question)

A) Single repository, monolith layout: modular `src/js/*` per configuration-plane unit, `src/templates/` for the Lambda handler, `scripts/` for build tooling, `tests/` for vitest — with build steps assembling the single-file artifacts

B) One repository per unit

C) Monorepo with independent deployable packages

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Answer Analysis
All answers unambiguous and mutually consistent: Domain-Based grouping (Q1) with contract-first sequencing (Q2) matches the dependency matrix in `component-dependency.md`; single-repo monolith layout (Q4) is consistent with the 2-maintainer model (Q3) and the generated-artifact build pattern locked in Application Design.

## Status
All checklist items complete. Plan approved and generation executed 2026-03-25 (see audit.md).
