#!/usr/bin/env node
const fs = require('fs');
const html = fs.readFileSync('configurator.html', 'utf8');

const checks = [
  [html.includes('<style>'),              'CSS is inlined'],
  [html.includes('TEMPLATE_VERSION'),     'JS constants present'],
  [html.includes('generateMainTemplate'), 'template generator present'],
  [html.includes('generateDeployScript'), 'deploy script generator present'],
  [html.includes('ALL_EVENT_NAMES'),      'service definitions present'],
  [html.includes('LANG_LABELS'),          'i18n present'],
  [html.includes('function t('),          't() function present'],
  [html.includes('selectMode'),           'flow navigation present'],
  [html.includes('deleteGenerate'),       'delete flow present'],
  [html.includes('editorGenerate'),       'editor flow present'],
  [html.includes('editorGenerateUpgrade'),'upgrade flow present'],
  [!html.includes('/* BUILD:'),         'no unresolved build placeholders'],
  [!html.includes('require('),            'no require() in output'],
];

let pass = true;
for (const [ok, label] of checks) {
  console.log(ok ? `  ✓ ${label}` : `  ✗ ${label}`);
  if (!ok) pass = false;
}
process.exit(pass ? 0 : 1);
