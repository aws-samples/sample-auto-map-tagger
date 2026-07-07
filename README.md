# MAP 2.0 Auto-Tagger

> **Disclaimer:** This is sample code for non-production usage. You should work with your security and legal teams to meet your organizational security, regulatory, and compliance requirements before deployment. You are responsible for testing, securing, and optimizing this solution as appropriate for production use based on your specific quality control practices and standards. Deploying this solution may incur AWS charges for Lambda, EventBridge, CloudWatch, SSM Parameter Store, SQS, and SNS. Under the [AWS Shared Responsibility Model](https://aws.amazon.com/compliance/shared-responsibility-model/), you are responsible for security decisions in the cloud, including the IAM roles and policies deployed by this solution.

**Automatic AWS resource tagging for MAP 2.0 credit tracking.**

Customers miss MAP 2.0 credits because engineers forget to tag resources, scripts create resources without tags, and dependent resources (EBS volumes, snapshots, read replicas) go untagged. This solution catches resource creation events via CloudTrail → EventBridge → SQS → Lambda and applies the `map-migrated` tag automatically — typically within 60–90 seconds, across 154 resource types.

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

## Day-2: Add or Remove Accounts

Run in AWS CloudShell from the management account. List **all** accounts that should be in scope (this is a full replacement):

```bash
aws cloudformation update-stack-set --stack-set-name map-auto-tagger-mig<MPE_ID> --use-previous-template --parameters 'ParameterKey=ScopedAccountIds,ParameterValue="[\"111111111111\",\"222222222222\"]"' 'ParameterKey=MpeId,UsePreviousValue=true' 'ParameterKey=AgreementStartDate,UsePreviousValue=true' 'ParameterKey=AgreementEndDate,UsePreviousValue=true' 'ParameterKey=ScopeMode,UsePreviousValue=true' 'ParameterKey=ScopedVpcIds,UsePreviousValue=true' 'ParameterKey=TagNonVpcServices,UsePreviousValue=true' 'ParameterKey=AlertEmail,UsePreviousValue=true' --capabilities CAPABILITY_NAMED_IAM --region <REGION>
```

See [INSTRUCTIONS.md](docs/INSTRUCTIONS.md) for single-account deployments and detailed guidance.

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

## Upgrading to a New Version

Each release note states whether the update is **upgrade-safe** or requires a **full redeploy**.

### Option A: Upgrade (service coverage updates — no re-entry needed)

Use when the release note says **"Upgrade-safe"** (most releases — new services, bug fixes, no new parameters).

1. Download the latest `configurator.html`
2. Select **"Update to latest template version"**
3. Enter your **region** and **MPE ID** only
4. Run the generated `upgrade.sh`

Your scope configuration (accounts, VPCs, dates) is preserved automatically. A change-set preview shows exactly what will change before applying.

### Option B: Re-run deploy.sh (also safe for any release)

Re-generate `deploy.sh` from the configurator with the same settings you used originally, then run it. The stack updates in-place.

To retrieve your current settings via CloudShell:

```bash
aws ssm get-parameter --name /auto-map-tagger/<MPE_ID>/config --query Parameter.Value --output text --region <REGION>
```

This returns your MPE ID, dates, scope mode, account IDs, and VPC IDs — everything you need to fill in the configurator.

### Option C: Full redeploy (required when release notes say so)

Use when the release note says **"Full redeploy required"** (rare — only when new configuration parameters are introduced).

```bash
aws cloudformation delete-stack --stack-name map-auto-tagger-mig<MPE_ID> --region <REGION>
aws cloudformation wait stack-delete-complete --stack-name map-auto-tagger-mig<MPE_ID> --region <REGION>
bash deploy.sh
```

Existing `map-migrated` tags on resources are preserved — MAP credits stay intact. Enable backfill to catch resources created during the brief gap (~2-5 minutes).

---

## Components

| File | Description |
|------|-------------|
| `configurator.html` | Self-service UI (built output). Generates `deploy.sh` for new deployments and `delete.sh` for clean removal. Day-2 account scope changes are done via CloudShell (see INSTRUCTIONS.md). |
| `src/` | Modular source files — CSS, HTML skeleton, JS modules, i18n, per-service definitions, Lambda Python |
| `scripts/build.js` | Build script — assembles `configurator.html` from `src/` |
| `CHANGELOG.md` | Version history |

---

## Development

```bash
npm install              # install dependencies (first time)
npm run build            # assemble configurator.html from src/
npm test                 # run unit tests (vitest)
npm run verify           # sanity-check the built output
npm run sync-rules       # sync AI agent rules (.kiro/steering -> .claude/rules)
```

**AI agent rules:** Engineering rules for AI coding agents live in `.kiro/steering/` (Kiro) and are mirrored to `.claude/rules/` (Claude Code). Edit the `.kiro/steering/` copy, then run `npm run sync-rules` and commit both. See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for details.

Source files live in `src/`. Edit there, run `npm run build`, open `configurator.html` to test.

**Adding a new AWS service:** drop a `.js` file in `src/js/services/` following the format in [DEVELOPMENT.md](docs/DEVELOPMENT.md), then `npm run build`.

For the full source structure, build process, and extension guide, see [DEVELOPMENT.md](docs/DEVELOPMENT.md).

---

## Cost

| Component | Monthly Cost |
|-----------|-------------|
| Lambda — Auto-Tagger (100–1,000 invocations/day) | $0.10 – $2.00 |
| Lambda — Preflight (1 at deploy) | < $0.01 |
| EventBridge + SQS + SSM | $0.01 – $0.20 |
| **Total per account** | **< $2/month** |

---

## Documentation

| Document | Description |
|----------|-------------|
| [OVERVIEW.md](docs/OVERVIEW.md) | How it works — architecture, deployment, auto-deployment, SSM scope, cost |
| [INSTRUCTIONS.md](docs/INSTRUCTIONS.md) | Deployment steps, day-2 operations, monitoring, upgrade path, FAQ |
| [COVERAGE.md](docs/COVERAGE.md) | Supported services (154 resource types) and E2E test coverage matrix |
| [LIMITATIONS.md](docs/LIMITATIONS.md) | Hard constraints — management account, SCPs, latency, upgrade gotcha |
| [MAP_TAGGING_GAP_ANALYSIS.md](docs/MAP_TAGGING_GAP_ANALYSIS.md) | What can't be tagged and why (AWS API limitations, customer-side config) |
| [CHANGELOG.md](CHANGELOG.md) | Version history and release notes |

---

## License

This project is licensed under the [MIT-0](LICENSE) license.
