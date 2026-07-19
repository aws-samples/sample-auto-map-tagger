import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regression guard for the SCP preflight never firing for role/SSO callers
// (found by release-gate 33-3, 2026-07-18 rerun — its first genuine
// execution after a harness credential bug was fixed).
//
// The check passed get-caller-identity's ARN straight to
// simulate-principal-policy. For an assumed-role caller that ARN is the STS
// session ARN (arn:aws:sts::...:assumed-role/Foo/session), which the API
// rejects with InvalidInput — swallowed by 2>/dev/null, so SCP_RESULT came
// back empty, the else-branch printed "No security policies are blocking"
// and an org whose SCP denies tag:TagResources sailed through preflight into
// a deploy that could never tag. The batched IAM check 20 lines down already
// did the assumed-role→role ARN conversion; the SCP check now shares it.

const src = fs.readFileSync(
  path.join(__dirname, '../../src/js/deploy/script-deploy.js'), 'utf8');

describe('deploy script — SCP preflight uses a simulatable principal ARN (gate 33-3)', () => {
  it('never feeds get-caller-identity output directly to simulate-principal-policy', () => {
    // The broken shape: --policy-source-arn "$(aws sts get-caller-identity ...)"
    expect(src).not.toMatch(
      /--policy-source-arn "\\\$\(aws sts get-caller-identity/);
  });

  it('SCP checks simulate against the converted SIM_ARN in both deploy paths', () => {
    // Each path: SIM_ARN derivation must precede the tag:TagResources
    // simulation that consumes it.
    const scpSites = src.split('--action-names "tag:TagResources"').length - 1;
    expect(scpSites).toBe(2);
    const simArnSites = src.split('--policy-source-arn "\\$SIM_ARN"').length - 1;
    // 2 SCP checks + 2 batched IAM checks, all on SIM_ARN.
    expect(simArnSites).toBe(4);
  });

  it('keeps the assumed-role → role ARN conversion for both paths', () => {
    const conversions = src.split(':assumed-role/').length - 1;
    expect(conversions).toBeGreaterThanOrEqual(2);
    expect(src).toContain('SIM_ARN="arn:aws:iam::\\${SIM_ACCT}:role/\\${SIM_ROLE}"');
  });
});
