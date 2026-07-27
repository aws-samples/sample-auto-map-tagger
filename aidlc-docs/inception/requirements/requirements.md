# Requirements — MAP 2.0 Auto-Tagger

## Intent Analysis

- **User Request**: Automatically apply the `map-migrated` tag to newly created AWS resources across a customer's entire organization so MAP credits are not lost. Partner configures in a browser; customer self-deploys with CloudFormation. No servers on our side; nothing phones home from the customer account.
- **Request Clarity**: Clear (core intent) with clarification needed on scope granularity, coverage set, retry semantics, i18n, and update channel — resolved via `requirement-verification-questions.md`.
- **Request Type**: New Project
- **Scope Estimate**: Cross-system — a client-side configuration application plus an event-driven runtime pipeline deployed across many AWS accounts
- **Complexity Estimate**: Complex — multi-account, ~80 services / 150+ event types, irreversible failure mode (a missed tag is permanently lost credit; tags cannot be back-dated)
- **Requirements Depth**: Comprehensive (high risk, multiple stakeholders, traceability required)

## Business Context

AWS Migration Acceleration Program (MAP) customers earn credits only on resources tagged `map-migrated` with their MPE/server ID. **Tags cannot be back-dated** — every resource created untagged is permanently lost credit. Manual tagging fails at scale: organizations with tens to hundreds of accounts and engineers creating resources daily cannot sustain manual tag discipline. The solution must tag resources automatically, within minutes of creation, org-wide, with a near-zero miss rate.

## Functional Requirements

| ID | Requirement | Unit(s) |
|---|---|---|
| FR-1 | **Browser-based configuration.** A single self-contained `configurator.html` (no backend; no data leaves the browser) shall collect MPE ID, agreement start/end dates, scope (accounts and/or VPCs), and locale, and validate all inputs client-side. | unit-1 |
| FR-2 | **Deployment artifact generation.** The configurator shall generate `deploy.sh`, `delete.sh`, and `upgrade.sh` plus the CloudFormation template(s), fully parameterized from the collected configuration, downloadable from the browser. | unit-1, unit-5 |
| FR-3 | **Event capture per covered service.** For every covered service, an EventBridge rule shall match that service's resource-creation CloudTrail events (event pattern per service definition) and forward them into the pipeline. | unit-3, unit-4 |
| FR-4 | **Tag application.** An Auto-Tagger Lambda (Python) shall extract the created resource ARN(s) from each event and apply `map-migrated=<mpe/server id>` via the Resource Groups Tagging API or native service tag APIs, honoring agreement date boundaries. | unit-2 |
| FR-5 | **Retry buffering for slow provisioners.** An SQS queue between EventBridge and the Lambda shall provide 14-day retention and a 5-receive × 180-second-visibility retry budget (15 minutes) so resources that take 3–10 minutes to become taggable (Aurora, ElastiCache Serverless, MSK Serverless) are retried rather than lost. | unit-3 |
| FR-6 | **Dead-letter safety net.** Events exhausting the retry budget shall land in a DLQ; a CloudWatch alarm on DLQ depth shall notify an SNS topic. | unit-3 |
| FR-7 | **Scoping.** Tagging shall be scoped by account (ALL or explicit account-ID list) and optionally by VPC ID list, with an independent switch controlling whether non-VPC services are tagged. | unit-2, unit-3 |
| FR-8 | **Multi-account deployment.** The solution shall deploy org-wide via CloudFormation StackSets with AutoDeployment (service-managed permissions, delegated-admin supported) and also support single-account deployment. | unit-3, unit-5 |
| FR-9 | **Multi-engagement namespacing.** All deployed resources (stacks, queues, roles, SSM parameters) shall be namespaced `map-auto-tagger-<mpeId>` so multiple concurrent MAP engagements coexist in one organization. | unit-3, unit-5 |
| FR-10 | **Configuration store.** Runtime configuration (mpe_id, agreement dates, scope_mode, scoped_account_ids, scoped_vpc_ids, tag_non_vpc_services) shall live in a single SSM parameter `/auto-map-tagger/{mpe_id}/config` — the sole config source read by the Lambda. | unit-3, unit-2 |
| FR-11 | **Internationalization.** The configurator UI shall be fully localized in 7 locales: en, id, ja, ko, th, vi, zh. Every UI string goes through the i18n engine; locale completeness is test-enforced. | unit-1 |
| FR-12 | **Operational alarms.** The deployment shall include alarms: TaggerError (Lambda errors), DLQFillingUp (DLQ depth), TrickleFailure (sustained low-rate failures), PeerTaggerDetected (conflicting tagger), each wired to SNS. | unit-3 |
| FR-13 | **Lifecycle: upgrade.** `upgrade.sh` shall update an existing deployment in place, preserving existing parameter values for parameters already in the stack. | unit-5 |
| FR-14 | **Lifecycle: delete.** `delete.sh` shall remove all solution infrastructure (EventBridge, SQS, Lambda, IAM, SSM, alarms) and shall NEVER remove `map-migrated` tags from customer resources (see NFR-6). | unit-5 |
| FR-15 | **Preflight checks.** Before mutating anything, deploy/upgrade shall verify: no peer tagger with overlapping scope, no scope intersection between engagements, required IAM capability present, and stack state compatible with the operation. | unit-5 |
| FR-16 | **Coverage parity gate.** Every service definition (event + permissions) must have a matching ARN-extraction handler in the Lambda; an automated audit shall fail the build on any gap in either direction. | unit-4, unit-2 |

## Non-Functional Requirements

| ID | Requirement | Unit(s) |
|---|---|---|
| NFR-1 | **Idempotent tagging.** Re-applying the same tag to the same resource must be a safe no-op — this is what makes the 5-retry model correct. | unit-2 |
| NFR-2 | **Three-path error classification.** Every tagging failure shall be classified actionable / ignorable / transient; transient errors (including slow-provisioner markers and both throttle spellings `ThrottledException`/`ThrottlingException`) return to the queue, ignorable errors are dropped with a log, actionable errors surface to the DLQ/alarm path. | unit-2 |
| NFR-3 | **Defensive CloudTrail parsing.** CloudTrail key casing is inconsistent; all event-field access shall be case-insensitive (`ci_get`), ARNs shall be validated for well-formedness before use, and all external parsing shall be wrapped in narrow exception handling — one malformed event must never crash the handler. | unit-2 |
| NFR-4 | **No outbound calls from the customer account (hard rule).** The deployed solution makes no network calls out of the customer's account — no telemetry, no update checks, no phoning home. GitHub Releases is the only update channel. | all units |
| NFR-5 | **Least-privilege IAM.** Generated IAM policies grant only the tagging actions the covered services require — no broad wildcards. IAM completeness shall be machine-checked against the service definitions. | unit-3, unit-4 |
| NFR-6 | **Tag preservation on delete (hard rule).** `delete.sh` must never remove `map-migrated` tags — MAP credits are permanent and irreversible; teardown removes infrastructure only. | unit-5 |
| NFR-7 | **Shell-injection safety.** Any user-supplied value interpolated into generated shell scripts shall use single-quote containment; an automated injection lint shall gate the build. | unit-1, unit-5 |
| NFR-8 | **Cost ceiling.** The deployed pipeline shall cost under $2/month/account at typical event volumes. | unit-3 |
| NFR-9 | **Tag latency.** Typical tag latency 60–90 seconds from resource creation; worst case ≤ 15 minutes (the retry budget) for slow-provisioning resources. | unit-2, unit-3 |
| NFR-10 | **Single-file distribution.** The configurator ships as one self-contained HTML file (inline CSS/JS, no framework, no CDN dependencies), built from modular sources; built artifacts are generated, never hand-edited. | unit-1 |
| NFR-11 | **Browser-only privacy.** No customer configuration data (MPE ID, account IDs, dates) leaves the browser; the configurator makes no network requests. | unit-1 |
| NFR-12 | **Observability.** Version visible via CFN output, SSM parameter, and Lambda cold-start log; every failure path emits a classifiable log line; alarm coverage per FR-12. | unit-2, unit-3 |

## Extension Requirements (opted in at Requirements Analysis)

- **Security Baseline — ENABLED**: security rules are blocking constraints across all stages (least-privilege IAM, injection safety, no secrets in the client artifact, KMS-compatible alerting).
- **Resiliency Baseline — ENABLED**: Well-Architected Reliability practices applied as design-time guidance (retry budgets, DLQ, alarms, idempotency, graceful degradation).
- **Property-Based Testing — DISABLED**: example-based vitest tests plus a golden corpus of real captured CloudTrail events chosen instead (rationale in Q12 of the verification questions).

## Key Requirements Summary

1. **Never lose a tag**: event-driven capture within ~5s of creation, 15-minute retry budget, DLQ + alarms for anything that escapes — because a missed tag is permanently lost customer money.
2. **Two decoupled planes**: a zero-backend browser configurator (privacy by construction) and an in-customer-account runtime (no outbound calls by construction).
3. **Org scale by default**: StackSets AutoDeployment, per-account/per-VPC scoping, MPE-namespaced coexistence of concurrent engagements.
4. **Safety as hard rules**: delete never touches tags; generated shell is injection-safe; IAM is least-privilege and machine-audited.
5. **Coverage = MAP Included Services List** (~80 services, 150+ create events) with a build-failing parity audit between service definitions and Lambda handlers.
6. **APJ-first UX**: 7-locale i18n is a launch requirement, not an enhancement.
