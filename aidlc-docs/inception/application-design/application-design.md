# Application Design — MAP 2.0 Auto-Tagger (Consolidated)

This document consolidates the application design. Detail lives in the four companion artifacts:

- **[components.md](components.md)** — 10 components across two planes: Configurator UI, Script Generator, Template Generator, i18n Engine, Service Definition Registry (configuration plane); Auto-Tagger Lambda, Preflight, Event Pipeline, Alerting, Config Store (runtime plane).
- **[component-methods.md](component-methods.md)** — method signatures and I/O types per component (JS for the configuration plane, Python 3.12 for the runtime plane).
- **[services.md](services.md)** — logical service view: Configuration, Tagging, Buffering, Alerting, and Config services with orchestration notes.
- **[component-dependency.md](component-dependency.md)** — dependency matrix, two-plane data-flow diagram, and communication patterns.

## Architecture Summary

Two fully decoupled planes:

1. **Configuration plane** — a single self-contained `configurator.html` (built from modular `src/`) that collects MPE ID, agreement dates, scope, and locale, then generates `deploy.sh` / `delete.sh` / `upgrade.sh` plus CloudFormation templates. No backend; no data leaves the browser.
2. **Runtime plane** — per customer account/region: CloudTrail → EventBridge (per-service rules) → SQS (14-day retention, 180s visibility × 5 receives) → Auto-Tagger Lambda → Resource Groups Tagging API / native tag APIs; failures → DLQ → CloudWatch alarms → SNS. Configuration from one SSM parameter per engagement. Typical tag latency 60–90s; worst case bounded by the 15-minute retry budget.

The only artifact crossing the plane boundary is the generated deployment package.

## Design Decisions

### D1. Single-file HTML configurator
**Decision**: Ship the configurator as one self-contained HTML file with inlined CSS/JS, built from modular `src/` sources.
**Rationale**: Consultants work on locked-down customer laptops and air-gapped review environments — a file that opens from disk with zero installation and zero network dependencies is the only universally deployable form. It also makes the privacy guarantee auditable: one file, no requests. The build step (modular sources → single artifact) keeps the source maintainable despite the monolithic distribution; built artifacts are never hand-edited and CI fails on staleness.

### D2. No JavaScript framework
**Decision**: Vanilla ES6+ only; no React/Vue/build-time framework dependencies.
**Rationale**: The single-file constraint makes framework runtimes pure payload cost; a framework's build chain would also complicate the "inline everything into one HTML file" pipeline and add supply-chain surface to a security-sensitive artifact. The UI is a linear wizard — well within vanilla DOM scope.

### D3. SQS between EventBridge and the Lambda (vs. direct invoke)
**Decision**: EventBridge targets an SQS queue; the Lambda consumes from it with partial batch response. Direct EventBridge→Lambda invocation is rejected.
**Rationale**: Slow-provisioning resources (Aurora, ElastiCache Serverless, MSK Serverless) take 3–10 minutes to become taggable, but the create event arrives in ~5 seconds. Direct invocation gives at most EventBridge's retry policy with no controllable backoff window; SQS gives a tunable retry budget (180s visibility × 5 receives = 15 minutes), 14-day durability through Lambda outages or throttles, a DLQ with replayability, and per-record failure isolation. The retry budget is a load-bearing coupled constant — any verification polling must assume tags land within it.

### D4. SSM parameter as the single config source
**Decision**: All runtime configuration lives in one SSM parameter per engagement, `/auto-map-tagger/{mpe_id}/config`, read with caching and defensive parsing.
**Rationale**: One authoritative source eliminates config drift between resources; namespacing by MPE ID gives multi-engagement coexistence and lets preflight inspect peer engagement scopes for intersection; scope changes take effect without code redeploy; SSM standard parameters are free (cost ceiling NFR-8). Environment variables were rejected (redeploy per change, invisible to peer preflight); DynamoDB was rejected (cost, and a table is overkill for one JSON document).

### D5. Declarative service-definition registry as the coverage contract
**Decision**: One definition module per covered service (`{source, events, permissions}`); EventBridge patterns, least-privilege IAM, and the handler parity audit all derive from this single registry.
**Rationale**: Coverage spans ~80 services / 150+ event types maintained by 2 people — the three things that must agree (what we listen to, what we may tag, what we can extract) must be generated from one place, with CI failing on any definition↔handler gap in either direction.

### D6. Cross-cutting patterns locked at design time
- **Single source of truth for the version**: one constant, read by every build output (HTML, YAML, SSM version parameter, Lambda cold-start log). No version string exists anywhere else.
- **Generated-artifact build**: built outputs (`configurator.html`, template YAML) are compiled from `src/`, never edited; a CI staleness check enforces it.
- **Three-path error classifier**: every runtime failure is actionable, ignorable, or transient — the classifier is the single failure-handling model, and new services must declare transient markers for their provisioning windows or they will DLQ prematurely.
- **Defensive CloudTrail parsing**: case-insensitive key access (`ci_get`), ARN well-formedness validation, and narrow exception wrapping on all external parsing — AWS event shapes are not trusted to be stable.

## Extension Compliance (Security + Resiliency baselines — enabled)

- **Security**: least-privilege IAM derived from the registry (D5); single-quote containment in all generated shell; no secrets in the client artifact; delete flow structurally incapable of tag removal; alarm topics must remain CloudWatch-publishable.
- **Resiliency**: durable buffering with explicit retry budget and DLQ (D3); idempotent mutation; three-path classification preventing both premature DLQ and infinite retry; four-alarm observability; graceful degradation on malformed config/events.
