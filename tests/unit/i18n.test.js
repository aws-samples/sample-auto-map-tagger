import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const I18N_DIR = path.join(__dirname, '../../src/js/i18n');
const LOCALES = ['en', 'ko', 'ja', 'zh', 'id', 'th', 'vi'];

describe('i18n locale files', () => {
  for (const locale of LOCALES) {
    it(`${locale}.js exists and declares translations`, () => {
      const content = fs.readFileSync(path.join(I18N_DIR, `${locale}.js`), 'utf8');
      expect(content).toContain(`${locale}_translations`);
      expect(content).toContain('ui_title');
    });
  }

  it('all locales have ui_title key', () => {
    for (const locale of LOCALES) {
      const content = fs.readFileSync(path.join(I18N_DIR, `${locale}.js`), 'utf8');
      expect(content, `${locale} missing ui_title`).toContain('ui_title');
    }
  });
});

describe('i18n engine', () => {
  const content = fs.readFileSync(path.join(I18N_DIR, 'engine.js'), 'utf8');

  it('declares LANG_LABELS', () => {
    expect(content).toContain('LANG_LABELS');
  });

  it('declares TRANSLATIONS referencing all locales', () => {
    for (const locale of LOCALES) {
      expect(content, `missing ${locale}_translations`).toContain(`${locale}_translations`);
    }
  });

  it('declares t() function', () => {
    expect(content).toContain('function t(');
  });

  it('declares setLanguage() function', () => {
    expect(content).toContain('function setLanguage(');
  });

  it('declares applyTranslations() function', () => {
    expect(content).toContain('function applyTranslations(');
  });
});
