# Component Dependencies — MAP 2.0 Auto-Tagger

## Dependency Matrix

Row depends on column (B = build-time, R = runtime, G = generation-time — i.e., embedded into a generated artifact).

| Component | C1 UI | C2 Script Gen | C3 Template Gen | C4 i18n | C5 Registry | C6 Lambda | C7 Preflight | C8 Pipeline | C9 Alerting | C10 Config Store |
|---|---|---|---|---|---|---|---|---|---|---|
| **C1 Configurator UI** | — | R | R | R | — | — | — | — | — | — |
| **C2 Script Generator** | — | — | — | — | — | — | G (embeds) | — | — | — |
| **C3 Template Generator** | — | — | — | — | R (patterns, IAM) | G (embeds source) | — | G (declares) | G (declares) | G (declares) |
| **C4 i18n Engine** | — | — | — | — | — | — | — | — | — | — |
| **C5 Service Definition Registry** | — | — | — | — | — | B (parity audit) | — | — | — | — |
| **C6 Auto-Tagger Lambda** | — | — | — | — | — | — | — | R (consumes SQS) | — | R (reads config) |
| **C7 Preflight** | — | — | — | — | — | — | — | — | — | R (reads peer configs) |
| **C8 Event Pipeline** | — | — | — | — | — | R (invokes) | — | — | — | — |
| **C9 Alerting** | — | — | — | — | — | R (metrics) | — | R (DLQ depth) | — | — |
| **C10 Config Store** | — | — | — | — | — | — | — | — | — | — |

Key observations:
- **C5 (Registry) is the coverage contract**: C3 derives event patterns and IAM from it; the build-time parity audit holds C6's handlers to it in both directions.
- **The planes share no runtime dependency**: every arrow from the configuration plane into the runtime plane is generation-time embedding (G), never a call.
- **C4 (i18n) and C10 (Config Store) are leaf dependencies** — nothing they depend on, many depend on them.

## Data-Flow Diagram (both planes)

```mermaid
flowchart TD
    subgraph CONFIG_PLANE["Configuration Plane — browser, no backend"]
        User(["Consultant"])
        C1["C1 Configurator UI"]
        C4["C4 i18n Engine<br/>(7 locales)"]
        C2["C2 Script Generator"]
        C3["C3 Template Generator"]
        C5["C5 Service Definition<br/>Registry"]
        ART[["Generated package:<br/>deploy.sh / delete.sh / upgrade.sh<br/>+ CloudFormation (embedded Lambda)"]]

        User --> C1
        C4 --> C1
        C1 -->|"validated Config"| C2
        C1 -->|"validated Config"| C3
        C5 -->|"event patterns + IAM"| C3
        C2 --> ART
        C3 --> ART
    end

    ART ==>|"customer runs deploy.sh<br/>(the only plane hand-off)"| CFN

    subgraph RUNTIME_PLANE["Runtime Plane — customer AWS account(s)"]
        CFN["CloudFormation /<br/>StackSets AutoDeployment"]
        CT["CloudTrail<br/>(~5s after creation)"]
        EB["C8 EventBridge rules<br/>(pattern per service)"]
        SQS["C8 SQS main queue<br/>(14d retention, 180s x 5)"]
        DLQ["C8 DLQ"]
        L["C6 Auto-Tagger Lambda"]
        SSM["C10 SSM config<br/>/auto-map-tagger/{mpe_id}/config"]
        TAG["Resource Groups Tagging API /<br/>native tag APIs"]
        CW["C9 CloudWatch alarms:<br/>TaggerError, DLQFillingUp,<br/>TrickleFailure, PeerTaggerDetected"]
        SNS["C9 SNS topic<br/>(per engagement)"]
        PF["C7 Preflight<br/>(in deploy/upgrade)"]

        CFN --> EB
        CFN --> SQS
        CFN --> L
        CFN --> SSM
        CFN --> CW
        PF -.->|"go / no-go before CFN"| CFN
        CT --> EB
        EB --> SQS
        SQS --> L
        SSM -->|"config read"| L
        L --> TAG
        SQS -->|"5 failed receives"| DLQ
        DLQ --> CW
        L -->|"error metrics"| CW
        CW --> SNS
    end

    style CONFIG_PLANE fill:#BBDEFB,stroke:#1565C0,stroke-width:2px,color:#000
    style RUNTIME_PLANE fill:#C8E6C9,stroke:#2E7D32,stroke-width:2px,color:#000
    style ART fill:#FFF59D,stroke:#F57F17,stroke-width:2px,color:#000
    style User fill:#CE93D8,stroke:#6A1B9A,stroke-width:3px,color:#000

    linkStyle default stroke:#333,stroke-width:2px
```

## Communication Patterns

| Path | Pattern | Rationale |
|---|---|---|
| Configuration plane → runtime plane | **Generated artifacts only** (scripts + template with embedded handler). No API, no polling, no callback. | Privacy by construction (NFR-11) and no-outbound-calls hard rule (NFR-4); the planes cannot drift into runtime coupling. |
| CloudTrail → EventBridge → SQS → Lambda | **Event-driven async with durable buffering** | Decouples event arrival from taggability (slow provisioners); absorbs throttles/outages; retry semantics live in one place (queue policy). |
| Lambda → tag APIs | **Idempotent synchronous calls with partial batch response** | Re-applying a tag is a safe no-op, so at-least-once delivery is correct; per-record failure reporting keeps one bad event from recycling a whole batch. |
| Failure → DLQ → alarm → SNS | **Escalation chain, no automatic reprocessing** | Exhausted messages need human judgment (replay after fix); automatic re-drive could loop on a systemic fault. |
| Lambda/Preflight → SSM | **Read-through cached config reads** | Single config source (FR-10); config changes apply without redeploy; defensive parsing prevents a bad write from crashing the tagger. |
| Registry → template/IAM/audit | **Build-time derivation from one declarative contract** | Event patterns, IAM grants, and handler parity can never disagree with each other because all three derive from C5. |
