import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regression guard for the multi-region staging-bucket collision bug
// (Megazone partner report, 2026-06). A single-account deploy to 2+ regions
// reused one account-scoped bucket name; region 2 collided with region 1's
// bucket and hard-failed. The fix region-qualifies the name so each region
// stages into its own bucket. These assertions read the generator source as
// text (matches the build.test.js / services.test.js style — no jsdom).
describe('deploy script — region-qualified staging bucket', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/js/deploy/script-deploy.js'), 'utf8');

  it('single-account bucket name includes the region', () => {
    expect(src).toContain('BUCKET="auto-map-tagger-\\${ACCT}-\\${REGION}"');
  });

  it('org/multi-account bucket name includes the region', () => {
    expect(src).toContain('BUCKET="auto-map-tagger-\\${ACCOUNT}-\\${REGION}"');
  });

  it('no bare account-only bucket name remains (collision bug)', () => {
    // The buggy forms ended the name right after the account variable.
    expect(src).not.toContain('BUCKET="auto-map-tagger-\\${ACCT}"');
    expect(src).not.toContain('BUCKET="auto-map-tagger-\\${ACCOUNT}"');
  });

  it('single-account deploy iterates over the regions array', () => {
    // REGIONS is templated from config.regions; the loop body region-qualifies
    // the bucket, so a 2-region deploy yields two distinct buckets.
    expect(src).toContain("REGIONS=\"${regions.join(' ')}\"");
  });
});

describe('deploy script — in-place update on existing stacks', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/js/deploy/script-deploy.js'), 'utf8');

  it('updates an existing stack in-place via update-stack', () => {
    // deploy.sh bakes customer values as template defaults, so update-stack
    // without --parameters is safe — CFN uses those baked defaults.
    expect(src).toContain('Updating in-place');
  });

  it('handles "No updates are to be performed" gracefully', () => {
    expect(src).toContain('No updates are to be performed');
  });

  it('preserves the create and rollback-recovery branches', () => {
    expect(src).toContain('cloudformation create-stack');
    expect(src).toContain('wait stack-delete-complete');
  });
});

// Regression guard: when a StackSet instance fails (e.g. the per-account
// CloudTrail preflight in template-main.js rejects an account), deploy.sh
// used to only report a count ("N account(s) failed") and point the
// customer at the CloudFormation console. That forced a separate dig to
// find out WHY. deploy.sh now queries StatusReason per failed instance and
// prints it inline, surfacing the preflight's actual message directly.
describe('deploy script — StackSet failure reason surfaced inline', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/js/deploy/script-deploy.js'), 'utf8');

  it('queries StatusReason for failed/cancelled StackSet instances', () => {
    expect(src).toContain("Summaries[?Status=='CANCELLED'||Status=='FAILED'].[Account,Region,StatusReason]");
  });

  it('prints the reason per failed account instead of just a count', () => {
    expect(src).toContain('FAIL_ACCT (\\$FAIL_REGION)');
    expect(src).toContain('FAIL_REASON');
  });
});

describe('deploy script — backfill wait anchors sentinel search at script start (gate 32B-1)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/js/deploy/script-deploy.js'), 'utf8');

  it('SCRIPT_START_MS captured at both script tops', () => {
    expect(src.match(/SCRIPT_START_MS=\\\$\(\( \\\$\(date \+%s\) \* 1000 \)\)/g) || []).toHaveLength(2);
  });

  it('both backfill waits filter logs from SCRIPT start, not loop start', () => {
    // The backfill custom resource completes DURING stack creation; anchoring
    // the CloudWatch filter at wait-loop start excluded the already-emitted
    // 'Backfill complete' line → every backfill deploy spun the full 1200s.
    expect(src.match(/BACKFILL_WAIT_START_MS=\\\$SCRIPT_START_MS/g) || []).toHaveLength(2);
    expect(src).not.toMatch(/BACKFILL_WAIT_START_MS=\\\$\(\( \\\$\(date/);
  });
});
