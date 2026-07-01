# 10 — Commit and PR Conventions

> ⚠️ Mirrored in `.kiro/steering/` and `.claude/rules/`. Run `npm run sync-rules` after edits.

## Conventional commits

Format: `<type>(<scope>): <subject>` — matching the project's history.

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`.

Reference the version and finding/wave where applicable:
- `fix: F034, F031 — validation and lifecycle UX (v21.0.4)`
- `feat(fsx): Add CreateVolume event for FSxN volume tagging`
- `fix(deploy): region-qualify S3 staging bucket; add us-east-1 warning`

Use imperative mood, capitalize the subject, no trailing period, keep the subject concise.

## Before pushing

1. **Rebuild artifacts**: `npm run build` — CI fails on stale `configurator.html` / `configurator.yaml`.
2. **Run tests**: `npm test` and `npm run verify`.
3. **Sync agent rules** if you edited any: `npm run sync-rules` (keeps `.kiro/steering/` and `.claude/rules/` identical).
4. **Update docs** per `04-documentation-update-rules` (CHANGELOG at minimum).

## PR flow

- Work on a feature branch; never commit directly to `main`.
- One logical change per PR (single concern).
- All CI gates must pass (build staleness, lint layers, tests, coverage audit).
- Do **not** force-push shared history or rewrite pushed commits — fix forward.
- Reference the finding ID / issue in the PR where relevant.

## Committing agent-rule changes

The rules live in two mirrored folders (`.kiro/steering/`, `.claude/rules/`). Always edit and commit both together (via `npm run sync-rules`) so Kiro and Claude Code stay in sync.
