# Units of Work — MAP 2.0 Auto-Tagger

Decomposition approach: **Domain-Based** (approved in `unit-of-work-plan.md`). Five units, each a logical module in a single repository. Dependency order and story assignments in the companion documents.

---

## unit-1-configurator
**Domain**: Browser configuration application
**Components**: C1 Configurator UI, C2 Script Generator (generation orchestration), C3 Template Generator (assembly orchestration), C4 i18n Engine
**Responsibilities**:
- Multi-step wizard collecting MPE ID, agreement dates, scope (accounts/VPCs, non-VPC switch), locale — all validation client-side, zero network requests.
- Orchestrate generation and browser download of the full deployment package.
- i18n engine + 7 locale files (en, id, ja, ko, th, vi, zh) with test-enforced completeness.
- Build pipeline: modular `src/` → single self-contained `configurator.html` (inline CSS/JS, embedded Lambda handler); staleness-checked in CI.
**Key stories**: US-1, US-2, US-3, US-17, US-18

## unit-2-lambda-tagger
**Domain**: Runtime tagging engine
**Components**: C6 Auto-Tagger Lambda
**Responsibilities**:
- Python 3.12 handler: SQS batch consumption with partial batch response.
- Per-service ARN extractors (direct, constructed, multi-resource, dependent-resource patterns) with `ci_get` case-insensitive access and ARN well-formedness validation.
- Scope evaluation (account/VPC/date window) against SSM config.
- Three-path error classifier (actionable/ignorable/transient; transient markers for slow provisioners; both throttle spellings).
- Idempotent tag application via Resource Groups Tagging API / native APIs.
**Key stories**: US-6, US-13

## unit-3-infrastructure
**Domain**: Cloud infrastructure templates
**Components**: C8 Event Pipeline, C9 Alerting, C10 Config Store, plus the CFN resource definitions for C6
**Responsibilities**:
- CloudFormation templates: single-account and StackSets org mode (AutoDeployment, service-managed permissions, delegated admin).
- EventBridge rules derived from service definitions; SQS main queue (14-day retention, 180s visibility, maxReceiveCount 5) + DLQ.
- Alarms (TaggerError, DLQFillingUp, TrickleFailure, PeerTaggerDetected) + SNS topic.
- SSM config parameter `/auto-map-tagger/{mpe_id}/config` and version parameter.
- Least-privilege IAM derived from service-definition permissions; `map-auto-tagger-<mpeId>` namespacing throughout.
**Key stories**: US-4, US-7, US-11, US-12, US-14, US-15

## unit-4-service-definitions
**Domain**: Coverage contract
**Components**: C5 Service Definition Registry
**Responsibilities**:
- One definition module per covered service: `{source, events[], permissions[]}` — target: the MAP Included Services List (~80 services, 150+ create events), with the list edition pinned.
- Aggregate registry consumed by unit-3 (event patterns, IAM) and unit-1 (embedding).
- Handler-coverage parity audit: CI fails if any definition lacks a unit-2 extractor or vice versa.
- Golden-event fixture corpus: each covered service lands with a real captured CloudTrail event.
**Key stories**: US-16

## unit-5-lifecycle-ops
**Domain**: Deployment lifecycle and day-2 operations
**Components**: C2 Script Generator (script content), C7 Preflight
**Responsibilities**:
- `deploy.sh` / `upgrade.sh` / `delete.sh` script logic: preflight → CFN operation → post-verification, with no silenced state-mutating failures.
- Preflight suite: peer-tagger collision, scope intersection across engagements, IAM capability, stack-state compatibility.
- Upgrade semantics: preserve existing stack parameter values; new parameters take safe defaults.
- Delete safety: infrastructure removal only — structurally no tag-removal code path; guarded by a hard regression test.
- Shell-injection lint gating all generated script content.
**Key stories**: US-5, US-8, US-9, US-10

---

## Code Organization Strategy (Greenfield)

Single repository, monolith layout with build-assembled artifacts (approved in `unit-of-work-plan.md`, Q4):

```text
<WORKSPACE-ROOT>/
├── src/
│   ├── html/configurator.html      # unit-1: HTML skeleton (BUILD:CSS / BUILD:JS placeholders)
│   ├── css/styles.css              # unit-1: all styles
│   ├── js/
│   │   ├── constants.js            # TEMPLATE_VERSION — single source of truth
│   │   ├── app.js                  # unit-1: entry (generateAndDownload, downloadFile)
│   │   ├── shared/ui.js            # unit-1: selectMode, step navigation
│   │   ├── i18n/                   # unit-1: engine.js + 7 locale files
│   │   ├── services/               # unit-4: per-service definitions + index.js registry
│   │   ├── deploy/                 # unit-1/3: deploy-flow, template-main, template-org, script-deploy
│   │   ├── delete/                 # unit-5: delete-flow
│   │   └── upgrade/ editor/        # unit-5: lifecycle flows
│   └── templates/lambda-handler.py # unit-2: standalone Python handler, embedded at build
├── scripts/                        # build.js, verify-build.js, build-yaml.js
├── .github/scripts/                # audit_handler_coverage, generate_iam, lint_* (units 4/5 gates)
├── tests/unit/                     # vitest suites (all units)
├── docs/                           # COVERAGE, LIMITATIONS, INSTRUCTIONS, DEVELOPMENT, ...
└── configurator.html               # BUILT ARTIFACT — generated, never hand-edited
```

- Units are directory-scoped modules, not deployables; the build (`npm run build`, `npm run build:yaml`) assembles them into the two distribution artifacts.
- The Lambda handler stays a standalone, independently testable Python file that the build embeds — unit-2 develops and tests it without the browser plane.
- CI gates enforce cross-unit contracts: handler-coverage parity (unit-4↔unit-2), IAM completeness (unit-4↔unit-3), build staleness (unit-1), shell-injection lint (unit-5).
