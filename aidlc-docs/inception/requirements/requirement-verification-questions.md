# Requirements Verification Questions

Please answer the following questions to clarify the requirements for the MAP 2.0 Auto-Tagger. Fill in the letter choice after each [Answer]: tag. If none of the options match, choose the last option (Other) and describe your preference.

## Question 1
At what granularity must customers be able to scope which resources get tagged?

A) Whole organization only — tag everything in every account

B) Per-account only — customer selects which accounts are in scope

C) Per-account AND per-VPC — account allowlist plus optional VPC-level scoping within accounts, with a separate switch for non-VPC services

D) Per-resource-type — customer picks individual services to tag

X) Other (please describe after [Answer]: tag below)

[Answer]: C

## Question 2
What should define the target set of AWS services the tagger covers?

A) The AWS MAP Included Services List (~80 services, 150+ create-event types) — only services eligible for MAP credit

B) All taggable AWS services, regardless of MAP eligibility

C) A minimal Tier-1 set (EC2, S3, RDS, Lambda) with growth on demand

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 3
How should the solution be deployed across a multi-account organization?

A) CloudFormation StackSets with AutoDeployment (service-managed permissions, delegated admin supported), plus a single-account mode

B) Manual per-account stack deployment only

C) Terraform modules the customer adapts

D) A central account that assumes roles into member accounts

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 4
Some resources (Aurora clusters, ElastiCache Serverless, MSK Serverless) take 3–10 minutes after the create event before they can be tagged. How should the pipeline handle this?

A) SQS buffer between EventBridge and the Lambda: 180-second visibility timeout × 5 receives (15-minute retry budget), 14-day message retention, failures to a DLQ

B) Lambda sleeps/polls until the resource is taggable

C) EventBridge retries only, no queue

D) Step Functions wait-state workflow per resource

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 5
A customer may run multiple concurrent MAP engagements (different MPE IDs) in one organization. How should deployments coexist?

A) Namespaced coexistence — every stack, queue, role, and SSM parameter is namespaced by MPE ID (map-auto-tagger-<mpeId>), with preflight detection of scope overlap between peer taggers

B) One deployment per organization, hard limit

C) One deployment that multiplexes multiple MPE IDs internally

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 6
Which languages must the configurator UI support?

A) English only

B) English + Japanese

C) Seven locales: English, Indonesian, Japanese, Korean, Thai, Vietnamese, Chinese — APJ field teams and customers are the primary users

X) Other (please describe after [Answer]: tag below)

[Answer]: C

## Question 7
How should customers learn about and receive updates to the solution?

A) GitHub Releases only — customers watch the repository; the deployed solution makes no outbound network calls of any kind (no telemetry, no update checks)

B) The deployed Lambda periodically checks for new versions

C) An SNS announcement topic customers subscribe to

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 8
Where should the runtime configuration (MPE ID, agreement dates, scope) live in the customer account?

A) A single SSM Parameter Store parameter per engagement: /auto-map-tagger/{mpe_id}/config (JSON), read by the Lambda with defensive parsing

B) Lambda environment variables

C) A DynamoDB configuration table

D) Baked into the Lambda code at deploy time

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 9
What is the acceptable per-account monthly cost ceiling for the deployed pipeline?

A) Under $2/month/account at typical event volumes

B) Under $10/month/account

C) Cost is not a constraint

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 10 — Security Extensions
Should security extension rules be enforced for this project?

A) Yes — enforce all SECURITY rules as blocking constraints (recommended for production-grade applications)

B) No — skip all SECURITY rules (suitable for PoCs, prototypes, and experimental projects)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 11 — Resiliency Extensions
Should the resiliency baseline be applied to this project?

**What this extension is.** Enabling it applies a set of **directional, design-time best practices** for building resilient systems, derived from the **AWS Well-Architected Framework (Reliability Pillar)** and resilience-review guidance. It steers requirements, design, and code toward fault tolerance, high availability, observability, and recoverability.

**What this extension is NOT.** Enabling it does **not** make your workload production-ready, nor does it certify or guarantee any availability, RTO, or RPO target.

A) Yes — apply the resiliency baseline as directional best practices and design-time guidance (recommended for business-critical workloads, as an informed starting point that you can validate and harden before go-live)

B) No — skip the resiliency baseline (suitable for PoCs, prototypes, and experimental projects where rapid iteration matters more than reliability)

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 12 — Property-Based Testing Extension
Should property-based testing (PBT) rules be enforced for this project?

A) Yes — enforce all PBT rules as blocking constraints (recommended for projects with business logic, data transformations, serialization, or stateful components)

B) Partial — enforce PBT rules only for pure functions and serialization round-trips (suitable for projects with limited algorithmic complexity)

C) No — skip all PBT rules (suitable for simple CRUD applications, UI-only projects, or thin integration layers with no significant business logic)

X) Other (please describe after [Answer]: tag below)

[Answer]: C — the tagger is a thin event-routing layer; example-based vitest tests plus a golden corpus of real captured CloudTrail events give better coverage per unit of effort than generated inputs. Real AWS event shapes drift in ways property generators would not model.
