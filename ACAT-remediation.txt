# ACAT Finding Remediation — SNS Topic Without Encryption

**Finding:** SNSTopicwithoutencryption
**Severity:** Medium
**Tool:** ACAT (AWS Code Analysis Toolkit)
**Date Remediated:** 2026-03-25

---

## Finding Description

ACAT flagged the `AWS::SNS::Topic` resource (`AlertTopic`) in the CloudFormation template as lacking KMS encryption at rest.

---

## Remediation

Added `KmsMasterKeyId: alias/aws/sns` to the SNS topic resource in both affected files:

**`map2-auto-tagger-optimized.yaml`** (standalone template):
```yaml
AlertTopic:
  Type: AWS::SNS::Topic
  Properties:
    TopicName: auto-map-tagger-alerts
    DisplayName: MAP 2.0 Auto-Tagger Alerts
    KmsMasterKeyId: alias/aws/sns   # ← added
```

**`configurator.html`** (configurator-generated template):
```yaml
AlertTopic:
  Type: AWS::SNS::Topic
  Properties:
    TopicName: auto-map-tagger-alerts
    DisplayName: MAP 2.0 Auto-Tagger Alerts
    KmsMasterKeyId: alias/aws/sns   # ← added
```

`alias/aws/sns` is the AWS-managed SNS KMS key present in every AWS account by default. No additional key management is required.

---

## Verification

**cfn-lint:** 0 findings after change
**Commit:** `050d303` on `main` branch
**GitFarm:** `https://code.amazon.com/packages/Auto-Map-Tagger`

---

## Context

The SNS topic is used exclusively for Lambda error alerting (error rate > 3 in 5 minutes). Messages contain Lambda error metadata only — no PII, no credentials, no customer data. Encryption at rest is applied as a defence-in-depth control.
