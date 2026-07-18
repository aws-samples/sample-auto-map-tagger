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
  // The whole app is one inline <script>. A backtick inside a JS comment in
  // any src file terminates the enclosing template literal at build output
  // and silently breaks EVERY function (found 2026-07-18: a `-quoted shell
  // fragment in a delete-flow comment killed selectMode in the built HTML
  // while all source-level tests stayed green). Index-based extraction, not
  // a tag regex (CodeQL js/bad-tag-filter): the build emits exactly one
  // bare "<script>" open tag; slice from it to the last close tag.
  [(() => {
    const open = html.indexOf('<script>');
    const close = html.lastIndexOf('</script>');
    if (open === -1 || close === -1 || close <= open) return false;
    try { new Function(html.slice(open + '<script>'.length, close)); return true; }
    catch (e) { return false; }
  })(),
   'inline JS bundle parses'],
];

let pass = true;
for (const [ok, label] of checks) {
  console.log(ok ? `  ✓ ${label}` : `  ✗ ${label}`);
  if (!ok) pass = false;
}
process.exit(pass ? 0 : 1);
