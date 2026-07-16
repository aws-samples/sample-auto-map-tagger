import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// Golden-event test for the ECS RunTask extractor (Fargate silent tag
// loss, found 2026-07-14). The fixture is a REAL captured CloudTrail
// event (rule 06: never hand-write fixtures — AWS changes event shapes
// without notice, #102). The task ARN sits in a LIST
// (responseElements.tasks[].taskArn), which the universal ARN scan
// cannot reach — extract_arns_multi must return it.
//
// Runs the actual Python extractor against the fixture via a small
// driver that stubs the boto3 module-level imports (the handler file
// can't be imported wholesale outside Lambda).
describe('lambda-handler.py — RunTask golden event', () => {
  const fixture = path.join(__dirname, '../fixtures/runtask-cloudtrail-event.json');
  const handler = path.join(__dirname, '../../src/templates/lambda-handler.py');

  const driver = `
import json, re, sys
src = open(sys.argv[1]).read()
def grab(name):
    m = re.search(r"^def %s\\(.*?(?=^def |\\Z)" % name, src, re.M | re.S)
    return m.group(0)
ns = {'boto3': None, 'time': None, 'ClientError': Exception}
exec(grab('ci_get') + grab('_is_wellformed_arn') + grab('extract_arns_multi'), ns)
detail = json.load(open(sys.argv[2]))
print(json.dumps(ns['extract_arns_multi'](detail, detail['userIdentity']['accountId'], detail['awsRegion'])))
`;

  it('extracts the task ARN from a real captured RunTask event', () => {
    const out = execFileSync('python3', ['-c', driver, handler, fixture], { encoding: 'utf8' });
    const arns = JSON.parse(out);
    expect(Array.isArray(arns)).toBe(true);
    expect(arns.length).toBeGreaterThan(0);
    expect(arns[0]).toMatch(/^arn:aws:ecs:[a-z0-9-]+:\d{12}:task\//);
  });

  it('fixture is the real event shape (eventVersion + tasks list present)', () => {
    const ct = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    expect(ct.eventName).toBe('RunTask');
    expect(ct.eventSource).toBe('ecs.amazonaws.com');
    expect(Array.isArray(ct.responseElements.tasks)).toBe(true);
    expect(ct.responseElements.tasks[0].taskArn).toBeTruthy();
  });
});
