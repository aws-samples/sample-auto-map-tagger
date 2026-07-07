# Application Design Plan — MAP 2.0 Auto-Tagger

## Design Approach
Two planes: a client-side configurator (vanilla JS, built to a single HTML file) and a cloud runtime (event-driven serverless tagging pipeline). Technology is fixed: vanilla JS + Node build for frontend, Python Lambda for tagging, CloudFormation for IaC.

## Execution Steps

- [x] Step 1: Identify configurator components (flows, i18n, service defs, templates)
- [x] Step 2: Identify runtime components (Lambda, event pipeline, IaC resources)
- [x] Step 3: Define component methods and interfaces
- [x] Step 4: Define service orchestration (event flow, deploy flow, tagging flow)
- [x] Step 5: Map component dependencies
- [x] Step 6: Generate all design artifacts
