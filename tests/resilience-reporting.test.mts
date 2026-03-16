import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildResilienceReport } from '../src/services/resilience/reporting.ts';

describe('resilience reporting', () => {
  it('generates Persian structured reports with grounded chart descriptors', () => {
    const report = buildResilienceReport('IR', [], 'comparative-country');
    const chartKinds = report.charts.map((chart) => chart.kind);

    assert.match(report.title, /گزارش/);
    assert.match(report.executiveSummary, /وضعیت «/);
    assert.ok(!/\b(very-strong|strong|balanced|fragile|severely-fragile)\b/.test(report.executiveSummary));
    assert.match(report.markdown, /## واقعیت‌های پایه/);
    assert.match(report.markdown, /## پیوست فنی/);
    assert.match(report.html, /^<!doctype html>/i);
    assert.ok(chartKinds.includes('time-series'));
    assert.ok(chartKinds.includes('radar'));
    assert.ok(chartKinds.includes('heatmap'));
    assert.ok(chartKinds.includes('ranked-bars'));
    assert.ok(chartKinds.includes('table'));
    assert.ok(chartKinds.includes('slope'));
    assert.ok(chartKinds.includes('spillover-network'));
    assert.ok(chartKinds.includes('stress-matrix'));
    assert.ok(report.sourceSummary.some((item) => item.includes('نمونه/نمایشی')));
  });
});
