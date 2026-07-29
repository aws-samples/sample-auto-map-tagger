# Interaction Diagrams — MAP 2.0 Auto-Tagger

## Business Transaction 1: Self-Service Deployment

```
SA/CSM          Configurator          Browser           CloudShell         AWS
  │                  │                    │                  │               │
  │ Open .html       │                    │                  │               │
  │─────────────────>│                    │                  │               │
  │ Fill MPE ID,     │                    │                  │               │
  │ scope, dates     │                    │                  │               │
  │─────────────────>│                    │                  │               │
  │                  │ Validate inputs    │                  │               │
  │                  │ Generate deploy.sh │                  │               │
  │                  │ (embed CFN)        │                  │               │
  │                  │───────────────────>│                  │               │
  │ Download         │                    │                  │               │
  │<─────────────────────────────────────│                  │               │
  │ Upload + run deploy.sh                │                  │               │
  │──────────────────────────────────────────────────────>│               │
  │                                                          │ CFN deploy    │
  │                                                          │──────────────>│
  │                                                          │  Stack/       │
  │                                                          │  StackSet     │
  │                                                          │<──────────────│
  │ ✅ Deployed                                              │               │
```

## Business Transaction 2: Automatic Tagging (Core Flow)

```
Engineer      AWS Resource    CloudTrail   EventBridge    SQS      Lambda    Tagging API
   │              │               │            │           │         │           │
   │ Create EC2   │               │            │           │         │           │
   │─────────────>│               │            │           │         │           │
   │              │ RunInstances  │            │           │         │           │
   │              │──────────────>│            │           │         │           │
   │              │               │ Event      │           │         │           │
   │              │               │───────────>│           │         │           │
   │              │               │            │ Match rule│         │           │
   │              │               │            │──────────>│         │           │
   │              │               │            │           │ Poll    │           │
   │              │               │            │           │────────>│           │
   │              │               │            │           │         │ Extract ARN│
   │              │               │            │           │         │ Apply tag  │
   │              │               │            │           │         │──────────>│
   │              │               │            │           │         │ ✅ Tagged │
   │              │               │            │           │         │<──────────│
   │ (resource now has map-migrated tag, ~60-90s total)              │           │
```

## Business Transaction 3: Failure Handling

```
SQS         Lambda        DLQ        CloudWatch      SNS         SA/CSM
 │            │            │            │             │            │
 │ Deliver    │            │            │             │            │
 │───────────>│            │            │             │            │
 │            │ Tag fails  │            │             │            │
 │            │ (retry 1-5)│            │             │            │
 │<───────────│            │            │             │            │
 │ ... 5 retries exhausted │            │             │            │
 │───────────────────────>│            │             │            │
 │                         │ Msg in DLQ │             │            │
 │                         │───────────>│             │            │
 │                         │            │ Alarm fires │            │
 │                         │            │────────────>│            │
 │                         │            │             │ Email alert│
 │                         │            │             │───────────>│
 │                         │            │             │  Investigate│
```

## Business Transaction 4: Day-2 Scope Change

```
SA/CSM        CloudShell       CloudFormation      SSM         StackSet
  │               │                  │              │             │
  │ update-stack-set with new        │              │             │
  │ ScopedAccountIds │               │              │             │
  │──────────────>│                  │              │             │
  │               │ Update StackSet  │              │             │
  │               │─────────────────>│              │             │
  │               │                  │ Update scope │             │
  │               │                  │─────────────>│             │
  │               │                  │ Propagate to accounts       │
  │               │                  │────────────────────────────>│
  │ ✅ Scope updated                 │              │             │
```
