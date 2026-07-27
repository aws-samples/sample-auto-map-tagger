# NFR Design Plan — unit-3-infrastructure

**Date**: 2026-03-26
**Phase**: CONSTRUCTION — NFR Design
**Unit**: unit-3-infrastructure (Cloud infrastructure templates)
**Inputs**: `aidlc-docs/construction/unit-3-infrastructure/nfr-requirements/`, functional-design artifacts

## Context

NFR Requirements quantified durability, cost, scale, and alerting reliability
(U3-NFR-1..11). This stage selects the design patterns and logical components
that realize them in the generated templates.

## Plan Steps

- [x] Step 1: Analyze NFR requirements and identify pattern candidates per NFR
- [x] Step 2: Resolve resilience/alerting/safety pattern questions (below)
- [x] Step 3: Document selected patterns → `nfr-design-patterns.md`
- [x] Step 4: Define logical components of the deployed pipeline → `logical-components.md`
- [x] Step 5: Verify every U3-NFR maps to a pattern or component; reconcile coupled constants with unit-2's NFR design

## Design Questions

## Question 1
How should the pipeline behave when tagging fails persistently?

A) Drop after retries and rely on log inspection

B) DLQ safety net: budget exhaustion parks the message in a 14-day DLQ, DLQ depth alarms immediately, and messages are replayable after a fix — failure is always parked + alerted, never dropped

C) Lambda writes failures to an S3 error bucket

D) Other (please describe after [Answer]: tag below)

[Answer]: B — the DLQ is the terminal state of unit-2's "zero silent loss"
property: everything that cannot be tagged within budget must end up somewhere
durable and *alarmed*. S3 (C) duplicates what the DLQ already is, with more IAM
surface and no native redrive.

## Question 2
How are preflight guarantees enforced at deploy time inside the template itself?

A) Trust the deploy script's checks only

B) A CFN Custom Resource (Preflight Lambda) that runs at stack create/update and fails the stack — before the pipeline goes live — on peer-tagger collision or scope intersection with another engagement

C) A post-deploy audit Lambda on a schedule

D) Other (please describe after [Answer]: tag below)

[Answer]: B — script-side checks (unit-5) can be bypassed by anyone deploying the
template directly (console, StackSets AutoDeployment into a new account — where
no script runs at all). The custom resource makes the safety check a property of
the *template*, which is the thing that actually reaches every account. A
scheduled audit (C) detects after the damage window instead of preventing it;
PeerTaggerDetected remains as the runtime backstop alarm.

## Question 3
How is the 900-second coupled constant protected against drift?

A) A comment next to each value

B) Coupled-constants discipline: both values (180 s visibility, maxReceiveCount 5) defined adjacently in the template module with the coupling and its dependents (unit-2 latency NFR, verify-poll budget) documented at the definition site; a unit test asserts the product equals the documented budget

C) Derive one value from the other at generation time

D) Other (please describe after [Answer]: tag below)

[Answer]: B, incorporating C where clean — the budget (900 s) and the receive
count are the semantic inputs; visibility can be derived (900/5) so a lone edit
is impossible in the generator, and the assertion test protects against a future
refactor un-deriving it. The documentation burden sits at the definition site
because that is where the next editor will be looking.

## Question 4
What is the fail-safe posture for template defaults?

A) Permissive defaults (scope ALL, tag everything) for easiest onboarding

B) Fail-safe defaults: every parameter default is the least-surprising, least-privileged choice (no implicit broadening of scope; new parameters added in upgrades default to no-behavior-change); anything requiring customer judgment has no default and must be supplied

C) No defaults anywhere

D) Other (please describe after [Answer]: tag below)

[Answer]: B — upgrade semantics (unit-5, FR-13) apply `UsePreviousValue` only to
parameters that already exist in a stack; a *newly added* parameter falls through
to its template default. Defaults are therefore a back-compat contract: a default
that changes behavior would silently reconfigure every upgraded deployment.
"Safe default" is defined as: an upgraded stack behaves exactly as before the
upgrade unless the customer explicitly opts in.

## Exit Criteria

- Both artifacts exist under `aidlc-docs/construction/unit-3-infrastructure/nfr-design/`.
- Every U3-NFR-1..11 maps to a named pattern or component.
- No open [Answer]: tags remain.
