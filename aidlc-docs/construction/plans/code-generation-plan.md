# Code Generation Plan — MAP 2.0 Auto-Tagger

## Per-Unit Code Generation

### Unit 4: Service Definitions (build first — foundational)
- [x] Create service definition format/schema
- [x] Generate 85 service definition files (154 resource types)
- [x] Create service registry aggregation (index.js)
- [x] Create coverage audit script

### Unit 2: Lambda Tagger
- [x] Create SQS event handler entry point
- [x] Implement ARN router + 154 service-specific extractors
- [x] Implement scope filtering (SSM/env)
- [x] Implement Tagging API integration
- [x] Implement retry/error handling for DLQ

### Unit 1: Configurator
- [x] Create HTML skeleton + CSS
- [x] Implement app shell + flow routing
- [x] Implement deploy flow + validation
- [x] Implement i18n engine + 7 language packs
- [x] Implement build script (single-file assembly)

### Unit 3: Infrastructure
- [x] Create main template generator (single-account)
- [x] Create org template generator (StackSet)
- [x] Implement IAM policy generation
- [x] Wire EventBridge/SQS/DLQ/Lambda/SSM/CloudWatch/SNS

### Unit 5: Lifecycle Operations
- [x] Implement delete flow (tag-preserving)
- [x] Implement upgrade flow (change-set preview)
- [x] Implement scope management (StackSet update + SSM)
- [x] Implement StackSet ops scripts
- [x] Implement backfill capability

## Cross-Unit Integration
- [x] Service defs consumed by both configurator and Lambda
- [x] Configurator embeds Lambda + CFN into deploy.sh
- [x] Coverage audit gates CI (handler parity)
