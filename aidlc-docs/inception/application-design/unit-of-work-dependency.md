# Unit of Work Dependency Matrix

## Dependency Graph

```
Unit 4 (Service Definitions) ──┐
                               ├──> Unit 1 (Configurator) ──> Unit 3 (Infrastructure)
                               │                                      │
Unit 2 (Lambda Tagger) ────────┴──────────────────────────────────────┤
                                                                       │
                                                              Unit 5 (Lifecycle Ops)
```

## Dependency Matrix

| Unit | Depends On | Depended By |
|------|-----------|-------------|
| 1. Configurator | Unit 4 (service defs for patterns) | Unit 3, Unit 5 |
| 2. Lambda Tagger | Unit 4 (service ARN shapes) | Unit 3 (deployed by CFN) |
| 3. Infrastructure | Units 1, 2, 4 (packages everything) | Unit 5 |
| 4. Service Definitions | None (foundational) | Units 1, 2, 3 |
| 5. Lifecycle Ops | Units 1, 3 (operates on deployed stacks) | None |

## Build Order (Critical Path)

1. **Unit 4: Service Definitions** (foundational — no dependencies)
2. **Unit 2: Lambda Tagger** (needs service ARN shapes)
3. **Unit 1: Configurator** (needs service defs for event patterns)
4. **Unit 3: Infrastructure** (packages Lambda + configurator output into CFN)
5. **Unit 5: Lifecycle Ops** (operates on deployed infrastructure)

## Parallelization Opportunities

- Unit 4 (Service Definitions) and Unit 2 (Lambda core logic) can be built in parallel
- Unit 1 (Configurator UI shell) can be built while Unit 2 progresses
- Unit 5 (Lifecycle) is largely independent once Unit 3 contracts are known

## Integration Points

| From | To | Interface |
|------|-----|-----------|
| Unit 4 → Unit 1 | Service defs consumed by ServiceRegistry | JS module import |
| Unit 4 → Unit 2 | ARN extraction shapes | Python handler mapping |
| Unit 1 → Unit 3 | Generated CFN template | Embedded in deploy.sh |
| Unit 2 → Unit 3 | Lambda code packaged in CFN | Inline / S3 asset |
| Unit 3 → Unit 5 | Deployed stack names | StackSet naming convention |
| Unit 1 → Unit 5 | Scope config schema | SSM parameter format |
