import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createConfidenceRecord } from '../src/platform/ai/assistant-contracts.ts';
import {
  composePromptEntry,
  DEFAULT_PROMPT_CATALOG,
  getPromptEntriesForMode,
} from '../src/platform/operations/prompt-catalog.ts';
import type { MapContextEnvelope } from '../src/platform/operations/map-context.ts';

const mapContext: MapContextEnvelope = {
  id: 'ctx-1',
  createdAt: '2026-03-16T10:00:00.000Z',
  selection: {
    kind: 'country',
    countryCode: 'IR',
    countryName: 'ایران',
  },
  activeLayers: ['air-traffic', 'ixp'],
  timeRange: { label: '72 ساعت گذشته' },
};

describe('prompt catalog composition', () => {
  it('filters entries by domain mode and task class', () => {
    const entries = getPromptEntriesForMode('infrastructure-risk', 'scenario-analysis');
    assert.ok(entries.some((entry) => entry.id === 'geo-defense-context'));
    assert.ok(!entries.some((entry) => entry.id === 'misinformation-red-flag'));
  });

  it('composes geo-context prompts with evidence and memory in Persian', () => {
    const entry = DEFAULT_PROMPT_CATALOG.entries.find((item) => item.id === 'geo-defense-context');
    assert.ok(entry);
    const prompt = composePromptEntry(entry!, {
      query: 'ریسک زیرساختی غرب ایران را بررسی کن',
      domainMode: 'infrastructure-risk',
      taskClass: 'scenario-analysis',
      mapContext,
      pinnedEvidence: [
        {
          id: 'ev-1',
          title: 'اختلال مرزی',
          summary: 'یک اختلال ترافیکی در گذرگاه مرزی گزارش شده است.',
          timeContext: '2026-03-16T08:00:00.000Z',
          score: 0.77,
          freshnessWeight: 0.8,
          source: {
            id: 'src-1',
            type: 'manual',
            title: 'گزارش تحلیلی',
            publisher: 'تحلیلگر',
            collectionMethod: 'manual',
            retrievedAt: '2026-03-16T08:00:00.000Z',
            reliability: createConfidenceRecord(0.72, 'نمونه تست'),
            legalBasis: 'OSINT / user-provided material',
          },
          evidence: {
            id: 'e-1',
            sourceId: 'src-1',
            summary: 'اختلال در عبور و مرور',
            excerpt: 'گزارش می‌گوید عبور کامیون‌ها کند شده است.',
            locator: 'memory',
            collectedAt: '2026-03-16T08:00:00.000Z',
            mimeType: 'text/plain',
          },
          provenance: { sourceIds: ['src-1'], evidenceIds: ['e-1'] },
          confidence: createConfidenceRecord(0.7, 'نمونه تست'),
          tags: ['border'],
        },
      ],
      memoryNotes: [
        {
          id: 'mem-1',
          title: 'فرض اولیه',
          content: 'اختلال لجستیکی می‌تواند روی تاب‌آوری محلی اثر بگذارد.',
          tags: ['assumption'],
          createdAt: '2026-03-16T07:00:00.000Z',
          updatedAt: '2026-03-16T07:00:00.000Z',
        },
      ],
    });

    assert.match(prompt, /کانتکست نقشه/);
    assert.match(prompt, /انتخاب کشور: ایران/);
    assert.match(prompt, /لایه‌های فعال: air-traffic، ixp/);
    assert.match(prompt, /شواهد پین‌شده/);
    assert.match(prompt, /حافظه فضای کار/);
  });
});
