import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regression guard for the org/StackSet CloudTrail blind spot (customer
// incident 2026-07-16). deploy.sh's Step 1 preflight only ever ran
// `aws cloudtrail describe-trails` with the CALLER's credentials — i.e. the
// management account when deploying multi-account. It never verified
// CloudTrail coverage inside the StackSet TARGET accounts, so a linked
// account with no trail (and no org trail shadowing one in) got its Lambda,
// EventBridge rule, and SQS queue created successfully, but the EventBridge
// rule (which matches "AWS API Call via CloudTrail" events) never received
// any events — resources were created with zero tagging and zero errors.
//
// The fix extends the existing PreflightFunction custom resource (already
// present in every StackSet target account via generateMainTemplate, and
// already gating AutoTaggerFunction's creation) to check CloudTrail coverage
// locally, in that account/region, before the tagger Lambda is created.
describe('preflight — CloudTrail coverage check (per-account)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/js/deploy/template-main.js'), 'utf8');

  it('PreflightRole can call cloudtrail:DescribeTrails and GetTrailStatus', () => {
    expect(src).toContain('cloudtrail:DescribeTrails');
    expect(src).toContain('cloudtrail:GetTrailStatus');
  });

  it('defines a local CloudTrail coverage check', () => {
    expect(src).toContain('def cloudtrail_covers_region(region):');
    expect(src).toContain("boto3.client('cloudtrail', region_name=region)");
    expect(src).toContain('describe_trails(includeShadowTrails=True)');
  });

  it('the coverage check only trusts a trail with GetTrailStatus IsLogging=True', () => {
    expect(src).toContain("status.get('IsLogging')");
  });

  it('handler blocks stack creation when no trail covers this account/region', () => {
    expect(src).toContain('if not cloudtrail_covers_region(region):');
    expect(src).toContain('PreflightNoCloudTrail');
    // Must fail the custom resource (blocks AutoTaggerFunction via DependsOn),
    // not silently succeed — a silent pass here is exactly the bug being fixed.
    expect(src).toMatch(/if not cloudtrail_covers_region\(region\):[\s\S]{0,1200}return respond\(event, context, 'FAILED', reason\)/);
  });

  it('the CloudTrail check runs before the peer-conflict check', () => {
    const trailIdx = src.indexOf('if not cloudtrail_covers_region(region):');
    const peerIdx = src.indexOf('conflicts = check_peers(props, account, region)');
    expect(trailIdx).toBeGreaterThan(-1);
    expect(peerIdx).toBeGreaterThan(-1);
    expect(trailIdx).toBeLessThan(peerIdx);
  });
});
