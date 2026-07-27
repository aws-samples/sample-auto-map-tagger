# Code Generation Plan — unit-4-service-definitions

**Date**: 2026-03-26
**Phase**: CONSTRUCTION — Code Generation (Part 1: Planning)
**Unit**: unit-4-service-definitions
**Inputs**: functional design at `aidlc-docs/construction/unit-4-service-definitions/functional-design/`
**Code location**: workspace root — `src/js/services/`, `.github/scripts/`, `tests/unit/` (never `aidlc-docs/`)

## Unit Context

- **Story implemented**: US-16 (add a covered service safely)
- **Dependencies / contracts**:
  - unit-2 (`src/templates/lambda-handler.py`) must expose a parseable extractor
    dispatch — the parity audit reads both sides (FR-16).
  - unit-3's template generators and `generate_iam.py` consume `ALL_SERVICES`
    for event patterns and IAM (FR-3, NFR-5).
  - unit-1's build concatenates `src/js/services/**` into the artifact.
- **Coverage target**: MAP Included Services List, edition pinned in
  `docs/MAP_included.md` — ~80 services, 150+ create events.
- **No API/repository/database layers** — this unit is data modules plus CI
  tooling; those plan sections are intentionally absent.

## Generation Steps

- [x] **Step 1: Definition contract + shared conventions** — establish the
  canonical module shape (`{source, events, permissions}` const per file),
  naming convention `SERVICE_<NAME>`, and the file template used by all service
  modules. *(US-16; BR-S-01)*
- [x] **Step 2: Compute services** — definitions for EC2 (RunInstances,
  CreateVolume, etc.), Lambda, ECS, EKS, Batch, Elastic Beanstalk, App Runner. *(US-16)*
- [x] **Step 3: Storage services** — S3, EBS-adjacent events, EFS, FSx
  (incl. volume events), S3 Glacier, Backup. *(US-16)*
- [x] **Step 4: Database services** — RDS/Aurora, DynamoDB, ElastiCache
  (incl. Serverless), MemoryDB, Neptune, DocumentDB, Redshift, Timestream,
  Keyspaces. *(US-16)*
- [x] **Step 5: Analytics + streaming services** — Kinesis (streams/firehose),
  MSK (incl. Serverless), EMR, Glue (taggable-at-creation resources only,
  per BR-S-22), Athena workgroups, OpenSearch, QuickSight-adjacent eligibility
  per MAP list. *(US-16)*
- [x] **Step 6: Networking + edge services** — VPC-family resources, ELB/ALB/NLB,
  CloudFront, Route 53, API Gateway (taggable resources), Transit Gateway,
  Direct Connect, Global Accelerator. *(US-16)*
- [x] **Step 7: AI/ML services** — SageMaker (endpoints, notebook instances,
  training jobs per MAP eligibility), Bedrock-adjacent eligible resources,
  Comprehend, Transcribe, Textract per MAP list. *(US-16)*
- [x] **Step 8: Media, migration, IoT, and remaining categories** — MediaLive/
  MediaConvert-family, DMS, DataSync, Transfer Family, MGN-adjacent, SQS, SNS,
  MQ, Step Functions, CloudWatch (taggable), KMS, Secrets Manager, ECR — every
  remaining MAP-list service until the whole pinned edition is covered in both
  directions (BR-S-21). *(US-16)*
- [x] **Step 9: `index.js` registry** — explicit `ALL_SERVICES` array listing
  every module; ordering grouped by category with one entry per service.
  *(US-16; BR-S-03/04)*
- [x] **Step 10: Parity audit script** —
  `.github/scripts/audit_handler_coverage.py`: parse registry `(source, event)`
  pairs and `lambda-handler.py` dispatch pairs, compute both gap directions,
  fail naming each gap; wire into CI. *(US-16 AC-1/AC-2; BR-S-30/31)*
- [x] **Step 11: Event-name lint** — `.github/scripts/lint_event_prefixes.py`:
  enforce create-type event naming with an explicit allowlist for creational
  non-`Create` names (`RunInstances`, …). *(BR-S-02)*
- [x] **Step 12: Golden-event fixture corpus** — one real captured CloudTrail
  event fixture per covered service under the test fixtures tree; fixture-
  presence check alongside the parity audit. *(US-16 AC-3; BR-S-32)*
- [x] **Step 13: Unit tests (Vitest)** — registry schema tests (shape, unique
  sources, no duplicate events, every file registered), permission lint (no
  wildcards), registration-completeness test. *(BR-S-01/03/04/10)*
- [x] **Step 14: Documentation** — `docs/COVERAGE.md` rows (all `UNVERIFIED`
  until live-verified, per BR-S-40), `docs/MAP_included.md` with pinned list
  edition; code-generation summary at
  `aidlc-docs/construction/unit-4-service-definitions/code/code-generation-summary.md`.

## Story Traceability

| Story | Covered by steps |
|---|---|
| US-16 Add a covered service safely | 1–14 (contract: 1, 9; coverage: 2–8; gates: 10–13; docs: 14) |

- [x] US-16

## Completion Criteria

All steps [x]; parity audit `PASS` (zero gaps both directions); event-name lint
green; registry tests green; every covered service has a real fixture; pinned
MAP list edition fully diffed against the registry.
