import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// BEHAVIORAL test for the per-account CloudTrail preflight (PR #112),
// complementing the source-string guards in preflight-cloudtrail.test.js.
// The coverage decision (which trail counts as "covers this region") is the
// load-bearing logic: a false negative false-blocks every org deploy, a false
// positive re-opens the silent-tag-loss bug. Source-text assertions can't
// catch a logic regression there — so we EXTRACT the embedded Python
// `cloudtrail_covers_region` from template-main.js and RUN it against a mock
// CloudTrail client across the coverage cases (same execFileSync-python3
// pattern as lambda-runtask.test.js).
//
// These cases were also confirmed LIVE 2026-07-17 against a disposable
// no-trail Isengard account: deploying the template there produced
// ROLLBACK with "No active CloudTrail trail covers <region>" and the tagger
// resources were never created.
describe('preflight — cloudtrail_covers_region behavior', () => {
  const tmpl = path.join(__dirname, '../../src/js/deploy/template-main.js');

  // Extract the Python function body out of the JS template literal, dedent
  // it, and exec it with a stub `boto3` whose cloudtrail client returns the
  // trails/status the case defines. Prints the boolean result.
  const driver = `
import json, re, sys, textwrap
js = open(sys.argv[1]).read()
m = re.search(r"def cloudtrail_covers_region\\(region\\):.*?\\n(?=\\S* {10}def |\\n {10}def handler)", js, re.S)
if not m:
    # fall back: capture from def to the 'return False' that closes it
    m = re.search(r"( *)def cloudtrail_covers_region\\(region\\):.*?return False", js, re.S)
block = m.group(0)
block = textwrap.dedent(block)
case = json.loads(sys.argv[2])
class FakeCT:
    def describe_trails(self, includeShadowTrails=False):
        return {'trailList': case['trails']}
    def get_trail_status(self, Name):
        st = case['status'].get(Name)
        if st is None:
            raise Exception('TrailNotFound')
        return st
class FakeBoto3:
    def client(self, svc, region_name=None):
        return FakeCT()
ns = {'boto3': FakeBoto3()}
exec(block, ns)
print(json.dumps(bool(ns['cloudtrail_covers_region'](case['region']))))
`;

  const REGION = 'ap-southeast-2';
  function covers(trails, status) {
    const out = execFileSync(
      'python3',
      ['-c', driver, tmpl, JSON.stringify({ region: REGION, trails, status })],
      { encoding: 'utf8' });
    return JSON.parse(out.trim());
  }

  it('BLOCKS when the account has no trails at all', () => {
    expect(covers([], {})).toBe(false);
  });

  it('BLOCKS when a covering trail exists but IsLogging is false', () => {
    expect(covers(
      [{ TrailARN: 'a', HomeRegion: REGION, IsMultiRegionTrail: false }],
      { a: { IsLogging: false } })).toBe(false);
  });

  it('PASSES on a local single-region trail in this region that is logging', () => {
    expect(covers(
      [{ TrailARN: 'a', HomeRegion: REGION, IsMultiRegionTrail: false }],
      { a: { IsLogging: true } })).toBe(true);
  });

  it('PASSES on a multi-region trail homed ELSEWHERE (org shadow-trail case)', () => {
    expect(covers(
      [{ TrailARN: 'a', HomeRegion: 'us-east-1', IsMultiRegionTrail: true }],
      { a: { IsLogging: true } })).toBe(true);
  });

  it('BLOCKS when the only trail is single-region homed in a DIFFERENT region', () => {
    expect(covers(
      [{ TrailARN: 'a', HomeRegion: 'us-east-1', IsMultiRegionTrail: false }],
      { a: { IsLogging: true } })).toBe(false);
  });

  it('BLOCKS (does not crash) when get_trail_status throws for the only trail', () => {
    expect(covers(
      [{ TrailARN: 'a', HomeRegion: REGION, IsMultiRegionTrail: true }],
      {})).toBe(false);
  });
});
