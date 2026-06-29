import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Guards for the revived, hardened Update flow (upgrade.sh generator).
// The generator lives in editor-flow.js (editorGenerateUpgrade). These read
// the source as text (build.test.js / deploy-script.test.js style — no jsdom)
// to lock in the scope-preservation + change-set-preview + pre-#95 guard
// behavior that was empirically validated in the sandbox.
describe('upgrade.sh generator — scope-safe in-place update', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/js/editor/editor-flow.js'), 'utf8');

  it('preserves every existing parameter via UsePreviousValue', () => {
    // Load-bearing: without this, a template-body swap resolves params to the
    // new template default and blows out scope to ["ALL"].
    expect(src).toContain('UsePreviousValue=true');
  });

  it('single-stack path uses a change-set preview before applying', () => {
    expect(src).toContain('create-change-set');
    expect(src).toContain('--change-set-type UPDATE');
    expect(src).toContain('execute-change-set');
  });

  it('change-set is created WITH preserved parameters (no blow-out via change-set)', () => {
    // The create-change-set invocation must carry $PREV_PARAMS (load-bearing:
    // dropping it lets scope fall to the new template default). Scan the
    // invocation window up to the capabilities flag that closes the command.
    const start = src.indexOf('aws cloudformation create-change-set');
    const csBlock = src.slice(start, start + 400);
    expect(csBlock).toContain('--parameters $PREV_PARAMS');
    expect(csBlock).toContain('--template-url');
  });

  it('refuses pre-#95 stacks that lack the ScopedAccountIds parameter', () => {
    expect(src).toContain('Pre-#95 deployment detected');
    expect(src).toContain('grep -qw "ScopedAccountIds"');
  });

  it('StackSet path keeps update-stack-set and shows a dry-run summary (no change-set)', () => {
    expect(src).toContain('update-stack-set');
    expect(src).toContain('do not support change-sets');
  });

  it('supports --auto-approve and a confirmation gate for interactive use', () => {
    expect(src).toContain('--auto-approve');
    expect(src).toContain('confirm_or_abort');
  });
});
