#!/usr/bin/env node
//
// Generates a standalone CloudFormation YAML by executing the same
// generateMainTemplate() that the configurator uses.
//
// Usage:
//   node scripts/build-yaml.js [--config '{"mpeId":"migXXX",...}'] [--output path.yaml]
//
// Without --config, uses placeholder defaults suitable for linting.
// With --config, bakes the provided values (for E2E scope tests).
//
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Parse CLI args
const args = process.argv.slice(2);
let configOverride = null;
let outputPath = path.join(__dirname, '..', 'configurator.yaml');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config' && args[i + 1]) {
    configOverride = JSON.parse(args[++i]);
  } else if (args[i] === '--output' && args[i + 1]) {
    outputPath = path.resolve(args[++i]);
  }
}

const SRC = path.join(__dirname, '..', 'src');

// 1. Read Lambda handler for YAML embedding
const lambdaPy = fs.readFileSync(path.join(SRC, 'templates', 'lambda-handler.py'), 'utf8');
const lambdaIndented = lambdaPy.split('\n').map(line => '          ' + line).join('\n');

// 2. Collect service files (same order as build.js)
const servicesDir = path.join(SRC, 'js', 'services');
const serviceFiles = fs.readdirSync(servicesDir)
  .filter(f => f.endsWith('.js') && f !== 'index.js')
  .sort()
  .map(f => `js/services/${f}`);

// 3. Only the JS files needed for template generation
const jsFiles = [
  'js/constants.js',
  ...serviceFiles,
  'js/services/index.js',
  'js/deploy/template-main.js',
];

// 4. Concatenate and strip module syntax
let jsBundle = '';
for (const file of jsFiles) {
  const content = fs.readFileSync(path.join(SRC, file), 'utf8');
  const stripped = content
    .replace(/^export\s+(default\s+)?/gm, '')
    .replace(/^import\s+.*;\s*$/gm, '');
  jsBundle += stripped;
}

// 5. Inject Lambda handler
const lambdaPlaceholder = '${LAMBDA_HANDLER_CODE}';
const lambdaIdx = jsBundle.indexOf(lambdaPlaceholder);
if (lambdaIdx === -1) {
  console.error('ERROR: ${LAMBDA_HANDLER_CODE} placeholder not found');
  process.exit(1);
}
jsBundle = jsBundle.slice(0, lambdaIdx) + lambdaIndented.trimEnd() + jsBundle.slice(lambdaIdx + lambdaPlaceholder.length);

// 6. Execute in sandbox
const sandbox = {};
vm.runInNewContext(jsBundle, sandbox);

// 7. Build config (defaults + overrides)
const config = Object.assign({
  mpeId: 'migPLACEHOLDER',
  deployMode: 'single',
  scopeMode: 'account',
  useAccountScope: false,
  stacksetAccounts: [],
  scopedVpcIds: ['NONE'],
  tagNonVpcServices: true,
  alertEmail: '',
  customerName: '',
  includeBackfill: false,
  agreementDate: '2024-01-01',
  agreementEndDate: '2099-12-31',
}, configOverride || {});

// 8. Generate and write
const yaml = sandbox.generateMainTemplate(config);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, yaml);
console.log(`Built: ${outputPath} (${(Buffer.byteLength(yaml) / 1024).toFixed(0)} KB)`);
