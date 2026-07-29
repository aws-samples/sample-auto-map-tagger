# Application Design — MAP 2.0 Auto-Tagger (Consolidated)

## Overview

A two-plane serverless system: a client-side configurator (vanilla JS built to a single HTML file) that generates deployment scripts, and a cloud runtime (CloudTrail → EventBridge → SQS → Lambda) that applies `map-migrated` tags to newly created AWS resources across 154 types.

## Architecture Layers

```
+---------------------------------------------------------+
|              CONFIGURATION PLANE (Client)                |
|  configurator.html (vanilla JS, single file)            |
|  Flows: Deploy | Delete | Upgrade | Editor              |
|  i18n (7 langs) | Service Defs (154 types)              |
|  Output: deploy.sh / delete.sh / upgrade.sh             |
+---------------------------------------------------------+
                          |
              (customer runs script in CloudShell)
                          |
+---------------------------------------------------------+
|                 IaC LAYER (CloudFormation)               |
|  Stack (single-account) or StackSet (multi-account)     |
+---------------------------------------------------------+
                          |
+---------------------------------------------------------+
|              EVENT PIPELINE (Runtime Plane)              |
|  CloudTrail → EventBridge → SQS → Lambda                |
|  DLQ → CloudWatch Alarm → SNS                           |
+---------------------------------------------------------+
                          |
+---------------------------------------------------------+
|                    DATA / STATE                          |
|  SSM Parameter Store (scope config)                     |
|  Resource Groups Tagging API (tag application)          |
+---------------------------------------------------------+
```

## Components Summary

| ID | Component | Layer | Purpose |
|---|---|---|---|
| FC-1 | AppShell | Configurator | Entry, flow routing, i18n init |
| FC-2 | DeployFlow | Configurator | Deploy form + script generation |
| FC-3 | DeleteFlow | Configurator | Removal script generation |
| FC-4 | UpgradeFlow | Configurator | Upgrade script generation |
| FC-5 | EditorFlow | Configurator | Edit existing config |
| FC-6 | TemplateGenerator | Configurator | Emit CFN (main + org) |
| FC-7 | I18nEngine | Configurator | Language resolution |
| FC-8 | ServiceRegistry | Configurator | Aggregate 154 service defs |
| BC-1 | TaggerHandler | Runtime | SQS event → ARN → tag |
| BC-2 | ArnExtractor | Runtime | Per-service ARN extraction |
| IC-1 | EventBridgeRules | Infra | Match creation events |
| IC-2 | SqsQueue + DLQ | Infra | Buffer + failure preservation |
| IC-3 | LambdaFunction | Infra | Tagger compute |
| IC-4 | IamRoles | Infra | Least-privilege tagging |
| IC-5 | SsmParameters | Infra | Scope config store |
| IC-6 | CloudWatchSns | Infra | Alerting |

## Service Orchestration

| Service | Pattern | Key Flow |
|---|---|---|
| DeploymentService | Client-side generation | Configurator → deploy.sh → CloudShell → CFN |
| TaggingService | Event-driven | CloudTrail → EventBridge → SQS → Lambda → Tagging API |
| FailureService | Retry + DLQ | Lambda fail x5 → DLQ → CloudWatch → SNS |
| ScopeService | Config-driven | StackSet update → SSM → Lambda reads scope |
| LifecycleService | Script-driven | upgrade.sh / delete.sh → CFN change-set |

## Key Design Decisions

1. **Single-file configurator** — vanilla JS, no framework, runs offline in any browser
2. **Embedded CloudFormation** — deploy.sh is self-contained, no template hosting
3. **SQS buffer** — handles slow-provisioning resources (3-10 min), 14-day retention
4. **Per-service modularity** — new services added as isolated `.js` + handler
5. **Tag preservation on delete** — credits never lost when removing the solution
6. **SSM for scope** — enables day-2 account changes without redeploy
7. **StackSet for scale** — org-wide deployment from management account
