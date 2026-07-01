# Components — MAP 2.0 Auto-Tagger

## Configurator Components (Frontend)

### FC-1: AppShell
**Purpose**: Application entry point and flow orchestration
**Responsibilities**:
- Initialize the configurator on load
- Route between deploy/delete/upgrade/editor flows
- Bootstrap i18n engine and load default language
- Wire shared UI utilities

### FC-2: DeployFlow
**Purpose**: Deployment configuration and script generation
**Responsibilities**:
- Render deployment form (MPE ID, dates, scope, accounts, VPCs, alert email)
- Validate all inputs before generation
- Invoke TemplateGenerator for the correct CFN template
- Produce and download self-contained `deploy.sh`

### FC-3: DeleteFlow
**Purpose**: Clean removal script generation
**Responsibilities**:
- Select region and scope (all deployments or specific MPEs)
- Require `DELETE` confirmation
- Generate `delete.sh` / `delete-<mpe>.sh`
- Ensure generated script preserves existing tags

### FC-4: UpgradeFlow
**Purpose**: Upgrade script generation
**Responsibilities**:
- Accept region + MPE ID (upgrade-safe path)
- Generate `upgrade.sh` with change-set preview
- Preserve existing scope configuration

### FC-5: EditorFlow
**Purpose**: Edit existing deployment configuration
**Responsibilities**:
- Load and modify existing config
- Regenerate scripts with updated settings

### FC-6: TemplateGenerator
**Purpose**: Emit CloudFormation templates
**Responsibilities**:
- Generate single-account template (`template-main.js`)
- Generate org/StackSet template (`template-org.js`)
- Embed EventBridge rules, SQS, Lambda, IAM, SSM, CloudWatch, SNS
- Inject scope parameters

### FC-7: I18nEngine
**Purpose**: Multi-language string resolution
**Responsibilities**:
- Load language packs (en, ja, ko, th, vi, id, zh)
- Resolve UI strings by key
- Switch language at runtime

### FC-8: ServiceRegistry
**Purpose**: Aggregate service definitions
**Responsibilities**:
- Load all 85 service `.js` files
- Build the event pattern set (154 resource types)
- Expose registry to template generation

---

## Runtime Components (Backend)

### BC-1: TaggerHandler
**Purpose**: Process resource creation events and apply tags
**Responsibilities**:
- Poll SQS for buffered CloudTrail events
- Parse event, identify service and resource
- Delegate to ArnExtractor for the ARN
- Call Resource Groups Tagging API to apply `map-migrated`
- Handle retries; route persistent failures to DLQ

### BC-2: ArnExtractor
**Purpose**: Per-service ARN extraction
**Responsibilities**:
- Map CloudTrail event shape to a resource ARN
- Handle 154 resource types with service-specific logic
- Handle dependent resources (EBS, snapshots, replicas)

---

## Infrastructure Components

### IC-1: EventBridgeRules
- Match resource creation events from CloudTrail
- Filter by scope (account, VPC, org)
- Route matched events to SQS

### IC-2: SqsQueue + DLQ
- Buffer events (14-day retention)
- 5 retries with 180s visibility timeout
- Dead Letter Queue for failed events

### IC-3: LambdaFunction
- Host TaggerHandler (Python)
- SQS event source mapping

### IC-4: IamRoles
- Least-privilege tagging permissions
- Cross-account roles for StackSet

### IC-5: SsmParameters
- Store scope config (MPE, dates, accounts, VPCs, scope mode)
- Read by Lambda at runtime

### IC-6: CloudWatchSns
- DLQ depth alarm
- SNS topic + email subscription for alerts
