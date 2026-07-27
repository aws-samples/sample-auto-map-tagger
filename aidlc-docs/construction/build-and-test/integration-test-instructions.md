# Integration Test Instructions

**Stage**: Build and Test (Construction)
**Date**: 2026-03-27

## Purpose

Test interactions between units across both planes to ensure they work together correctly: the configurator (unit 1) must generate scripts (unit 5) that deploy the infrastructure (unit 3) whose Lambda (unit 2) tags resources matched by the service definitions (unit 4). Unit tests validate each piece in isolation; integration tests prove the **event-driven pipeline works against real AWS**: CloudTrail → EventBridge → SQS → Lambda → Resource Groups Tagging API, with the DLQ safety net.

The machinery lives in `.github/scripts/` and is orchestrated by `.github/workflows/e2e.yml` (deploy → create resources by category → verify tags → teardown), with a nightly `cleanup.yml` sweep as a safety net against leaked test resources.

## Test Scenarios

### Scenario 1: Configurator → Generated Scripts (units 1 + 5)

- **Description**: The browser configurator produces syntactically valid, injection-safe `deploy.sh` / `delete.sh` / `upgrade.sh` for a given configuration.
- **Setup**: Built `configurator.html`; no AWS credentials needed.
- **Test Steps**: Open `configurator.html`, complete the wizard (including a customer name containing quotes/metacharacters), download the scripts; run `bash -n` and shellcheck on each; run `python3 .github/scripts/lint_shell_injection.py` against the generated output.
- **Expected Results**: All scripts parse; user input is single-quote contained; the injection lint passes.
- **Cleanup**: Delete downloaded scripts.

### Scenario 2: Deploy → Pipeline → Tag (units 3 + 2 + 4, the core path)

- **Description**: A deployed stack tags a newly created resource end-to-end.
- **Setup**: Test AWS account with CloudTrail enabled; `npm run build:yaml`; deploy via `python3 .github/scripts/deploy_stackset.py` (single-account stack or StackSet for the multi-account variant).
- **Test Steps**: Create real resources with `python3 .github/scripts/create_resources.py` (category modules under `.github/scripts/resource_groups/`: networking, core, databases, analytics, integration, security, devtools, ml, media_iot, misc — plus `global_us_east_1.py` / `global_us_west_2.py` for global services, which only emit CloudTrail events in us-east-1). Then poll with `python3 .github/scripts/verify_tags.py` against the emitted ARN lists.
- **Expected Results**: Every taggable ARN carries `map-migrated` within the 15-minute poll budget; `verify_tags.py` exits 0. Quick manual smoke of the same path:
  ```bash
  aws s3 mb s3://test-map-$(date +%s) && sleep 90
  aws s3api get-bucket-tagging --bucket test-map-XXXXX
  # Expect: {"TagSet": [{"Key": "map-migrated", "Value": "mig..."}]}
  ```
- **Cleanup**: `python3 .github/scripts/teardown.py` (deletes test resources and the stack).

### Scenario 3: Slow-Provisioner Retry Path (SQS retry budget)

- **Description**: Resources that take 3–10 minutes to become taggable (Aurora, ElastiCache Serverless, MSK Serverless) are tagged via SQS redelivery rather than DLQ'd.
- **Setup**: Same deployed stack as Scenario 2.
- **Test Steps**: Create a slow-provisioning resource; watch the Lambda logs classify the initial failure as **transient** (TRANSIENT_MARKER), the message return to the queue, and a later receive succeed; verify the tag with `verify_tags.py` (its 15-min budget covers the 5×180s retry window).
- **Expected Results**: Tag applied within the retry budget; DLQ remains empty; no alarm fires.
- **Cleanup**: `teardown.py`.

### Scenario 4: DLQ / Alarm Path (failure safety net)

- **Description**: A permanently failing event exhausts its 5 receives, lands in the DLQ, and the CloudWatch alarm notifies via SNS.
- **Setup**: Deployed stack; temporarily induce a permanent failure (e.g., create a resource then delete it before the tagger processes the event, or use an event the IAM role cannot tag).
- **Test Steps**: Confirm 5 delivery attempts in Lambda logs; check DLQ depth > 0; confirm the DLQ alarm transitions to ALARM and SNS delivers.
- **Expected Results**: Exactly 5 attempts (no infinite retry), message in DLQ with original body intact (14-day retention allows manual replay), alarm + notification fire. Optionally run `python3 .github/scripts/assert_tagger_health.py` to confirm the health signal reflects the DLQ state.
- **Cleanup**: Purge the DLQ, let the alarm return to OK, `teardown.py`.

### Scenario 5: delete.sh Preserves Tags (unit 5 hard rule)

- **Description**: Removing the solution deletes infrastructure only — never `map-migrated` tags on customer resources. MAP credits are permanent; a removed tag is irreversible loss.
- **Setup**: Deployed stack plus at least one resource tagged by Scenario 2.
- **Test Steps**: Run the generated `delete.sh`; confirm the stack and its components (EventBridge, SQS, Lambda, IAM, SSM, alarms) are gone; re-read the tags on the previously tagged resource.
- **Expected Results**: Infrastructure removed; `map-migrated` tag still present on the resource; log groups retained per their DeletionPolicy.
- **Cleanup**: Delete the (still-tagged) test resource manually.

## Setup Integration Test Environment

### 1. Start Required Services

```bash
npm install && npm run build && npm run build:yaml   # fresh artifacts
export AWS_PROFILE=<test-account-profile>            # NEVER a production account
python3 .github/scripts/deploy_stackset.py --template configurator.yaml ...
python3 .github/scripts/wait_stackset.py             # block until deployed
```

### 2. Configure Service Endpoints

No endpoints to configure — the pipeline is event-driven inside the account. Ensure CloudTrail is enabled in the test account and note the region (global-service events appear only in us-east-1).

## Run Integration Tests

### 1. Execute Integration Test Suite

The full suite runs in GitHub Actions (`e2e.yml`) on demand: deploy jobs (single-account stack + multi-account StackSet), parallel per-category resource-creation jobs uploading ARN artifacts, then a verify job and teardown. Locally, run the same scripts in sequence: `deploy_stackset.py` → `create_resources.py --group <category>` → `verify_tags.py` → `teardown.py`.

### 2. Verify Service Interactions

- **Test Scenarios**: the five scenarios above; the e2e workflow automates Scenarios 2–3 across all resource categories.
- **Expected Results**: `verify_tags.py` exit 0 = all taggable ARNs tagged within budget; exit non-zero lists the untagged ARNs.
- **Logs Location**: Lambda CloudWatch log group in the test account; GitHub Actions job logs for the workflow runs.

### 3. Cleanup

```bash
python3 .github/scripts/teardown.py
# Safety net: cleanup.yml runs nightly (guarded by nightly_cleanup_guard.py)
# and sweep_iam_roles.py removes orphaned test IAM roles.
```

**Cleanup is mandatory** — leaked E2E resources cost real money and, worse, leaked taggers in a shared test account cause peer-tagger collisions for the next run.
