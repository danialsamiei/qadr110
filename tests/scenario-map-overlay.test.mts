import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getScenarios } from '../src/ai/scenario-engine.ts';
import { createPointMapContext } from '../src/platform/operations/map-context.ts';
import { buildScenarioMapVisualizationModel } from '../src/services/ScenarioMapOverlay.ts';

describe('scenario map overlay', () => {
  it('builds map-aware hotspots, clusters, zones, paths, and commands from scenario state', () => {
    const mapContext = createPointMapContext('overlay-map', {
      lat: 29.95,
      lon: 32.55,
      countryCode: 'EG',
      countryName: 'مصر',
      label: 'کانال سوئز',
    }, {
      activeLayers: ['gdelt', 'polymarket', 'outages', 'protests', 'cyberThreats'],
      viewport: {
        zoom: 6.5,
        view: 'mena',
        bounds: {
          west: 28,
          south: 26,
          east: 36,
          north: 33,
        },
      },
      nearbySignals: [
        { id: 'near-1', label: 'اختلال کشتیرانی', kind: 'shipping', severity: 'high', occurredAt: '2026-03-17T09:00:00.000Z' },
      ],
      selectedEntities: ['کانال سوئز', 'مصر', 'دریای سرخ'],
      geopoliticalContext: ['این گلوگاه برای تجارت جهانی و انرژی حساس است.'],
      dataFreshness: { overallStatus: 'sufficient', coveragePercent: 88 },
    });

    const state = getScenarios({
      trigger: 'اگر اختلال در کانال سوئز تشدید شود',
      query: 'برای کانال سوئز اثرات محلی، منطقه‌ای و جهانی را تحلیل کن',
      mapContext,
      localContextPackets: [
        {
          id: 'pkt-suez-1',
          title: 'GDELT shipping stress',
          summary: 'shipping congestion and regional escalation signals are rising',
          content: 'shipping logistics escalation',
          sourceLabel: 'GDELT',
          sourceType: 'api',
          updatedAt: '2026-03-17T09:10:00.000Z',
          score: 0.71,
          tags: ['gdelt'],
          provenance: { sourceIds: ['src-s1'], evidenceIds: ['ev-s1'] },
        },
      ],
    });

    const model = buildScenarioMapVisualizationModel(state, {
      outages: [
        {
          id: 'out-1',
          title: 'بندر با ظرفیت محدود',
          link: '#',
          description: 'اختلال لجستیکی',
          pubDate: new Date('2026-03-17T08:00:00.000Z'),
          country: 'EG',
          lat: 31.2,
          lon: 32.3,
          severity: 'major',
          categories: ['infrastructure'],
        },
      ],
      protests: [
        {
          id: 'pr-1',
          title: 'اعتراض بندری',
          country: 'EG',
          lat: 30.6,
          lon: 32.27,
          time: new Date('2026-03-17T08:30:00.000Z'),
          severity: 'medium',
          sources: ['rss'],
          sourceType: 'rss',
          confidence: 'medium',
          validated: true,
          eventType: 'protest',
        },
      ],
      cyberThreats: [
        {
          id: 'cy-1',
          type: 'malicious_url',
          source: 'otx',
          indicator: 'canal-ops.example',
          indicatorType: 'domain',
          lat: 30.1,
          lon: 32.7,
          severity: 'high',
          tags: ['logistics'],
        },
      ],
      newsClusters: [
        {
          id: 'cl-1',
          primaryTitle: 'خوشه خبری اختلال مسیر کشتیرانی',
          primarySource: 'Reuters',
          primaryLink: '#',
          sourceCount: 7,
          topSources: [],
          allItems: [],
          firstSeen: new Date('2026-03-17T07:00:00.000Z'),
          lastUpdated: new Date('2026-03-17T09:20:00.000Z'),
          isAlert: true,
          lat: 30.3,
          lon: 32.6,
        },
      ],
    });

    assert.ok(model);
    assert.equal(model?.anchor.label, 'کانال سوئز');
    assert.ok((model?.hotspots.length ?? 0) >= 3);
    assert.ok((model?.clusters.length ?? 0) >= 2);
    assert.equal(model?.zones.length, 3);
    assert.ok((model?.paths.length ?? 0) > 0);
    assert.equal(model?.commands.length, 3);
  });
});
