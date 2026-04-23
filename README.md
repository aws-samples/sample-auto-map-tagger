# MAP 2.0 Auto-Tagger

> **Disclaimer:** This is sample code for non-production usage. You should work with your security and legal teams to meet your organizational security, regulatory, and compliance requirements before deployment. You are responsible for testing, securing, and optimizing this solution as appropriate for production use based on your specific quality control practices and standards. Deploying this solution may incur AWS charges for Lambda, EventBridge, CloudWatch, SSM Parameter Store, SQS, and SNS. Under the [AWS Shared Responsibility Model](https://aws.amazon.com/compliance/shared-responsibility-model/), you are responsible for security decisions in the cloud, including the IAM roles and policies deployed by this solution.

**Automatic AWS resource tagging for MAP 2.0 credit tracking.**

Customers miss MAP 2.0 credits because engineers forget to tag resources, scripts create resources without tags, and dependent resources (EBS volumes, snapshots, read replicas) go untagged. This solution catches resource creation events via CloudTrail → EventBridge → SQS → Lambda and applies the `map-migrated` tag automatically — typically within 60–90 seconds, across 140+ resource types.

---

## Quick Start

### 1. Generate deploy.sh

Open `configurator.html` in a browser, fill in your MAP Engagement ID and details, click **Generate & Download**.

### 2. Run deploy.sh

```bash
# AWS CloudShell (recommended) — upload deploy.sh, then:
bash deploy.sh

# Or local AWS CLI with credentials configured:
bash deploy.sh
```

One file. One command. Done.

### 3. Verify

```bash
aws s3 mb s3://test-map-$(date +%s) && sleep 90
aws s3api get-bucket-tagging --bucket test-map-XXXXX
# Expected: {"TagSet": [{"Key": "map-migrated", "Value": "mig1234567890"}]}
```

---

## Day-2: Post-Deployment Operations

Open `configurator.html` → choose a mode card:

| Mode | Output | When to use |
|---|---|---|
| ✏️ Edit existing deployment | `update.sh` | Add/remove accounts from scope. No CFN redeploy. |
| 🔄 Update to latest template version | `upgrade.sh` | Upgrade to a new PATCH/MINOR version in place. Preserves scope, agreement dates. Refuses cross-MAJOR. |
| 🗑️ Destroy existing deployment | `destroy.sh` | Remove a deployment cleanly. Required before MAJOR upgrades. Preserves `map-migrated` tags on resources. |

Download the generated script, upload to CloudShell from the deployment account, and run it. See [INSTRUCTIONS.md](docs/INSTRUCTIONS.md) for full details.

---

## Upgrading from a Previous Version

Prior versions used fixed resource names (`map-auto-tagger`). The current version uses MPE-ID-namespaced names (`map-auto-tagger-mig111`). Running `deploy.sh` without removing the old stack will deploy **both side by side**. Delete the old stack first:

```bash
aws cloudformation delete-stack --stack-name map-auto-tagger
aws cloudformation wait stack-delete-complete --stack-name map-auto-tagger
bash deploy.sh
```

---

## Components

| File | Description |
|------|-------------|
| `configurator.html` | Self-service UI. Four modes: Deploy (generates `deploy.sh`), Edit (generates `update.sh` for account-scope changes), Update (generates `upgrade.sh` for template-version upgrades), Destroy (generates `destroy.sh` for clean removal). |
| `map2-auto-tagger-optimized.yaml` | CloudFormation template (140+ resource types, IAM hardened) |
| `CHANGELOG.md` | Version history |

---

## Cost

| Component | Monthly Cost |
|-----------|-------------|
| Lambda (100–1,000 invocations/day) | $0.10 – $2.00 |
| EventBridge + SQS + SSM | $0.01 – $0.20 |
| **Total per account** | **< $2/month** |

---

## Documentation

| Document | Description |
|----------|-------------|
| [OVERVIEW.md](docs/OVERVIEW.md) | How it works — architecture, deployment, auto-deployment, SSM scope, cost |
| [INSTRUCTIONS.md](docs/INSTRUCTIONS.md) | Deployment steps, day-2 operations (update.sh / upgrade.sh / destroy.sh), monitoring, upgrade path, FAQ |
| [COVERAGE.md](docs/COVERAGE.md) | Supported services (140+ resource types) and E2E test coverage matrix |
| [LIMITATIONS.md](docs/LIMITATIONS.md) | Hard constraints — management account, SCPs, latency, upgrade gotcha |
| [MAP_TAGGING_GAP_ANALYSIS.md](docs/MAP_TAGGING_GAP_ANALYSIS.md) | What can't be tagged and why (AWS API limitations, customer-side config) |
| [CHANGELOG.md](CHANGELOG.md) | Version history and release notes |

---

## License

This project is licensed under the [MIT-0](LICENSE) license.
