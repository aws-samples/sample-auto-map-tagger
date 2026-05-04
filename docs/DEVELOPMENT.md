# Source Structure & Development Guide

The configurator is built from modular source files in `src/`. A build script (`scripts/build.js`) assembles them into a single `build/configurator.html` that runs entirely in the browser with no dependencies.

## Directory Layout

```
src/
├── html/configurator.html       HTML skeleton (no CSS, no JS)
├── css/styles.css               All styles
├── js/
│   ├── constants.js             TEMPLATE_VERSION, VERSION_HISTORY
│   ├── app.js                   generateAndDownload(), downloadFile(), copyInstructions()
│   ├── shared/
│   │   └── ui.js                selectMode(), step navigation for all flows
│   ├── i18n/
│   │   ├── engine.js            t(), setLanguage(), applyTranslations()
│   │   ├── en.js                English translations
│   │   ├── ko.js, ja.js, ...    Other locales (7 total)
│   ├── services/
│   │   ├── index.js             Aggregates → ALL_EVENT_NAMES, ALL_SOURCES, TAGGING_PERMISSIONS
│   │   ├── _shared.js           Cross-cutting permissions (tag:*, SQS, IAM, etc.)
│   │   ├── ec2.js, rds.js, ...  Per-service definitions (~80 files)
│   │   └── README.md            Format docs for contributors
│   ├── deploy/
│   │   ├── deploy-flow.js       Deploy mode UI, validation, config gathering
│   │   ├── template-main.js     generateMainTemplate() — CFN YAML generator
│   │   ├── template-org.js      generatePerAccountTemplate(), generateOrgTemplate()
│   │   ├── script-deploy.js     generateDeployScript() — deploy.sh generator
│   │   └── instructions.js      generateInstructions()
│   ├── editor/
│   │   └── editor-flow.js       Editor mode — add/remove accounts, generates update.sh
│   ├── upgrade/
│   │   └── upgrade-flow.js      Upgrade mode — template version upgrades, generates upgrade.sh
│   └── delete/
│       └── delete-flow.js       Delete mode — removal flow, generates delete.sh
└── templates/
    └── lambda-handler.py        Auto-tagger Lambda (standalone Python, embedded at build time)
```

## How the Build Works

`scripts/build.js` does three things:

1. Reads `src/html/configurator.html` (the skeleton with `<!-- BUILD:CSS -->` and `<!-- BUILD:JS -->` placeholders)
2. Inlines CSS from `src/css/styles.css`
3. Concatenates all JS files in dependency order, injects the Lambda Python (indented for YAML embedding), and inlines the result

The output is a single self-contained HTML file at `build/configurator.html`.

## How to Extend

### Adding a new AWS service

1. Create `src/js/services/<service>.js`:
   ```js
   const SERVICE_MYSERVICE = {
       source: 'aws.myservice',
       events: ['CreateThing', 'CreateOtherThing'],
       permissions: ['myservice:TagResource'],
   };
   ```
2. Add it to the `ALL_SERVICES` array in `src/js/services/index.js`
3. Run `npm run build` — the build auto-discovers service files

### Adding a new locale

1. Copy `src/js/i18n/en.js` to `src/js/i18n/<code>.js`
2. Rename the variable to `<code>_translations` and translate the values
3. Add the locale to `LANG_LABELS` and `TRANSLATIONS` in `src/js/i18n/engine.js`
4. Add the file to the `jsFiles` array in `scripts/build.js`

### Adding a new flow (mode)

1. Create `src/js/<flow>/<flow>-flow.js` with the flow functions
2. Add the HTML for the flow in `src/html/configurator.html`
3. Add a mode card on the landing page and update `selectMode()` in `src/js/shared/ui.js`
4. Add the file to the `jsFiles` array in `scripts/build.js`
5. Add i18n keys to all locale files

### Modifying the Lambda handler

Edit `src/templates/lambda-handler.py` directly. It's valid standalone Python — you can lint it, test it, and run `python3 -m py_compile src/templates/lambda-handler.py` to check syntax. The build script reads it and embeds it into the CFN template.

## Verification

```bash
npm run build     # assemble build/configurator.html
npm test          # 35 unit tests (services, i18n, build output, Lambda)
npm run verify    # 13 sanity checks on the built HTML
```

After every change, the built output should contain all functions, all i18n keys, all service definitions, and no unresolved placeholders.
