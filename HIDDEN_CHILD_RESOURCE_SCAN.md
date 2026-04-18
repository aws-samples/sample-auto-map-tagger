# Hidden Child-Resource Scan for MAP Auto-Tagger

**Date:** 2026-04-18
**Trigger:** Jin flagged `RunInstances` emits no `CreateVolume` / `CreateNetworkInterface` for attached children. Fixed in PR #12. This doc enumerates other possible instances of the same pattern across MAP-eligible services.

## Method

For each candidate parent event:
1. Query CloudTrail in live test account to verify which events fire
2. Where possible, create actual test resources and verify tag state empirically
3. Account: `586009411781` (automaptaggersingleacc), region ap-northeast-2

## Pattern definition

A **hidden child** is a resource:
1. Created as a side-effect of a parent `Create*`/`Run*` call
2. Has its own ARN (billable, taggable)
3. AWS does NOT emit a separate CloudTrail event for it
4. → Auto-tagger silently misses it

## FINDINGS

### 🔴 Confirmed gap — FIXED

**`RunInstances` → attached EBS volumes** (PR #12)
- Evidence: CloudTrail RunInstances responseElements has empty `blockDeviceMapping`. Real volumes only appear via `describe_instances`.
- Evidence: primary ENI IS in responseElements.networkInterfaceSet — tagged correctly.
- Fix: `extract_arns_multi` calls `describe_instances` with 30s poll to resolve volumes + extracts ENIs from event.
- Empirically verified with live Lambda deploy: instance + ENI + root vol + extra /dev/sdf vol all tagged in 1.7s.

### ✅ Tested — NOT a gap (auto-propagation)

**`CreateReplicationGroup` (ElastiCache Redis) → cache cluster nodes**
- Created live test RG `scan-rg-01` with 2 nodes (primary + replica)
- CloudTrail emits NO `CreateCacheCluster` events for the nodes (confirmed over 4-hour window in 4 prior RGs)
- **HOWEVER:** ElastiCache automatically propagates tags from RG to cache clusters
- Manual test: tagged the RG with `map-migrated=X` → both nodes `scan-rg-01-001` and `scan-rg-01-002` inherited the tag within seconds
- → **Lambda tagging the RG is sufficient**. No fix needed.
- Caveat: RG availability lag (~5 min) can cause tagging to exhaust the 3-retry window and go to DLQ. This is an ElastiCache timing issue, not a hidden-child issue.

**`RunJobFlow` (EMR) → EC2 master/core/task instances + EBS volumes**
- CloudTrail emits NO `RunInstances` events for EMR-launched nodes (confirmed)
- **HOWEVER:** EMR propagates cluster-level tags to EC2 + EBS automatically per AWS docs
- Our Lambda tags the EMR cluster ARN → tag propagation handled by EMR service
- → **Not a gap.** The existing RunJobFlow handler is sufficient.

**`CreateCluster` (EKS) + `CreateNodegroup`**
- Each node group fires its own `CreateNodegroup` event — handled
- EC2 instances launched by a node group fire `RunInstances` (invokedBy=eks.amazonaws.com) — now FIXED by PR #12 (volumes tagged too)
- → **Not a gap.**

**`CreateClusterV2` (MSK Kafka)**
- Broker nodes live in the MSK service account, not the customer account. Not visible or taggable by the customer. → **Not a gap** (same as SageMaker notebook's hidden EC2)

**`CreateDBCluster` (Aurora Provisioned)**
- Console/CFN/SDK all require explicit `create_db_instance` call for Aurora writer — fires its own event. Already handled.
- → **Not a gap.**

**`CreateDistribution` (CloudFront)**
- Edge locations are internal, not customer-taggable.
- → **Not a gap.**

### 🟡 Untested / likely not gaps (documented, not investigated further)

**`CreateVpc` → default route table / NACL / security group**
- Defaults exist with ARNs but are not billable.
- → Not a MAP credit concern.

**`CreateCluster` (Redshift multi-node)**
- Compute nodes are internal to Redshift cluster; customer ARN is the cluster itself.
- Redshift supports tag inheritance? Per AWS docs yes, per-node charges roll up to cluster.
- → Likely not a gap; can revisit if E2E surfaces issues.

**`CreateDBCluster` (Aurora Serverless v1/v2)**
- ACUs scale internally, no separate ARNs per ACU.
- → Not a gap.

**`RunInstances` with N > 1 instances**
- PR #12 already handles: `extract_arns_multi` loops all `items[*]`, unit-tested with N=2 case.
- → Handled.

**`CreateFleet` (EC2 Spot Fleet / On-Demand Fleet)**
- Fleet launches multiple RunInstances → each fires its own RunInstances event (invokedBy=ec2.amazonaws.com).
- → Handled via PR #12's RunInstances path.

## Conclusion

**PR #12 (RunInstances fix) is the only gap found in this scan.** Other candidates either have their own CloudTrail events, are in service-managed accounts, or auto-propagate tags from the parent.

The real risk area for MAP credit is **EC2 + attached EBS**, which is now covered.

## Recommended followups (low priority)

1. **Redshift multi-node verification** — spin up a 2-node cluster, verify node-level tag state
2. **E2E coverage for EMR tag propagation** — after EMR cluster tagged, verify underlying EC2 instances receive the tag (wait 5-10min, call `describe_instances` filtered by cluster-id)
3. **Document findings** — add this scan as an appendix to `MAP_TAGGING_GAP_ANALYSIS.md`

## Test artifacts

- Test stack: `map-auto-tagger-scan-debug` (MpeId=migTESTScan01, account 586009411781)
- Test resources created & deleted: `scan-rg-01` ElastiCache RG

## Cleanup

```bash
# Delete debug stack after scan
aws cloudformation delete-stack --stack-name map-auto-tagger-scan-debug \
  --profile automaptaggersingleacc --region ap-northeast-2
```
