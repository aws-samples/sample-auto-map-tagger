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
    "scope_mode": "account",
    "scoped_account_ids": ["ALL"],
    "scoped_vpc_ids": []
  }'
```

> Replace `mig1234567890` with your actual MPE ID throughout.

**Fields read by the runtime Lambda:**
>
> - `mpe_id` — the MAP Engagement ID applied as the tag value.
> - `agreement_start_date` — `YYYY-MM-DD`; events with `eventTime` before this date are skipped (also used by the backfill CustomResource as the CloudTrail lookup start).
> - `scope_mode` — `account` or `vpc`. Determines which field below is authoritative.
> - `scoped_account_ids` — list of 12-digit account IDs, or `["ALL"]`. In `account` mode, only tags resources whose creation event came from a listed account. Ignored in `vpc` mode.
> - `scoped_vpc_ids` — list of `vpc-…` IDs. In `vpc` mode, only tags resources whose VPC membership resolves to a listed VPC; resources with no VPC association (S3, DynamoDB, Lambda, SNS, SQS, etc.) are **skipped** in `vpc` mode by design. Ignored in `account` mode.
>
> Fields shown in the configurator UI like `tag_non_vpc_services` are UI-only
> controls that shape how `scoped_vpc_ids` is populated at deploy time; they
> are not read by the runtime Lambda and have no effect if added here.

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

## Upgrading from a Previous Version

Prior versions used fixed resource names (`map-auto-tagger`, `/auto-map-tagger/config`). The current version uses MPE-ID-namespaced names (`map-auto-tagger-mig111`, `/auto-map-tagger/mig111/config`).

Running `deploy.sh` on an existing deployment will deploy a **second stack** alongside the old one. Delete the old stack first:

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
    "scope_mode": "account",
    "scoped_account_ids": ["ALL"],
    "scoped_vpc_ids": []
  }'
```

Previously tagged resources retain the old value and must be re-tagged manually via AWS Tag Editor.

> **Do not use automated bulk re-tagging scripts** in accounts with multiple concurrent MAP engagements — different resources may intentionally carry different MPE IDs.
