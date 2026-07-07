# 02 — Build System

> ⚠️ Canonical copy: `.kiro/steering/`. Edit there, then run `npm run sync-rules` — the sync is **one-way** (kiro → claude) and overwrites `.claude/rules/`.

## The one rule that prevents the most bugs

**NEVER edit `configurator.html` or `configurator.yaml` directly.** They are generated. Edit the modular sources in `src/`, then run `npm run build`. CI fails if committed artifacts are stale (build-staleness check, PR #91).

## How the build works

`scripts/build.js`:
1. Reads `src/html/configurator.html` (skeleton with `<!-- BUILD:CSS -->` / `<!-- BUILD:JS -->` placeholders)
2. Inlines CSS from `src/css/styles.css`
3. Concatenates JS files in dependency order
4. Embeds `src/templates/lambda-handler.py` (indented for YAML embedding)
5. Outputs the single self-contained `configurator.html`

**`npm run build` only produces the HTML.** The YAML is generated separately by `npm run build:yaml` (`scripts/build-yaml.js`, optionally with `--config '{...}'`), from the same `src/` sources — so drift between HTML and YAML is impossible by construction (this eliminated the F012 drift bug class in v22).

## Single source of truth

- **Version** lives in exactly one place: `src/js/constants.js` → `TEMPLATE_VERSION`. Never hardcode a version anywhere else.
- **No hand-maintained YAML monolith.** The old `map2-auto-tagger-optimized.yaml` was removed in v22. If you need to change the deployed template, edit `src/js/deploy/template-*.js`.

## The verify loop (run after every change)

```bash
npm run build       # assemble configurator.html
npm run build:yaml  # assemble configurator.yaml
npm test            # unit tests (services, i18n, build output, Lambda)
npm run verify      # sanity checks on built HTML (no unresolved placeholders, all functions present)
```

Don't hardcode test or check counts in docs — they rot on every PR.

Always rebuild and run this loop before committing — a stale artifact fails CI.
