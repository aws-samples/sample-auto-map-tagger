# Story Generation Plan — MAP 2.0 Auto-Tagger

## Objective
Convert the approved requirements (`aidlc-docs/inception/requirements/requirements.md`) into INVEST user stories with personas and testable acceptance criteria.

## Execution Checklist

### Phase A — Preparation
- [x] Load requirements.md and requirement-verification-questions.md (with answers)
- [x] Identify stakeholder types from business context (partner consultant, platform engineer, FinOps manager, maintainer)
- [x] Confirm story breakdown approach with user (questions below)

### Phase B — Persona Development
- [x] Generate personas.md with user archetypes and characteristics
- [x] Document goals, pain points, and technical proficiency per persona
- [x] Map each persona to the requirement areas it drives

### Phase C — Story Generation
- [x] Generate stories.md with user stories following INVEST criteria
- [x] Ensure stories are Independent, Negotiable, Valuable, Estimable, Small, Testable
- [x] Include Given/When/Then acceptance criteria for each story
- [x] Assign priority (Must/Should/Could) per story
- [x] Map personas to relevant user stories
- [x] Trace each story to the FR/NFR it realizes

### Phase D — Validation
- [x] Verify every functional requirement is covered by at least one story
- [x] Verify hard-rule NFRs (tag preservation, no outbound calls, injection safety) appear as explicit acceptance criteria
- [x] Verify stories are unit-assignable (no story spans multiple units)

## Clarifying Questions

## Question 1
Which user personas should the stories cover?

A) Only the partner consultant who configures the solution

B) Consultant + customer platform engineer

C) Four personas: partner/ProServe migration consultant (configures), customer cloud platform engineer (deploys/operates), customer FinOps/migration program manager (tracks credit capture), solution maintainer/contributor (extends coverage)

X) Other (please describe after [Answer]: tag below)

[Answer]: C

## Question 2
What story granularity is appropriate?

A) Epic-level only (5-6 large stories)

B) Feature-level: one story per user-visible capability (~15-20 stories), each independently testable within one unit of work

C) Task-level (~50+ fine-grained stories)

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 3
How should the stories be organized?

A) User Journey-Based — follow workflows end to end

B) Feature-Based — organized around system capabilities

C) Persona-Based — grouped by user type and their needs

D) Epic-Based — hierarchical epics with sub-stories

X) Other (please describe after [Answer]: tag below)

[Answer]: C

## Question 4
What acceptance criteria format should be used?

A) Given/When/Then (Gherkin-style) — testable, maps directly to automated tests

B) Checklist of conditions

C) Free-form narrative

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Approach Trade-offs Considered
- **User Journey-Based**: strong for E2E flows but blurs persona ownership across the two planes.
- **Feature-Based**: clean capability mapping but hides who benefits, weakening prioritization.
- **Persona-Based (selected)**: four sharply distinct personas with little overlap make persona grouping the natural unit-assignment and prioritization axis; journeys are preserved inside each persona's story sequence.
- **Epic-Based**: unnecessary hierarchy at this scale (~18 stories).

## Status
All checklist items complete. All questions answered; no ambiguities detected. Plan approved 2026-03-24 (see audit.md).
