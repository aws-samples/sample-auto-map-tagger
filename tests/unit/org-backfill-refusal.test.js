import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { execFileSync } from 'child_process';
import os from 'os';

// Regression guards for release-gate findings 32B-5/32B-7 (2026-09-10):
// backfill exists only in the single-account template, but the configurator
// accepted org+backfill — pre-existing resources silently never got tagged,
// and the generated org deploy.sh waited on the nonexistent backfill Lambda,
// where one unguarded `aws logs filter-log-events` failure (CLI exit 254)
// killed the whole deploy under `set -e`.

const SRC = path.join(__dirname, '../../src');

function sandboxed() {
  const files = [
    'js/constants.js',
    'js/i18n/en.js', 'js/i18n/ko.js', 'js/i18n/ja.js', 'js/i18n/zh.js',
    'js/i18n/id.js', 'js/i18n/th.js', 'js/i18n/vi.js', 'js/i18n/engine.js',
    'js/deploy/script-deploy.js',
  ];
  let bundle = '';
  for (const f of files) {
    bundle += fs.readFileSync(path.join(SRC, f), 'utf8')
      .replace(/^export\s+(default\s+)?/gm, '')
      .replace(/^import\s+.*;\s*$/gm, '');
  }
  const sandbox = {};
  vm.runInNewContext(bundle, sandbox);
  return sandbox;
}

const baseConfig = {
  mpeId: 'migBFTEST1',
  scopeMode: 'account',
  useAccountScope: false,
  stacksetAccounts: [],
  scopedVpcIds: ['NONE'],
  tagNonVpcServices: true,
  alertEmail: '',
  customerName: 'TestCo',
  agreementDate: '2024-01-01',
  agreementEndDate: '2099-12-31',
  regions: ['ap-southeast-2'],
  includeBackfill: true, // deliberately hostile: org must ignore this
};

describe('org deploy.sh — backfill honestly refused (gate 32B-5/7)', () => {
  const sb = sandboxed();
  const orgScript = sb.generateDeployScript(
    { ...baseConfig, deployMode: 'org' }, 'DUMMY_ORG', 'DUMMY_PER_ACCOUNT');
  const singleScript = sb.generateDeployScript(
    { ...baseConfig, deployMode: 'single' }, 'DUMMY_MAIN', null);

  it('org script emits NO backfill wait even with includeBackfill:true', () => {
    // defense-in-depth below the UI/config gates: the generator itself
    // never emits the wait for a Lambda org templates do not contain
    expect(orgScript).not.toContain('filter-log-events');
    expect(orgScript).not.toContain('BACKFILL_RESULT');
    expect(orgScript).not.toContain('Backfill Lambda');
  });

  it('org script still parses (bash -n)', () => {
    const p = path.join(os.tmpdir(), `org-backfill-refusal-${Date.now()}.sh`);
    fs.writeFileSync(p, orgScript);
    try { execFileSync('bash', ['-n', p]); } finally { fs.rmSync(p, { force: true }); }
  });

  it('single-account backfill wait is preserved, with the poll guarded', () => {
    expect(singleScript).toContain('filter-log-events');
    // one failed poll (throttle/5xx, aws CLI exit 254) must not kill the
    // deploy under set -e — the exact death mode 32B-5/7 exhibited
    expect(singleScript).toMatch(/--output text 2>\/dev\/null \|\| true\)/);
  });
});

describe('deploy-flow — org backfill refused at UI and config level', () => {
  const flowSrc = fs.readFileSync(
    path.join(SRC, 'js/deploy/deploy-flow.js'), 'utf8');

  it('getConfig force-clears includeBackfill for multi mode', () => {
    expect(flowSrc).toMatch(/includeBackfill:\s*deployMode !== 'multi'/);
  });

  it('mode switch disables and unchecks the backfill checkbox for multi', () => {
    expect(flowSrc).toContain("backfillBox.disabled = mode === 'multi'");
    expect(flowSrc).toContain('ui_backfill_multi_note');
  });

  it('review table reports the refusal instead of claiming enabled', () => {
    expect(flowSrc).toContain('rv_backfill_not_multi');
  });
});
