# Component Dependencies — MAP 2.0 Auto-Tagger

## Dependency Matrix

| Component | Depends On | Depended By |
|---|---|---|
| FC-1 AppShell | I18nEngine, all flows | — (root) |
| FC-2 DeployFlow | TemplateGenerator, ServiceRegistry, I18nEngine | AppShell |
| FC-3 DeleteFlow | I18nEngine | AppShell |
| FC-4 UpgradeFlow | TemplateGenerator, I18nEngine | AppShell |
| FC-5 EditorFlow | TemplateGenerator, I18nEngine | AppShell |
| FC-6 TemplateGenerator | ServiceRegistry | DeployFlow, UpgradeFlow, EditorFlow |
| FC-7 I18nEngine | Language packs | All flows |
| FC-8 ServiceRegistry | Service definition files | TemplateGenerator, DeployFlow |
| BC-1 TaggerHandler | ArnExtractor, SSM, Tagging API | Lambda (SQS trigger) |
| BC-2 ArnExtractor | Service event shapes | TaggerHandler |
| IC-1 EventBridgeRules | CloudTrail | SQS |
| IC-2 SqsQueue+DLQ | EventBridge | Lambda |
| IC-3 LambdaFunction | SQS, IAM | — |
| IC-4 IamRoles | — | Lambda, StackSet |
| IC-5 SsmParameters | — | Lambda, day-2 ops |
| IC-6 CloudWatchSns | DLQ | SA/CSM (alerts) |

## Runtime Data Flow

```
Resource Created
   │
   ▼
CloudTrail (records API call)
   │
   ▼
EventBridge (IC-1) ── matches pattern from ServiceRegistry (FC-8)
   │
   ▼
SQS (IC-2) ── buffers
   │
   ▼
Lambda / TaggerHandler (BC-1)
   │  ├─→ reads scope from SSM (IC-5)
   │  ├─→ ArnExtractor (BC-2) resolves ARN
   │  └─→ Resource Groups Tagging API applies map-migrated
   │
   ├─ success → resource tagged
   └─ fail x5 → DLQ (IC-2) → CloudWatch alarm → SNS (IC-6)
```

## Configurator Build Flow

```
src/js/services/*.js (85 files)
   │
   ▼
ServiceRegistry (FC-8) aggregates
   │
   ▼
TemplateGenerator (FC-6) embeds patterns into CFN
   │
   ▼
DeployFlow (FC-2) wraps CFN into deploy.sh
   │
   ▼
scripts/build.js assembles everything → configurator.html
```

## Cross-Plane Contract

| From (Configurator) | To (Runtime) | Contract |
|---|---|---|
| TemplateGenerator | CloudFormation | CFN template schema (resources, params) |
| ServiceRegistry | EventBridge rules | Event pattern format per service |
| DeployFlow scope inputs | SSM Parameters | Scope config schema (MPE, accounts, VPCs) |
