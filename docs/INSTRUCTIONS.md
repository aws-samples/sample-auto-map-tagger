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

## Day-2: Add or Remove Accounts (update.sh)

After the initial deployment, use the **Editor** tab in `configurator.html` to add or remove accounts from scope without redeploying.

### Generate update.sh

1. Open `configurator.html` and switch to the **Editor** tab
2. Enter the MPE ID and region of the existing deployment
3. Choose **Add accounts** or **Remove accounts**
4. Enter the account IDs to add or remove
5. Click **Generate update.sh** → downloads `update.sh`

### Run update.sh

**Option 1 — AWS CloudShell:**

1. Log into the AWS Console for your **management account**
2. Open **CloudShell**
3. Upload `update.sh`
4. Run:

```bash
bash update.sh
```

**Option 2 — Local AWS CLI:**

```bash
bash update.sh
```

The script:
- Verifies the existing StackSet deployment
- Updates the account scope in the SSM parameter and S3 template
- Pushes the update to all accounts in the org
- Optionally re-runs backfill for newly added accounts

> Only resources created **after** the update will be tagged in newly added accounts (unless backfill is enabled). Existing tags on removed accounts are not affected.

---

## Monitoring

To receive email alerts on tagging errors:

1. Go to **SNS → Topics → `map-auto-tagger-alerts-mig1234567890`**
2. **Create subscription** → Protocol: Email → enter your address
3. Confirm from your inbox

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
    "scope_mode": "account",
    "scoped_account_ids": ["ALL"],
    "scoped_vpc_ids": [],
    "tag_non_vpc_services": true
  }'
```

> Replace `mig1234567890` with your actual MPE ID throughout.

---

## Upgrade the Template Version (upgrade.sh)

When a new template version is released, upgrade an existing deployment in place without redeploying. Scope, agreement dates, and VPC config are preserved.

### Generate upgrade.sh

1. Open `configurator.html` → **Upgrade to the latest template version** card
2. Select the deployment region
3. Optionally restrict to specific MPE IDs (default: upgrade every `map-auto-tagger-mig*` deployment found in the account)
4. Click **Generate upgrade.sh** → downloads `upgrade-<mpe>.sh` (or `upgrade-all.sh`)

### Run upgrade.sh

```bash
# CloudShell (recommended) or local AWS CLI — from the deployment account:
bash upgrade.sh
```

The script:
- Enumerates matching Stacks and StackSets
- Reads each deployment's `/auto-map-tagger/<mpe>/version` SSM parameter
- Compares against the target (SemVer): PATCH/MINOR proceed in place; cross-MAJOR and downgrade are refused
- Detects backfill Lambda presence and picks the matching template variant
- Applies `update-stack` / `update-stack-set`, reading existing parameter keys from the deployed stack and passing `UsePreviousValue=true` for each (CLI v2 has no `--use-previous-parameters` flag — per-key `UsePreviousValue=true` is the equivalent)
- For StackSets: parallel rollout (100% concurrency, PARALLEL region mode)

> `upgrade.sh` refuses cross-MAJOR upgrades. For MAJOR bumps, use `delete.sh` → regenerate `deploy.sh` → redeploy. See [Upgrading Across a MAJOR Version Boundary](#upgrading-across-a-major-version-boundary).

> Use `--force` only to intentionally downgrade (not recommended). Cross-MAJOR cannot be forced.

---

## Delete a Deployment (delete.sh)

Use this when a MAP engagement ends, you need to recover from a failed deployment, or you're preparing for a MAJOR upgrade.

### Generate delete.sh

1. Open `configurator.html` → **Delete existing deployment** card
2. Select the region
3. By default, the script deletes **every** `map-auto-tagger-mig*` stack and stackset found in the region. To limit to specific MPE(s):
   - Check **Limit to specific MAP engagement(s)**
   - Enter one or more 10-character MPE IDs
4. Optionally check **Delete CloudWatch Log Groups** (default: retain for audit history)
5. Click **Review** → type the word `delete` to confirm
6. Click **Generate delete.sh** → downloads `delete-<mpe>.sh` (or `delete-all.sh` when unscoped)

### Run delete.sh

```bash
# CloudShell (recommended) or local AWS CLI — from the deployment account:
bash delete.sh
```

The script:
- Enumerates target deployments (all, or just the specified MPE IDs)
- For StackSets: deletes stack instances in parallel (100% tolerance), then the StackSet
- For Stacks: `delete-stack` + wait for completion
- Automatically deletes the S3 staging bucket **only when no MAP Auto-Tagger deployments remain** in the account (prevents breaking sibling MPE deployments)
- Idempotent — missing resources are reported as skipped, safe to re-run

### What delete.sh does NOT delete

- **`map-migrated` tags on already-tagged AWS resources** — tags are preserved so MAP credits remain intact.
- **`AWSCloudFormationStackSetAdministrationRole` / `ExecutionRole`** — shared org scaffolding used by every StackSet in the organization. Never touch these.
- **CloudWatch Log Groups** unless you opt in. Audit history is retained by default.

---

## Remove the Auto-Tagger

Prefer `delete.sh` above — it handles single-account, multi-account, optional bucket/log cleanup, and guards against breaking sibling MPE deployments.

For a manual minimal delete:

**Single account:**

```bash
aws cloudformation delete-stack --stack-name map-auto-tagger-mig1234567890
```

**Multi-account:**

```bash
aws cloudformation delete-stack-set --stack-set-name map-auto-tagger-mig1234567890
```

Tags already applied to existing resources are not removed.

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

## Upgrading from a Previous Version

For **PATCH and MINOR upgrades** (e.g. v20.3.0 → v20.4.0), use `upgrade.sh` — in place, no tagging gap, scope preserved. See [Upgrade the Template Version (upgrade.sh)](#upgrade-the-template-version-upgradesh).

For **MAJOR upgrades** (e.g. v18 → v19, or any future cross-MAJOR jump), resource names change and CloudFormation cannot bridge the rename. You must delete the old deployment first. `upgrade.sh` detects this and refuses with explicit guidance.

**From a pre-v19 unnamespaced stack (`map-auto-tagger`):**

```bash
aws cloudformation delete-stack --stack-name map-auto-tagger
aws cloudformation wait stack-delete-complete --stack-name map-auto-tagger
```

Then regenerate `deploy.sh` from the current configurator and run it. There will be a ~5–15 minute gap between delete and the new Lambda coming online — enable backfill in the new `deploy.sh` to catch resources created during the window.

For **any** MAJOR upgrade, `delete.sh` from the Delete mode handles the delete step with better safety (typed confirmation, sibling-MPE bucket guard, idempotency). Run `delete.sh` → regenerate `deploy.sh` → `bash deploy.sh`.

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
    "scope_mode": "account",
    "scoped_account_ids": ["ALL"],
    "scoped_vpc_ids": []
  }'
```

Previously tagged resources retain the old value and must be re-tagged manually via AWS Tag Editor.

> **Do not use automated bulk re-tagging scripts** in accounts with multiple concurrent MAP engagements — different resources may intentionally carry different MPE IDs.
