# MAP 2.0 Auto-Tagger

> **Disclaimer:** This is sample code for non-production usage. You should work with your security and legal teams to meet your organizational security, regulatory, and compliance requirements before deployment. You are responsible for testing, securing, and optimizing this solution as appropriate for production use based on your specific quality control practices and standards. Deploying this solution may incur AWS charges for Lambda, EventBridge, CloudWatch, SSM Parameter Store, SQS, and SNS. Under the [AWS Shared Responsibility Model](https://aws.amazon.com/compliance/shared-responsibility-model/), you are responsible for security decisions in the cloud, including the IAM roles and policies deployed by this solution.

**Automatic AWS resource tagging for MAP 2.0 credit tracking.**

Customers miss MAP 2.0 credits because engineers forget to tag resources, scripts create resources without tags, and dependent resources (EBS volumes, snapshots, read replicas) go untagged. This solution catches resource creation events via CloudTrail → EventBridge → SQS → Lambda and applies the `map-migrated` tag automatically — typically within 60–90 seconds, across 154 resource types.

---

## Quick Start

### 1. Generate deploy.sh

Open `build/configurator.html` in a browser, fill in your MAP Engagement ID and details, click **Generate & Download**.

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

## Day-2: Add or Remove Accounts

1. Open `configurator.html` → **Editor** tab
2. Enter MPE ID, choose add/remove, enter account IDs
3. Click **Generate update.sh** → download and run:

```bash
bash update.sh
```

No redeployment needed — updates the account scope across all existing stack instances.

---

## Removing a Deployment

1. Open `configurator.html` → **Delete existing deployment** tab
2. Select region; by default every `map-auto-tagger-mig*` stack/stackset is removed. Optionally scope to specific MPE(s).
3. Type `DELETE` to confirm → **Generate delete.sh** → download and run:

```bash
bash delete-all.sh   # or delete-<mpe>.sh if scoped
```

The S3 staging bucket is deleted only when no other MAP Auto-Tagger deployments remain in the account. `map-migrated` tags on already-tagged AWS resources are preserved (MAP credits remain intact).

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
| `build/configurator.html` | Self-service UI (built output). Generates `deploy.sh` for new deployments, `update.sh` for day-2 account changes (Editor tab), `upgrade.sh` for template-version upgrades (Upgrade tab), and `delete.sh` for clean removal (Delete tab). |
| `src/` | Modular source files — CSS, HTML skeleton, JS modules, i18n, per-service definitions, Lambda Python |
| `scripts/build.js` | Build script — assembles `build/configurator.html` from `src/` |
| `map2-auto-tagger-optimized.yaml` | CloudFormation template (154 resource types, IAM hardened) |
| `CHANGELOG.md` | Version history |

---

## Development

```bash
npm install              # install dependencies (first time)
npm run build            # assemble build/configurator.html from src/
npm test                 # run unit tests (vitest)
npm run verify           # sanity-check the built output
```

Source files live in `src/`. Edit there, run `npm run build`, open `build/configurator.html` to test.

**Adding a new AWS service:** drop a `.js` file in `src/js/services/` following the format in `src/js/services/README.md`, then `npm run build`.

---

## Cost

| Component | Monthly Cost |
|-----------|-------------|
| Lambda — Auto-Tagger (100–1,000 invocations/day) | $0.10 – $2.00 |
| Lambda — Reconciliation (1/day) + Preflight (1 at deploy) | < $0.01 |
| EventBridge + SQS + SSM | $0.01 – $0.20 |
| **Total per account** | **< $2/month** |

---

## Documentation

| Document | Description |
|----------|-------------|
| [OVERVIEW.md](docs/OVERVIEW.md) | How it works — architecture, deployment, auto-deployment, SSM scope, cost |
| [INSTRUCTIONS.md](docs/INSTRUCTIONS.md) | Deployment steps, day-2 operations (update.sh), monitoring, upgrade path, FAQ |
| [COVERAGE.md](docs/COVERAGE.md) | Supported services (154 resource types) and E2E test coverage matrix |
| [LIMITATIONS.md](docs/LIMITATIONS.md) | Hard constraints — management account, SCPs, latency, upgrade gotcha |
| [MAP_TAGGING_GAP_ANALYSIS.md](docs/MAP_TAGGING_GAP_ANALYSIS.md) | What can't be tagged and why (AWS API limitations, customer-side config) |
| [CHANGELOG.md](CHANGELOG.md) | Version history and release notes |

---

## License

This project is licensed under the [MIT-0](LICENSE) license.
