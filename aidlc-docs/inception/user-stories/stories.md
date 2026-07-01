# User Stories — MAP 2.0 Auto-Tagger

Organization: **Feature-Based** | Granularity: **Medium**

---

## Feature 1: Self-Service Configurator

### US-1.1: Generate Deployment Script
**As an** SA, **I want to** enter my MAP Engagement ID and scope into a browser form **so that** I get a ready-to-run deployment script.

**Acceptance Criteria:**
- [ ] Form fields: MPE ID, agreement start/end dates, scope mode, account IDs, VPC IDs, alert email
- [ ] Input validation (MPE format, date ranges, account ID format)
- [ ] "Generate & Download" produces a self-contained `deploy.sh`
- [ ] CloudFormation template embedded in the script (no external hosting)

### US-1.2: Multi-Language Support
**As an** SA in APJ, **I want to** use the configurator in my language **so that** I can work efficiently.

**Acceptance Criteria:**
- [ ] Language selector with en, ja, ko, th, vi, id, zh
- [ ] All UI strings translated
- [ ] Language preference persists during session

### US-1.3: Single vs Multi-Account Mode
**As an** SA, **I want to** choose single-account or organization deployment **so that** I match the customer's setup.

**Acceptance Criteria:**
- [ ] Toggle between Stack (single) and StackSet (multi-account) mode
- [ ] Multi-account mode accepts a list of account IDs
- [ ] Generated script uses the correct CFN template

---

## Feature 2: Automatic Tagging

### US-2.1: Tag New Resources
**As a** customer engineer, **I want** new resources tagged automatically **so that** I don't lose MAP credits.

**Acceptance Criteria:**
- [ ] Any supported resource creation triggers tagging
- [ ] `map-migrated` tag applied with correct MPE-derived value
- [ ] Tagging completes within 60–90 seconds
- [ ] No action required from the engineer

### US-2.2: Broad Service Coverage
**As a** FinOps analyst, **I want** all major resource types covered **so that** credit capture is comprehensive.

**Acceptance Criteria:**
- [ ] 154 resource types across compute, database, storage, networking, analytics, AI/ML, etc.
- [ ] Dependent resources (EBS, snapshots, replicas) covered
- [ ] Coverage documented in COVERAGE.md

### US-2.3: Handle Slow-Provisioning Resources
**As a** customer engineer, **I want** slow-to-provision resources (Aurora, ElastiCache Serverless) tagged reliably **so that** nothing is missed.

**Acceptance Criteria:**
- [ ] SQS retry buffer (5 retries, 180s visibility) covers 3-10 min provisioning delays
- [ ] 14-day message retention prevents event loss

---

## Feature 3: Failure Handling & Observability

### US-3.1: Alert on Tagging Failures
**As an** SA, **I want to** be alerted when tagging fails repeatedly **so that** I can investigate.

**Acceptance Criteria:**
- [ ] Events failing 5 retries route to DLQ
- [ ] CloudWatch alarm fires on DLQ activity
- [ ] SNS email sent to configured address
- [ ] Failed events preserved for investigation

### US-3.2: Verify Tagging Works
**As an** SA, **I want to** verify tagging after deployment **so that** I can confirm it's working.

**Acceptance Criteria:**
- [ ] Documented verification steps (create test resource, check tag after 90s)
- [ ] Tag verification tooling available

---

## Feature 4: Scope Management (Day-2)

### US-4.1: Add/Remove Accounts
**As an** SA, **I want to** change which accounts are in scope **so that** I can adjust as the migration grows.

**Acceptance Criteria:**
- [ ] StackSet update with new account list (full replacement)
- [ ] No full redeploy required
- [ ] Existing config preserved (dates, VPCs)

### US-4.2: Retrieve Current Config
**As an** SA, **I want to** see the current scope configuration **so that** I know what's deployed.

**Acceptance Criteria:**
- [ ] Config readable from SSM Parameter Store
- [ ] Returns MPE ID, dates, scope mode, account IDs, VPC IDs

---

## Feature 5: Lifecycle Operations

### US-5.1: Upgrade Service Coverage
**As an** SA, **I want to** upgrade to new service coverage **so that** customers benefit from added resource types.

**Acceptance Criteria:**
- [ ] Upgrade-safe path preserves scope config (region + MPE only)
- [ ] Change-set preview before applying
- [ ] Full-redeploy path documented for breaking changes

### US-5.2: Clean Removal
**As an** SA, **I want to** remove the solution cleanly **so that** no orphaned resources remain.

**Acceptance Criteria:**
- [ ] `delete.sh` removes all `map-auto-tagger-*` stacks/stacksets
- [ ] Existing `map-migrated` tags preserved (credits intact)
- [ ] S3 staging bucket removed only when no other deployments remain

---

## Feature 6: Extensibility

### US-6.1: Add New AWS Service
**As a** maintainer, **I want to** add a new AWS service easily **so that** coverage keeps pace with AWS.

**Acceptance Criteria:**
- [ ] Drop a `.js` file in `src/js/services/` following the standard format
- [ ] Matching ARN extractor in Lambda handler
- [ ] `npm run build` regenerates configurator
- [ ] Coverage audit confirms handler parity
