import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AssistantConversationThread } from '../src/platform/ai/assistant-contracts.ts';
import type { ScenarioEngineState } from '../src/ai/scenario-engine.ts';
import type { MapLayers } from '../src/types/index.ts';
import { createPointMapContext } from '../src/platform/operations/map-context.ts';
import { createAssistantSessionContext } from '../src/services/ai-orchestrator/session.ts';
import { PROMPT_INTELLIGENCE_AGENT_PROFILE } from '../src/platform/operations/prompt-intelligence.ts';
import {
  PROMPT_SUGGESTION_TEMPLATES,
  generatePromptSuggestions,
  scorePromptSuggestionCandidate,
  type PromptSuggestionContextSnapshot,
} from '../src/services/PromptSuggestionEngine.ts';

function makeLayers(): MapLayers {
  return {
    hotspots: true,
    protests: true,
    roadTraffic: true,
  } as unknown as MapLayers;
}

function makeThread(): AssistantConversationThread {
  const now = new Date().toISOString();
  return {
    id: 'thread-1',
    title: 'تحلیل تهران',
    domainMode: 'security-brief',
    taskClass: 'briefing',
    createdAt: now,
    updatedAt: now,
    pinnedEvidenceIds: [],
    workflowId: undefined,
    sessionContext: undefined,
    messages: [
      {
        id: 'm1',
        role: 'user',
        createdAt: now,
        content: 'ریسک ژئوپلیتیک این منطقه را بسنج',
        domainMode: 'security-brief',
        taskClass: 'briefing',
      },
    ],
  };
}

function makeContext(overrides: Partial<PromptSuggestionContextSnapshot> = {}): PromptSuggestionContextSnapshot {
  const session = createAssistantSessionContext('session-1');
  const now = new Date().toISOString();
  session.intentHistory = [
    {
      id: 'intent-1',
      query: 'ریسک ژئوپلیتیک این منطقه را بسنج',
      taskClass: 'briefing',
      domainMode: 'security-brief',
      createdAt: now,
      inferredIntent: 'geopolitical-risk',
      complexity: 'reasoning',
    },
  ];
  session.reusableInsights = [
    {
      id: 'insight-1',
      query: 'ریسک ژئوپلیتیک این منطقه را بسنج',
      summary: 'افزایش سیگنال‌های امنیتی و فشار لجستیکی پیرامون تهران',
      createdAt: now,
      evidenceCardIds: [],
      relevanceTags: ['security-brief'],
    },
  ];

  const mapContext = createPointMapContext('map-1', {
    lat: 35.6892,
    lon: 51.389,
    countryCode: 'IR',
    countryName: 'ایران',
    label: 'تهران',
  }, {
    activeLayers: ['gdelt', 'polymarket', 'roadTraffic', 'protests'],
    viewport: {
      zoom: 8,
      view: 'mena',
      bounds: { west: 50, south: 34, east: 52, north: 36 },
    },
    timeRange: { label: '24h' },
    selectedEntities: ['ایران', 'تهران'],
    watchlists: ['IR Watch'],
  });

  return {
    anchorLabel: 'تهران',
    mapState: {
      zoom: 8,
      pan: { x: 0, y: 0 },
      view: 'mena',
      layers: makeLayers(),
      timeRange: '24h',
    },
    mapContext,
    scenarioState: {
      scenarios: [
        {
          id: 'scenario-1',
          title: 'تشدید امنیتی پیرامون تهران',
          description: '',
          probability: 'medium',
          probability_score: 0.68,
          impact_level: 'high',
          impact_score: 0.82,
          time_horizon: '72h',
          drivers: ['اعتراض محلی', 'اختلال ترافیک'],
          causal_chain: [],
          indicators_to_watch: ['تشدید تجمعات'],
          mitigation_options: ['پایش مستمر'],
          uncertainty_level: 'medium',
          uncertainty_score: 0.42,
          strategic_relevance: 0.81,
          confidence: { level: 'medium', score: 0.63, rationale: '' },
          cross_domain_impacts: {},
          competing_hypotheses: [],
          assumptions: [],
        },
      ],
      drift: [
        {
          scenarioId: 'scenario-1',
          previousProbability: 0.58,
          currentProbability: 0.68,
          delta: 0.1,
          direction: 'up',
          reason: 'افزایش خوشه‌های سیگنال',
          changedAt: now,
        },
      ],
    } as unknown as ScenarioEngineState,
    geoSnapshot: {
      context: mapContext,
      promptContext: 'تهران با ۴ سیگنال نزدیک، لایه‌های اعتراض و ترافیک فعال، و نشانه‌های Polymarket.',
      generatedAt: now,
      center: { lat: 35.6892, lon: 51.389 },
      country: { code: 'IR', name: 'ایران' },
      adminRegion: 'تهران',
      viewport: {
        zoom: 8,
        view: 'mena',
        bounds: { west: 50, south: 34, east: 52, north: 36 },
      },
      activeLayers: ['gdelt', 'polymarket', 'roadTraffic', 'protests'],
      workspaceMode: 'analysis',
      watchlists: ['IR Watch'],
      selectedEntities: ['ایران', 'تهران'],
      nearbySignals: [
        { id: 's1', label: 'اعتراض محلی', kind: 'اعتراض', distanceKm: 8, occurredAt: now, sourceLabel: 'GDELT' },
        { id: 's2', label: 'اختلال ترافیک', kind: 'ترافیک', distanceKm: 5, occurredAt: now, sourceLabel: 'Road' },
        { id: 's3', label: 'هشدار زیرساختی', kind: 'زیرساخت', distanceKm: 21, occurredAt: now, sourceLabel: 'OSINT' },
        { id: 's4', label: 'خبر امنیتی', kind: 'خبر', distanceKm: 18, occurredAt: now, sourceLabel: 'News' },
      ],
      nearbyInfrastructure: [
        { id: 'a1', name: 'گره حمل‌ونقل', type: 'pipeline', distanceKm: 12 },
      ],
      sourceDensity: {
        evidenceDensity: 'high',
        nearbySignalCount: 4,
        nearbyAssetCount: 1,
      },
      dataFreshness: {
        overallStatus: 'sufficient',
        coveragePercent: 82,
        freshSources: ['GDELT', 'Polymarket'],
        staleSources: [],
      },
      trendPreview: [
        { label: '24h', value: 4 },
        { label: '72h', value: 7 },
      ],
    },
    sessionContext: session,
    activeThread: makeThread(),
    activeLayers: ['gdelt', 'polymarket', 'roadTraffic', 'protests'],
    nearbySignals: [
      { id: 's1', label: 'اعتراض محلی', kind: 'اعتراض', distanceKm: 8, occurredAt: now, sourceLabel: 'GDELT' },
      { id: 's2', label: 'اختلال ترافیک', kind: 'ترافیک', distanceKm: 5, occurredAt: now, sourceLabel: 'Road' },
      { id: 's3', label: 'هشدار زیرساختی', kind: 'زیرساخت', distanceKm: 21, occurredAt: now, sourceLabel: 'OSINT' },
      { id: 's4', label: 'خبر امنیتی', kind: 'خبر', distanceKm: 18, occurredAt: now, sourceLabel: 'News' },
    ],
    trendingSignals: [
      'Will instability in Iran rise this week?',
      'GDELT shows increased incident clustering near Tehran',
    ],
    predictionSignals: [
      { title: 'Will instability in Iran rise this week?', yesPrice: 57, regions: ['mena'] },
      { title: 'Will regional pressure affect Tehran logistics?', yesPrice: 49, regions: ['mena'] },
    ],
    freshnessStatus: 'sufficient',
    focusQuery: 'ریسک ژئوپلیتیک این منطقه را بسنج',
    ...overrides,
  };
}

describe('PromptSuggestionEngine', () => {
  it('exposes the prompt intelligence agent role contract', () => {
    assert.equal(PROMPT_INTELLIGENCE_AGENT_PROFILE.role, 'Prompt Intelligence Agent');
    assert.ok(PROMPT_INTELLIGENCE_AGENT_PROFILE.analyzes.includes('user intent'));
    assert.ok(PROMPT_INTELLIGENCE_AGENT_PROFILE.analyzes.includes('map context'));
    assert.ok(PROMPT_INTELLIGENCE_AGENT_PROFILE.analyzes.includes('scenario state'));
    assert.ok(PROMPT_INTELLIGENCE_AGENT_PROFILE.outputContract.includes('expected insight'));
  });

  it('generates 5-8 diverse suggestions with rationale and routing metadata', () => {
    const suggestions = generatePromptSuggestions(makeContext());

    assert.ok(suggestions.length >= 5 && suggestions.length <= 8);
    assert.deepEqual(
      [...new Set(suggestions.map((item) => item.category))],
      ['osint', 'forecast', 'risk', 'strategy', 'deep-analysis'],
    );
    assert.ok(suggestions.every((item) => item.why.startsWith('چون ')));
    assert.ok(suggestions.every((item) => item.expectedInsight.startsWith('انتظار می‌رود ')));
    assert.ok(suggestions.every((item) => item.routeLabel.length > 0));
    assert.ok(suggestions.every((item) => item.score > 0));
    assert.ok(suggestions.some((item) => item.id === 'polymarket-gdelt-correlation'));
  });

  it('scores richer map/session context higher than sparse context', () => {
    const template = PROMPT_SUGGESTION_TEMPLATES.find((item) => item.id === 'geopolitical-risk');
    assert.ok(template, 'expected geopolitical-risk template to exist');

    const rich = scorePromptSuggestionCandidate(template!, makeContext());
    const sparse = scorePromptSuggestionCandidate(template!, makeContext({
      activeLayers: [],
      nearbySignals: [],
      predictionSignals: [],
      trendingSignals: [],
      focusQuery: undefined,
      freshnessStatus: 'insufficient',
      scenarioState: null,
      sessionContext: createAssistantSessionContext('session-sparse'),
      activeThread: null,
    }));

    assert.ok(rich.total > sparse.total);
    assert.ok(rich.breakdown.scenario > sparse.breakdown.scenario);
    assert.match(rich.why, /سیگنال نزدیک|لایه هم‌راستا|هم‌راستا با state سناریو|پوشش داده مناسب/);
  });
});
