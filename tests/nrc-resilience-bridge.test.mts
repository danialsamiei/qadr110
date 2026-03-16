import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  calculateNRC,
  getNRCHistory,
  getNRCScore,
  getRegionalAverages,
} from '../src/services/nrc-resilience.ts';

describe('NRC compatibility bridge', () => {
  it('preserves sorted NRC rankings over the new resilience engine', () => {
    const scores = calculateNRC();
    assert.ok(scores.length >= 15);
    assert.ok(scores[0]!.overallScore >= scores[scores.length - 1]!.overallScore);
  });

  it('returns a stable bridged score for Iran', () => {
    const score = getNRCScore('IR');
    assert.ok(score);
    assert.equal(Object.keys(score.domains).length, 6);
    assert.ok(score.confidenceInterval.lower <= score.overallScore);
    assert.ok(score.confidenceInterval.upper >= score.overallScore);
    assert.equal(getNRCHistory('IR').length, 12);
  });

  it('keeps regional averages available for legacy consumers', () => {
    const regions = getRegionalAverages();
    assert.ok(regions.length > 0);
    assert.ok(regions.every((region) => region.countries >= 1));
  });
});
