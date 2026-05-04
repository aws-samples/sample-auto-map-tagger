#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const OUT = path.join(__dirname, '..', 'build', 'configurator.html');

// 1. Read HTML skeleton
let html = fs.readFileSync(path.join(SRC, 'html', 'configurator.html'), 'utf8');

// 2. Inline CSS
const css = fs.readFileSync(path.join(SRC, 'css', 'styles.css'), 'utf8');
const cssPlaceholder = '<!-- BUILD:CSS -->';
html = html.slice(0, html.indexOf(cssPlaceholder)) + css.trimEnd() + html.slice(html.indexOf(cssPlaceholder) + cssPlaceholder.length);

// 3. Read JS files in dependency order and concatenate
const jsFiles = [
  'js/constants.js',
  'js/app-pre.js',
  'js/i18n/all.js',
  'js/services/registry.js',
  'js/deploy/template-main.js',
  'js/deploy/instructions.js',
  'js/deploy/template-org.js',
  'js/deploy/script-deploy.js',
  'js/app-post.js',
];

let jsBundle = '';
for (const file of jsFiles) {
  const content = fs.readFileSync(path.join(SRC, file), 'utf8');
  // Strip ES module syntax (source files use export/import for IDE support;
  // output is a single <script> block with everything in global scope)
  const stripped = content
    .replace(/^export\s+(default\s+)?/gm, '')
    .replace(/^import\s+.*;\s*$/gm, '// (import removed by build)');
  jsBundle += stripped;
}

const jsPlaceholder = '<!-- BUILD:JS -->';
html = html.slice(0, html.indexOf(jsPlaceholder)) + jsBundle.trimEnd() + html.slice(html.indexOf(jsPlaceholder) + jsPlaceholder.length);

// 4. Write output
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`Built: ${OUT} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
