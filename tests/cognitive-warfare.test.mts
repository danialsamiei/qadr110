import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getScenarios } from '../src/ai/scenario-engine.ts';
import { createPointMapContext } from '../src/platform/operations/map-context.ts';
import { createAssistantSessionContext } from '../src/services/ai-orchestrator/session.ts';
import { buildCognitiveWarfareModel } from '../src/services/cognitive-warfare.ts';
import type { ClusteredEvent, NewsItem } from '../src/types/index.ts';

function makeScenarioState() {
  const session = createAssistantSessionContext('cognitive-test');
  session.intentHistory = [
    {
      query: 'برای این منطقه فشار روایی و drift احساسی را بررسی کن',
      taskClass: 'scenario-analysis',
      timestamp: '2026-03-17T10:00:00.000Z',
    },
  ];

  const mapContext = createPointMapContext('cognitive-test-map', {
    lat: 35.6892,
    lon: 51.389,
    countryCode: 'IR',
    countryName: 'ایران',
    label: 'تهران',
  }, {
    activeLayers: ['gdelt', 'osint', 'polymarket', 'protests'],
    workspaceMode: 'analysis',
    nearbySignals: [
      { id: 'sig-1', label: 'رشد ناگهانی روایت اعتراضی', kind: 'protest', severity: 'high' },
      { id: 'sig-2', label: 'نوسان شدید ترندهای عمومی', kind: 'news', severity: 'medium' },
    ],
    viewport: { zoom: 8, view: 'map' },
    geopoliticalContext: ['مرکز تصمیم‌گیری سیاسی و رسانه‌ای'],
  });

  return getScenarios({
    trigger: 'اگر فشار روایی و اجتماعی در تهران تشدید شود',
    query: 'برای تهران سناریوهای روایت، احساس عمومی و spillover اجتماعی را بساز',
    mapContext,
    sessionContext: session,
    timeContext: '2026-03-17T10:05:00.000Z',
    localContextPackets: [
      {
        id: 'packet-1',
        title: 'خوشه روایتی اعتراضی',
        summary: 'چند منبع خبری و اجتماعی روی یک framing مشترک همگرا شده‌اند.',
        content: 'narrative pressure',
        sourceLabel: 'GDELT',
        sourceType: 'feed',
        updatedAt: '2026-03-17T10:03:00.000Z',
        score: 0.82,
        tags: ['narrative', 'social'],
        provenance: { sourceIds: ['src-1'], evidenceIds: ['ev-1'] },
      },
      {
        id: 'packet-2',
        title: 'سیگنال drift احساسی',
        summary: 'روند منفی در sentiment و قطبی‌سازی عمومی در حال تشدید است.',
        content: 'sentiment drift',
        sourceLabel: 'OSINT',
        sourceType: 'model',
        updatedAt: '2026-03-17T10:04:00.000Z',
        score: 0.76,
        tags: ['sentiment', 'drift'],
        provenance: { sourceIds: ['src-2'], evidenceIds: ['ev-2'] },
      },
    ],
  });
}

function makeNews(): NewsItem[] {
  const now = new Date('2026-03-17T10:00:00.000Z');
  return [
    {
      source: 'IRNA',
      title: 'IRNA reports rising concerns over coordinated media narratives in Tehran',
      link: 'https://example.com/irna-1',
      pubDate: now,
      isAlert: false,
      tier: 2,
      lang: 'en',
    },
    {
      source: 'BBC Persian',
      title: 'BBC Persian highlights protest narrative shifts and public sentiment drift',
      link: 'https://example.com/bbc-1',
      pubDate: new Date(now.getTime() - 1_800_000),
      isAlert: true,
      tier: 1,
      lang: 'en',
    },
    {
      source: 'Iran International',
      title: 'Iran International says social media campaign is amplifying unrest framing',
      link: 'https://example.com/intl-1',
      pubDate: new Date(now.getTime() - 3_600_000),
      isAlert: true,
      tier: 1,
      lang: 'en',
    },
    {
      source: 'Fars',
      title: 'Fars describes hostile narrative injection and misinformation campaign',
      link: 'https://example.com/fars-1',
      pubDate: new Date(now.getTime() - 5_400_000),
      isAlert: false,
      tier: 3,
      lang: 'en',
    },
  ];
}

function makeClusters(news: NewsItem[]): ClusteredEvent[] {
  return [
    {
      id: 'cluster-1',
      primaryTitle: 'Narrative injection around Tehran protests',
      primarySource: 'BBC Persian',
      primaryLink: 'https://example.com/cluster-1',
      sourceCount: 4,
      topSources: [
        { name: 'BBC Persian', tier: 1, url: 'https://example.com/bbc-1' },
        { name: 'Iran International', tier: 1, url: 'https://example.com/intl-1' },
      ],
      allItems: news,
      firstSeen: new Date('2026-03-17T08:00:00.000Z'),
      lastUpdated: new Date('2026-03-17T10:00:00.000Z'),
      isAlert: true,
      velocity: {
        sourcesPerHour: 5,
        level: 'spike',
        trend: 'rising',
        sentiment: 'negative',
        sentimentScore: -0.72,
      },
      lang: 'en',
    },
  ];
}

describe('cognitive warfare model', () => {
  it('builds a detection and defense model from news, clusters, and scenario state', () => {
    const news = makeNews();
    const clusters = makeClusters(news);
    const scenarioState = makeScenarioState();

    const model = buildCognitiveWarfareModel({
      news,
      clusters,
      scenarioState,
    });

    assert.ok(model.summary.includes('تهران'));
    assert.ok(model.metrics.length >= 4);
    assert.ok(model.narrativeClusters.length >= 1);
    assert.ok(model.influenceGraph.nodes.length >= 4);
    assert.ok(model.influenceGraph.edges.length >= 2);
    assert.ok(model.alerts.length >= 1);
    assert.ok(model.sentimentAnomalies.length >= 1);
    assert.equal(model.heatmap.length, 4);
    assert.equal(model.defensePlans.length, 3);
    assert.ok(model.evidenceStack.length >= 2);
    assert.ok(model.watchIndicators.length >= 2);
  });

  it('keeps counter-narratives and response plans actionable', () => {
    const model = buildCognitiveWarfareModel({
      news: makeNews(),
      clusters: makeClusters(makeNews()),
      scenarioState: makeScenarioState(),
    });

    const primaryPlan = model.defensePlans[0];
    assert.ok(primaryPlan);
    assert.ok(primaryPlan!.counterNarratives.length >= 2);
    assert.ok(primaryPlan!.responsePlan.length >= 3);
    assert.match(primaryPlan!.summary, /روای|دفاع|پاسخ/i);
  });
});
