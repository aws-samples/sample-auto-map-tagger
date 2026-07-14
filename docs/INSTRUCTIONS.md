# MAP 2.0 Auto-Tagger — Instructions

---

## Prerequisites

- **CloudTrail** must be enabled in all deployment regions. `deploy.sh` verifies this automatically.
- **Deployer permissions:** `iam:*Role*`, `lambda:CreateFunction`, `events:PutRule`, `ssm:PutParameter`, `sns:CreateTopic`, `sqs:CreateQueue`, `cloudwatch:PutMetricAlarm` — or use a CloudFormation service role.
- **Multi-account only:** Trusted access for CloudFormation StackSets must be enabled:
  ```bash
  aws organizations enable-aws-service-access --service-principal member.org.stacksets.cloudformation.amazonaws.com
  ```
- **Lambda concurrency quota** — the per-region default is 1,000. Control Tower-managed accounts may start at 400. This doesn't cause failures — the SQS pipeline buffers events for 14 days. Reduced quotas only increase tagging latency during bursts.

---

## Step 1 — Generate deploy.sh

1. Open `configurator.html` in any browser
2. Fill in the form:

| Field | What to enter |
|-------|--------------|
| MAP Engagement ID | From AWS Investments — starts with `mig` |
| Agreement Start Date | Date the MAP agreement was signed |
| Customer Name | For your reference only |
| Deployment Mode | Single Account or Multiple Accounts |
| Account IDs | If multiple — add each migration account ID and a label |
| Region(s) | Regions where the customer creates resources |

3. Click **Generate & Download** → downloads `deploy.sh`

> `deploy.sh` is fully self-contained — it embeds the CloudFormation template(s) inside the script. No separate YAML files to manage.

---

## Step 2 — Deploy

### Single Account

**Option 1 — AWS CloudShell (recommended):**

1. Log into the AWS Console for your **migration account**
2. Open **CloudShell** (terminal icon in the top menu bar)
3. Click **Actions → Upload file** → upload `deploy.sh`
4. Run:

```bash
bash deploy.sh
```

**Option 2 — Local AWS CLI:**

1. Ensure AWS CLI v2 is installed and configured with credentials for the migration account
2. Run:

```bash
bash deploy.sh
```

### Multiple Accounts (AWS Organizations)

**Option 1 — AWS CloudShell (recommended):**

1. Log into the AWS Console for your **management account** (or delegated administrator account)
2. Open **CloudShell** (terminal icon in the top menu bar)
3. Click **Actions → Upload file** → upload `deploy.sh`
4. Run:

```bash
bash deploy.sh
```

**Option 2 — Local AWS CLI:**

1. Ensure AWS CLI v2 is installed and configured with credentials for the management account
2. Run:

```bash
bash deploy.sh
```

The script handles everything automatically:
- Preflight checks (CloudTrail, permissions, StackSet trusted access)
- Uploads templates to S3 (multi-account only)
- Discovers org root OU and deploys to all accounts
- Runs backfill if enabled
- Generates a deployment report

---

## Verify

```bash
aws s3 mb s3://test-map-$(date +%s) && sleep 90
aws s3api get-bucket-tagging --bucket test-map-XXXXX
# Expected: {"TagSet": [{"Key": "map-migrated", "Value": "mig1234567890"}]}
```

---

## Check Deployment Status (multi-account only)

```bash
aws cloudformation list-stack-instances \
  --stack-set-name map-auto-tagger-mig1234567890 \
  --query "Summaries[*].[Account,Region,StackInstanceStatus.DetailedStatus]" \
  --output table
# Expected: SUCCEEDED for all accounts
```

---

## Day-2: Add or Remove Accounts

To modify which accounts are tagged, update the `ScopedAccountIds` CloudFormation parameter directly via CloudShell. No configurator UI or script download needed.

### View current scope (optional)

```bash
aws cloudformation describe-stack-set --stack-set-name map-auto-tagger-mig<MPE_ID> --region <REGION> --query "StackSet.Parameters[?ParameterKey=='ScopedAccountIds'].ParameterValue" --output text
```

### Update account scope

**Simplest:** use the `scripts/map-tagger.sh` helper — pass plain account IDs and it builds the escaped JSON and full parameter list for you:

```bash
./scripts/map-tagger.sh <MPE_ID> <REGION> 111111111111 222222222222 333333333333
./scripts/map-tagger.sh <MPE_ID> <REGION> ALL     # tag all org accounts
```

Or run the raw command as a **single line** in CloudShell from the management account. List **all** accounts that should be in scope (this is a full replacement — any account not listed will be removed from scope):

```bash
aws cloudformation update-stack-set --stack-set-name map-auto-tagger-mig<MPE_ID> --use-previous-template --parameters 'ParameterKey=ScopedAccountIds,ParameterValue="[\"111111111111\",\"222222222222\",\"333333333333\"]"' 'ParameterKey=MpeId,UsePreviousValue=true' 'ParameterKey=AgreementStartDate,UsePreviousValue=true' 'ParameterKey=AgreementEndDate,UsePreviousValue=true' 'ParameterKey=ScopeMode,UsePreviousValue=true' 'ParameterKey=ScopedVpcIds,UsePreviousValue=true' 'ParameterKey=TagNonVpcServices,UsePreviousValue=true' 'ParameterKey=AlertEmail,UsePreviousValue=true' --capabilities CAPABILITY_NAMED_IAM --region <REGION>
```

**Format:** Each account ID must be wrapped in `\"...\"`  and separated by commas. Replace the example IDs with your actual account IDs. To tag all accounts in the org, use `"[\"ALL\"]"`.

**To remove an account:** run the same command but omit that account ID from the list. The Lambda remains deployed but stops tagging in that account.

### Single-account deployments

For single-account stacks, update the SSM parameter directly:

```bash
aws ssm get-parameter --name "/auto-map-tagger/mig<MPE_ID>/config" --region <REGION> --query Parameter.Value --output text
# Edit the scoped_account_ids array, then:
aws ssm put-parameter --name "/auto-map-tagger/mig<MPE_ID>/config" --type String --overwrite --value '<updated JSON>' --region <REGION>
```

---

## Monitoring

> **Alerts don't fire unless you subscribe.** The template creates an SNS alert
> topic but leaves it with zero subscribers — unconfirmed or absent subscriptions
> silently drop every Lambda-error / DLQ notification. Do this once per stack;
> otherwise tagging failures go unnoticed.

To receive email alerts on tagging errors, either use the one-liner script:

```bash
./scripts/add_subscriber.sh <MpeId> <email>
# example:
./scripts/add_subscriber.sh mig1234567890 ops@example.com
```

…or do it by hand in the console:

1. Go to **SNS → Topics → `auto-map-tagger-alerts-mig1234567890`**
2. **Create subscription** → Protocol: Email → enter your address
3. Confirm from your inbox (link is valid for 3 days)

To view tagging activity:

```bash
aws logs tail /aws/lambda/map-auto-tagger-mig1234567890 --follow
```

To check for errors:

```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/map-auto-tagger-mig1234567890 \
  --filter-pattern "Failed"
```

---

## Update the MAP Engagement ID

No redeployment needed — update the SSM parameter:

```bash
aws ssm put-parameter \
  --name /auto-map-tagger/mig1234567890/config \
  --type String \
  --overwrite \
  --value '{
    "mpe_id": "mig9999999999",
    "agreement_start_date": "2024-06-01",
    "agreement_end_date": "2027-12-31",
    "scope_mode": "account",
    "scoped_account_ids": ["ALL"],
    "scoped_vpc_ids": [],
    "tag_non_vpc_services": true
  }'
```

> Replace `mig1234567890` with your actual MPE ID throughout.

**Fields read by the runtime Lambda:**
>
> - `mpe_id` — the MAP Engagement ID applied as the tag value.
> - `agreement_start_date` — `YYYY-MM-DD`; events with `eventTime` before this date are skipped (also used by the backfill CustomResource as the CloudTrail lookup start).
> - `agreement_end_date` — `YYYY-MM-DD`; events with `eventTime` after this date are skipped. Default `2099-12-31` if not set. Set this to your MAP agreement expiry to stop tagging after the engagement ends.
> - `scope_mode` — `account` or `vpc`. Determines which field below is authoritative.
> - `scoped_account_ids` — list of 12-digit account IDs, or `["ALL"]`. In `account` mode, only tags resources whose creation event came from a listed account. Ignored in `vpc` mode.
> - `scoped_vpc_ids` — list of `vpc-…` IDs. In `vpc` mode, only tags resources whose VPC membership resolves to a listed VPC. Ignored in `account` mode.
> - `tag_non_vpc_services` — `true` or `false`. In `vpc` mode, controls whether non-VPC services (S3, DynamoDB, Lambda, SNS, SQS, etc.) are tagged. When `true` (default), non-VPC services are tagged; VPC-bound services (EC2, RDS, ElastiCache, etc.) are still filtered by VPC membership. When `false`, only resources in scoped VPCs are tagged. Ignored in `account` mode.

---

## Remove the Auto-Tagger

**Recommended: use the configurator's Delete mode.** Open `configurator.html` → **🗑️ Delete existing deployment**, select the region, optionally scope to specific MPE(s), type `DELETE` to confirm, and download `delete.sh`. The generated script auto-detects single-account stacks and multi-account StackSets, deletes stack instances in parallel (100% tolerance), and conditionally removes the S3 staging bucket. See the [configurator delete flow](../configurator.html) for details.

**Manual path (single account):**

```bash
aws cloudformation delete-stack --stack-name map-auto-tagger-mig1234567890 --region <REGION>
aws cloudformation wait stack-delete-complete --stack-name map-auto-tagger-mig1234567890 --region <REGION>
```

**Manual path (multi-account StackSet):** you MUST delete the stack instances before deleting the StackSet itself, otherwise `delete-stack-set` fails with `StackSetNotEmpty`.

```bash
# 1. Delete stack instances from all accounts in the org (parallel, 100% tolerance)
aws cloudformation delete-stack-instances \
  --stack-set-name map-auto-tagger-mig1234567890 \
  --deployment-targets OrganizationalUnitIds=<OU_ID> \
  --regions <REGION> \
  --operation-preferences MaxConcurrentPercentage=100,FailureTolerancePercentage=100,RegionConcurrencyType=PARALLEL \
  --no-retain-stacks \
  --region <REGION>

# 2. Wait for the operation to reach SUCCEEDED
aws cloudformation list-stack-set-operations \
  --stack-set-name map-auto-tagger-mig1234567890 \
  --region <REGION> \
  --query "Summaries[0].Status"

# 3. Once empty, delete the StackSet itself
aws cloudformation delete-stack-set \
  --stack-set-name map-auto-tagger-mig1234567890 \
  --region <REGION>
```

Tags already applied to existing resources are not removed — MAP credits stay intact. StackSet admin/execution IAM roles (shared org scaffolding) are never touched.

---

## FAQ

**Will this tag resources that already exist?**
No — only resources created after deployment. Enable the backfill option in the configurator to tag resources created up to 90 days before deployment.

**Will it overwrite my other tags?**
No — it only adds `map-migrated`. All existing tags are untouched.

**What if a resource fails to tag?**
Failed events go to a Dead Letter Queue. A CloudWatch alarm fires and sends an SNS notification. Tag it manually or investigate the DLQ.

**Does it affect my workload performance?**
No — runs independently via EventBridge + Lambda, only adds a tag, zero impact on resources.

**What regions does it cover?**
The region(s) selected during setup. Deploy to us-east-1 for CloudFront/Route53 and us-west-2 for Global Accelerator.

**Can I run multiple MAP engagements in the same org?**
Yes — all resources are namespaced by MPE ID. Deploy separate stacks for each engagement with different account scopes. Do not scope the same account to two different MPE IDs.

---

## Day-2: Add or Remove Accounts from Scope

To modify which accounts are tagged, update the `ScopedAccountIds` CloudFormation parameter directly via CloudShell. No configurator UI or script download needed.

### Update account scope

**View current scope (optional):**

```bash
aws cloudformation describe-stack-set --stack-set-name map-auto-tagger-mig<MPE_ID> --region <REGION> --query "StackSet.Parameters[?ParameterKey=='ScopedAccountIds'].ParameterValue" --output text
```

**Simplest:** `./scripts/map-tagger.sh <MPE_ID> <REGION> 111111111111 222222222222 333333333333` (use `ALL` to tag every org account) — it builds the escaped JSON and parameter list for you.

**Update scope** — or run as a single line in CloudShell from the management account. List **all** accounts that should be in scope (this is a full replacement):

```bash
aws cloudformation update-stack-set --stack-set-name map-auto-tagger-mig<MPE_ID> --use-previous-template --parameters 'ParameterKey=ScopedAccountIds,ParameterValue="[\"111111111111\",\"222222222222\",\"333333333333\"]"' 'ParameterKey=MpeId,UsePreviousValue=true' 'ParameterKey=AgreementStartDate,UsePreviousValue=true' 'ParameterKey=AgreementEndDate,UsePreviousValue=true' 'ParameterKey=ScopeMode,UsePreviousValue=true' 'ParameterKey=ScopedVpcIds,UsePreviousValue=true' 'ParameterKey=TagNonVpcServices,UsePreviousValue=true' 'ParameterKey=AlertEmail,UsePreviousValue=true' --capabilities CAPABILITY_NAMED_IAM --region <REGION>
```

**Format:** Each account ID must be wrapped in `\"...\"`  and separated by commas. Replace the example IDs with your actual account IDs. To tag all accounts in the org, use `"[\"ALL\"]"`.

**To remove an account:** run the same command but omit that account ID from the list. The Lambda remains deployed but stops tagging in that account.

### Single-account deployments

For single-account stacks, update the SSM parameter directly:

```bash
aws ssm get-parameter --name "/auto-map-tagger/mig<MPE_ID>/config" --region <REGION> --query Parameter.Value --output text
# Edit the scoped_account_ids array, then:
aws ssm put-parameter \
  --name "/auto-map-tagger/mig<MPE_ID>/config" \
  --type String --overwrite \
  --value '<updated JSON>'
```

---

## Upgrading from a Previous Version

Each release note states whether the update is **upgrade-safe** or requires a **full redeploy**.

### Option A: upgrade.sh (upgrade-safe releases — recommended)

Use when the release note says **"Upgrade-safe"** (most releases — new service coverage, bug fixes, no new CloudFormation parameters introduced).

1. Download the latest `configurator.html` from the GitHub release
2. Select **"Update to latest template version"**
3. Enter **region** and **MPE ID** only — no account IDs, VPCs, or dates needed
4. Click Generate → download `upgrade.sh`
5. Run in CloudShell: `bash upgrade.sh`

**What happens:**
- The script finds your existing stack (or StackSet)
- Creates a CloudFormation change-set preview showing exactly what will change (Lambda code, EventBridge rules, IAM permissions)
- Asks for confirmation before applying
- Uses `UsePreviousValue=true` for all parameters — your scope, dates, and config are untouched
- For StackSets, shows a dry-run summary of affected accounts before proceeding

**Flags:**
- `--auto-approve` — skip confirmation (for non-interactive/batch use)
- `--force` — bypass version guards (cross-major, downgrade, pre-#95 legacy stacks)

### Option B: Re-run deploy.sh (also safe for any release)

Re-generate `deploy.sh` from the configurator with the same settings you used originally, then run it. The stack updates in-place — CloudFormation only changes resources that differ between the old and new template.

**To retrieve your current settings** (so you don't have to remember what you entered):

```bash
aws ssm get-parameter --name /auto-map-tagger/<MPE_ID>/config --query Parameter.Value --output text --region <REGION>
```

This returns a JSON object with your MPE ID, agreement dates, scope mode, account IDs, and VPC IDs — everything you need to re-fill in the configurator.

### Option C: Full redeploy (required when release notes say so)

Use when the release note explicitly says **"Full redeploy required"** — this is rare and only happens when new CloudFormation parameters are introduced that cannot be defaulted safely.

```bash
# Single-account:
aws cloudformation delete-stack --stack-name map-auto-tagger-mig<MPE_ID> --region <REGION>
aws cloudformation wait stack-delete-complete --stack-name map-auto-tagger-mig<MPE_ID> --region <REGION>
bash deploy.sh
```

Existing `map-migrated` tags on resources are preserved — MAP credits stay intact. Enable backfill to catch resources created during the brief gap (~2-5 minutes).

### Migrating from the pre-v19 un-namespaced layout

Prior versions used fixed resource names (`map-auto-tagger`, `/auto-map-tagger/config`). The current version uses MPE-ID-namespaced names (`map-auto-tagger-mig111`, `/auto-map-tagger/mig111/config`). The un-namespaced layout must be migrated manually.

> **⚠️ Dual-Lambda concurrent-tagging window.** During the migration, the old Lambda will still be processing events from its SQS queue while the new Lambda is being created. If a new resource is created during this window, both Lambdas receive the event and race to tag it. They'll write the same `map-migrated` tag value (SSM config is shared per MPE ID), so the race is a no-op in the single-MPE case — but if the new deployment uses a **different** MPE ID, the last writer wins and you get non-deterministic tag values. Mitigation: pause resource creation during the migration window (typically 2-5 minutes).

Delete the old stack first:

```bash
aws cloudformation delete-stack --stack-name map-auto-tagger
aws cloudformation wait stack-delete-complete --stack-name map-auto-tagger
```

Then run the new `deploy.sh`. There will be a ~5 minute gap. Enable backfill to catch resources created during the window.

---

## Changing the MPE ID Mid-Migration

If the MAP Engagement ID changes, update the SSM parameter — the Lambda automatically uses the new value for all future resources:

```bash
aws ssm put-parameter \
  --name /auto-map-tagger/mig1234567890/config \
  --type String \
  --overwrite \
  --value '{
    "mpe_id": "mig9999999999",
    "agreement_start_date": "2024-06-01",
    "agreement_end_date": "2027-12-31",
    "scope_mode": "account",
    "scoped_account_ids": ["ALL"],
    "scoped_vpc_ids": [],
    "tag_non_vpc_services": true
  }'
```

Previously tagged resources retain the old value and must be re-tagged manually via AWS Tag Editor.

> **Do not use automated bulk re-tagging scripts** in accounts with multiple concurrent MAP engagements — different resources may intentionally carry different MPE IDs.
