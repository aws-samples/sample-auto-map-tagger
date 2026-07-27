import { describe, it, expect } from 'vitest';
import path from 'path';
import { execFileSync } from 'child_process';

// Regression guard for IaC tag-drift detection (L2, Jin's 2026-07-16 ask):
// a customer's `terraform apply` with default_tags silently strips the
// map-migrated tag from resources the tagger already tagged (UntagResource /
// DeleteTags / DeleteBucketTagging fire, all in _IGNORE_EVENTS) — the tagger
// was blind, credit silently lost. The handler now subscribes untag events
// via a second EventBridge rule and ALERT-ONLY detects drift:
//   removed keys include map-migrated → self/peer-principal filter →
//   verify-read (tag:GetResources) → confirmed absent → TAG_DRIFT_DETECTED
//   log + MapAutoTagger/TagDriftDetected metric (TagDriftAlarm fires).
// NO auto-restore — the alarm description carries the customer-side fix
// (ignore_tags). Drift processing must NEVER retry/DLQ: always acks.
//
// Executes the REAL handler module (exec with boto3 stubbed, like
// lambda-create-race.test.js) and drives _process_event with untag events.

const handler = path.join(__dirname, '../../src/templates/lambda-handler.py');

const driver = `
import json, sys, types

# ---- controllable boto3 stub ----------------------------------------------
# get_resources returns a configurable tag state; cloudwatch records
# put_metric_data calls so the test can assert on drift-metric emission.
TAG_STATE = {}          # arn -> {tagKey: value}; arn absent = resource has no tags
METRICS = []            # recorded put_metric_data MetricData entries
GET_RESOURCES_RAISES = {'flag': False}

class _FakeClient:
    def __getattr__(self, name):
        def _noop(*a, **k):
            return {}
        return _noop

class _FakeTagging:
    def get_resources(self, **kw):
        if GET_RESOURCES_RAISES['flag']:
            raise Exception('AccessDeniedException: verify-read denied')
        out = []
        for arn in kw.get('ResourceARNList', []):
            if arn in TAG_STATE:
                out.append({'ResourceARN': arn,
                            'Tags': [{'Key': k, 'Value': v} for k, v in TAG_STATE[arn].items()]})
        return {'ResourceTagMappingList': out}
    def __getattr__(self, name):
        def _noop(*a, **k):
            return {}
        return _noop

class _FakeCloudWatch:
    def put_metric_data(self, **kw):
        METRICS.extend(kw.get('MetricData', []))
        return {}
    def __getattr__(self, name):
        def _noop(*a, **k):
            return {}
        return _noop

def _client(service, *a, **k):
    if service == 'resourcegroupstaggingapi':
        return _FakeTagging()
    if service == 'cloudwatch':
        return _FakeCloudWatch()
    return _FakeClient()

fake = types.ModuleType('boto3')
fake.client = _client
fake.session = types.SimpleNamespace(Session=lambda **kw: types.SimpleNamespace(region_name='us-east-1'))
sys.modules['boto3'] = fake

ns = {'__name__': 'handler_under_test'}
exec(open(sys.argv[1]).read(), ns)

CONFIG = {
    'mpe_id': 'migDRIFT1', 'scope_mode': 'account',
    'scoped_account_ids': ['111122223333'], 'scoped_vpc_ids': ['NONE'],
    'agreement_start_date': '2025-06-01', 'agreement_end_date': '2026-12-31',
}
ACCT = '111122223333'

def event(name, request_params, user_arn='arn:aws:iam::111122223333:user/tf-deployer'):
    return {
        'account': ACCT, 'region': 'us-east-1',
        'detail': {
            'eventName': name,
            'eventTime': '2026-07-27T00:00:00Z',
            'recipientAccountId': ACCT,
            'awsRegion': 'us-east-1',
            'requestParameters': request_params,
            'userIdentity': {'arn': user_arn},
        },
    }

def run(name, request_params, tag_state, user_arn=None, config=CONFIG, raises=False):
    TAG_STATE.clear(); TAG_STATE.update(tag_state)
    METRICS.clear()
    GET_RESOURCES_RAISES['flag'] = raises
    kw = {} if user_arn is None else {'user_arn': user_arn}
    status, err = ns['_process_event'](event(name, request_params, **kw), config)
    drift = [m for m in METRICS if m.get('MetricName') == 'TagDriftDetected']
    return {'status': status, 'drift_metrics': len(drift),
            'dims': drift[0]['Dimensions'] if drift else None}

ARN_DDB = 'arn:aws:dynamodb:us-east-1:111122223333:table/app-table'
ARN_S3 = 'arn:aws:s3:::drift-test-bucket'

out = {}

# 1. RGTA UntagResources stripping map-migrated, verify-read confirms absent -> drift
out['rgta_strip_absent'] = run('UntagResources',
    {'resourceARNList': [ARN_DDB], 'tagKeys': ['map-migrated']},
    {ARN_DDB: {'Owner': 'x'}})

# 2. UntagResource (singular) stripping only unrelated key -> no drift
out['unrelated_key'] = run('UntagResource',
    {'resourceArn': ARN_DDB, 'tagKeys': ['Owner']},
    {ARN_DDB: {'map-migrated': 'migDRIFT1'}})

# 3. map-migrated in removed keys but verify-read shows it present -> no drift
out['still_present'] = run('UntagResources',
    {'resourceARNList': [ARN_DDB], 'tagKeys': ['map-migrated']},
    {ARN_DDB: {'map-migrated': 'migDRIFT1'}})

# 4. self/peer-tagger principal -> no drift even when absent
out['self_principal'] = run('UntagResources',
    {'resourceARNList': [ARN_DDB], 'tagKeys': ['map-migrated']},
    {},
    user_arn='arn:aws:sts::111122223333:assumed-role/map-auto-tagger-role-migOTHER-us-east-1/map-auto-tagger-migOTHER')

# 5. EC2 DeleteTags shape (resourcesSet ids + tagSet keys) -> ARN constructed, drift on absence
out['ec2_deletetags'] = run('DeleteTags',
    {'resourcesSet': {'items': [{'resourceId': 'i-0abc123def456'}]},
     'tagSet': {'items': [{'key': 'map-migrated'}]}},
    {})

# 6. S3 DeleteBucketTagging (no tagKeys; whole TagSet dropped) -> drift on absence
out['s3_delete_bucket_tagging'] = run('DeleteBucketTagging',
    {'bucketName': 'drift-test-bucket'},
    {ARN_S3: {'Owner': 'x'}})

# 7. broken config -> existing transient guard wins, no drift metric
out['broken_config'] = run('UntagResources',
    {'resourceARNList': [ARN_DDB], 'tagKeys': ['map-migrated']},
    {}, config={'mpe_id': None, 'scope_mode': 'account', 'scoped_account_ids': ['ALL'],
                'scoped_vpc_ids': ['NONE'], 'agreement_start_date': None,
                'config_error': 'config unreachable'})

# 8. out-of-scope account -> skipped, no drift
out['out_of_scope'] = run('UntagResources',
    {'resourceARNList': [ARN_DDB], 'tagKeys': ['map-migrated']},
    {}, config=dict(CONFIG, scoped_account_ids=['999988887777']))

# 9. verify-read raises -> best-effort: no drift metric, no crash, acks
out['verify_read_error'] = run('UntagResources',
    {'resourceARNList': [ARN_DDB], 'tagKeys': ['map-migrated']},
    {}, raises=True)

# 10. event with no extractable resource -> skipped quietly
out['no_resource'] = run('UntagResources', {'tagKeys': ['map-migrated']}, {})

# 11. untag names must be subscribed AND stay out of creation-ignore acking
out['untag_events'] = sorted(ns['_UNTAG_EVENTS'])

print(json.dumps(out))
`;

function run() {
  return JSON.parse(
    execFileSync('python3', ['-c', driver, handler], { encoding: 'utf8' }).trim().split('\n').pop()
  );
}

describe('lambda-handler.py — IaC tag-drift detection (untag events, alert-only)', () => {
  const out = run();

  it('fires drift metric when map-migrated is stripped and verify-read confirms absence', () => {
    expect(out.rgta_strip_absent.status).toBe('skipped'); // alert-only: always acks
    expect(out.rgta_strip_absent.drift_metrics).toBe(1);
    expect(out.rgta_strip_absent.dims).toContainEqual({ Name: 'MpeId', Value: 'migDRIFT1' });
  });

  it('ignores removal of unrelated tag keys', () => {
    expect(out.unrelated_key.status).toBe('skipped');
    expect(out.unrelated_key.drift_metrics).toBe(0);
  });

  it('suppresses the alert when the tag is still present at verify-read (re-tagged/race)', () => {
    expect(out.still_present.drift_metrics).toBe(0);
  });

  it('filters self/peer-tagger principals (no ping-pong with our own role)', () => {
    expect(out.self_principal.drift_metrics).toBe(0);
  });

  it('handles the EC2 DeleteTags event shape (resourcesSet + tagSet)', () => {
    expect(out.ec2_deletetags.status).toBe('skipped');
    expect(out.ec2_deletetags.drift_metrics).toBe(1);
  });

  it('treats S3 DeleteBucketTagging (whole TagSet drop) as map-migrated-affected', () => {
    expect(out.s3_delete_bucket_tagging.drift_metrics).toBe(1);
  });

  it('broken config still routes to the CT6-005 transient path, not the drift branch', () => {
    expect(out.broken_config.status).toBe('transient');
    expect(out.broken_config.drift_metrics).toBe(0);
  });

  it('out-of-scope accounts never alert', () => {
    expect(out.out_of_scope.status).toBe('skipped');
    expect(out.out_of_scope.drift_metrics).toBe(0);
  });

  it('verify-read failure is best-effort: acks without alerting or crashing', () => {
    expect(out.verify_read_error.status).toBe('skipped');
    expect(out.verify_read_error.drift_metrics).toBe(0);
  });

  it('acks quietly when no resource ARN can be extracted', () => {
    expect(out.no_resource.status).toBe('skipped');
    expect(out.no_resource.drift_metrics).toBe(0);
  });

  it('subscribes the big-6 untag event names', () => {
    expect(out.untag_events).toEqual([
      'DeleteBucketTagging', 'DeleteTags', 'RemoveTags',
      'RemoveTagsFromResource', 'UntagResource', 'UntagResources',
    ]);
  });

  it('drift processing never returns transient/actionable (no DLQ pollution)', () => {
    for (const k of ['rgta_strip_absent', 'unrelated_key', 'still_present', 'self_principal',
      'ec2_deletetags', 's3_delete_bucket_tagging', 'out_of_scope', 'verify_read_error', 'no_resource']) {
      expect(out[k].status).toBe('skipped');
    }
  });
});
