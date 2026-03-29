<!-- Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Holmes Scan Justifications — MAP 2.0 Auto-Tagger

**Holmes Scan ID:** 9fb0257c-2c29-4d5e-9205-745ff4daaf44  
**Previous Scan ID:** 41b718a7-8ea0-4e7d-ba5a-e155317758a7  
**PCSR Ticket:** V2153641992  
**Date:** 2026-03-29  

---

## Finding 1 — Architecture Documentation and Design Quality
**Result:** non_compliant  
**Finding:** Missing service-specific security configuration guidelines for Lambda, SQS, SNS, CloudWatch Logs, SSM, EventBridge, CloudFormation.

**Disposition: Accepted Risk (sample code)**

This is sample code. THREAT-MODEL.md (included in this scan) provides a comprehensive architecture diagram (Mermaid), data flow documentation, STRIDE threat analysis, trust boundaries, and documented residual risks — satisfying architecture documentation requirements.

Service-specific security guidelines (e.g., "enable Lambda Insights") are implementation decisions for the customer's production environment and outside the scope of sample code. The sample code disclaimer explicitly transfers this responsibility: *"You are responsible for testing, securing, and optimizing this solution to meet your organization's security, regulatory, and compliance requirements."* AWS Well-Architected guidance and service-specific security documentation are publicly available and need not be duplicated in sample code.

---

## Finding 2 — IAM Policy and Access Control Implementation
**Result:** non_compliant  
**Finding:** Resource: `*` on 150+ tagging actions, no condition statements, no documented access review.

**Disposition: Accepted Risk — architectural requirement (previously documented in PCSR ticket)**

The broad IAM permissions are required by the AWS platform, not a security gap:

1. **`tag:TagResources` with `Resource: *`** — The AWS Resource Groups Tagging API does not support resource-level restrictions. This is an AWS API platform constraint, not a choice. Precedent: MAP Taggr (AWS-internal tool) uses the same pattern with AppSec approval.

2. **150+ service-specific tagging permissions with `Resource: *`** — The Lambda receives resource ARNs at runtime via CloudTrail events. It is architecturally impossible to pre-declare specific ARNs in the IAM policy for a general-purpose tagging solution.

3. **Condition statements** — IAM conditions scoped to specific VPCs or accounts would break multi-region and multi-account deployments. Scope filtering is enforced at the application layer (SSM config + `is_in_scope()` runtime logic).

4. **Access review** — The IAM role is created by CloudFormation and owned/operated by the customer. Review cadence is the customer's responsibility per the sample code disclaimer.

This is documented as an accepted risk in THREAT-MODEL.md (Section 6: Residual Risks).

---

## Finding 3 — Code Security and Vulnerability Assessment
**Result:** non_compliant  
**Finding:** XSS vulnerabilities (innerHTML), SSRF risks, missing input validation, missing scan documentation.

**Disposition: False positive + accepted risk**

**XSS (innerHTML):** The flagged `innerHTML` assignments use only hardcoded HTML template strings defined in the JavaScript source — not user-supplied content. No user-controlled data flows into any `innerHTML` assignment. XSS requires user-controlled input reaching `innerHTML`; that path does not exist in this codebase.

**SSRF:** The configurator is a static HTML file that generates configuration files locally. It makes no outbound HTTP requests and has no server-side component. SSRF requires a server-side request mechanism; this tool has none.

**Input validation:** MPE ID is validated with regex (`^mig[a-zA-Z0-9]+$`) at both UI (JavaScript) and CloudFormation (`AllowedPattern`) layers. VPC IDs validated against `vpc-[0-9a-f]{8,17}`. Account IDs validated as exactly 12 digits. Agreement dates use HTML date inputs with `min`/`max` constraints.

**Security scan documentation:** This Holmes scan (9fb0257c) and the previous scan (41b718a7) are attached to this PCSR ticket as scan artifacts.

---

## Finding 4 — Legal Compliance and Risk Assessment
**Result:** non_compliant  
**Finding:** Missing copyright in configurator.html and THREAT-MODEL.md.

**Disposition: False positive (configurator.html) + Fixed (THREAT-MODEL.md)**

**configurator.html:** Copyright has been present since the initial commit:
```
Line 1: <!-- Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved. -->
Line 2: <!-- SPDX-License-Identifier: Apache-2.0 -->
```
The scanner failed to detect HTML comment-format copyright headers. This is a scanner false positive.

**THREAT-MODEL.md:** The copyright header was missing and has been added in commit `297f697`.

**Risk assessment:** THREAT-MODEL.md provides comprehensive risk assessment including STRIDE analysis, trust boundaries, attack surface, and residual risks.

---

## Finding 5 — GenAI, AI Security and Dataset Compliance
**Result:** non_compliant — **REGRESSION** (was `not_applicable` in scan 41b718a7)  
**Finding:** Content tags Bedrock/SageMaker resources without GenAI security controls.

**Disposition: False positive — dispute**

This solution is an infrastructure automation tool that tags AI/ML resources the same way it tags S3 buckets or EC2 instances. It does **not**:
- Implement, deploy, or invoke any AI/ML functionality
- Use AI/ML models, APIs, SDKs, or inference endpoints
- Process training data or model artifacts
- Make LLM calls or use GenAI features

The Bedrock/SageMaker references are exclusively in IAM permission lists (so the Lambda can call `tag:TagResources` on those ARNs) and ARN pattern matching code — identical to how a backup tool references S3 ARNs without being a storage solution.

The previous scan (41b718a7) **correctly** identified this as `not_applicable`. The regression was caused by THREAT-MODEL.md listing Bedrock as a tagged service type, which the scanner misinterpreted as AI/ML implementation. The architectural reality is unchanged. The rule's own `not_applicable` criteria states: *"Content contains NO AI/ML services implementation, NO machine learning models, NO intelligent automation."* This tool meets all those criteria.

---

## Finding 6 — S3 Security Fundamentals
**Result:** non_compliant  
**Finding:** S3 buckets missing Block Public Access, TLS enforcement, encryption.

**Disposition: False positive (i18n strings) + accepted risk (staging bucket)**

The scanner is flagging two distinct categories incorrectly:

1. **i18n translation strings** containing `aws s3 mb` text — These are UI display strings in the configurator (translated into 7 languages), not executable code. The actual staging bucket **does** have full security: Block Public Access, AES-256 encryption, and HTTPS-only bucket policy (configurator.html lines 3724–3736 and 4029–4038, E2E verified).

2. **Lambda S3 references** (`s3:GetObject`, `s3:PutBucketTagging`) — The Lambda tags customer-owned buckets that already exist. It does not create or configure them; applying BPA/encryption to pre-existing customer buckets is not appropriate.

**Access logging/versioning/MFA Delete on staging bucket:** The staging bucket holds only a ~40KB CloudFormation template. These controls are designed for data buckets with sensitive content, not single-file deployment artifacts. Accepted risk documented in THREAT-MODEL.md.

---

## Finding 7 — Data Security and Encryption Implementation
**Result:** non_compliant  
**Finding:** SSM uses String (not SecureString), no HTTPS for HTML configurator, no KMS for CloudWatch Logs.

**Disposition: Accepted risk (previously documented)**

**SSM Parameter (String vs SecureString):** The parameter stores non-sensitive configuration only: MPE ID (a business identifier like `mig1234567890`), date range, scope mode, and account/VPC ID lists. None are credentials, secrets, or PII. Encrypting with a customer-managed KMS key adds deployment complexity and ~$1/month cost for zero security benefit. Documented as accepted risk in THREAT-MODEL.md. IAM restricts access to the specific parameter path.

**HTTPS for configurator.html:** The configurator is a static HTML file run locally from the filesystem (`file://` protocol) or opened from a download. There is no web server and no HTTP transport. HTTPS enforcement does not apply to local HTML files. No credentials are entered.

**CloudWatch Logs without KMS:** Lambda logs contain operational data only (resource ARNs, error messages) — no credentials, PII, or sensitive data. Adding customer-managed KMS for CloudWatch Logs requires customers to pre-create a KMS key and grant permissions, creating a deployment dependency inappropriate for sample code. Documented as accepted risk in THREAT-MODEL.md.

**Key management:** SQS and SNS use AWS-managed keys (`alias/aws/sqs`, `alias/aws/sns`) providing encryption at rest without customer key management burden — appropriate for sample code.

---

## Finding 8 — Content Quality, Technical Accuracy, and Communication Standards
**Result:** non_compliant  
**Finding:** Technical inaccuracy in YAML cross-account comment, superlative language.

**Disposition: Fixed + partial dispute**

**Cross-account comment:** Updated in commit `936cb24`. The comment now accurately states: *"This template deploys a single-account Lambda. No sts:AssumeRole or cross-account permissions are present or required. For multi-account deployments, a separate CloudFormation StackSet deploys this same template to each account independently via CloudFormation SERVICE_MANAGED permissions (AWS service-linked roles), not direct cross-account role assumption."*

**Superlative language:** All instances of "ensure," "will," "always," and "never" in English user-facing strings have been replaced with present tense or qualified alternatives across all 7 languages. Remaining instances flagged by the scanner are in:
- Bash shell script `echo` output (CLI tool output, not documentation)
- AWS CLI command strings (`aws cloudtrail describe-trails`) — fixed AWS syntax

Applying English prose grammar rules to CLI command syntax is inappropriate.

---

## Finding 9 — AWS Service Name Standards
**Result:** partially_compliant (improved from non_compliant in first scan)  
**Finding:** Missing parenthetical abbreviations on first mention, "CloudTrail" without "AWS" prefix 23 times, "S3" 13 times without full first-mention format.

**Disposition: Partially fixed; remaining are CLI syntax context**

**Progress:** This rule improved from `non_compliant` → `partially_compliant` across scans, reflecting the service name prefix work completed.

**Parenthetical abbreviations** (e.g., "Amazon Simple Notification Service (Amazon SNS)"): AWS style guidelines requiring full first-mention names apply to published documentation — not to UI labels, dropdown options, or generated tool output. Applying this requirement to a tool's interface text would make every UI element verbose and unusable for the technical audience.

**"CloudTrail" without "AWS" prefix (23 instances):** The scanner is flagging occurrences in:
- Bash CLI commands: `aws cloudtrail describe-trails` (correct AWS CLI syntax — lowercase required)
- Shell script variable names (`CLOUDTRAIL_*`)
- i18n strings (where `AWS CloudTrail` IS used in prose contexts)

AWS CLI syntax requires lowercase service names; the scanner cannot distinguish CLI command context from documentation prose.

**"S3" without full name (13 instances):** Occurrences are in CloudFormation YAML action strings (`s3:GetObject`), bash variable names, and IAM action names — fixed AWS API format that cannot be changed.

---

## Finding 10 — Actionable Security Measures
**Result:** non_compliant  
**Finding:** Missing specific implementation steps with commands, measurable metrics, prioritization.

**Disposition: Accepted risk — sample code pattern**

1. **Specific implementation steps:** The `deploy.sh` script IS the implementation — complete, executable security configuration including IAM role creation, KMS encryption for SQS/SNS, S3 security hardening, and SCP advisory. Steps are embedded in the executable artifact, not duplicated as separate documentation.

2. **Measurable security metrics:** The operational metric is binary: are resources tagged within SLA? CloudWatch alarms (deployed by the solution) alert on tagging failures (>3 in 5 minutes). Additional KPIs would be customer-specific.

3. **Implementation priority:** The `deploy.sh` preflight enforces prerequisites sequentially: credentials → CloudTrail → IAM permissions → SCP → VPC/account existence. This IS prioritized implementation.

The sample code disclaimer transfers responsibility for security customization to the customer. Embedding prescriptive metrics frameworks in sample code is outside scope.

---

## Finding 11 — Security Responsibility and Messaging
**Result:** non_compliant  
**Finding:** Does not clearly define AWS vs. customer responsibilities, inadequate shared responsibility explanation.

**Disposition: Accepted risk + dispute**

Explicit customer responsibility messaging exists in multiple locations:

1. **Sample code disclaimer** (configurator.html lines 202, 934): *"You are responsible for testing, securing, and optimizing this solution to meet your organization's security, regulatory, and compliance requirements before deployment."*
2. **Shared Responsibility Model link**: Present in all 7 languages with direct link to aws.amazon.com/security/shared-responsibility/
3. **SCP advisory** (Step 3 UI): Warns customers about SCP implications and their responsibility to verify
4. **THREAT-MODEL.md Section 6**: Delineates AWS-managed vs. customer-managed risk items

The finding expects a per-service AWS/customer responsibility breakdown for 50+ services. This would duplicate public AWS documentation and is not appropriate for sample code.

---

## Finding 12 — Responsible Security and Compliance Messaging
**Result:** non_compliant — **REGRESSION** (was `compliant` in scan 41b718a7)  
**Finding:** "English translation lacks customer security responsibility messaging."

**Disposition: False positive**

The English customer security responsibility notice IS present:
- **configurator.html line 202:** HTML fallback text with full disclaimer
- **configurator.html line 934:** JavaScript i18n key `ui_sample_notice_body` (English) with complete disclaimer

All 7 languages have this string defined with equivalent content. The scanner's claim that other languages include it but English does not is incorrect. This is a false positive — the scanner likely parsed the multi-language JavaScript object non-sequentially and found other language definitions before the English one, incorrectly concluding the English version was absent.

The regression from `compliant` → `non_compliant` between scans is not due to any code change. The English notice is identical to previous scans.

---

## Summary

| Finding | Disposition |
|---------|-------------|
| Architecture Documentation | Accepted risk — THREAT-MODEL.md satisfies for sample code |
| IAM Resource:\* | Accepted risk — AWS API platform constraint, MAP Taggr precedent |
| Code Security (XSS/SSRF) | False positive — no user data in innerHTML, no server-side component |
| Legal Compliance (copyright) | Fixed (THREAT-MODEL.md commit 297f697) + false positive (configurator.html) |
| GenAI Compliance | False positive — tool tags AI resources, does not implement AI |
| S3 Security | False positive (i18n strings) + accepted risk (staging bucket) |
| Data Security/Encryption | Accepted risk — SSM non-sensitive config, no HTTP transport, no PII in logs |
| Content Quality | Fixed (YAML comment) + dispute (CLI syntax ≠ documentation prose) |
| AWS Service Names | Partially fixed — remaining in AWS CLI syntax (not changeable) |
| Actionable Security Measures | Accepted risk — deploy.sh IS the implementation |
| Security Responsibility | Accepted risk — disclaimer present in all 7 languages |
| Responsible Security Messaging | False positive — EN notice at lines 202 and 934 |
