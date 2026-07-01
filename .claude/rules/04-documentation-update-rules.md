# 04 — Documentation Update Rules

> ⚠️ Mirrored in `.kiro/steering/` and `.claude/rules/`. Run `npm run sync-rules` after edits.

**Every change must leave the documentation consistent. Before finishing any change, check whether these docs need updating.**

## When you change X, update Y

| Change | Docs to update |
|---|---|
| **Any user-visible or behavioral change** | `CHANGELOG.md` — categorized under Added / Fixed / Changed / Breaking, with the version |
| **Added / removed / changed service coverage** | `COVERAGE.md` **and** `docs/MAP_included.md` |
| **Discovered a new constraint or edge case** | `LIMITATIONS.md` |
| **Changed the build, source structure, or extension process** | `docs/DEVELOPMENT.md` |
| **Changed user-facing behavior or deployment steps** | `README.md` and/or `docs/INSTRUCTIONS.md` |
| **Version bump** | `src/js/constants.js` (`TEMPLATE_VERSION`) + add examples to `VERSIONING.md` if the bump rule is illustrative |
| **A service AWS cannot tag** | `docs/MAP_TAGGING_GAP_ANALYSIS.md` |
| **Big feature** (new Lambda, new pipeline component, new CFN parameter) | Write a design doc in `docs/` **with locked open questions before coding** |

## CHANGELOG discipline

- Every entry states its **bump class** (Breaking / Added / Changed / Fixed) — see `05-versioning-and-releases`.
- Note **back-compat impact** when relevant (e.g., "a bucket created by a pre-fix deploy is named without the `-{region}` suffix; delete it manually").
- Reference the PR number and finding ID where applicable.

## Do a doc-drift reconciliation pass on significant changes

After large changes, sweep the docs for drift — this has been done repeatedly (commits #22, #39, #69, #87, #101, #106 were dedicated reconciliation passes). Docs that disagree with the code are worse than no docs.

## Design docs before big features

For anything substantial, write the design first, enumerate the open questions, get them reviewed, and mark the design **LOCKED** with a date before writing code (the pattern in `docs/design-reconciliation.md`). AI proposes the design; a human locks it.
