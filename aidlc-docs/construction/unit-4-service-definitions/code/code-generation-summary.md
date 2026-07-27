# Code Generation Summary — unit-4-service-definitions

**Date**: 2026-03-26
**Plan**: `aidlc-docs/construction/plans/unit-4-service-definitions-code-generation-plan.md` (all steps complete)
**Story**: US-16

## Files Created

### Service definition modules — `src/js/services/`

~85 modules, one per covered MAP-eligible service, each exporting a single
constant of the canonical shape:

```js
const SERVICE_RDS = {
    source: 'aws.rds',
    events: ['CreateDBInstance', 'CreateDBCluster'],
    permissions: ['rds:AddTagsToResource'],
};
```

| Category | Representative modules |
|---|---|
| Compute | `ec2.js`, `lambda.js`, `ecs.js`, `eks.js`, `batch.js`, `apprunner.js`, `elasticbeanstalk.js` |
| Storage | `s3.js`, `efs.js`, `fsx.js`, `backup.js` |
| Database | `rds.js`, `dynamodb.js`, `elasticache.js`, `memorydb.js`, `neptune.js`, `docdb.js`, `redshift.js`, `timestream.js`, `keyspaces.js` |
| Analytics / streaming | `kinesis.js`, `firehose.js`, `msk.js`, `emr.js`, `glue.js`, `athena.js`, `opensearch.js` |
| Networking / edge | `vpc.js`, `elb.js`, `cloudfront.js`, `route53.js`, `apigateway.js`, `transitgateway.js`, `directconnect.js`, `globalaccelerator.js` |
| AI/ML | `sagemaker.js`, `comprehend.js`, `transcribe.js`, `textract.js` |
| App integration / other | `sqs.js`, `sns.js`, `mq.js`, `stepfunctions.js`, `kms.js`, `secretsmanager.js`, `ecr.js`, `dms.js`, `datasync.js`, `transfer.js`, `medialive.js`, `mediaconvert.js`, … |

Coverage totals ~80 services / 150+ create events — the full pinned MAP Included
Services List edition, diffed in both directions (BR-S-21). Untaggable resource
types are documented in `docs/MAP_TAGGING_GAP_ANALYSIS.md` instead of defined
(BR-S-22).

### Registry

| File | Purpose |
|---|---|
| `src/js/services/index.js` | Explicit `ALL_SERVICES` array registering every module exactly once (BR-S-04); the single coverage source of truth consumed by unit-3 (event patterns, IAM) and unit-1 (build embedding) |

### CI gates — `.github/scripts/`

| File | Purpose |
|---|---|
| `audit_handler_coverage.py` | Bidirectional parity audit (FR-16): parses registry `(source, event)` pairs and `lambda-handler.py` extractor dispatch; fails CI naming every definition-without-handler and handler-without-definition gap (BR-S-30/31) |
| `lint_event_prefixes.py` | Enforces create-type event naming with an explicit allowlist for creational non-`Create` names such as `RunInstances` (BR-S-02) |

### Fixtures and tests

| Location | Purpose |
|---|---|
| test fixtures tree (golden-event corpus) | One real captured CloudTrail event per covered service, replayed by unit-2 handler tests (US-16 AC-3, BR-S-32); presence checked alongside the parity audit |
| `tests/unit/` (services suites) | Registry schema tests (three-field shape, `aws.<svc>` source format, unique sources, no duplicate events), registration completeness (every file in `ALL_SERVICES`), permission lint (no wildcards, tagging actions only — BR-S-10) |

### Documentation

| File | Purpose |
|---|---|
| `docs/COVERAGE.md` | Per-service coverage rows; all entries `UNVERIFIED` until a real resource is observed receiving the tag (BR-S-40) |
| `docs/MAP_included.md` | Pinned MAP Included Services List edition date — the eligibility arbiter (BR-S-20/21) |

## Verification

Parity audit: `PASS` (zero gaps, both directions). Event-name lint, registry
tests, and fixture-presence check green. `npm run build` embeds the registry
into the configurator artifact with no drift.
