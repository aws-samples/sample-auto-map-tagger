# MAP 2.0 Auto-Tagger — Instructions

---

# FOR THE AWS ACCOUNT TEAM

**1. Open `configurator.html` in any browser**

**2. Fill in the form**

| Field | What to enter |
|-------|--------------|
| MAP Engagement ID | From AWS Investments — starts with `mig` |
| Agreement Start Date | Date the MAP agreement was signed |
| Customer Name | For your reference only |
| Deployment Mode | Single Account or Multiple Accounts |
| Account IDs | If multiple — add each migration account ID and a label (for reference) |
| Region(s) | Regions where the customer creates resources |

**3. Click "Generate & Download" → downloads `deploy.sh`**

**4. Send `deploy.sh` to the customer with:**

> *"Log into the AWS Console, open CloudShell from the top menu bar, upload this file, and run: `bash deploy.sh`"*

---

---

# FOR THE CUSTOMER

## Single Account

1. Log into the AWS Console for your **migration account**
2. Open **CloudShell** (terminal icon in the top menu bar)
3. Click **Actions → Upload file** → upload `deploy.sh`
4. Run:

```bash
bash deploy.sh
```

Done. The script deploys everything and confirms when complete.

---

## Multiple Accounts (AWS Organizations)

1. Log into the AWS Console for your **management account**
2. Open **CloudShell** (terminal icon in the top menu bar)
3. Click **Actions → Upload file** → upload `deploy.sh`
4. Run:

```bash
bash deploy.sh
```

Done. The script handles everything automatically — no additional steps needed.

> CloudShell is already authenticated as your current account. No AWS CLI installation or credential setup required.

---

## Check deployment status (multi-account only)

The script prints the status commands when it finishes. To check manually:

```bash
# Overall stack status
aws cloudformation describe-stacks \
  --stack-name map-auto-tagger \
  --query "Stacks[0].StackStatus"

# Per-account deployment (~10 min)
aws cloudformation list-stack-instances \
  --stack-set-name map-auto-tagger-mig1234 \
  --query "Summaries[*].[Account,Region,StackInstanceStatus.DetailedStatus]" \
  --output table
```

---

## Monitoring

To receive email alerts on tagging errors:

1. Go to **SNS → Topics → `map-auto-tagger-alerts`**
2. **Create subscription** → Protocol: Email → enter your address
3. Confirm from your inbox

To view tagging activity:

```bash
aws logs tail /aws/lambda/map-auto-tagger --follow
```

---

## Update the MAP Engagement ID

No redeployment needed — just update the config:

```bash
aws ssm put-parameter \
  --name /map-tagger/config \
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

---

## Remove the Auto-Tagger

```bash
aws cloudformation delete-stack --stack-name map-auto-tagger
```

Tags already applied to existing resources are not removed.

---

## FAQ

**Will this tag resources that already exist?**
No — only resources created after deployment.

**Will it overwrite my other tags?**
No — it only adds `map-migrated`. All existing tags are untouched.

**What if a resource fails to tag?**
Failed events go to a Dead Letter Queue. An alarm fires. Tag it manually or retry.

**Does it affect my workload performance?**
No — runs independently, only adds a tag, zero impact on resources.

**What regions does it cover?**
The region(s) selected during setup. Redeploy the script in additional regions as needed.

**Why does it deploy to ALL accounts in the org?**
AWS Organizations requires OU-based targeting for cross-account deployments — individual account IDs cannot be used as deployment targets. The auto-tagger deploys to all accounts in your org. It only fires when resources are created, so inactive accounts (audit, log archive) are unaffected.
