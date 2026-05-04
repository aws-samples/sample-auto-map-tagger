import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SERVICES_DIR = path.join(__dirname, '../../src/js/services');

// Load all service files (excluding index.js, _shared.js, README.md)
const serviceFiles = fs.readdirSync(SERVICES_DIR)
  .filter(f => f.endsWith('.js') && f !== 'index.js' && f !== '_shared.js');

describe('service modules', () => {
  const modules = serviceFiles.map(f => {
    const content = fs.readFileSync(path.join(SERVICES_DIR, f), 'utf8');
    return { file: f, content };
  });

  it('every service file declares a source', () => {
    for (const { file, content } of modules) {
      expect(content, `${file} missing source`).toMatch(/source:\s*'/);
    }
  });

  it('every service file declares events array', () => {
    for (const { file, content } of modules) {
      expect(content, `${file} missing events`).toMatch(/events:\s*\[/);
    }
  });

  it('every service file declares permissions array', () => {
    for (const { file, content } of modules) {
      expect(content, `${file} missing permissions`).toMatch(/permissions:\s*\[/);
    }
  });

  it('all sources start with aws.', () => {
    for (const { file, content } of modules) {
      const sourceMatch = content.match(/source:\s*'([^']+)'/);
      if (sourceMatch) {
        expect(sourceMatch[1], `${file} source`).toMatch(/^aws\./);
      }
    }
  });

  it('no duplicate sources across service files', () => {
    const sources = [];
    for (const { file, content } of modules) {
      const matches = content.matchAll(/source:\s*'([^']+)'/g);
      for (const m of matches) sources.push({ source: m[1], file });
    }
    const seen = new Map();
    for (const { source, file } of sources) {
      if (seen.has(source)) {
        throw new Error(`Duplicate source '${source}' in ${file} and ${seen.get(source)}`);
      }
      seen.set(source, file);
    }
  });
});

describe('_shared.js', () => {
  const content = fs.readFileSync(path.join(SERVICES_DIR, '_shared.js'), 'utf8');

  it('declares SHARED_PERMISSIONS', () => {
    expect(content).toContain('SHARED_PERMISSIONS');
  });

  it('includes tag:TagResources', () => {
    expect(content).toContain("'tag:TagResources'");
  });
});

describe('index.js aggregation', () => {
  const content = fs.readFileSync(path.join(SERVICES_DIR, 'index.js'), 'utf8');

  it('declares ALL_EVENT_NAMES', () => {
    expect(content).toContain('ALL_EVENT_NAMES');
  });

  it('declares ALL_SOURCES', () => {
    expect(content).toContain('ALL_SOURCES');
  });

  it('declares TAGGING_PERMISSIONS', () => {
    expect(content).toContain('TAGGING_PERMISSIONS');
  });
});
