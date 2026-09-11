import { describe, it, expect } from 'vitest';
import path from 'path';
import { execFileSync } from 'child_process';

// Regression guards for P27B-BEANSTALK-ENV (gate130, 2026-09-11) — the first
// live test of #111's environment ARN constructor found the tag permanently
// lost anyway: RGTA's index answers "Resource not found for ARN" for a fresh
// environment until well past the create-race grace, and that spelling was
// not in _NOT_FOUND_MARKERS → permanent_actionable → DLQ. Two fixes:
// 1. environment ARNs dispatch natively (elasticbeanstalk
//    UpdateTagsForResource) — retries ride "Must be Ready" (a TRANSIENT
//    marker) until the env is Ready instead of RGTA indexing lag;
// 2. RGTA's not-found spelling joins _NOT_FOUND_MARKERS so the create-race
//    age disambiguation applies to every RGTA-path service.

const handler = path.join(__dirname, '../../src/templates/lambda-handler.py');

const driver = `
import json, re, sys
from datetime import datetime, timezone, timedelta
src = open(sys.argv[1]).read()

def grab_def(name):
    m = re.search(r"^def %s\\(.*?(?=^def |^[A-Z_]+ = |\\Z)" % name, src, re.M | re.S)
    return m.group(0)

def grab_assign(name):
    m = re.search(r"^%s = .*?(?=^def |^[A-Z_]+ = |\\Z)" % name, src, re.M | re.S)
    return m.group(0)

# ── dispatch routing ─────────────────────────────────────────────────────────
calls = {"eb": [], "rgta": []}

class FakeEB:
    def update_tags_for_resource(self, **kw):
        calls["eb"].append(kw); return {}

class FakeClientRecorder:
    def __init__(self, service): self.service = service
    def __getattr__(self, op):
        def _op(**kw):
            raise AssertionError(f"unexpected native call {self.service}.{op}")
        return _op

class FakeSession:
    region_name = "ap-southeast-2"

class FakeBoto3:
    class session:
        Session = FakeSession
    @staticmethod
    def client(service, **kw):
        if service == "elasticbeanstalk":
            return FakeEB()
        return FakeClientRecorder(service)

class FakeRGTA:
    def tag_resources(self, **kw):
        calls["rgta"].append(kw)
        return {}

ns = {
    "boto3": FakeBoto3, "ClientError": Exception, "time": __import__("time"),
    "random": __import__("random"),
    "_retry_throttles": lambda f: f(),
    "THROTTLE_CODES": set(),
    "tagging": None, "ec2": None, "region": "ap-southeast-2",
}
exec(grab_def("tag_resource"), ns)

env_arn = "arn:aws:elasticbeanstalk:ap-southeast-2:111122223333:environment/myapp/my-env"
app_arn = "arn:aws:elasticbeanstalk:ap-southeast-2:111122223333:application/myapp"

ns["tag_resource"](env_arn, "map-migrated", "migTEST", tagging_client=FakeRGTA())
assert len(calls["eb"]) == 1, f"env ARN did not dispatch natively: {calls}"
assert calls["eb"][0]["ResourceArn"] == env_arn
assert calls["eb"][0]["TagsToAdd"] == [{"Key": "map-migrated", "Value": "migTEST"}]
assert len(calls["rgta"]) == 0, "env ARN must not fall through to RGTA"

ns["tag_resource"](app_arn, "map-migrated", "migTEST", tagging_client=FakeRGTA())
assert len(calls["rgta"]) == 1, f"application ARN must stay on RGTA: {calls}"
assert len(calls["eb"]) == 1, "application ARN must not dispatch natively"

# ── classifier: RGTA not-found spelling honors the create-race grace ────────
cls_ns = {"datetime": datetime, "timezone": timezone}
exec(grab_assign("_TRANSIENT_MARKERS") + grab_assign("_NOT_FOUND_MARKERS")
     + grab_assign("_CREATE_RACE_GRACE_S") + grab_assign("_PERMANENT_IGNORABLE_MARKERS")
     + grab_def("_event_age_seconds") + grab_def("_classify_error"), cls_ns)

msg = "Tagging API failed: Resource not found for ARN 'arn:aws:elasticbeanstalk:ap-southeast-2:111122223333:environment/a/b'"
fresh = (datetime.now(timezone.utc) - timedelta(seconds=60)).strftime("%Y-%m-%dT%H:%M:%SZ")
old = (datetime.now(timezone.utc) - timedelta(seconds=3600)).strftime("%Y-%m-%dT%H:%M:%SZ")

got_fresh = cls_ns["_classify_error"](msg, fresh)
got_old = cls_ns["_classify_error"](msg, old)
assert got_fresh == "transient", f"fresh not-found must retry, got {got_fresh}"
assert got_old == "permanent_ignorable", f"old not-found means deleted, got {got_old}"
# The pre-fix behavior this guards against: permanent_actionable -> DLQ.
assert got_fresh != "permanent_actionable" and got_old != "permanent_actionable"

print("OK")
`;

describe('lambda-handler.py — Beanstalk env dispatch + RGTA not-found classification', () => {
  it('env ARNs dispatch natively, app ARNs stay on RGTA, not-found honors create-race grace', () => {
    const out = execFileSync('python3', ['-c', driver, handler], { encoding: 'utf8' });
    expect(out.trim()).toBe('OK');
  });
});
