import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizePersianIntelligenceQuery } from '../src/platform/retrieval/query-normalization.ts';

describe('Persian retrieval normalization', () => {
  it('normalizes Arabic characters and expands resilience terminology', () => {
    const result = normalizePersianIntelligenceQuery('تاب اوري اقتصادي در مرز عراق');
    assert.equal(result.language, 'fa');
    assert.equal(result.normalizedQuery, 'تاب اوري اقتصادي در مرز عراق'.replace(/[يى]/g, 'ی').replace(/[ك]/g, 'ک').toLowerCase());
    assert.ok(result.terminologyMatches.includes('تاب‌آوری'));
    assert.ok(result.terminologyMatches.includes('مرز'));
    assert.ok(result.expandedQueries.includes('resilience'));
    assert.ok(result.expandedQueries.includes('border'));
  });

  it('supports mixed Persian-English intelligence terms', () => {
    const result = normalizePersianIntelligenceQuery('sanctions impact بر زیرساخت انرژی');
    assert.equal(result.language, 'mixed');
    assert.ok(result.terminologyMatches.includes('تحریم'));
    assert.ok(result.terminologyMatches.includes('زیرساخت'));
    assert.ok(result.expandedQueries.includes('financial pressure'));
  });
});
