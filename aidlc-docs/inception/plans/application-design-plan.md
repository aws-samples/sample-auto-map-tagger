# Application Design Plan — MAP 2.0 Auto-Tagger

## Objective
Identify components, method-level interfaces, service layer, and dependencies for the two-plane architecture, producing the mandatory design artifacts.

## Execution Checklist

### Phase A — Context Analysis
- [x] Load requirements.md (FR-1..FR-16, NFR-1..NFR-12) and stories.md (US-1..US-18)
- [x] Identify business capabilities: configuration, artifact generation, event capture, tag application, buffering/retry, alerting, lifecycle operations, coverage management
- [x] Confirm design decisions with user (questions below)

### Phase B — Design Artifact Generation
- [x] Generate components.md with component definitions and high-level responsibilities
- [x] Generate component-methods.md with method signatures (business rules detailed later in Functional Design)
- [x] Generate services.md with service definitions and orchestration patterns
- [x] Generate component-dependency.md with dependency relationships, communication patterns, and data-flow diagram
- [x] Generate application-design.md consolidating the above with design-decision rationale
- [x] Validate design completeness and consistency against all FRs/NFRs and stories

## Design Questions

## Question 1
How should components be identified and bounded?

A) One component per user story

B) One component per capability, split along the two-plane boundary: configuration-plane components (UI, script generator, template generator, i18n, service registry) and runtime-plane components (tagger Lambda, event pipeline, alerting, config store, preflight)

C) Layered (presentation/business/data) within a single plane

X) Other (please describe after [Answer]: tag below)

[Answer]: B

## Question 2
Does the system need an explicit service layer?

A) Yes — a logical service view (Configuration, Tagging, Buffering, Alerting, Config services) for orchestration reasoning, even though the planes never call each other at runtime

B) No — components are enough

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 3
How should the two planes depend on each other?

A) No runtime coupling whatsoever — the configuration plane's only outputs are generated artifacts (scripts + templates with embedded handler); the runtime plane never calls back

B) A shared API between configurator and runtime

C) The configurator polls deployed stacks for status

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 4
Which cross-cutting design patterns should be locked now?

A) All of: (1) single-source-of-truth version constant read by every build output; (2) generated-artifact build — modular sources compiled into single-file outputs that are never hand-edited, with CI staleness checks; (3) three-path error classifier (actionable/ignorable/transient) as the sole failure-handling model in the Lambda; (4) declarative service-definition registry as the one coverage contract consumed by rules, IAM, and parity audits

B) Only the version constant

C) Decide patterns per-unit during Functional Design

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 5
How should the Lambda access configuration?

A) Read the namespaced SSM parameter at invocation (with caching and defensive parsing) — config changes take effect without redeploying code

B) Environment variables set at deploy time

C) Hardcode config into the handler at build time

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Status
All checklist items complete. All questions answered; no ambiguities detected (user emphasized Q4's version constant and generated-artifact build as non-negotiable). Plan approved 2026-03-25 (see audit.md).
