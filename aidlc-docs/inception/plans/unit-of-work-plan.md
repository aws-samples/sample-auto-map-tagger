# Unit of Work Plan — MAP 2.0 Auto-Tagger

## Decomposition Approach

The system decomposes into 5 units along clear architectural boundaries: the configurator UI, the tagging Lambda, the infrastructure, the service definitions, and the lifecycle operations.

## Units

| Unit | Name | Primary Responsibility |
|---|---|---|
| 1 | Configurator | Browser UI + deploy/delete/upgrade script generation |
| 2 | Lambda Tagger | Event processing + ARN extraction + tag application |
| 3 | Infrastructure | CloudFormation templates + event pipeline (EventBridge/SQS/DLQ/IAM) |
| 4 | Service Definitions | 154 resource type definitions + event patterns |
| 5 | Lifecycle Operations | Upgrade, delete, scope management, backfill |

## Decomposition Rationale
- **Separation of planes**: Configurator (client) vs runtime (cloud) are independent
- **Extensibility isolation**: Service definitions are a separate unit so new services can be added without touching core logic
- **Operational separation**: Lifecycle ops (day-2) are distinct from initial deployment

## Approval
- [x] Units reviewed and approved
