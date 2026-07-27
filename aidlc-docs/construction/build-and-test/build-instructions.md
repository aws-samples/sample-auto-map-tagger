# Build Instructions

**Stage**: Build and Test (Construction)
**Date**: 2026-03-27
**Scope**: Building the two generated artifacts — `configurator.html` and `configurator.yaml` — from the modular sources in `src/`.

The MAP 2.0 Auto-Tagger has no compiled binaries. "Build" here means **assembly**: `scripts/build.js` stitches the modular `src/` tree (HTML skeleton, CSS, ~85 service definition files, i18n locales, flow modules, and the embedded Python Lambda handler) into a single self-contained `configurator.html`, and `scripts/build-yaml.js` assembles the deployable CloudFormation template `configurator.yaml` from the same sources. Because both outputs derive from one source tree, HTML/YAML drift is impossible by construction.

## Prerequisites

- **Build Tool**: Node.js 20+ with npm (the build scripts are plain Node — no bundler, no transpiler)
- **Dependencies**: dev dependencies from `package.json` (`vitest` for tests; `playwright` is used only by browser-level checks). Installed via `npm install`.
- **Environment Variables**: none. The build is fully offline and deterministic.
- **AWS Credentials**: **not required.** Nothing in the build touches AWS. Credentials are only needed for the integration/E2E stage (see `integration-test-instructions.md`).
- **System Requirements**: any OS that runs Node 20 (macOS/Linux/Windows); < 500 MB disk for `node_modules`; no special memory needs.

## Build Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

No configuration needed. Do **not** set AWS credentials for this step — the build must succeed on a machine with no AWS access, and keeping it that way enforces the "no outbound calls" design constraint at build time.

### 3. Build All Units

```bash
# Assemble the single-file configurator (Unit 1 + embedded Units 2/4)
npm run build

# Assemble the CloudFormation template (Unit 3, from the same src/ tree)
npm run build:yaml
```

`npm run build` (`scripts/build.js`):
1. Reads the skeleton `src/html/configurator.html` (contains `<!-- BUILD:CSS -->` / `<!-- BUILD:JS -->` placeholders)
2. Inlines `src/css/styles.css`
3. Concatenates the JS modules in dependency order (constants → i18n → services → flows → app), auto-discovering service files in `src/js/services/`
4. Embeds `src/templates/lambda-handler.py`, re-indented for YAML embedding
5. Writes the single self-contained `configurator.html` at the repo root

`npm run build:yaml` (`scripts/build-yaml.js`) generates `configurator.yaml` from the same template modules (`src/js/deploy/template-*.js`); it accepts an optional `--config '{...}'` for parameterized builds.

### 4. Verify Build Success

```bash
npm run verify
```

`scripts/verify-build.js` runs sanity checks on the built HTML:
- **No unresolved build placeholders** (no literal `/* BUILD:` markers survive into output)
- **All required functions present** (entry points like `generateAndDownload` exist in the assembled bundle)
- Output is a single self-contained file (no external script/style references)

- **Expected Output**: `npm run build` and `npm run build:yaml` exit 0 and print the output path; `npm run verify` prints one OK line per check and exits 0.
- **Build Artifacts**:
  - `configurator.html` — single self-contained browser app (repo root)
  - `configurator.yaml` — deployable CloudFormation template (repo root)
- **Common Warnings**: none expected. Any warning is a defect — treat it as a failure.

### Full verify loop (run after every change)

```bash
npm run build && npm run build:yaml && npm test && npm run verify
```

## Golden Rule

**Never edit `configurator.html` or `configurator.yaml` directly.** They are generated artifacts. Edit `src/`, rebuild, and commit source + regenerated artifacts together. CI runs a build-staleness check (`configurator-check` job) that rebuilds from `src/` and fails the PR if the committed artifacts differ — a stale artifact cannot merge.

The version string lives in exactly one place: `src/js/constants.js` → `TEMPLATE_VERSION`. Both build outputs read it; never hardcode a version elsewhere.

## Troubleshooting

### Build Fails with Dependency Errors

- **Cause**: `node_modules` missing or corrupted; Node version below 20 (older Node lacks APIs the build scripts use).
- **Solution**:
  1. `node --version` — confirm ≥ 20; upgrade if not.
  2. `rm -rf node_modules package-lock.json && npm install`
  3. Re-run `npm run build`.

### Build Fails with Compilation Errors

- **Cause**: The build is concatenation, so "compilation" failures are almost always a malformed source module — a syntax error in a `src/js/**` file, a service definition file missing its expected shape, or a placeholder typo in the HTML skeleton.
- **Solution**:
  1. Read the error — `build.js` reports the offending source file.
  2. Fix the file in `src/` (never in the built output).
  3. Rebuild and run `npm run verify`; a "missing function" verify failure usually means a JS module failed to parse and silently truncated the bundle.

### `npm run verify` Fails with "unresolved build placeholders"

- **Cause**: The skeleton's `BUILD:CSS` / `BUILD:JS` markers were renamed or the build script's replacement step was edited inconsistently.
- **Solution**: Diff `src/html/configurator.html` against `scripts/build.js` placeholder handling; restore the matching marker strings; rebuild.

### CI fails `configurator-check` (build staleness) but local build passes

- **Cause**: You edited `src/` but committed without rebuilding, or edited the artifact directly.
- **Solution**: Run the full verify loop locally, `git add configurator.html configurator.yaml`, and push the regenerated artifacts.
