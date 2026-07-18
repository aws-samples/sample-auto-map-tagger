import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// Regression guard for the create-race tag-loss bug (P3-C11-DDB, fleet run
// 2026-07-18; sibling of P1-ECACHE-CL from the 2026-07-14 gate): a
// not-found error from the tagging API moments after the Create event
// means the resource is STILL PROVISIONING, not deleted. The classifier
// used to route every not-found to permanent_ignorable → never retried →
// resource permanently untagged (7/100 DDB tables in the burst run).
//
// Executes the REAL handler module (exec with boto3 stubbed, like the
// RunTask golden test) and drives _classify_error through the age matrix.

const handler = path.join(__dirname, '../../src/templates/lambda-handler.py');

const driver = `
import json, sys, types

# Stub boto3 before exec'ing the handler so module-level client creation
# and the cold-start peer-tagger probe are inert.
class _FakeClient:
    def __getattr__(self, name):
        def _noop(*a, **k):
            return {}
        return _noop
fake = types.ModuleType('boto3')
fake.client = lambda *a, **k: _FakeClient()
fake.session = types.SimpleNamespace(Session=lambda **k: types.SimpleNamespace(region_name='us-east-1'))
sys.modules['boto3'] = fake

ns = {'__name__': 'handler_under_test'}
exec(open(sys.argv[1]).read(), ns)

from datetime import datetime, timezone, timedelta
def iso(seconds_ago):
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds_ago)).strftime('%Y-%m-%dT%H:%M:%SZ')

classify = ns['_classify_error']
ddb = 'An error occurred (ResourceNotFoundException) when calling the TagResource operation: Requested resource not found: ResourceArn: arn:aws:dynamodb:ap-southeast-2:1:table/x not found'
out = {
    'fresh_not_found': classify(ddb, iso(10)),
    'old_not_found': classify(ddb, iso(3600)),
    'no_timestamp_not_found': classify(ddb, None),
    'bad_timestamp_not_found': classify(ddb, 'not-a-date'),
    'ecache_fresh': classify('CacheClusterNotFoundFault: cluster not present', iso(30)),
    'throttle_any_age': classify('Throttling: rate exceeded', iso(3600)),
    'bedrock_profile_old': classify('System-defined Inference Profile is not taggable', iso(10)),
    'unknown_error': classify('AccessDeniedException: nope', iso(10)),
    'grace': ns['_CREATE_RACE_GRACE_S'],
}
print(json.dumps(out))
`;

function run() {
  return JSON.parse(execFileSync('python3', ['-c', driver, handler], { encoding: 'utf8' }).trim().split('\n').pop());
}

describe('lambda-handler.py — create-race not-found classification', () => {
  const r = run();

  it('not-found FRESH after the event is transient (still provisioning → retry)', () => {
    expect(r.fresh_not_found).toBe('transient');
  });

  it('not-found on an OLD event is permanent_ignorable (genuinely deleted)', () => {
    expect(r.old_not_found).toBe('permanent_ignorable');
  });

  it('missing or unparseable eventTime takes the safe branch (transient)', () => {
    expect(r.no_timestamp_not_found).toBe('transient');
    expect(r.bad_timestamp_not_found).toBe('transient');
  });

  it('ElastiCache not-found-fault right after create retries (P1-ECACHE-CL)', () => {
    expect(r.ecache_fresh).toBe('transient');
  });

  it('non-not-found markers are unaffected by event age', () => {
    expect(r.throttle_any_age).toBe('transient');
    expect(r.bedrock_profile_old).toBe('permanent_ignorable');
    expect(r.unknown_error).toBe('permanent_actionable');
  });

  it('grace window stays below the SQS retry lifetime (5 x 180s VT)', () => {
    // A genuinely-deleted resource must age past the grace and get ACKED
    // before its receive budget runs out, or every deletion would land in
    // EventDLQ and fire the alarm.
    expect(r.grace).toBeLessThan(5 * 180);
    expect(r.grace).toBeGreaterThanOrEqual(300);
  });
});

describe('lambda-handler.py — create-race source guards', () => {
  const py = fs.readFileSync(handler, 'utf8');

  it('both classifier call sites pass event_time', () => {
    const calls = py.match(/_classify_error\(err_msg[^)]*\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) expect(c).toContain('event_time');
  });
});
