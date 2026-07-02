# 03 — Check Prior Art First (mandatory pre-change ritual)

> ⚠️ Mirrored in `.kiro/steering/` and `.claude/rules/`. Run `npm run sync-rules` after edits.

**This project has extensive accumulated learning — 200+ commits, multiple chaos-test waves, and features that were shipped then deliberately reverted. Before implementing ANY change, assume your idea may have already been tried, considered, or explicitly rejected. Check the institutional memory first.**

## Where to look, and what each answers

| Source | Answers |
|---|---|
| `LIMITATIONS.md` | "Is this a known constraint we already decided we can't/won't solve?" (e.g., global services only emit CloudTrail events in us-east-1; long-provisioning resources exceed the retry budget) |
| `CHANGELOG.md` | "Did we already ship, change, or **revert** this?" |
| `docs/*.md` design docs | "Was this a locked design decision?" (e.g., `design-reconciliation.md` locked its open questions on a date — don't re-litigate) |
| `git log` + commit messages | "Was this tried and fixed?" Search the F-taxonomy: `git -P log --oneline \| grep -i <keyword>` — find the F### finding, its fix, and rationale |
| `COVERAGE.md` / `docs/MAP_included.md` | "Is this service already covered or intentionally excluded?" |
| `docs/MAP_TAGGING_GAP_ANALYSIS.md` | "Is this untaggable due to an AWS API limitation?" |
| `tests/unit/` | "Is there a regression test guarding this behavior?" |

## Workflow before coding

1. Search `CHANGELOG.md` and `git log` for the feature/bug keyword.
2. If it was **reverted** → understand *why* before re-proposing.
3. If it's a **documented limitation** → confirm with a human before trying to override a deliberate decision.
4. If a **regression test** guards the area → your change must not break it. If it must, stop and ask.
5. **Cite what you found** in your explanation, e.g.: "This was added in PR #40 (v20.5.0) and removed in PR #95 (v22) because reconciliation risked mass-mistagging when SSM config was wrong."

## Real traps this prevents (all from actual history)

- **Re-adding the reconciliation Lambda** — removed in v22; it risked mass-mistagging on bad SSM config.
- **Naively re-enabling the Edit flow** — Edit stays disabled (its sed-on-template approach is incompatible with the `!Sub`-based SSM config). The Upgrade flow, by contrast, was **revived in #105** (hardened with `UsePreviousValue=true` + a pre-#95 guard that refuses in-place upgrade on legacy stacks lacking `ScopedAccountIds`). Don't re-enable Edit, and don't strip the upgrade guards.
- **Trying to tag services AWS APIs can't tag** — IoT Things, Lambda Layers, Glue Tables (post-creation), CloudWatch Log Streams, API Gateway API Keys.
- **Reintroducing the YAML monolith** — decoupled in v22 to kill the drift bug class.
- **Removing `ci_get()`** (case-insensitive CloudTrail key access) — it exists because CloudTrail casing inconsistency caused silent tag loss.

This rule pairs with `04-documentation-update-rules`: check prior art *before*, update docs *after*.
