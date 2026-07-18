import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regression guards for the two CT6 preflight-gap blockers (source-as-text
// assertions, matching the deploy-script.test.js style).
//
// CT6-007: deploy.sh's competing-tagger preflight only matched
// map-auto-tagger-* stacks, so a peer that arrived via StackSet
// AutoDeployment (stack name StackSet-map-auto-tagger-<mpe>-<uuid>) was
// invisible — two scope=ALL taggers coexisted and raced on every event.
//
// CT6-006: #96 raised the MPE UI MaxLength 20→44 without auditing derived
// names; map-auto-tagger-backfill-mig<id>-<region> overflows IAM's 64-char
// RoleName limit region-dependently → ROLLBACK_COMPLETE with no preflight.

describe('deploy script — peer preflight sees StackSet instance stacks (CT6-007)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/js/deploy/script-deploy.js'), 'utf8');

  it('list-stacks query matches the StackSet- prefix too', () => {
    // Escaping in the generator source is noisy; anchor on the OR'd second
    // starts_with clause naming the StackSet prefix.
    expect(src).toMatch(/\|\| starts_with\(StackName, [^)]*StackSet-map-auto-tagger-/);
  });

  it('strips the StackSet- prefix before deriving the peer MPE', () => {
    expect(src).toContain('EXISTING_MPE="\\${EXISTING#StackSet-}"');
  });

  it('strips the StackSet instance-name UUID suffix (PR #85 lesson)', () => {
    // Without the strip, the SSM config lookup uses mig<id>-<uuid> and
    // misses the peer's real config.
    expect(src).toMatch(/EXISTING_MPE=.*sed -E.*\[0-9a-f\]\{8\}/);
  });
});

describe('deploy flow — MPE derived-name length validation (CT6-006)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/js/deploy/deploy-flow.js'), 'utf8');

  it('computes a config-dependent max MPE length', () => {
    expect(src).toContain('function maxMpeLenForConfig()');
    // The binding constraints: region-qualified backfill/main role names and
    // the org deploy role.
    expect(src).toContain("'map-auto-tagger-backfill-'.length");
    expect(src).toContain("'map-auto-tagger-role-'.length");
    expect(src).toContain("'auto-map-tagger-deploy-role-'.length");
  });

  it('validate() enforces the derived-name cap with its own error message', () => {
    expect(src).toContain('mpeId.length > mpeMax');
    expect(src).toContain("t('err_mpe_derived_length')");
  });

  it('the arithmetic stays anchored to the 64-char IAM RoleName limit', () => {
    const fn = src.slice(src.indexOf('function maxMpeLenForConfig'),
                         src.indexOf('function validate()'));
    expect(fn).toContain('64 - rolePrefixLen - 3 - 1 - maxRegionLen');
  });
});

describe('i18n — err_mpe_derived_length present in every locale', () => {
  const i18nDir = path.join(__dirname, '../../src/js/i18n');
  for (const f of ['en.js', 'ko.js', 'ja.js', 'zh.js', 'th.js', 'vi.js', 'id.js']) {
    it(`${f} has the key with a {max} placeholder`, () => {
      const src = fs.readFileSync(path.join(i18nDir, f), 'utf8');
      expect(src).toContain('err_mpe_derived_length');
      expect(src).toMatch(/err_mpe_derived_length:"[^"]*\{max\}[^"]*"/);
    });
  }
});

describe('deploy flow — region selectors agree between validator and getConfig (review-115 nit)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/js/deploy/deploy-flow.js'), 'utf8');

  it('multi-mode getConfig scopes regions to #regionList only', () => {
    // A bare '.region-select' also matches the hidden-but-never-cleared
    // single-mode list; a single→multi mode switch then deploys a stray
    // region the MPE-length validator (which reads #regionList) never
    // accounted for — re-opening the CT6-006 overflow for that region.
    expect(src).toContain("getValues('#regionList .region-select')");
    expect(src).not.toMatch(/config\.regions = \[\.\.\.new Set\(getValues\('\.region-select'\)\)\]/);
  });

  it('validator and getConfig use the SAME multi-mode selector', () => {
    const validatorSel = src.match(/maxMpeLenForConfig[^]*?'([^']*region-select[^']*)'/)[1]
      .split(':')[0];
    // both must anchor on #regionList in multi mode
    expect(src.slice(src.indexOf('function maxMpeLenForConfig'))).toContain("'#regionList .region-select'");
    expect(src.slice(src.indexOf("deployMode === 'multi'"))).toContain("'#regionList .region-select'");
  });
});
