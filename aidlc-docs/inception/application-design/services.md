# Services — MAP 2.0 Auto-Tagger

Logical service-level view (approved in `application-design-plan.md`, Q2). "Service" here is a logical grouping for orchestration reasoning — the two planes never call each other at runtime; the only artifact crossing the boundary is the generated deployment package.

---

## S1. Configuration Service (browser)

- **Components**: Configurator UI (C1), Script Generator (C2), Template Generator (C3), i18n Engine (C4), Service Definition Registry (C5)
- **Responsibility**: Transform a consultant's engagement inputs into a complete, safe, self-contained deployment package.
- **Orchestration**: `generateAndDownload()` is the single orchestration point: collect + validate config → `buildDeployScript` / `buildDeleteScript` / `buildUpgradeScript` → `buildTemplate` / `buildOrgTemplate` (which pull event patterns and IAM from the registry and embed the Lambda source) → `downloadFile` per artifact.
- **Guarantees**: no network I/O; all user values single-quote contained; version stamped from the single constant; IAM derived (not hand-written) from the registry.

## S2. Tagging Service (Lambda, per account/region)

- **Components**: Auto-Tagger Lambda (C6), Config Store reads (C10)
- **Responsibility**: Convert each delivered create-event into an idempotent `map-migrated` tag on the created resource(s), or a correctly classified failure.
- **Orchestration**: per SQS record — parse event defensively → `extract_arn` → `is_wellformed_arn` → `in_scope` (config from `get_config`) → `apply_tags`; on exception → `classify_error` → transient: report batch-item failure (message returns to queue); ignorable: log and drop; actionable: raise to retry/DLQ path with an alarmed metric.
- **Guarantees**: one malformed event never fails the batch; re-delivery is safe (idempotent tagging); no outbound calls beyond AWS APIs in-account.

## S3. Buffering Service (SQS)

- **Components**: Event Pipeline (C8)
- **Responsibility**: Absorb the gap between event arrival (~5s after creation) and resource taggability (up to ~10 minutes for slow provisioners); absorb Lambda throttles/outages up to 14 days.
- **Orchestration**: EventBridge rules (per-service patterns) → main queue (visibility 180s, maxReceiveCount 5 → 15-minute retry budget) → Lambda event source mapping with partial batch response → DLQ on exhaustion.
- **Guarantees**: no event dropped silently; every non-success terminates in either a successful retry or a DLQ message.

## S4. Alerting Service

- **Components**: Alerting Component (C9), DLQ tail of Event Pipeline (C8)
- **Responsibility**: Convert failure signals into human notification fast enough to stop credit leakage.
- **Orchestration**: Lambda error metrics → TaggerError; DLQ depth → DLQFillingUp; sustained low-rate failure metric → TrickleFailure; peer-conflict detection metric → PeerTaggerDetected. All alarms publish to the engagement's namespaced SNS topic.
- **Guarantees**: every alarm names the engagement (MPE namespace); alarm topics must remain publishable by CloudWatch (no KMS configuration that silently blocks delivery).

## S5. Config Service (SSM)

- **Components**: Config Store (C10)
- **Responsibility**: Hold the single authoritative runtime configuration per engagement.
- **Orchestration**: written by deploy/upgrade (from generated template parameters); read with caching and defensive parsing by the Tagging Service; read by preflight for scope-intersection checks against peer engagements.
- **Guarantees**: one parameter per engagement (`/auto-map-tagger/{mpe_id}/config`); malformed config degrades safely (narrow exception handling, no crash); config changes take effect without code redeploy.

---

## Cross-Service Interaction Notes

- **Plane boundary**: S1 runs only in the browser at configuration time; S2–S5 run only in the customer account at runtime. The generated package (scripts + templates with embedded handler) is the sole hand-off.
- **Lifecycle orchestration** (unit-5) sits outside these services: generated scripts sequence preflight → CFN deploy/update/delete → post-deploy verification, touching S3/S4/S5 resources only through CloudFormation.
- **Failure flow**: S2 classification decides; S3 mechanics retry; S4 escalates. No service retries outside the SQS budget — the budget is the single retry authority (coupled constants: 180s × 5 = 900s must match any verification polling assumptions).
