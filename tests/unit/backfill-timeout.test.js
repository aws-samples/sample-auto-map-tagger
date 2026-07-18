import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regression guard for the backfill 15-min stall (gate 32B-5/32B-7,
// reproduced twice): an old agreementStartDate + the full ~208-type event
// list can exceed the backfill custom-resource Lambda's hard 900s timeout.
// The process dies BEFORE respond() delivers the CFN callback, CloudFormation
// retries the resource 3x, and the whole stack creation stalls permanently
// (manual stop-stack-set-operation was needed to unblock the gate).
//
// The fix is a time budget: lookups stop with runway reserved for the SQS
// send loop and the respond() PUT, and a cut-off run reports PARTIAL in the
// CFN Reason instead of never responding at all.

const src = fs.readFileSync(
  path.join(__dirname, '../../src/js/deploy/template-main.js'), 'utf8');

describe('backfill Lambda — time budget prevents the CFN stall (32B-5/32B-7)', () => {
  it('derives the deadline from the real remaining Lambda time', () => {
    expect(src).toContain('context.get_remaining_time_in_millis()');
  });

  it('reserves runway for the send loop and the CFN respond() call', () => {
    // 120s reserve carved out of the lookup budget; the send loop gets its
    // own later cutoff so respond() always has time left.
    expect(src).toMatch(/deadline = time\.time\(\) \+ .*- 120/);
    expect(src).toContain('send_deadline = deadline + 60');
  });

  it('lookup loop checks the deadline every page', () => {
    const fn = src.slice(src.indexOf('def lookup_events'), src.indexOf('def handler'));
    expect(fn).toContain('if time.time() >= deadline:');
    expect(fn).toContain("lookup_error = 'time budget exhausted'");
  });

  it('send loop also stops before the budget runs out', () => {
    expect(src).toContain('if time.time() >= send_deadline:');
  });

  it('a cut-off run still responds SUCCESS, flagged PARTIAL in the Reason', () => {
    // Backfill is best-effort — a truncated backfill that responds beats a
    // complete one that never does. The PARTIAL flag is what tells the
    // operator a manual sweep may be needed.
    expect(src).toContain('if timed_out_types or unsent:');
    expect(src).toMatch(/PARTIAL — cut off by the 15-min Lambda budget/);
  });

  it('lookup workers receive the deadline', () => {
    expect(src).toContain('executor.submit(lookup_events, name, start_time, deadline)');
  });
});
