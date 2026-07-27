# Components — MAP 2.0 Auto-Tagger

Components are bounded per capability, split along the two-plane boundary (approved in `application-design-plan.md`, Q1). Method signatures in `component-methods.md`; dependencies in `component-dependency.md`.

---

## Configuration Plane (client-side, browser)

### C1. Configurator UI
- **Purpose**: Collect and validate everything needed to produce a deployment package, entirely in the browser.
- **Responsibilities**:
  - Multi-step wizard: mode selection → engagement details (MPE ID, agreement dates) → scope (accounts/VPCs, non-VPC switch) → review → generate.
  - Client-side validation of every field (MPE ID format, date ordering, account-ID/VPC-ID syntax).
  - Locale selection and fully localized rendering via the i18n Engine.
  - Zero network requests; no data leaves the page (NFR-11).
- **Interfaces**: DOM events in; validated configuration object out (to Script Generator and Template Generator); string lookups to i18n Engine.

### C2. Script Generator
- **Purpose**: Produce `deploy.sh`, `delete.sh`, `upgrade.sh` from a validated configuration.
- **Responsibilities**:
  - Interpolate configuration into script templates with single-quote containment for every user-supplied value (NFR-7).
  - Embed preflight logic (peer-tagger collision, scope intersection, IAM, stack-state checks) into deploy/upgrade scripts.
  - Guarantee `delete.sh` contains no tag-removal code path (NFR-6).
- **Interfaces**: configuration object in; script text artifacts out (to browser download).

### C3. Template Generator
- **Purpose**: Produce the CloudFormation template(s) — single-account and StackSets org mode — from the same configuration.
- **Responsibilities**:
  - Assemble pipeline resources (EventBridge rules from the Service Definition Registry, SQS/DLQ, Lambda, alarms, SNS, SSM parameter, IAM) with `map-auto-tagger-<mpeId>` namespacing.
  - Embed the Auto-Tagger Lambda source into the template.
  - Derive least-privilege IAM from covered service definitions (NFR-5).
  - Stamp the template version from the single version constant.
- **Interfaces**: configuration object + service definitions in; CloudFormation YAML out.

### C4. i18n Engine
- **Purpose**: Localize every UI string across 7 locales (en, id, ja, ko, th, vi, zh).
- **Responsibilities**: key-based lookup with fallback to English; locale completeness enforced by test; no hardcoded UI strings outside locale files.
- **Interfaces**: `t(key, locale)` lookups in; localized strings out.

### C5. Service Definition Registry
- **Purpose**: Single declarative source of truth for coverage — which services, which create events, which permissions.
- **Responsibilities**:
  - One definition module per covered service: `{ source, events[], permissions[] }`.
  - Aggregate registry consumed by the Template Generator (EventBridge patterns, IAM) and by the parity audit against the Lambda's handlers.
  - Track the MAP Included Services List edition it implements.
- **Interfaces**: static definitions out (to Template Generator, IAM generation, coverage audit).

---

## Runtime Plane (customer AWS account)

### C6. Auto-Tagger Lambda
- **Purpose**: Turn a resource-creation CloudTrail event into a `map-migrated` tag on the created resource(s).
- **Responsibilities**:
  - **ARN Extractors**: per-service extraction of created resource ARN(s) — direct-from-response, constructed, multi-resource, and dependent-resource patterns; case-insensitive key access; ARN well-formedness validation (NFR-3).
  - **Scope Evaluator**: enforce account/VPC scope and agreement date window from config (FR-7).
  - **Error Classifier**: three-path classification (actionable/ignorable/transient) with transient markers for slow provisioners and both throttle spellings (NFR-2).
  - **Tag Applier**: idempotent tag application via Resource Groups Tagging API or native service APIs (NFR-1).
- **Interfaces**: SQS event batches in; tag API calls out; SSM config reads; structured logs/metrics out.

### C7. Preflight Component
- **Purpose**: Validate before any mutation during deploy/upgrade.
- **Responsibilities**: detect peer taggers with overlapping scope; scope-intersection check across engagements; IAM capability verification; stack-state compatibility check (FR-15). Implemented within generated scripts plus supporting runtime checks (PeerTaggerDetected alarm).
- **Interfaces**: AWS read-only describe/list calls in; go/no-go verdict with explanation out.

### C8. Event Pipeline
- **Purpose**: Reliable delivery of create events from CloudTrail to the Lambda.
- **Responsibilities**: EventBridge rules (one pattern per covered service, from the registry); SQS main queue (14-day retention, 180s visibility, maxReceiveCount 5); DLQ for exhausted messages (FR-5, FR-6).
- **Interfaces**: CloudTrail events in; SQS batches out to Auto-Tagger Lambda; exhausted messages to DLQ.

### C9. Alerting Component
- **Purpose**: Surface failures to humans fast enough to fix leakage.
- **Responsibilities**: CloudWatch alarms — TaggerError, DLQFillingUp, TrickleFailure, PeerTaggerDetected — each publishing to the engagement's SNS topic (FR-12).
- **Interfaces**: CloudWatch metrics in; SNS notifications out.

### C10. Config Store
- **Purpose**: Single runtime configuration source per engagement.
- **Responsibilities**: SSM parameter `/auto-map-tagger/{mpe_id}/config` (JSON: mpe_id, agreement dates, scope_mode, scoped_account_ids ALL-or-list, scoped_vpc_ids, tag_non_vpc_services); version parameter for observability (FR-10, NFR-12).
- **Interfaces**: written at deploy/upgrade; read (cached, defensively parsed) by the Auto-Tagger Lambda and Preflight.
