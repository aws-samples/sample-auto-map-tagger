# Unit of Work — Requirements Mapping

## Unit 1: Configurator

| Requirement | Coverage |
|-------------|----------|
| FR-01: Self-Service Configurator | Full — browser UI, script generation |
| NFR-04: Portability | Full — single-file, offline-capable |
| FR-01 (i18n) | Full — 7 languages |

## Unit 2: Lambda Tagger

| Requirement | Coverage |
|-------------|----------|
| FR-02: Automatic Resource Tagging | Full — ARN extraction + tag application |
| NFR-02: Reliability | Full — idempotent, retry-safe |

## Unit 3: Infrastructure

| Requirement | Coverage |
|-------------|----------|
| FR-03: Event-Driven Pipeline | Full — EventBridge/SQS/DLQ/Lambda |
| FR-04: Multi-Account Deployment | Full — Stack + StackSet |
| FR-08: Observability | Full — CloudWatch + SNS |
| NFR-01: Cost Efficiency | Full — serverless |
| NFR-03: Security | Full — least-privilege IAM |

## Unit 4: Service Definitions

| Requirement | Coverage |
|-------------|----------|
| FR-02 (coverage) | Full — 154 resource types |
| FR-07: Per-Service Extensibility | Full — modular definitions |
| NFR-05: Maintainability | Full — coverage audit |

## Unit 5: Lifecycle Operations

| Requirement | Coverage |
|-------------|----------|
| FR-05: Scope Management | Full — StackSet update + SSM |
| FR-06: Lifecycle Operations | Full — upgrade/delete/backfill |

## Coverage Matrix

| Requirement | Unit(s) | Status |
|-------------|---------|--------|
| FR-01 | 1 | ✅ |
| FR-02 | 2, 4 | ✅ |
| FR-03 | 3 | ✅ |
| FR-04 | 3 | ✅ |
| FR-05 | 5 | ✅ |
| FR-06 | 5 | ✅ |
| FR-07 | 4 | ✅ |
| FR-08 | 3 | ✅ |
| NFR-01 | 3 | ✅ |
| NFR-02 | 2 | ✅ |
| NFR-03 | 3 | ✅ |
| NFR-04 | 1 | ✅ |
| NFR-05 | 4 | ✅ |

**All requirements mapped. No gaps detected.**
