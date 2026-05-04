import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('build output', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../build/configurator.html'), 'utf8');

  it('contains inlined CSS', () => {
    expect(html).toContain('<style>');
    expect(html).toContain('box-sizing');
  });

  it('contains all flow functions', () => {
    const fns = [
      'selectMode', 'editorReview', 'editorGenerate', 'editorGenerateUpgrade',
      'deleteReview', 'deleteGenerate', 'updateReview', 'updateGenerate',
      'selectDeployMode', 'validate', 'getConfig', 'reviewConfig',
      'generateMainTemplate', 'generateDeployScript', 'generateAndDownload',
    ];
    for (const fn of fns) {
      expect(html, `missing function ${fn}`).toContain(`function ${fn}`);
    }
  });

  it('contains service definitions', () => {
    expect(html).toContain('ALL_EVENT_NAMES');
    expect(html).toContain('ALL_SOURCES');
    expect(html).toContain('TAGGING_PERMISSIONS');
  });

  it('contains i18n for all locales', () => {
    for (const locale of ['en', 'ko', 'ja', 'zh', 'id', 'th', 'vi']) {
      expect(html, `missing ${locale} translations`).toContain(`${locale}_translations`);
    }
  });

  it('has no unresolved build placeholders', () => {
    expect(html).not.toContain('<!-- BUILD:');
  });

  it('has no require() calls', () => {
    expect(html).not.toContain('require(');
  });

  it('has no import statements', () => {
    expect(html).not.toMatch(/^import\s+/m);
  });
});
