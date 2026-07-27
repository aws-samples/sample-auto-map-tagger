# Component Methods — MAP 2.0 Auto-Tagger

Method-level interfaces per component. Detailed business rules will be defined per-unit in Functional Design (CONSTRUCTION phase).

---

## Configuration Plane (JavaScript, ES6+)

### C1. Configurator UI

| Method | Purpose | Input | Output |
|---|---|---|---|
| `selectMode(mode)` | Enter a top-level flow (deploy / delete / upgrade) and initialize its wizard steps | `mode: string` | void (UI state transition) |
| `nextStep()` / `prevStep()` | Step navigation with per-step validation gating | none | void |
| `validateField(fieldId, value)` | Validate a single input (MPE ID format, date ordering, account/VPC ID syntax) | `fieldId: string, value: string` | `{valid: boolean, errorKey: string\|null}` |
| `collectConfig()` | Assemble the validated configuration object from form state | none | `Config` object |
| `generateAndDownload()` | Orchestrate generation: config → scripts + template → browser downloads | none | void (triggers downloads) |
| `downloadFile(filename, content)` | Deliver a generated artifact as a browser download (no network) | `filename: string, content: string` | void |

### C2. Script Generator

| Method | Purpose | Input | Output |
|---|---|---|---|
| `buildDeployScript(config)` | Generate `deploy.sh` with embedded preflight and single-quote-contained values | `config: Config` | `string` (bash) |
| `buildDeleteScript(config)` | Generate `delete.sh` — infrastructure removal only, never tag removal | `config: Config` | `string` (bash) |
| `buildUpgradeScript(config)` | Generate `upgrade.sh` preserving existing stack parameter values | `config: Config` | `string` (bash) |
| `shq(value)` | Single-quote containment of a user-supplied value for safe shell interpolation | `value: string` | `string` (quoted) |

### C3. Template Generator

| Method | Purpose | Input | Output |
|---|---|---|---|
| `buildTemplate(config)` | Generate the single-account CloudFormation template (pipeline, alarms, SSM, IAM, embedded Lambda) | `config: Config` | `string` (YAML) |
| `buildOrgTemplate(config)` | Generate the StackSets org-mode template (AutoDeployment, delegated admin) | `config: Config` | `string` (YAML) |
| `buildEventPatterns(services)` | Derive EventBridge event patterns from service definitions | `services: ServiceDef[]` | pattern objects |
| `buildIamPolicy(services)` | Derive least-privilege IAM policy statements from service definition permissions | `services: ServiceDef[]` | policy JSON |

### C4. i18n Engine

| Method | Purpose | Input | Output |
|---|---|---|---|
| `t(key, locale)` | Resolve a UI string key in the given locale, falling back to `en` | `key: string, locale: string` | `string` |
| `setLocale(locale)` | Switch active locale and re-render localized DOM nodes | `locale: string` | void |
| `missingKeys(locale)` | List keys absent from a locale (test-time completeness check) | `locale: string` | `string[]` |

### C5. Service Definition Registry

| Method | Purpose | Input | Output |
|---|---|---|---|
| `getAllServices()` | Return the aggregate `ALL_SERVICES` registry | none | `ServiceDef[]` |
| `getService(source)` | Look up one service definition by event source (e.g., `aws.rds`) | `source: string` | `ServiceDef \| undefined` |

`ServiceDef = { source: string, events: string[], permissions: string[] }`

---

## Runtime Plane (Python 3.12)

### C6. Auto-Tagger Lambda

| Method | Purpose | Input | Output |
|---|---|---|---|
| `lambda_handler(event, context)` | Entry point: iterate SQS records, process each CloudTrail event, report partial batch failures | `event: dict, context: LambdaContext` | `dict` (batchItemFailures) |
| `get_config(mpe_id)` | Read + cache + defensively parse the SSM config parameter | `mpe_id: str` | `dict` (config) or safe default |
| `ci_get(d, key, default=None)` | Case-insensitive dictionary key access (CloudTrail casing is inconsistent) | `d: dict, key: str` | value or default |
| `extract_arn(event_name, detail)` | Dispatch to the per-service extractor; return created resource ARN(s), with suffix-match fallback | `event_name: str, detail: dict` | `list[str]` |
| `is_wellformed_arn(arn)` | Validate ARN shape before trusting CloudTrail data | `arn: str` | `bool` |
| `in_scope(detail, config)` | Evaluate account/VPC scope and agreement date window | `detail: dict, config: dict` | `bool` |
| `classify_error(exc)` | Three-path classification: `'actionable' \| 'ignorable' \| 'transient'` (transient markers + both throttle spellings) | `exc: Exception` | `str` |
| `apply_tags(arns, tags)` | Idempotently apply `map-migrated` tag via Resource Groups Tagging API / native APIs | `arns: list[str], tags: dict` | per-ARN result |

### C7. Preflight Component (generated bash + supporting Python)

| Method | Purpose | Input | Output |
|---|---|---|---|
| `preflight_peer_taggers()` | Detect existing tagger deployments and compare scopes for intersection | AWS describe/list results | pass/fail + conflicting MPE IDs |
| `preflight_iam()` | Verify the caller can create the required roles/policies | none | pass/fail + missing capability |
| `preflight_stack_state()` | Verify the target stack is absent (deploy) or upgradeable (upgrade) | stack name | pass/fail + explanation |
