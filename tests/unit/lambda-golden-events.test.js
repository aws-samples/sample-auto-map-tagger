import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// Golden-event replay for the extractor fixes from the 2026-07-15 phase-27
// verification sweep. Every fixture is a REAL captured CloudTrail event
// (rule 06 — AWS changes event shapes without notice, #102), each of which
// previously produced either no ARN (silent skip) or the WRONG resource's
// ARN (GameLift script instead of fleet; Redshift namespace instead of
// cluster). The expected values below are what the fixed extractor must
// return against the genuine event shape.
const CASES = [
  {
    fixture: 'capacityreservation-cloudtrail-event.json',
    multi: false,
    expect: /^arn:aws:ec2:[a-z0-9-]+:\d{12}:capacity-reservation\/cr-/,
  },
  {
    fixture: 'copysnapshot-cloudtrail-event.json',
    multi: false,
    expect: /^arn:aws:ec2:[a-z0-9-]+:\d{12}:snapshot\/snap-/,
  },
  {
    fixture: 'createsnapshots-cloudtrail-event.json',
    multi: true,
    expect: /^arn:aws:ec2:[a-z0-9-]+:\d{12}:snapshot\/snap-/,
  },
  {
    // responseElements is null in the real event — ARN must come from
    // requestParameters.targetTableName.
    fixture: 'ddb-restoretablefrombackup-cloudtrail-event.json',
    multi: false,
    expect: /^arn:aws:dynamodb:[a-z0-9-]+:\d{12}:table\//,
  },
  {
    // responseElements is null here too — constructed from applicationName
    // + environmentName.
    fixture: 'beanstalk-createenvironment-cloudtrail-event.json',
    multi: false,
    expect: /^arn:aws:elasticbeanstalk:[a-z0-9-]+:\d{12}:environment\/.+\/.+/,
  },
  {
    // Must be the CLUSTER arn, never the namespace arn the universal scan
    // used to pick up (namespaces reject tagging).
    fixture: 'redshift-createcluster-cloudtrail-event.json',
    multi: false,
    expect: /^arn:aws:redshift:[a-z0-9-]+:\d{12}:cluster:/,
    reject: /:namespace:/,
  },
  {
    // Must be the FLEET arn, not the script arn the allowlist scan tagged.
    fixture: 'gamelift-createfleet-cloudtrail-event.json',
    multi: false,
    expect: /^arn:aws:gamelift:[a-z0-9-]+:\d{12}:fleet\/fleet-/,
    reject: /:script\//,
  },
];

const handler = path.join(__dirname, '../../src/templates/lambda-handler.py');

// Runs the real Python extractors against a fixture, stubbing the module-
// level boto3 imports the way the RunTask golden test does.
const driver = `
import json, re, sys
src = open(sys.argv[1]).read()
def grab(name):
    m = re.search(r"^def %s\\(.*?(?=^def |\\Z)" % name, src, re.M | re.S)
    return m.group(0)
ns = {'boto3': None, 'time': None, 'ClientError': Exception}
exec(grab('ci_get') + grab('_is_wellformed_arn') + grab('get_account_from_arn')
     + grab('extract_arns_multi') + grab('extract_arn'), ns)
detail = json.load(open(sys.argv[2]))
acct = detail.get('userIdentity', {}).get('accountId') or detail.get('recipientAccountId')
region = detail['awsRegion']
if sys.argv[3] == 'multi':
    print(json.dumps(ns['extract_arns_multi'](detail, acct, region)))
else:
    print(json.dumps(ns['extract_arn'](detail, acct, region)))
`;

describe('lambda-handler.py — golden-event extractor replay (P27 sweep fixes)', () => {
  for (const c of CASES) {
    it(`extracts the right ARN from ${c.fixture}`, () => {
      const fixture = path.join(__dirname, '../fixtures', c.fixture);
      const out = execFileSync('python3',
        ['-c', driver, handler, fixture, c.multi ? 'multi' : 'single'],
        { encoding: 'utf8' });
      const result = JSON.parse(out);
      const arns = c.multi ? result : [result];
      expect(arns.length).toBeGreaterThan(0);
      for (const arn of arns) {
        expect(arn).toMatch(c.expect);
        if (c.reject) expect(arn).not.toMatch(c.reject);
      }
    });
  }
});
