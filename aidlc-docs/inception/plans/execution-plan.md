# Workflow Planning — MAP 2.0 Auto-Tagger

## Execution Plan

This is a high-complexity greenfield build. All Inception stages execute. Construction proceeds per-unit.

### Inception Stages
| Stage | Execute? | Rationale |
|---|---|---|
| Workspace Detection | ✅ | Always |
| Reverse Engineering | ⏭️ Skipped | Greenfield at build time (reverse-engineering docs added retroactively for analysis) |
| Requirements Analysis | ✅ | High complexity — full requirements needed |
| User Stories | ✅ | User-facing configurator + multiple personas |
| Workflow Planning | ✅ | Always |
| Application Design | ✅ | New components across two planes |
| Units Generation | ✅ | System decomposes into 5 units |

### Construction Stages (per unit)
| Stage | Execute? | Rationale |
|---|---|---|
| Functional Design | ✅ | Complex business logic per unit |
| NFR Requirements | ✅ | Cost, reliability, security constraints |
| NFR Design | ✅ | Retry/DLQ patterns, least-privilege IAM |
| Infrastructure Design | ✅ | CloudFormation for the runtime plane |
| Code Generation | ✅ | Always |
| Build and Test | ✅ | Unit + E2E across accounts |

## Change Sequence
1. Unit 1: Configurator (UI + script generation)
2. Unit 2: Lambda Tagger (core tagging engine)
3. Unit 3: Infrastructure (CFN templates, event pipeline)
4. Unit 4: Service Definitions (154 resource types)
5. Unit 5: Lifecycle Operations (upgrade, delete, scope management)
