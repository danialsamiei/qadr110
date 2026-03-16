import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  coerceAssistantStructuredOutput,
  parseAssistantResponseJson,
} from '../src/platform/ai/assistant-schema.ts';

const samplePath = new URL('./fixtures/assistant-structured-sample.json', import.meta.url);
const sampleRaw = readFileSync(samplePath, 'utf8');

describe('assistant schema coercion', () => {
  it('parses fenced JSON and fills missing sections with Persian defaults', () => {
    const parsed = parseAssistantResponseJson(`\`\`\`json\n${sampleRaw}\n\`\`\``);
    assert.ok(parsed);
    assert.equal(parsed.reportTitle, 'تحلیل کوتاه نمونه');
    assert.equal(parsed.observedFacts.title, 'واقعیت‌های مشاهده‌شده');
    assert.equal(parsed.analyticalInference.title, 'استنباط تحلیلی');
    assert.equal(parsed.uncertainties.title, 'عدم‌قطعیت‌ها');
    assert.equal(parsed.scenarios[0]?.probability, 'high');
    assert.match(parsed.recommendations.bullets[0] || '', /cross-check/);
  });

  it('coerces invalid payloads into a safe Persian structure', () => {
    const parsed = coerceAssistantStructuredOutput({ executiveSummary: 'خلاصه کوتاه' });
    assert.equal(parsed.reportTitle, 'گزارش تحلیلی QADR110');
    assert.equal(parsed.executiveSummary, 'خلاصه کوتاه');
    assert.equal(parsed.observedFacts.title, 'واقعیت‌های مشاهده‌شده');
    assert.deepEqual(parsed.followUpSuggestions, []);
  });
});
