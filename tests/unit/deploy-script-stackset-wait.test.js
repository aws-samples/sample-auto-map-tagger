import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import { execFileSync, spawnSync } from 'child_process';

// Behavioral regression guards for the org StackSet wait/report block
// (customer incident 2026-09-04): a rollout stuck at 4/32 instances was
// declared SUCCESS because (1) the failed-instance filter queried the
// top-level Status field, whose enum (CURRENT|OUTDATED|INOPERABLE) can
// never be FAILED/CANCELLED, and (2) the 1200s timeout fallback flipped
// any TOTAL>0 to SUCCESS. The prior tests only grepped the generator
// source — one even asserted the wrong query verbatim — so the generated
// bash was never executed. These tests run the real generated block
// against a stubbed `aws` CLI.

const SRC = path.join(__dirname, '../../src');

function generateOrgDeployScript() {
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
  const config = {
    mpeId: 'migTEST01',
    deployMode: 'org',
    scopeMode: 'account',
    useAccountScope: false,
    stacksetAccounts: ['742073797974'],
    scopedVpcIds: ['NONE'],
    tagNonVpcServices: true,
    alertEmail: '',
    customerName: 'TestCo',
    includeBackfill: false,
    agreementDate: '2024-01-01',
    agreementEndDate: '2099-12-31',
    regions: ['ap-southeast-2', 'us-east-1'],
  };
  return {
    org: sandbox.generateDeployScript(config, 'DUMMY_MAIN_TEMPLATE', 'DUMMY_PER_ACCOUNT_TEMPLATE'),
    single: sandbox.generateDeployScript(
      { ...config, deployMode: 'single' }, 'DUMMY_MAIN_TEMPLATE', 'DUMMY_PER_ACCOUNT_TEMPLATE'),
  };
}

// The stub answers every aws CLI shape the wait/report block issues, from
// per-scenario files. Quoted case-pattern segments match literally, so the
// JMESPath brackets are not glob classes.
const AWS_STUB = `#!/bin/bash
args="$*"
case "$args" in
  *describe-stacks*"OutputKey=='StackSetName'"*) cat "$STUB_DIR/stackset_name" ;;
  *list-stack-set-operations*) cat "$STUB_DIR/op_status" ;;
  *"length(Summaries[?StackInstanceStatus.DetailedStatus=='SUCCEEDED'])"*) cat "$STUB_DIR/ready" ;;
  *"length(Summaries)"*) cat "$STUB_DIR/total" ;;
  *"length(Summaries[?StackInstanceStatus.DetailedStatus=='FAILED'"*) cat "$STUB_DIR/failed_n" ;;
  *".[Account,Region,StatusReason]"*) cat "$STUB_DIR/failures.tsv" ;;
  *"[Account,Region,StackInstanceStatus.DetailedStatus,StatusReason]"*) cat "$STUB_DIR/table.txt" ;;
  *"Summaries[*].Account"*) cat "$STUB_DIR/accounts" ;;
  *) echo "" ;;
esac
`;

let waitBlock;   // generated bash: StackSet wait through report file write
let tmpRoot;

function extractWaitAndReport(script) {
  const start = script.indexOf('# ── StackSet rollout wait');
  expect(start).toBeGreaterThan(-1);
  const endMark = script.indexOf('> "$REPORT_FILE"', start);
  expect(endMark).toBeGreaterThan(-1);
  return script.slice(start, script.indexOf('\n', endMark) + 1);
}

// Sixteen accounts × two regions = 32 instances (the customer's topology).
const ACCOUNTS_16 = Array.from({ length: 16 },
  (_, i) => String(100000000000 + i)).flatMap(a => [a, a]).join('\t');

function runScenario(files) {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'scen-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'aws'), AWS_STUB, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'sleep'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
  const defaults = {
    stackset_name: 'map-auto-tagger-migTEST01',
    op_status: 'SUCCEEDED',
    ready: '32',
    total: '32',
    failed_n: '0',
    'failures.tsv': '',
    'table.txt': 'PER_INSTANCE_TABLE_MARKER',
    accounts: ACCOUNTS_16,
  };
  for (const [name, content] of Object.entries({ ...defaults, ...files })) {
    fs.writeFileSync(path.join(dir, name), content + '\n');
  }
  const harness = [
    'set -e',
    `export STUB_DIR="${dir}"`,
    `export PATH="${bin}:$PATH"`,
    'DEPLOY_STATUS="NOT STARTED"',
    'STACKSET_NAME=""',
    'STACK_NAME="map-auto-tagger-migTEST01"',
    'REGION="ap-southeast-2"',
    'MPE="migTEST01"',
    'CUSTOMER="TestCo"',
    'ACCOUNT="111111111111"',
    'DEPLOY_TIME="2026-09-10 00:00:00"',
    'PREFLIGHT_LOG=""',
    `REPORT_FILE="${dir}/report.txt"`,
    waitBlock,
    'echo "FINAL_DEPLOY_STATUS:$DEPLOY_STATUS"',
  ].join('\n');
  const res = spawnSync('bash', ['-c', harness], { encoding: 'utf8', timeout: 60000 });
  const report = fs.existsSync(path.join(dir, 'report.txt'))
    ? fs.readFileSync(path.join(dir, 'report.txt'), 'utf8') : '';
  return { stdout: res.stdout, stderr: res.stderr, report };
}

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sswait-'));
  const { org, single } = generateOrgDeployScript();
  // Syntax gate: the generated scripts must parse. Catches the class of
  // escaping bugs that unbalances quotes. (The 2026-09-04 report mangling
  // stayed syntactically valid — the executed-report assertions below are
  // what catch that.)
  for (const [name, body] of [['org', org], ['single', single]]) {
    const p = path.join(tmpRoot, `deploy-${name}.sh`);
    fs.writeFileSync(p, body);
    execFileSync('bash', ['-n', p]);
  }
  waitBlock = extractWaitAndReport(org);
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('org deploy.sh StackSet wait — executed against a stubbed aws CLI', () => {
  it('clean rollout: operation SUCCEEDED, all instances SUCCEEDED → SUCCESS with honest counts', () => {
    const { stdout, report } = runScenario({});
    expect(stdout).toContain('FINAL_DEPLOY_STATUS:SUCCESS');
    // instances and accounts are reported as what they are, not conflated
    expect(stdout).toContain('32/32 stack instances ready across 16 account(s)');
    expect(stdout).toContain('all 32 stack instances across 16 account(s) ready');
    expect(report).toContain('SUCCESS');
    expect(report).toContain('PER_INSTANCE_TABLE_MARKER');
  });

  it('partial failure (the 2026-09-04 incident): failed instances → FAILED with StatusReason inline', () => {
    const { stdout, report } = runScenario({
      op_status: 'SUCCEEDED', // failure tolerance: op can succeed with failed instances
      ready: '4',
      failed_n: '28',
      'failures.tsv': '742073797974\tus-east-1\tCloudTrail is not logging in this region',
    });
    expect(stdout).toContain('FINAL_DEPLOY_STATUS:FAILED — 28 of 32 stack instance(s) failed in StackSet');
    expect(stdout).toContain('CloudTrail is not logging in this region');
    expect(stdout).not.toContain('FINAL_DEPLOY_STATUS:SUCCESS');
    // the saved report must carry the failure and the per-instance evidence
    expect(report).toContain('FAILED — 28 of 32');
    expect(report).toContain('PER_INSTANCE_TABLE_MARKER');
  });

  it('timeout with the operation still RUNNING → INCOMPLETE, never SUCCESS', () => {
    const { stdout, report } = runScenario({
      op_status: 'RUNNING',
      ready: '4',
    });
    expect(stdout).toContain('FINAL_DEPLOY_STATUS:INCOMPLETE');
    expect(stdout).not.toContain('FINAL_DEPLOY_STATUS:SUCCESS');
    expect(stdout).toContain('Not declaring success');
    expect(report).toContain('INCOMPLETE');
    expect(report).toContain('PER_INSTANCE_TABLE_MARKER');
  });

  it('zero instances after the wait → loud FAILED (CT6-004 defect 3 preserved)', () => {
    const { stdout } = runScenario({
      op_status: 'None',
      ready: '0',
      total: '0',
      accounts: '',
    });
    expect(stdout).toMatch(/FINAL_DEPLOY_STATUS:FAILED — StackSet .* has ZERO stack instances/);
    expect(stdout).toContain('never created any stack instances');
  });

  it('operation FAILED with failed instances → FAILED, not blanket success', () => {
    const { stdout } = runScenario({
      op_status: 'FAILED',
      ready: '30',
      failed_n: '2',
      'failures.tsv': [
        '100000000003\tap-southeast-2\tResource limit exceeded',
        '100000000007\tus-east-1\t',
      ].join('\n'),
    });
    expect(stdout).toContain('FINAL_DEPLOY_STATUS:FAILED — 2 of 32 stack instance(s) failed');
    expect(stdout).toContain('Resource limit exceeded');
    // empty StatusReason falls back to a pointer, not a blank
    expect(stdout).toContain('No reason reported');
  });
});
