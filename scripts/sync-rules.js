#!/usr/bin/env node
/**
 * sync-rules.js — Keep AI agent rules in sync across tools.
 *
 * Canonical source: .kiro/steering/*.md (Kiro auto-loads these)
 * Mirror target:    .claude/rules/*.md  (Claude Code auto-loads these)
 *
 * The two folders hold identical files so Kiro and Claude Code follow the
 * same rules. Symlinks are unreliable in .kiro, so we copy physical files.
 *
 * Usage: npm run sync-rules   (run after editing any steering file)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, '.kiro', 'steering');
const TARGET = path.join(ROOT, '.claude', 'rules');

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Source folder not found: ${SOURCE}`);
    process.exit(1);
  }

  fs.mkdirSync(TARGET, { recursive: true });

  const sourceFiles = fs.readdirSync(SOURCE).filter((f) => f.endsWith('.md'));

  // Remove stale files in target that no longer exist in source.
  for (const existing of fs.readdirSync(TARGET).filter((f) => f.endsWith('.md'))) {
    if (!sourceFiles.includes(existing)) {
      fs.unlinkSync(path.join(TARGET, existing));
      console.log(`  removed stale  .claude/rules/${existing}`);
    }
  }

  // Copy every source file into the target.
  let copied = 0;
  for (const file of sourceFiles) {
    fs.copyFileSync(path.join(SOURCE, file), path.join(TARGET, file));
    copied++;
  }

  console.log(`Synced ${copied} rule file(s): .kiro/steering/ -> .claude/rules/`);
}

main();
