# Performance Test Instructions

**Stage**: Build and Test (Construction)
**Date**: 2026-03-27

## Purpose

Validate that the tagging pipeline meets its latency and burst-absorption requirements. The system is asynchronous and event-driven — there is no request/response throughput to load-test in the classic sense. What matters is: (1) **tag latency** — how long after resource creation the `map-migrated` tag lands (a missed tag is permanently lost MAP credit, but a *slow* tag is fine as long as it lands), and (2) **burst absorption** — a migration wave creating hundreds of resources at once must not drop events.

## Performance Requirements

- **Tag Latency (typical)**: 60–90 s from resource creation to tag applied (CloudTrail delivery dominates; Lambda work is milliseconds)
- **Tag Latency (maximum)**: 15 minutes — the verify-poll budget. This is coupled to the SQS retry budget: 5 receives × 180 s visibility timeout = 900 s. **These constants are a load-bearing pair — change both or neither.**
- **Error Rate**: ~0 non-ignorable failures. Every event must end in exactly one of the three classifier paths: tagged (actionable succeeded), ignorable (documented untaggable/out-of-scope), or DLQ (visible failure). Silent loss is the only unacceptable outcome.
- **Burst Absorption**: SQS buffers arbitrarily large creation bursts (14-day retention); Lambda drains at BatchSize 10 with `ReportBatchItemFailures` so one bad record in a batch does not fail its 9 siblings.
- **Concurrent Users**: N/A — the configurator is a static client-side file; the runtime has no users, only events.

## Setup Performance Test Environment

### 1. Prepare Test Environment

```bash
npm run build:yaml
export AWS_PROFILE=<test-account-profile>   # never production
python3 .github/scripts/deploy_stackset.py --template configurator.yaml ...
python3 .github/scripts/wait_stackset.py
```

Deploy into a quiet test account so ambient CloudTrail traffic doesn't pollute measurements.

### 2. Configure Test Parameters

- **Test Duration**: one burst + drain cycle, ≤ 30 minutes wall clock
- **Ramp-up Time**: none — fire the burst at once; that is the worst case being tested
- **Load Shape**: 100–300 cheap taggable resources created in rapid succession (SQS queues, SNS topics, log groups, S3 buckets are fast and inexpensive); reuse `.github/scripts/create_resources.py` category modules to generate the burst

## Run Performance Tests

### 1. Execute Load Tests (burst absorption + latency)

```bash
# Record start time, then fire the burst
START=$(date +%s)
python3 .github/scripts/create_resources.py --group integration --group misc ...

# Poll until every ARN is tagged; verify_tags.py enforces the 15-min budget
python3 .github/scripts/verify_tags.py --arn-files arns-*.json
```

For per-resource latency, compare each resource's CloudTrail `eventTime` against the tag-application timestamp in the Lambda logs.

### 2. Execute Stress Tests (drain-rate observation)

While the burst drains, watch the queue and function metrics:

```bash
# SQS depth over time — should rise with the burst, then drain monotonically to 0
aws cloudwatch get-metric-statistics --namespace AWS/SQS \
  --metric-name ApproximateNumberOfMessagesVisible ...
# Lambda concurrency, errors, and throttles
aws cloudwatch get-metric-statistics --namespace AWS/Lambda --metric-name Errors ...
```

Do not chase failure-point stress: the design intentionally trades latency for durability — under any realistic load the queue absorbs the excess and latency stretches, but nothing drops.

### 3. Analyze Performance Results

- **Tag Latency**: actual p50/p95 vs the 60–90 s typical band; every resource within 15 min (Actual vs Expected)
- **Burst Drain**: queue depth returns to 0; drain rate ≈ (BatchSize 10 × concurrent executions) / avg batch duration
- **Error Rate**: DLQ depth 0 after drain; Lambda `Errors` metric only reflects deliberate transient retries (slow provisioners), not permanent failures
- **Bottlenecks**: if latency exceeds the band, attribute it — CloudTrail delivery lag (external, not fixable), Tagging API throttling (check for `ThrottledException` **and** `ThrottlingException` — both spellings occur), or Lambda concurrency limits
- **Results Location**: CloudWatch metrics/logs in the test account; `verify_tags.py` output listing per-ARN outcomes

## Performance Optimization

If performance doesn't meet requirements:

1. Identify the bottleneck from the metrics above before changing anything.
2. Tuning knobs and their constraints:
   - **BatchSize** (currently 10): raising it increases throughput per invocation but widens the blast radius of a poison record; `ReportBatchItemFailures` mitigates but the CI `lint_batchsize_floor.py` gate enforces the agreed floor — do not tune below it.
   - **Visibility timeout / maxReceiveCount** (180 s × 5): this pair defines the 900 s retry budget that slow provisioners depend on. Shortening it DLQs Aurora/ElastiCache/MSK-Serverless events prematurely; lengthening it must be mirrored in the `verify_tags.py` poll budget. Coupled constants — change both sides or neither.
   - **Lambda memory/timeout**: the handler is I/O-bound and cheap; only touch if batch duration is the measured constraint.
3. Rerun the burst test to validate improvements, and record the new envelope here.

## Cleanup

```bash
python3 .github/scripts/teardown.py
```
