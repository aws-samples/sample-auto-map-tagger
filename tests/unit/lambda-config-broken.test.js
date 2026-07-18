import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// Regression guard for CT6-005: a malformed or unreachable SSM config used
// to fail closed for SCOPING (correct — nothing tags) but the in-window
// events were acked as 'skipped' — silent tag loss with zero operator
// signal (no DLQ, no alarm). Broken-config events must classify transient
// so they retry and, if the config stays broken, exhaust into EventDLQ and
// fire the DLQ alarm; the customer fixes the config and redrives.
//
// Executes the REAL handler module (exec with boto3 stubbed) and drives
// _process_event with broken vs valid configs.

const handler = path.join(__dirname, '../../src/templates/lambda-handler.py');

const driver = `
import json, sys, types

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

event = {'detail': {'eventName': 'CreateTable', 'eventTime': '2026-01-01T00:00:00Z'},
         'account': '111122223333', 'region': 'us-east-1'}

def status_for(config):
    return ns['_process_event'](event, config)[0]

out = {
    # get_config's CONFIG_UNREACHABLE safe-default shape
    'unreachable': status_for({'mpe_id': None, 'scope_mode': 'account',
                               'scoped_account_ids': ['ALL'], 'scoped_vpc_ids': ['NONE'],
                               'agreement_start_date': None,
                               'config_error': 'config unreachable/unparseable: boom'}),
    # day-2 SSM edit that dropped mpe_id
    'no_mpe': status_for({'mpe_id': '', 'scope_mode': 'account',
                          'scoped_account_ids': ['ALL'], 'scoped_vpc_ids': ['NONE'],
                          'agreement_start_date': '2025-01-01'}),
    # day-2 SSM edit that mangled the date
    'bad_date': status_for({'mpe_id': 'migTEST1', 'scope_mode': 'account',
                            'scoped_account_ids': ['ALL'], 'scoped_vpc_ids': ['NONE'],
                            'agreement_start_date': '01/01/2025'}),
    # healthy config, event before agreement start → genuinely skipped
    'before_start': status_for({'mpe_id': 'migTEST1', 'scope_mode': 'account',
                                'scoped_account_ids': ['ALL'], 'scoped_vpc_ids': ['NONE'],
                                'agreement_start_date': '2099-01-01'}),
    # healthy config, out-of-scope account → genuinely skipped
    'out_of_scope': status_for({'mpe_id': 'migTEST1', 'scope_mode': 'account',
                                'scoped_account_ids': ['999999999999'], 'scoped_vpc_ids': ['NONE'],
                                'agreement_start_date': '2025-01-01'}),
}
print(json.dumps(out))
`;

function run() {
  return JSON.parse(execFileSync('python3', ['-c', driver, handler], { encoding: 'utf8' }).trim().split('\n').pop());
}

describe('lambda-handler.py — broken config retries instead of silent ack (CT6-005)', () => {
  const r = run();

  it('unreachable/unparseable config → transient (retries, then DLQ + alarm)', () => {
    expect(r.unreachable).toBe('transient');
  });

  it('config missing mpe_id → transient', () => {
    expect(r.no_mpe).toBe('transient');
  });

  it('config with malformed agreement_start_date → transient', () => {
    expect(r.bad_date).toBe('transient');
  });

  it('healthy config still acks genuinely-out-of-window events (no DLQ noise)', () => {
    expect(r.before_start).toBe('skipped');
    expect(r.out_of_scope).toBe('skipped');
  });
});
