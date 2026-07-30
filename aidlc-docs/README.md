# AI-DLC artifacts — brownfield pass

**What this is:** the artifacts from an [AI-DLC](https://github.com/awslabs/aidlc-workflows)
pass run over this codebase on **2026-07-07**, part-way through the project's life
(first commit 2026-03-24). The project was **not** built AI-DLC-first — the
solution already existed and was in active development when this ran, so the
workflow started with **Reverse Engineering**: the AI read the shipped code and
derived the architecture, component inventory, technology stack and interaction
diagrams from it, then worked forward into requirements, user stories,
application design and units of work.

**Why do it on an existing codebase.** Most real systems aren't greenfield. The
value here was not the documents themselves but what deriving them surfaced:
requirements the code implied but nobody had written down, and decisions that had
been made and reversed without a durable record. The most useful output of the
exercise is not in this folder — it is the agent steering rules in
[`.kiro/steering/`](../.kiro/steering/) and the hard rules in
[`docs/DESIGN-INVARIANTS.md`](../docs/DESIGN-INVARIANTS.md), both of which came
out of this pass and are actively maintained.

## Point-in-time snapshot — read with the date in mind

These files describe the codebase **as it stood on 2026-07-07** and are not
updated as the code changes. Treat them as a dated record of that exercise, not
as a current description of the system. Notably, they predate the v22.2.0 IaC
tag-drift detection work.

For current, maintained documentation see:

| Topic | Document |
|---|---|
| How the system works | [`docs/OVERVIEW.md`](../docs/OVERVIEW.md) |
| Rules the solution must never violate | [`docs/DESIGN-INVARIANTS.md`](../docs/DESIGN-INVARIANTS.md) |
| Known constraints | [`docs/LIMITATIONS.md`](../docs/LIMITATIONS.md) |
| Service coverage | [`docs/COVERAGE.md`](../docs/COVERAGE.md) |
| Contributor + AI agent rules | [`.kiro/steering/`](../.kiro/steering/) |
| Version history | [`CHANGELOG.md`](../CHANGELOG.md) |

## Contents

```
aidlc-state.md                     phase/stage status at the end of the pass
audit.md                           stage-by-stage log of the session
inception/
  reverse-engineering/             derived from the shipped code — the starting point
    business-overview.md           domain, users, business transactions
    architecture.md                two-plane architecture
    component-inventory.md         module-by-module inventory
    technology-stack.md            languages, build, dependencies
    interaction-diagrams.md        runtime and deploy-time flows
  requirements/                    requirements + the verification questions asked
  user-stories/                    personas and stories
  application-design/              components, services, dependencies, units of work
  plans/                           per-stage execution plans
construction/
  unit-1..5/functional-design/     per-unit design
  build-and-test/                  build and test approach
```

## Phases

Inception and Construction were completed in the pass. **Operations is a
placeholder** — releases run through GitHub Releases, and the operational side of
the lifecycle was not modelled.
