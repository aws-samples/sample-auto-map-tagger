# MAP 2.0 Auto-Tagger — AI Agent Guide (Claude Code)

This project uses shared, tool-agnostic engineering rules. The full rules live as
topic-scoped files in **`.claude/rules/`** (auto-loaded by Claude Code) and are
mirrored from **`.kiro/steering/`** (auto-loaded by Kiro). Edit the Kiro copy, then
run `npm run sync-rules` to update `.claude/rules/`.

## What this project is

The MAP 2.0 Auto-Tagger automatically applies the `map-migrated` tag to newly
created AWS resources so customers capture MAP migration credits. Two planes:
a client-side **configurator** (`configurator.html`, built from `src/`) and a
cloud **runtime** pipeline (CloudTrail → EventBridge → SQS → Lambda → Tagging API,
with a DLQ safety net).

## Highest-priority rules (full detail in `.claude/rules/`)

1. **Never edit `configurator.html` / `configurator.yaml` directly** — they are
   generated. Edit `src/`, run `npm run build`. CI fails on stale artifacts.
   → `.claude/rules/02-build-system.md`
2. **Check prior art before ANY change** — search CHANGELOG, git log (F-taxonomy),
   LIMITATIONS, and design docs. Features have been tried and *reverted*; don't
   reintroduce them. → `.claude/rules/03-check-prior-art-first.md`
3. **Update docs after every change** — CHANGELOG always; COVERAGE/LIMITATIONS/etc.
   as applicable. → `.claude/rules/04-documentation-update-rules.md`
4. **Security hard rules** — `delete.sh` must never remove `map-migrated` tags;
   single-quote containment in generated scripts; least-privilege IAM.
   → `.claude/rules/08-security.md`

## Rule index

| File | Topic |
|---|---|
| `01-project-overview.md` | System, two planes, directory map |
| `02-build-system.md` | Modular `src/` → single file; never edit built output |
| `03-check-prior-art-first.md` | Consult history/docs before changing |
| `04-documentation-update-rules.md` | Which docs to update when |
| `05-versioning-and-releases.md` | Semver policy + release process |
| `06-adding-a-service.md` | Service definition + handler parity recipe |
| `07-engineering-practices.md` | Defensive coding, idempotency, preflight |
| `08-security.md` | Hard security constraints |
| `09-testing-and-chaos.md` | F-taxonomy, chaos waves, CI gates |
| `10-commit-and-pr-conventions.md` | Conventional commits, PR flow |

## Verify loop (after any change)

```bash
npm run build && npm test && npm run verify
npm run sync-rules   # if you edited any rule file
```
