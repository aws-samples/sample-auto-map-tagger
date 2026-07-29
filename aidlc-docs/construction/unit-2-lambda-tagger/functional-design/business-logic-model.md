# Business Logic Model — Unit 2: Lambda Tagger

## Event Processing Flow

```
1. SQS delivers a batch of CloudTrail events to the Lambda
2. For each record:
   a. Parse the CloudTrail event JSON
   b. Extract eventSource (e.g., ec2.amazonaws.com) and eventName (e.g., RunInstances)
   c. Check scope: is this account/region/VPC in scope? (read from SSM/env)
   d. If out of scope → skip (delete message)
   e. Route to the service-specific ARN extractor
   f. Extract the resource ARN (and dependent ARNs if applicable)
   g. Call Resource Groups Tagging API: tag_resources(ARN, {map-migrated: mig<MPE>})
   h. On success → delete SQS message
   i. On failure → raise (SQS will retry; after 5 → DLQ)
3. Return partial batch response (only failed records retried)
```

## Tag Format

```python
TAG_KEY = "map-migrated"
TAG_VALUE = f"mig{mpe_id}"   # e.g., "mig1234567890"
```

## ARN Extraction Strategy

```python
# Router
EXTRACTORS = {
    "ec2.amazonaws.com": extract_ec2,
    "rds.amazonaws.com": extract_rds,
    "s3.amazonaws.com": extract_s3,
    # ... 154 resource types mapped
}

def extract_arn(event):
    source = event["eventSource"]
    extractor = EXTRACTORS.get(source, extract_generic)
    return extractor(event)
```

### Extraction Patterns

| Pattern | Example Services | ARN Source |
|---|---|---|
| Direct from response | EC2, RDS | `responseElements` contains resource ID |
| Constructed | S3, Lambda | Build ARN from account + region + name |
| Multiple resources | EC2 RunInstances (N instances + volumes) | Loop over response elements |
| Dependent resources | RDS (instance + storage) | Extract primary + dependents |

## Scope Filtering

```python
def should_tag(event, scope):
    account = event["recipientAccountId"]
    region = event["awsRegion"]

    if scope["mode"] == "account" and account not in scope["accounts"]:
        return False
    if scope["vpc_ids"] and not resource_in_vpc(event, scope["vpc_ids"]):
        return False
    return True
```

## Idempotency

Tagging is idempotent — applying the same tag twice is safe. On retry (e.g., resource became taggable after initial failure), re-tagging causes no harm. This makes the 5-retry strategy safe.

## Error Handling

| Error | Handling |
|---|---|
| Resource not yet taggable (slow provisioning) | Raise → SQS retry (up to 5x, 180s apart) |
| Permission denied | Raise → DLQ → alert (indicates IAM misconfiguration) |
| Resource already deleted | Skip (delete message, log) |
| Unknown service | Fall back to generic extractor; if fails → DLQ |
| Throttling from Tagging API | Raise → SQS retry with backoff |

## Slow-Provisioning Resources

Some resources take 3-10 minutes to become taggable:
- ElastiCache Serverless
- Aurora clusters
- MSK Serverless
- OpenSearch domains

The 5-retry × 180s = up to 15 minutes of retry window covers these. 14-day SQS retention is the ultimate safety net.
