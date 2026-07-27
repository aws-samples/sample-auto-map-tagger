# Functional Design Plan — unit-3-infrastructure

**Date**: 2026-03-25
**Phase**: CONSTRUCTION — Functional Design
**Unit**: unit-3-infrastructure (Cloud infrastructure templates)
**Inputs**: `aidlc-docs/inception/application-design/unit-of-work.md`, `unit-of-work-story-map.md`, `requirements.md`

## Unit Context

unit-3-infrastructure will deliver the CloudFormation definitions for the entire
runtime pipeline: EventBridge rule(s) derived from the service definitions, the
SQS main queue + DLQ, the Auto-Tagger Lambda resource and its generated
least-privilege role, the Preflight custom-resource Lambda, the SSM config
parameter, SNS alert topics, CloudWatch alarms, and log groups — in both
single-account and org-wide StackSets form (FR-3, FR-5, FR-6, FR-8, FR-9, FR-10,
FR-12; NFR-5, NFR-8, NFR-12).

The templates are *generated*: JS template modules (`src/js/deploy/template-main.js`,
`template-org.js`) assemble YAML from the shared service-definition registry and
`TEMPLATE_VERSION`, so the HTML and YAML distribution artifacts can never drift.

**Stories**: US-4 (concurrent engagements), US-7 (least-privilege IAM review),
US-11 (alerted on failure), US-12 (buffer slow provisioners), US-14 (see credit
leakage early), US-15 (negligible run cost).

**Dependencies**: unit-4's registry drives the event pattern and IAM; unit-2's
handler is embedded into the Lambda resource; unit-5's scripts drive stack
operations against these templates.

## Plan Steps

- [x] Step 1: Analyze unit definition, assigned stories, and FR/NFR traceability
- [x] Step 2: Model template generation (JS modules → YAML) and the two deployment topologies → `business-logic-model.md`
- [x] Step 3: Model the runtime event flow through the deployed resources
- [x] Step 4: Define infrastructure business rules (namespacing, config sourcing, alarm/KMS, retention) → `business-rules.md`
- [x] Step 5: Define domain entities (StackTemplate, StackSetDeployment, AlertTopology, ConfigParameter) → `domain-entities.md`
- [x] Step 6: Resolve embedded design questions (below) and reconcile answers into the artifacts

## Design Questions

## Question 1
Should single-account and org-wide deployment share one template or be two templates?

A) One template with a mode parameter and heavy `Condition` branching

B) Two generated templates from shared building blocks: `template-main.js` (the per-account pipeline stack) and `template-org.js` (the StackSet wrapper: StackSet resource, AutoDeployment, delegated-admin support, staging bucket) — org mode deploys the main template *through* the StackSet

C) Maintain one hand-written YAML monolith covering both

D) Other (please describe after [Answer]: tag below)

[Answer]: B — the per-account pipeline is identical in both modes, so it lives in
one module and the org template only adds the StackSet machinery around it. A
single mode-parameterized template (A) would entangle StackSet-only resources
with the pipeline via conditions and make single-account review harder (US-7
wants a reviewable IAM surface). A hand-written monolith (C) reintroduces
drift between distribution artifacts — the generation model exists to make drift
structurally impossible.

## Question 2
What alerting topology serves a multi-account org deployment?

A) One SNS topic per account per region — subscribers must subscribe everywhere

B) A central per-region topic `auto-map-tagger-alerts-central-<mpe>` in the management account; member-account alarms publish cross-account into it, with the topic policy scoped by `aws:SourceOrgID`; single-account mode gets a local topic

C) One global topic in us-east-1 for everything

D) Other (please describe after [Answer]: tag below)

[Answer]: B — US-11/US-14 need alerts to reach *one channel the team watches*;
per-account topics (A) means hundreds of subscriptions nobody maintains and
leakage discovered at the quarterly report. CloudWatch alarms can only publish to
same-region topics, so the central topic must exist per region (C is impossible
for that reason). Cross-account publish is scoped with `aws:SourceOrgID` — org
membership, not an unbounded principal list. Hard companion rule: **no
AWS-managed KMS key (`alias/aws/sns`) on alarm topics** — CloudWatch cannot
publish through it and the alarm silently never delivers.

## Question 3
How do concurrent MAP engagements coexist in one organization?

A) One shared deployment, multiple MPE IDs in one config

B) Full namespacing: every resource name (stacks, queues, roles, topics, alarms, SSM parameters, log groups) carries the pattern `map-auto-tagger-<mpeId>`; engagements are entirely disjoint deployments; preflight (unit-5) rejects overlapping account scopes

C) Namespace only the stack names and share queues/roles

D) Other (please describe after [Answer]: tag below)

[Answer]: B — US-4 requires two engagements to coexist without clobbering each
other's queues, roles, config, or tags. Shared plumbing (A, C) makes one
engagement's config or teardown a blast radius for another. Namespacing is a
generation-time rule applied to every `Name`/`TopicName`/`RoleName`/parameter
path — with derived-name length audited against AWS limits (the MPE ID may be up
to 44 chars; e.g. IAM role names cap at 64).

## Question 4
Where does runtime configuration live, and how is it written?

A) Lambda environment variables set from CFN parameters

B) A single SSM parameter `/auto-map-tagger/{mpe_id}/config` whose JSON value the template builds via `!Sub` from CFN parameters (ScopedAccountIds, ScopedVpcIds, TagNonVpcServices, agreement dates) — one config source, updatable by stack update

C) A DynamoDB config table

D) Other (please describe after [Answer]: tag below)

[Answer]: B — FR-10 mandates SSM as the sole config source read by the Lambda.
`!Sub`-assembly from CFN parameters keeps the stack the single writer (upgrades
preserve values via `UsePreviousValue`, unit-5). Env vars (A) would split config
across two sources and force a function update per scope change; DynamoDB (C) is
cost and surface with no benefit at this size. Known ceiling accepted and
documented: a CFN parameter value caps at 4096 bytes, bounding an explicit
account list to roughly ~270 accounts — beyond that, scope_mode ALL with OU-level
StackSet targeting is the path.

## Exit Criteria

- All three functional-design artifacts exist under
  `aidlc-docs/construction/unit-3-infrastructure/functional-design/`.
- Every US-4/7/11/12/14/15 acceptance criterion maps to a rule, entity, or flow.
- No open [Answer]: tags remain.
