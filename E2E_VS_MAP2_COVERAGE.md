# E2E Test Coverage vs MAP 2.0 Eligible Services

**Date:** 2026-04-18
**Canonical MAP 2.0 eligible services list:** AWS Migration Acceleration Program 2.0 eligibility docs (~60 tagged services).

## Legend
- ✅ = E2E creates at least one resource for this service
- ⚠️ = E2E has partial or indirect coverage
- ❌ = No E2E coverage (but Lambda handler may still exist)
- 🚫 = Not MAP 2.0 eligible (or deprecated)

## Coverage matrix

### Compute
| Service | MAP eligible | E2E covered | Notes |
|---------|:------------:|:-----------:|-------|
| Amazon EC2 (instances) | ✅ | ✅ | `core.py` — EC2 + attached EBS + ENI (PR #12) |
| Amazon EC2 Auto Scaling | ✅ | ✅ | `core.py` — ASG + launch template |
| AWS Lambda | ✅ | ✅ | `core.py` |
| Amazon ECS | ✅ | ✅ | `core.py` — cluster only (no tasks) |
| Amazon EKS | ✅ | ✅ | `core.py` — cluster (no node groups in E2E) |
| AWS Fargate | ✅ | ⚠️ | indirect — ECS cluster created, no Fargate task launched |
| AWS Batch | ✅ | ❌ | no E2E |
| AWS App Runner | ✅ | ❌ | no E2E |
| Amazon Lightsail | 🚫 | ❌ | not MAP eligible |

### Storage
| Service | MAP eligible | E2E covered | Notes |
|---------|:------------:|:-----------:|-------|
| Amazon S3 | ✅ | ✅ | `analytics.py` bucket for Firehose |
| Amazon EBS | ✅ | ✅ | `core.py` standalone + PR #12 attached |
| Amazon EFS | ✅ | ✅ | `databases.py` |
| Amazon FSx | ✅ | ✅ | `databases.py` |
| Amazon S3 Glacier | ✅ | ❌ | no E2E |
| AWS Storage Gateway | ✅ | ❌ | no E2E |
| AWS Backup | ✅ | ✅ | `security.py` (backup vault + plan) |
| AWS DataSync | ✅ | ✅ | `misc.py` |

### Database
| Service | MAP eligible | E2E covered | Notes |
|---------|:------------:|:-----------:|-------|
| Amazon RDS (MySQL, Postgres, MariaDB, Oracle, MSSQL) | ✅ | ✅ | `databases.py` — MySQL instance |
| Amazon Aurora | ✅ | ✅ | `databases.py` — cluster + writer instance |
| Amazon DynamoDB | ✅ | ✅ | `databases.py` |
| Amazon ElastiCache | ✅ | ✅ | `databases.py` — Redis RG + Serverless |
| Amazon MemoryDB | ✅ | ✅ | `databases.py` |
| Amazon DocumentDB | ✅ | ✅ | `databases.py` |
| Amazon Neptune | ✅ | ⚠️ | integration.py mentions but not sure active |
| Amazon Keyspaces | ✅ | ❌ | no E2E |
| Amazon Timestream | ✅ | ❌ | no E2E |
| Amazon QLDB | 🚫 | ❌ | deprecated, not MAP eligible |

### Analytics
| Service | MAP eligible | E2E covered | Notes |
|---------|:------------:|:-----------:|-------|
| Amazon Redshift | ✅ | ✅ | `databases.py` |
| Amazon EMR | ✅ | ✅ | `analytics.py` — cluster |
| AWS Glue | ✅ | ✅ | `analytics.py` — database + crawler + job |
| Amazon Athena | ✅ | ✅ | `analytics.py` — workgroup |
| Amazon Kinesis Data Streams | ✅ | ✅ | `analytics.py` |
| Amazon Kinesis Firehose | ✅ | ✅ | `analytics.py` |
| Amazon Kinesis Video Streams | ✅ | ✅ | `analytics.py` |
| Amazon OpenSearch | ✅ | ✅ | `databases.py` |
| Amazon QuickSight | ✅ | ⚠️ | `ml.py` — datasets/analyses (partial; users are identity-based) |
| AWS Lake Formation | ✅ | ❌ | no E2E |
| Amazon Managed Streaming for Kafka (MSK) | ✅ | ✅ | `databases.py` v1 + v2 serverless |
| Amazon MSK Connect | ✅ | ❌ | no E2E |

### Networking
| Service | MAP eligible | E2E covered | Notes |
|---------|:------------:|:-----------:|-------|
| Amazon VPC | ✅ | ✅ | `networking.py` — full suite |
| AWS Transit Gateway | ✅ | ✅ | `networking.py` |
| AWS Direct Connect | ✅ | ✅ | `networking.py` — LAG |
| AWS Site-to-Site VPN | ✅ | ✅ | `networking.py` |
| AWS Client VPN | ✅ | ❌ | no E2E |
| AWS Global Accelerator | ✅ | ✅ | `networking.py` |
| Amazon CloudFront | ✅ | ✅ | `global_us_east_1.py` |
| Amazon Route 53 | ✅ | ✅ | `global_us_east_1.py` — hosted zone + health check |
| Elastic Load Balancing (ALB/NLB/CLB) | ✅ | ❌ | no E2E — **GAP** |
| AWS App Mesh | ✅ | ❌ | no E2E |
| Amazon API Gateway | ✅ | ✅ | `integration.py` — REST + HTTP |
| AWS Cloud Map | ✅ | ⚠️ | possibly — via HttpNamespace |
| AWS PrivateLink | ✅ | ✅ | via VPC endpoint |
| AWS Network Firewall | ✅ | ⚠️ | handler exists, E2E unclear |

### Integration & Messaging
| Service | MAP eligible | E2E covered | Notes |
|---------|:------------:|:-----------:|-------|
| Amazon SNS | ✅ | ✅ | `core.py` |
| Amazon SQS | ✅ | ✅ | `integration.py` |
| AWS Step Functions | ✅ | ✅ | `integration.py` |
| Amazon EventBridge | ✅ | ⚠️ | handler exists; E2E may not create rules |
| Amazon MQ | ✅ | ✅ | `databases.py` |
| AWS AppSync | ✅ | ✅ | `integration.py` |

### Security & Identity
| Service | MAP eligible | E2E covered | Notes |
|---------|:------------:|:-----------:|-------|
| AWS KMS | ✅ | ✅ | `security.py` |
| AWS Certificate Manager (ACM) | ✅ | ✅ | `security.py` |
| Amazon Cognito | ✅ | ✅ | `security.py` — user pool + identity pool |
| AWS Secrets Manager | ✅ | ✅ | `security.py` |
| AWS Private CA | ✅ | ⚠️ | handler exists |
| AWS WAF | ✅ | ❌ | no E2E — **GAP** |
| AWS Shield | ✅ | ❌ | no E2E |
| AWS Security Hub | ✅ | ❌ | no E2E (handler has EnableSecurityHub) |
| Amazon GuardDuty | ✅ | ❌ | no E2E |
| Amazon Inspector | ✅ | ❌ | no E2E |
| Amazon Macie | ✅ | ❌ | no E2E |

### Management & Governance
| Service | MAP eligible | E2E covered | Notes |
|---------|:------------:|:-----------:|-------|
| Amazon CloudWatch | ✅ | ✅ | `security.py` alarm |
| AWS CloudWatch Logs | ✅ | ✅ | `core.py` log group |
| AWS Systems Manager | ✅ | ✅ | `security.py` parameter |
| AWS CloudFormation | ✅ | ⚠️ | indirect via deploy.sh; no E2E-created stack |
| AWS Service Catalog | ✅ | ✅ | `devtools.py` portfolio |
| AWS Config | ✅ | ❌ | no E2E |
| AWS AppConfig | ✅ | ❌ | no E2E |

### DevOps
| Service | MAP eligible | E2E covered | Notes |
|---------|:------------:|:-----------:|-------|
| AWS CodeBuild | ✅ | ✅ | `devtools.py` |
| AWS CodePipeline | ✅ | ✅ | `devtools.py` |
| AWS CodeDeploy | ✅ | ❌ | no E2E |
| AWS CodeCommit | 🚫 | — | deprecated |
| AWS CodeArtifact | ✅ | ❌ | no E2E |
| Amazon ECR | ✅ | ✅ | `core.py` |

### ML / AI
| Service | MAP eligible | E2E covered | Notes |
|---------|:------------:|:-----------:|-------|
| Amazon SageMaker | ✅ | ✅ | `ml.py` — notebook, endpoint, pipeline, feature group |
| Amazon Bedrock | ✅ | ✅ | `ml.py` — inference profile, agent, guardrail |
| Amazon Comprehend | ✅ | ✅ | `ml.py` |
| Amazon Polly | ✅ | ❌ | no E2E |
| Amazon Rekognition | ✅ | ❌ | no E2E |
| Amazon Translate | ✅ | ❌ | no E2E |
| Amazon Transcribe | ✅ | ❌ | no E2E |
| Amazon HealthLake | ✅ | ✅ | `ml.py` |
| Amazon Personalize | ✅ | ❌ | no E2E |

### Media & IoT
| Service | MAP eligible | E2E covered | Notes |
|---------|:------------:|:-----------:|-------|
| Amazon MediaConvert | ✅ | ✅ | `media_iot.py` |
| Amazon MediaLive | ✅ | ❌ | no E2E |
| Amazon MediaPackage | ✅ | ❌ | no E2E |
| AWS Elemental MediaStore | 🚫 | — | deprecated |
| AWS IoT Core | ✅ | ✅ | `media_iot.py` |
| AWS IoT SiteWise | ✅ | ✅ | `media_iot.py` |
| AWS IoT Device Defender | ✅ | ❌ | no E2E |
| AWS IoT Events | 🚫 | — | not available to new customers |
| AWS IoT Analytics | 🚫 | — | not available to new customers |
| AWS IoT Greengrass | ✅ | ❌ | no E2E |

### Migration & Transfer
| Service | MAP eligible | E2E covered | Notes |
|---------|:------------:|:-----------:|-------|
| AWS DMS | ✅ | ✅ | `databases.py` |
| AWS Transfer Family | ✅ | ✅ | `misc.py` |
| AWS Application Migration Service | ✅ | ❌ | no E2E |
| AWS Snow Family | ✅ | ❌ | no E2E (device-based, hard to E2E) |

### End User / Other
| Service | MAP eligible | E2E covered | Notes |
|---------|:------------:|:-----------:|-------|
| Amazon AppStream 2.0 | ✅ | ✅ | `misc.py` fleet |
| Amazon WorkSpaces | ✅ | ❌ | no E2E — **GAP** (handler exists) |
| Amazon Connect | ✅ | ❌ | no E2E |
| Amazon Chime | 🚫 | — | deprecated for new customers |
| Amazon Location Service | ✅ | ✅ | `misc.py` |
| AWS Supply Chain | ✅ | ✅ | `misc.py` |
| AWS Deadline Cloud | ✅ | ✅ | `media_iot.py` |

## Summary

### Coverage stats
- **MAP 2.0 eligible services:** ~85 (active, tagged)
- **E2E covers:** ~55 services (65%)
- **Not covered but handler exists:** ~10 services (e.g. ELB, WAF, WorkSpaces, Connect, App Runner)
- **Truly uncovered (no handler, no E2E):** ~20 rarely-used or specialized services

### Notable gaps (high-value services we should add)

1. **Elastic Load Balancing (ALB/NLB/CLB)** — extremely common in migrations, heavily billed. **Priority: add to E2E.**
2. **AWS WAF** — common pairing with ALB/CloudFront. Easy E2E.
3. **Amazon WorkSpaces** — big MAP workload for VDI migrations.
4. **AWS CloudFormation** — customer stacks; we tag via handler but never E2E-test it.
5. **AWS Batch** — compute, billable.
6. **AWS App Runner** — newer but included in MAP.
7. **AWS Config** — often deployed alongside MAP.
8. **Amazon GuardDuty / Security Hub** — operational handler exists, untested.

### Handler-present-but-untested tier

Run `python3 .github/scripts/audit_handler_coverage.py --report` for the authoritative list (90 of 148 handlers have E2E coverage per baseline).

## Recommendation

**PR #13 (follow-up): Add ELB E2E coverage.** It's the single most common MAP resource not covered by E2E. Easy to add (create an ALB in networking.py), provides large proof-of-correctness gain.

Subsequent PRs can close the WAF / WorkSpaces / Batch / App Runner gaps.
