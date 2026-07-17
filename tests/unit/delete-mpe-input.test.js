import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regression guard: the delete-form MPE-ID input has TWO copies of its
// markup — a static row baked into src/html/configurator.html (the first
// row shown on load) and a JS template string in src/js/delete/delete-
// flow.js (used when the user clicks "add another MPE"). PR #94 removed
// the 10-character maxlength but only fixed the JS template; the static
// HTML copy silently kept maxlength="10", so any customer typing an MPE
// ID longer than 10 chars into the FIRST (and often only) delete-scope
// row got silently truncated — found live in the 2026-07-16 release gate,
// where delete.sh scoped to the truncated ID matched no stack and
// silently did nothing (32B-2/3/6/8/10/11).
describe('delete-form MPE input — maxlength stays in sync across both copies', () => {
  const skeleton = fs.readFileSync(
    path.join(__dirname, '../../src/html/configurator.html'), 'utf8');
  const jsTemplate = fs.readFileSync(
    path.join(__dirname, '../../src/js/delete/delete-flow.js'), 'utf8');
  const built = fs.readFileSync(
    path.join(__dirname, '../../configurator.html'), 'utf8');

  const extractMaxlength = (text) => {
    const m = text.match(/class="delete-mpe-input"[^>]*maxlength="(\d+)"/);
    return m ? m[1] : null;
  };

  it('static HTML skeleton copy allows the full 44-char MPE suffix', () => {
    expect(extractMaxlength(skeleton)).toBe('44');
  });

  it('JS added-row template also allows the full 44-char MPE suffix', () => {
    expect(extractMaxlength(jsTemplate)).toBe('44');
  });

  it('built configurator.html has no maxlength="10" delete-mpe-input anywhere', () => {
    const matches = built.match(/class="delete-mpe-input"[^>]*maxlength="10"/g);
    expect(matches).toBeNull();
  });
});
