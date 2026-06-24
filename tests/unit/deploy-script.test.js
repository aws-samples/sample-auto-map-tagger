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

describe('deploy script — deploy-only (no in-place update)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/js/deploy/script-deploy.js'), 'utf8');

  it('refuses to modify an existing stack instead of a bare update-stack', () => {
    // Re-running deploy.sh on an existing scoped stack used to run update-stack
    // with no --parameters → scope blew out to ["ALL"]. Now it refuses.
    expect(src).toContain('does not modify existing stacks');
    // Both the single-account and org healthy-stack branches refuse (2 echoes).
    const matches = src.match(/does not modify existing stacks/g) || [];
    expect(matches.length).toBe(2);
  });

  it('no longer carries the in-place "Updating in-place" update-stack branch', () => {
    expect(src).not.toContain('Updating in-place');
  });

  it('preserves the create and rollback-recovery branches', () => {
    expect(src).toContain('cloudformation create-stack');
    expect(src).toContain('wait stack-delete-complete');
  });
});
