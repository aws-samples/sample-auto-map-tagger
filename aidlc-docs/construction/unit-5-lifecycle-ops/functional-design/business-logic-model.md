# Business Logic Model — Unit 5: Lifecycle Operations

## Upgrade Flow

### Upgrade-Safe Path (most releases)
```
1. SA downloads latest configurator.html
2. Selects "Update to latest template version"
3. Enters region + MPE ID only
4. Generates upgrade.sh
5. Script produces a CFN change-set (preview) — shows exactly what changes
6. On apply: stack updated in-place
7. Scope config (accounts, VPCs, dates) preserved automatically from SSM
```

### Full-Redeploy Path (breaking changes — new parameters)
```
1. Release note states "Full redeploy required"
2. delete stack → wait for completion → run deploy.sh fresh
3. Existing map-migrated tags preserved (credits intact)
4. Enable backfill to catch resources created during the ~2-5 min gap
```

## Delete Flow

```
1. SA selects Delete tab, chooses region + scope (all or specific MPEs)
2. Types "DELETE" to confirm
3. Generate delete.sh / delete-<mpe>.sh
4. Script:
   a. Remove EventBridge rules, SQS, Lambda, IAM, SSM, alarms
   b. PRESERVE map-migrated tags on already-tagged resources
   c. Remove S3 staging bucket ONLY if no other MAP deployments remain
```

**Critical rule**: Deletion never removes `map-migrated` tags from resources — MAP credits must stay intact.

## Scope Management (Day-2)

### Add/Remove Accounts
```
aws cloudformation update-stack-set \
  --stack-set-name map-auto-tagger-mig<MPE> \
  --use-previous-template \
  --parameters ParameterKey=ScopedAccountIds,ParameterValue='["111","222"]' \
               ...UsePreviousValue for other params
```
Full-replacement semantics: the account list provided replaces the existing list entirely.

### Retrieve Current Config
```
aws ssm get-parameter \
  --name /auto-map-tagger/<MPE>/config \
  --query Parameter.Value --output text
# Returns: MPE, dates, scope mode, account IDs, VPC IDs
```

## Backfill

For resources created during a deployment gap (upgrade/redeploy window):
```
1. Enable backfill mode
2. Scan existing untagged resources in scope
3. Apply map-migrated tags retroactively (within the current agreement window)
```

## StackSet Operations (CI/ops scripts)

| Script | Purpose |
|---|---|
| `deploy_stackset.py` | Create/update StackSet + instances |
| `wait_stackset.py` | Poll operation until complete |
| `delete_stackset.py` | Remove StackSet + instances |
| `sweep_iam_roles.py` | Clean orphaned IAM roles |

## Operation Safety

| Operation | Safety Measure |
|---|---|
| Upgrade | Change-set preview before apply |
| Delete | `DELETE` typed confirmation; tags preserved |
| Scope change | Full-replacement list shown before apply |
| Redeploy | Backfill covers the gap |
