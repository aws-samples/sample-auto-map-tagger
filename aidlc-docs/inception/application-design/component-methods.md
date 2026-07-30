# Component Methods — MAP 2.0 Auto-Tagger

## Configurator Methods

### FC-2: DeployFlow
| Method | Input | Output | Purpose |
|---|---|---|---|
| `renderForm()` | — | void | Render deployment form |
| `validateInputs(config)` | config: object | ValidationResult | Validate MPE, dates, accounts |
| `generateDeployScript(config)` | config: object | string (deploy.sh) | Produce self-contained script |
| `downloadScript(content, name)` | content: string, name: string | void | Trigger browser download |

### FC-6: TemplateGenerator
| Method | Input | Output | Purpose |
|---|---|---|---|
| `buildMainTemplate(config)` | config: object | string (CFN) | Single-account template |
| `buildOrgTemplate(config)` | config: object | string (CFN) | StackSet template |
| `buildEventPatterns(services)` | services: list | object | EventBridge rule patterns |
| `injectScope(template, scope)` | template: string, scope: object | string | Add scope parameters |

### FC-7: I18nEngine
| Method | Input | Output | Purpose |
|---|---|---|---|
| `loadLanguage(lang)` | lang: string | void | Load a language pack |
| `t(key)` | key: string | string | Resolve translated string |
| `setLanguage(lang)` | lang: string | void | Switch active language |

### FC-8: ServiceRegistry
| Method | Input | Output | Purpose |
|---|---|---|---|
| `loadAll()` | — | list | Load all service definitions |
| `getEventPatterns()` | — | object | Aggregate event patterns |
| `getResourceTypes()` | — | list | List all 154 supported types |

---

## Runtime Methods

### BC-1: TaggerHandler
| Method | Input | Output | Purpose |
|---|---|---|---|
| `handler(event, context)` | event: SQSEvent, context | dict | Lambda entry point |
| `process_record(record)` | record: dict | TagResult | Process one SQS message |
| `apply_tag(arn, mpe_value)` | arn: str, mpe_value: str | bool | Call Tagging API |
| `should_tag(event, scope)` | event: dict, scope: dict | bool | Check event against scope |

### BC-2: ArnExtractor
| Method | Input | Output | Purpose |
|---|---|---|---|
| `extract_arn(event)` | event: dict | str \| None | Route to service extractor |
| `extract_ec2(event)` | event: dict | str | EC2 resource ARN |
| `extract_rds(event)` | event: dict | str | RDS resource ARN |
| `extract_generic(event, service)` | event: dict, service: str | str | Generic ARN builder |
| `get_dependent_arns(event)` | event: dict | list[str] | Dependent resource ARNs |
