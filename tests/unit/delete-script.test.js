import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regression guard for release-gate 16D-3: with "delete logs" unchecked,
// the generated delete.sh must contain NO log-group-deletion logic at all
// (previously the Step 4 block was always emitted and only runtime-guarded
// by DELETE_LOGS=false — a footgun if a customer flips the variable or
// copies the block). The generator now emits Step 4 conditionally, so the
// whole block sits inside a `${deleteLogs ? ... : ''}` template ternary.
describe('delete script — log-group block emitted only when requested', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/js/delete/delete-flow.js'), 'utf8');

  it('wraps Step 4 in a deleteLogs conditional', () => {
    expect(src).toContain(
      "${deleteLogs ? `# ── Step 4: Optional — CloudWatch Log Groups");
  });

  it('has no unconditional delete-log-group emission', () => {
    // Every delete-log-group occurrence must sit inside the single
    // deleteLogs-guarded template block (between the ternary open and
    // its `: ''}` close).
    const open = src.indexOf('${deleteLogs ? `# ── Step 4');
    const close = src.indexOf("` : ''}# ── Summary", open);
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    const outside = src.slice(0, open) + src.slice(close);
    expect(outside).not.toContain('delete-log-group');
  });
});
