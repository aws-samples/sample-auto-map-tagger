# Services — MAP 2.0 Auto-Tagger

## S-1: DeploymentService
**Purpose**: Generate and deliver deployment artifacts client-side
**Interactions**:
- Configurator (DeployFlow) → TemplateGenerator → deploy.sh
- Customer → CloudShell → CloudFormation Stack/StackSet

**Orchestration Pattern**: Client-side generation (no server)
1. SA fills configurator form
2. Inputs validated
3. TemplateGenerator embeds CFN into deploy.sh
4. Customer downloads and runs in CloudShell
5. CloudFormation provisions the runtime pipeline

---

## S-2: TaggingService
**Purpose**: Apply map-migrated tags to new resources
**Interactions**:
- CloudTrail → EventBridge → SQS → Lambda → Resource Groups Tagging API

**Orchestration Pattern**: Event-driven pipeline
1. Resource created → CloudTrail records API call
2. EventBridge rule matches, filters by scope
3. Event buffered in SQS
4. Lambda polls, extracts ARN, applies tag
5. Success → resource tagged (~60-90s total)

---

## S-3: FailureService
**Purpose**: Preserve and alert on failed tagging
**Interactions**:
- Lambda → SQS retry → DLQ → CloudWatch Alarm → SNS

**Orchestration Pattern**: Retry with dead-letter
1. Lambda tagging fails (resource not yet taggable, transient error)
2. SQS redelivers (up to 5 times, 180s visibility)
3. After 5 failures → message to DLQ
4. CloudWatch alarm on DLQ depth
5. SNS email to configured address

---

## S-4: ScopeService
**Purpose**: Manage deployment scope (day-2)
**Interactions**:
- SA → CloudShell → StackSet update → SSM Parameter Store → Lambda

**Orchestration Pattern**: Config-driven
1. SA updates StackSet with new account list (full replacement)
2. Scope config written to SSM
3. Lambda reads scope config at runtime
4. EventBridge rules updated to match new scope

---

## S-5: LifecycleService
**Purpose**: Upgrade and remove deployments
**Interactions**:
- Configurator → upgrade.sh / delete.sh → CloudFormation change-set

**Orchestration Pattern**: Script-driven change-set
1. SA generates upgrade.sh or delete.sh
2. Script produces a CFN change-set (preview)
3. On apply: stack updated or removed
4. Delete preserves existing tags; upgrade preserves scope

---

## Service Communication Summary

| From | To | Protocol | Pattern |
|---|---|---|---|
| Configurator | Local download | Browser | File generation |
| deploy.sh | CloudFormation | AWS CLI | Stack/StackSet ops |
| CloudTrail | EventBridge | AWS native | Event stream |
| EventBridge | SQS | AWS native | Event routing |
| SQS | Lambda | Event source mapping | Poll/batch |
| Lambda | Tagging API | AWS SDK (boto3) | Request-Response |
| Lambda | DLQ | AWS native | Failed message routing |
| DLQ | CloudWatch → SNS | AWS native | Alarm → notification |
| Lambda | SSM | AWS SDK | Config read |
