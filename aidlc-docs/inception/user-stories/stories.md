# User Stories — MAP 2.0 Auto-Tagger

Stories are grouped by persona (Persona-Based breakdown, approved in `story-generation-plan.md`). All stories follow INVEST criteria with Given/When/Then acceptance criteria. Priority: Must / Should / Could. Each story is assigned to exactly one unit of work (see `unit-of-work-story-map.md`).

---

## Persona 1: Priya — Partner / ProServe Migration Consultant

### US-1: Configure an engagement in the browser
**As a** migration consultant, **I want** to enter the MPE ID, agreement start/end dates, and deployment scope into a single self-contained HTML page, **so that** I can produce a correct deployment package without installing anything or sending customer data anywhere.

**Acceptance Criteria**
- Given the configurator HTML file opened from local disk, When I complete the form, Then all validation runs client-side and the page makes zero network requests.
- Given an invalid MPE ID format or an agreement end date before the start date, When I attempt to proceed, Then the field is rejected with a localized, specific error message.
- Given a completed configuration, When I review the summary step, Then every value I entered is displayed for confirmation before any artifact is generated.

**Priority**: Must | **Unit**: unit-1-configurator

### US-2: Generate the deployment package
**As a** migration consultant, **I want** the configurator to generate `deploy.sh`, `delete.sh`, `upgrade.sh`, and the CloudFormation template from my configuration, **so that** the customer can deploy without editing anything by hand.

**Acceptance Criteria**
- Given a confirmed configuration, When I click generate, Then all artifacts download from the browser, parameterized with my MPE ID, dates, and scope.
- Given any user-supplied value (e.g., customer name) containing shell metacharacters, When scripts are generated, Then the value is single-quote contained and cannot alter script behavior.
- Given generated artifacts, When inspected, Then they embed the template version identifier from the single version constant.

**Priority**: Must | **Unit**: unit-1-configurator

### US-3: Work in my customer's language
**As a** consultant running workshops in APJ, **I want** the entire configurator UI in English, Indonesian, Japanese, Korean, Thai, Vietnamese, or Chinese, **so that** customer staff can follow and validate the configuration themselves.

**Acceptance Criteria**
- Given the locale selector, When I choose any of the 7 locales, Then every visible UI string (labels, validation errors, help text) renders in that locale with no untranslated keys.
- Given a new UI string added by a maintainer, When locale files are incomplete, Then the automated i18n completeness test fails.

**Priority**: Must | **Unit**: unit-1-configurator

### US-4: Run concurrent engagements safely
**As a** consultant with multiple active MAP engagements in one customer organization, **I want** every deployment namespaced by MPE ID, **so that** engagements coexist without clobbering each other's queues, roles, config, or tags.

**Acceptance Criteria**
- Given two engagements with different MPE IDs, When both are deployed to the same organization, Then all stacks, queues, roles, alarms, and SSM parameters are distinct under `map-auto-tagger-<mpeId>` naming.
- Given two engagements whose account scopes overlap, When the second deploy runs preflight, Then the overlap is detected and the deploy refuses to proceed with a clear explanation.

**Priority**: Must | **Unit**: unit-3-infrastructure

### US-18: Trust the tool with customer data
**As a** consultant subject to customer security review, **I want** written, verifiable guarantees that no configuration data leaves the browser and nothing in the deployed solution calls out of the customer account, **so that** security teams approve the tool.

**Acceptance Criteria**
- Given the configurator, When its source is audited, Then it contains no telemetry, analytics, CDN, or remote-fetch code.
- Given the deployed runtime, When its IAM policies and code are audited, Then no outbound network call exists other than AWS service API calls within the account/region; updates are distributed exclusively via GitHub Releases.

**Priority**: Must | **Unit**: unit-1-configurator

---

## Persona 2: Marcus — Customer Cloud Platform Engineer

### US-5: Deploy org-wide in one operation
**As a** platform engineer, **I want** `deploy.sh` to roll the solution out via CloudFormation StackSets with AutoDeployment (delegated admin supported), **so that** every current and future in-scope account is covered without per-account work.

**Acceptance Criteria**
- Given an organization with a delegated CloudFormation admin account, When I run `deploy.sh`, Then stack instances deploy to all in-scope accounts and AutoDeployment covers accounts added later.
- Given a single-account customer, When I choose single-account mode, Then a plain stack deploys with identical runtime behavior.
- Given a partial deployment failure, When the script exits, Then no state-mutating step's failure has been silently swallowed and the failure point is clearly reported.

**Priority**: Must | **Unit**: unit-5-lifecycle-ops

### US-6: Scope precisely
**As a** platform engineer, **I want** to scope tagging to an explicit account list (or ALL) and optionally to specific VPC IDs, with a separate switch for non-VPC services, **so that** only genuinely migrated workloads receive the tag.

**Acceptance Criteria**
- Given scope_mode with an explicit account list, When a resource is created in an out-of-scope account, Then it is not tagged.
- Given a scoped VPC list, When a VPC-bound resource is created in a non-listed VPC, Then it is not tagged; When created in a listed VPC, Then it is tagged.
- Given tag_non_vpc_services=false, When a non-VPC-bound resource (e.g., an S3 bucket) is created, Then it is not tagged.

**Priority**: Must | **Unit**: unit-2-lambda-tagger

### US-7: Review least-privilege IAM before deploying
**As a** platform engineer answerable to security review, **I want** the generated IAM policies to grant only the tagging actions the covered services need, **so that** the deployment passes least-privilege review.

**Acceptance Criteria**
- Given the generated template, When its IAM policies are diffed against the covered service definitions, Then every granted action traces to a covered service and no broad wildcards exist.
- Given a service added to coverage, When IAM generation runs, Then its required permissions appear automatically and an IAM-completeness check gates CI.

**Priority**: Must | **Unit**: unit-3-infrastructure

### US-8: Upgrade in place
**As a** platform engineer, **I want** `upgrade.sh` to update an existing deployment without losing my configured parameter values, **so that** I can adopt new versions safely.

**Acceptance Criteria**
- Given a deployed stack, When I run `upgrade.sh` with a newer template, Then parameters that already exist in the stack keep their previous values and newly added parameters take safe template defaults.
- Given a stack in a state incompatible with in-place upgrade, When preflight runs, Then the upgrade refuses with a clear explanation instead of proceeding.

**Priority**: Must | **Unit**: unit-5-lifecycle-ops

### US-9: Delete without losing credits
**As a** platform engineer, **I want** `delete.sh` to remove all solution infrastructure and never touch `map-migrated` tags on my resources, **so that** teardown cannot destroy earned credits.

**Acceptance Criteria**
- Given a deployed solution and tagged resources, When `delete.sh` completes, Then EventBridge rules, SQS queues, Lambda, IAM roles, SSM parameters, and alarms are gone and every previously applied `map-migrated` tag remains.
- Given the delete script source, When audited or tested, Then no code path issues any untag/remove-tag API call.

**Priority**: Must | **Unit**: unit-5-lifecycle-ops

### US-10: Preflight before mutation
**As a** platform engineer, **I want** deploy and upgrade to validate everything before mutating anything, **so that** a misconfiguration is caught as a refusal, not as a broken half-deployment.

**Acceptance Criteria**
- Given a peer tagger already deployed with intersecting scope, When preflight runs, Then deployment refuses and names the conflicting engagement.
- Given missing IAM capability or an incompatible stack state, When preflight runs, Then the operation stops before any resource is created or modified.

**Priority**: Must | **Unit**: unit-5-lifecycle-ops

### US-11: Get alerted on failure
**As a** platform engineer on call, **I want** CloudWatch alarms (TaggerError, DLQFillingUp, TrickleFailure, PeerTaggerDetected) wired to SNS, **so that** I learn about tagging failures from a page, not from a missing credit.

**Acceptance Criteria**
- Given a Lambda error spike, When the TaggerError alarm threshold is crossed, Then an SNS notification is delivered.
- Given messages accumulating in the DLQ, When DLQFillingUp fires, Then the notification identifies the engagement (MPE namespace) affected.
- Given a sustained low-rate failure pattern that never spikes, When TrickleFailure evaluates, Then it fires despite per-period counts being small.

**Priority**: Must | **Unit**: unit-3-infrastructure

### US-12: Buffer slow provisioners
**As a** platform engineer, **I want** the pipeline to retry resources that take minutes to become taggable, **so that** Aurora clusters, ElastiCache Serverless, and MSK Serverless are tagged rather than dead-lettered.

**Acceptance Criteria**
- Given a create event for a slow-provisioning resource, When the first tag attempt fails with a not-yet-taggable error, Then the message returns to the queue and is retried up to 5 times over a 15-minute budget (180s visibility × 5 receives).
- Given a resource that becomes taggable on attempt 3, When the retry succeeds, Then no alarm fires and no DLQ entry is created.
- Given the retry budget exhausted, When the 5th receive fails, Then the message lands in the DLQ (14-day retention) for manual replay.

**Priority**: Must | **Unit**: unit-3-infrastructure

---

## Persona 3: Elena — FinOps / Migration Program Manager

### US-13: Tags land within minutes
**As a** program manager, **I want** newly created eligible resources tagged typically within 60–90 seconds (worst case 15 minutes), **so that** credit capture is continuous and nothing slips through an untagged window.

**Acceptance Criteria**
- Given a covered resource created in an in-scope account/VPC, When I check its tags after 90 seconds, Then `map-migrated=<mpe id>` is present in the typical case.
- Given a resource created outside the agreement date window, When the tagger evaluates it, Then it is not tagged (credit rules honored).

**Priority**: Must | **Unit**: unit-2-lambda-tagger

### US-14: See credit leakage early
**As a** program manager, **I want** failure alarms to reach a channel my team watches, **so that** leakage is corrected within days, not discovered at the quarterly MAP report when it is unrecoverable.

**Acceptance Criteria**
- Given a subscription to the solution's SNS topic, When any tagging-failure alarm fires, Then my team receives the notification with enough context (engagement, alarm type) to act.
- Given DLQ messages replayed after a fix, When re-tagging succeeds, Then the affected resources carry the tag from the replay time forward.

**Priority**: Must | **Unit**: unit-3-infrastructure

### US-15: Negligible run cost
**As a** program manager, **I want** the tagging pipeline to cost under $2/month/account at typical event volumes, **so that** the solution's cost is never an argument against credit capture.

**Acceptance Criteria**
- Given typical enterprise event volumes, When monthly cost per account is estimated from the architecture (EventBridge rules, SQS, Lambda invocations, CloudWatch alarms, SSM standard parameters), Then it totals under $2.
- Given the design, When reviewed, Then no always-on compute (containers, instances, provisioned concurrency) exists.

**Priority**: Should | **Unit**: unit-3-infrastructure

---

## Persona 4: Dev — Solution Maintainer / Contributor

### US-16: Add a covered service safely
**As a** maintainer, **I want** adding a service to require only a service definition file (source, events, permissions) plus a matching ARN-extraction handler, with an automated parity audit, **so that** coverage grows without silent gaps.

**Acceptance Criteria**
- Given a new service definition registered in the registry, When the build's handler-coverage audit runs without a matching Lambda handler, Then CI fails naming the gap.
- Given a handler without a definition (or vice versa), When the audit runs, Then the mismatch fails CI in either direction.
- Given a new handler, When its tests run, Then they replay a real captured CloudTrail event fixture for that service (not a hand-written approximation).

**Priority**: Must | **Unit**: unit-4-service-definitions

### US-17: Trust the built artifacts
**As a** maintainer, **I want** the single-file configurator and the CloudFormation output generated from modular sources by the build, with staleness checks in CI, **so that** nobody can hand-edit a built artifact and cause source/artifact drift.

**Acceptance Criteria**
- Given a change to any `src/` module, When the build runs, Then `configurator.html` is regenerated with inlined CSS/JS and the embedded Lambda handler.
- Given a committed artifact that does not match a fresh build of the sources, When CI runs, Then the build-staleness check fails.
- Given the version constant changed in its single source of truth, When both HTML and YAML outputs are built, Then both carry the new version with no other edit.

**Priority**: Must | **Unit**: unit-1-configurator

---

## Coverage Check

- FR-1→US-1; FR-2→US-2; FR-3→US-16; FR-4→US-13; FR-5→US-12; FR-6→US-12/US-14; FR-7→US-6; FR-8→US-5; FR-9→US-4; FR-10→US-6 (config source); FR-11→US-3; FR-12→US-11; FR-13→US-8; FR-14→US-9; FR-15→US-10; FR-16→US-16.
- Hard-rule NFRs surfaced as explicit acceptance criteria: NFR-4/NFR-11→US-18; NFR-6→US-9; NFR-7→US-2; NFR-8→US-15; NFR-10→US-17.
