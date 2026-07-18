import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regression guards for CT6-004 (S0): a documented org-mode v21→v22
// migration silently left ZERO taggers org-wide while printing
// "Setup Complete!". Three compounding defects:
//  1. INSTRUCTIONS.md's StackSet-removal steps deleted instances + StackSet
//     but not the management-account admin stack.
//  2. deploy.sh update-stack on the surviving identical stack swallowed
//     "No updates are to be performed" (>/dev/null 2>&1 || true) — and CFN
//     only re-invokes the StackSet-creating custom resource on a property
//     change, so nothing deployed.
//  3. The StackSet poll's 1200s catch-all flipped TOTAL==0 (deleted
//     StackSet / empty targets) to SUCCESS.

const deploySrc = fs.readFileSync(
  path.join(__dirname, '../../src/js/deploy/script-deploy.js'), 'utf8');
const instructions = fs.readFileSync(
  path.join(__dirname, '../../docs/INSTRUCTIONS.md'), 'utf8');

describe('org deploy — no-op update on a surviving admin stack is refused (CT6-004 defect 2)', () => {
  it('update-stack stderr is captured, not discarded', () => {
    // The buggy form silenced everything: update-stack ... > /dev/null 2>&1 || true
    expect(deploySrc).toContain('UPDATE_ERR=');
    expect(deploySrc).not.toMatch(/update-stack[^]{0,300}> \/dev\/null 2>&1 \|\| true/);
  });

  it('"No updates are to be performed" fails the deploy with remediation', () => {
    expect(deploySrc).toContain('No updates are to be performed');
    expect(deploySrc).toContain('FAILED — no-op update on existing management stack');
    // remediation names the delete-then-rerun path
    expect(deploySrc).toMatch(/delete-stack --stack-name \\\$STACK_NAME/);
  });

  it('other update-stack errors also fail instead of passing silently', () => {
    expect(deploySrc).toContain('FAILED — update-stack error');
  });
});

describe('org deploy — StackSet poll fails on zero instances (CT6-004 defect 3)', () => {
  it('the 1200s catch-all no longer flips TOTAL==0 to SUCCESS', () => {
    expect(deploySrc).toContain('has ZERO stack instances');
    expect(deploySrc).toContain('never created any stack instances');
  });

  it('TOTAL>0 timeout still resolves SUCCESS (rollout continues in CFN)', () => {
    const block = deploySrc.slice(deploySrc.indexOf('NOT STARTED" ]; then'),
                                  deploySrc.indexOf('has ZERO stack instances'));
    expect(block).toContain('"\\$TOTAL" -gt 0');
  });
});

describe('docs — migration steps delete the admin stack (CT6-004 defect 1)', () => {
  it('INSTRUCTIONS.md StackSet-removal section includes the admin-stack deletion step', () => {
    expect(instructions).toContain('Delete the management-account admin stack');
  });

  it('clarifies admin STACK vs admin IAM roles (the conflation that hid the omission)', () => {
    expect(instructions).toContain('the two are not the same thing');
  });
});
