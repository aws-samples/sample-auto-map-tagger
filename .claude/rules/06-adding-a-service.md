# 06 — Adding an AWS Service

> ⚠️ Mirrored in `.kiro/steering/` and `.claude/rules/`. Run `npm run sync-rules` after edits.

Full guide in `docs/DEVELOPMENT.md`. The recipe:

## Steps

1. **Create `src/js/services/<service>.js`** following the standard shape:
   ```js
   const SERVICE_MYSERVICE = {
       source: 'aws.myservice',
       events: ['CreateThing', 'CreateOtherThing'],
       permissions: ['myservice:TagResource'],
   };
   ```

2. **Register it** in the `ALL_SERVICES` array in `src/js/services/index.js`.

3. **Add the matching ARN extractor** in `src/templates/lambda-handler.py`. This is mandatory — the handler-coverage audit gate (`audit_handler_coverage.py`) fails CI if a service definition has no handler.

4. **Rebuild**: `npm run build` (auto-discovers service files).

5. **Verify parity**: the coverage audit confirms every defined resource type has a Lambda handler.

## ARN extraction patterns

| Pattern | Example | Notes |
|---|---|---|
| Direct from response | EC2, RDS | ARN/ID in `responseElements` |
| Constructed | S3, Lambda | Build ARN from account + region + name |
| Multiple resources | EC2 `RunInstances` | Loop over instances + attached volumes/ENIs |
| Dependent resources | RDS instance + storage | Extract primary + dependents |

## Gotchas learned the hard way

- **Use `ci_get()` for CloudTrail keys** — CloudTrail returns inconsistent casing (`aRN` vs `arn`); direct key access caused silent tag loss (e.g., CloudFront `CreateDistribution`).
- **Add a TRANSIENT_MARKER** for slow-provisioning services, or they get classified as permanent failures and DLQ prematurely.
- **Check `MAP_included.md`** — only tag services on the MAP Included Services List (CFN stacks were deliberately removed in v22 because they're not MAP-eligible).
- **Some resources are untaggable** by AWS API — see `docs/MAP_TAGGING_GAP_ANALYSIS.md` before adding a handler that can't work.

## Update docs

New coverage → update `COVERAGE.md` and `docs/MAP_included.md` (see `04-documentation-update-rules`).
