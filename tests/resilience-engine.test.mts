import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getResilienceComparisonSet,
  getResilienceCountrySnapshot,
  getResilienceDashboardModel,
  getResilienceMethodologySummary,
  listResilienceBaselineCountries,
} from '../src/services/resilience/engine.ts';

const IRAN_NEIGHBORS = ['IQ', 'TR', 'AM', 'AZ', 'TM', 'AF', 'PK'];
const REQUIRED_BASELINE = ['IR', 'IL', 'US', ...IRAN_NEIGHBORS, 'RU', 'CN', 'BR', 'IN', 'JP'];

describe('resilience engine', () => {
  it('covers the required baseline comparison countries', () => {
    const countries = listResilienceBaselineCountries().map((item) => item.code);
    REQUIRED_BASELINE.forEach((code) => {
      assert.ok(countries.includes(code), `missing baseline country ${code}`);
    });
  });

  it('keeps all land neighbors of Iran in the default comparison set', () => {
    const comparisonSet = getResilienceComparisonSet('IR');
    IRAN_NEIGHBORS.forEach((code) => {
      assert.ok(comparisonSet.includes(code), `missing Iran neighbor ${code}`);
    });

    const dashboard = getResilienceDashboardModel('IR');
    const comparisonCodes = dashboard.comparisons.map((item) => item.countryCode);
    assert.deepEqual(comparisonCodes, IRAN_NEIGHBORS);
  });

  it('builds a transparent 14-dimension snapshot with coverage and methodology', () => {
    const snapshot = getResilienceCountrySnapshot('IR');
    assert.ok(snapshot);
    assert.equal(snapshot.dimensionOrder.length, 14);
    assert.equal(Object.keys(snapshot.dimensions).length, 14);
    assert.ok(snapshot.sources.length >= 2);
    assert.ok(snapshot.coverage.coveragePercent > 0);
    assert.ok(snapshot.composite.uncertainty.lower <= snapshot.composite.score);
    assert.ok(snapshot.composite.uncertainty.upper >= snapshot.composite.score);
    assert.equal(snapshot.history.length, 12);
    assert.match(getResilienceMethodologySummary(), /۱۴ بعد/);
  });
});
