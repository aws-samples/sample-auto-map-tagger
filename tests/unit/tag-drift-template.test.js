import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Template-side regression guard for IaC tag-drift detection (L2):
// - TagDriftEventRule subscribes the EXACT untag event names (never
//   prefixes — Untag*/Delete*/Remove* prefixes would route every deletion
//   in the account into SQS) and targets the existing EventQueue.
// - EventQueuePolicy must allow BOTH rules (aws:SourceArn list), or drift
//   events are silently rejected at the queue.
// - TagDriftAlarm fires on MapAutoTagger/TagDriftDetected and its
//   description carries the customer-side fix (ignore_tags snippet).
// Checked in BOTH build outputs (configurator.html + configurator.yaml).

const ROOT = path.join(__dirname, '../..');

const UNTAG_EVENTS = [
  'UntagResource', 'UntagResources', 'DeleteTags',
  'RemoveTagsFromResource', 'RemoveTags', 'DeleteBucketTagging',
];

function driftRuleBlock(text, file) {
  const start = text.indexOf('TagDriftEventRule:');
  expect(start, `${file}: TagDriftEventRule missing`).toBeGreaterThan(-1);
  // Slice to the next top-level resource after the rule
  const rest = text.slice(start);
  const end = rest.search(/\n  [A-Za-z]+:\s*\n\s+Type:/);
  return end > -1 ? rest.slice(0, end) : rest.slice(0, 4000);
}

describe('tag-drift template wiring (built artifacts)', () => {
  let html, yaml;

  beforeAll(() => {
    execSync('node scripts/build.js', { cwd: ROOT, stdio: 'pipe' });
    execSync('node scripts/build-yaml.js', { cwd: ROOT, stdio: 'pipe' });
    html = fs.readFileSync(path.join(ROOT, 'configurator.html'), 'utf8');
    yaml = fs.readFileSync(path.join(ROOT, 'configurator.yaml'), 'utf8');
  });

  for (const [name, get] of [['configurator.html', () => html], ['configurator.yaml', () => yaml]]) {
    describe(name, () => {
      it('has TagDriftEventRule with all six exact untag event names', () => {
        const block = driftRuleBlock(get(), name);
        for (const ev of UNTAG_EVENTS) {
          expect(block, `missing ${ev}`).toContain(`- ${ev}`);
        }
      });

      it('uses exact names, not prefixes, in the drift rule', () => {
        const block = driftRuleBlock(get(), name);
        expect(block).not.toContain('prefix:');
      });

      it('drift rule targets the EventQueue (shared pipeline)', () => {
        const block = driftRuleBlock(get(), name);
        expect(block).toContain('EventQueue.Arn');
      });

      it('queue policy admits both rules via aws:SourceArn list', () => {
        const text = get();
        const polStart = text.indexOf('EventQueuePolicy:');
        expect(polStart).toBeGreaterThan(-1);
        const pol = text.slice(polStart, polStart + 1500);
        expect(pol).toContain('AutoTagEventRule.Arn');
        expect(pol).toContain('TagDriftEventRule.Arn');
      });

      it('has TagDriftAlarm on MapAutoTagger/TagDriftDetected with the ignore_tags fix in its description', () => {
        const text = get();
        const start = text.indexOf('TagDriftAlarm:');
        expect(start, 'TagDriftAlarm missing').toBeGreaterThan(-1);
        const alarm = text.slice(start, start + 3000);
        expect(alarm).toContain('TagDriftDetected');
        expect(alarm).toContain('MapAutoTagger');
        expect(alarm).toContain('ignore_tags');
        expect(alarm).toContain('map-migrated');
        // Central-topic routing parity with the other alarms
        expect(alarm).toContain('HasCentralTopic');
        expect(alarm).toContain('TreatMissingData: notBreaching');
      });

      it('creation rule still uses prefixes and comes before the drift rule (lint_event_prefixes order)', () => {
        const text = get();
        const creation = text.indexOf('AutoTagEventRule:');
        const drift = text.indexOf('TagDriftEventRule:');
        expect(creation).toBeGreaterThan(-1);
        expect(creation).toBeLessThan(drift);
      });
    });
  }
});
