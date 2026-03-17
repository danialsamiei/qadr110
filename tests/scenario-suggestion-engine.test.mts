import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getScenarios } from '../src/ai/scenario-engine.ts';
import { createPointMapContext } from '../src/platform/operations/map-context.ts';
import { createAssistantSessionContext } from '../src/services/ai-orchestrator/session.ts';
import {
  buildScenarioSuggestionContext,
  generateScenarioSuggestions,
  scoreScenarioSuggestionCandidate,
  SCENARIO_SUGGESTION_TEMPLATES,
} from '../src/services/ScenarioSuggestionEngine.ts';

function makeScenarioState() {
  const session = createAssistantSessionContext('scenario-suggestion');
  session.intentHistory = [
    {
      id: 'intent-1',
      query: 'اگر در این ناحیه تشدید نظامی یا اختلال انرژی رخ دهد چه می‌شود؟',
      taskClass: 'scenario-analysis',
      domainMode: 'scenario-planning',
      createdAt: '2026-03-17T08:00:00.000Z',
      inferredIntent: 'simulation',
      complexity: 'complex',
    },
  ];
  session.reusableInsights = [
    {
      id: 'reuse-1',
      query: 'هرمز',
      summary: 'همگرایی Polymarket، GDELT و سیگنال‌های کشتیرانی ریسک انرژی را بالا برده است.',
      createdAt: '2026-03-17T08:00:00.000Z',
      evidenceCardIds: [],
      relevanceTags: ['energy', 'security'],
    },
  ];

  const mapContext = createPointMapContext('map-suggestion-1', {
    lat: 26.566,
    lon: 56.25,
    countryCode: 'IR',
    countryName: 'ایران',
    label: 'تنگه هرمز',
  }, {
    activeLayers: ['gdelt', 'polymarket', 'ais', 'military', 'roadTraffic'],
    nearbySignals: [
      { id: 'sig-1', label: 'اختلال کشتیرانی', kind: 'shipping', severity: 'high', occurredAt: '2026-03-17T08:10:00.000Z' },
      { id: 'sig-2', label: 'افزایش posture نظامی', kind: 'military', severity: 'high', occurredAt: '2026-03-17T08:12:00.000Z' },
    ],
    geopoliticalContext: ['منطقه به شدت به جریان انرژی و deconfliction حساس است.'],
    selectedEntities: ['ایران', 'خلیج فارس', 'انرژی'],
    dataFreshness: { overallStatus: 'sufficient', coveragePercent: 85 },
  });

  return getScenarios({
    trigger: 'اگر در تنگه هرمز اختلال راهبردی رخ دهد',
    query: 'اگر در تنگه هرمز اختلال راهبردی رخ دهد',
    mapContext,
    sessionContext: session,
    localContextPackets: [
      {
        id: 'pkt-1',
        title: 'Polymarket energy repricing',
        summary: 'market reprices regional shipping risk',
        content: 'energy shipping market sanction',
        sourceLabel: 'Polymarket',
        sourceType: 'api',
        updatedAt: '2026-03-17T08:15:00.000Z',
        score: 0.74,
        tags: ['polymarket'],
        provenance: { sourceIds: ['src-1'], evidenceIds: ['ev-1'] },
      },
      {
        id: 'pkt-2',
        title: 'GDELT maritime escalation',
        summary: 'maritime and military signals rise',
        content: 'shipping military escalation',
        sourceLabel: 'GDELT',
        sourceType: 'api',
        updatedAt: '2026-03-17T08:16:00.000Z',
        score: 0.72,
        tags: ['gdelt'],
        provenance: { sourceIds: ['src-2'], evidenceIds: ['ev-2'] },
      },
    ],
  });
}

describe('ScenarioSuggestionEngine', () => {
  it('generates 5-8 scenario prompts with why and potential impact', () => {
    const state = makeScenarioState();
    const context = buildScenarioSuggestionContext({
      state,
      focusQuery: 'اگر صادرات نفت یا تشدید نظامی از این نقطه شروع شود چه می‌شود؟',
    });

    assert.ok(context);
    const suggestions = generateScenarioSuggestions(context!);

    assert.ok(suggestions.length >= 5 && suggestions.length <= 8);
    assert.ok(suggestions.every((item) => item.why.startsWith('چون ')));
    assert.ok(suggestions.every((item) => item.potentialImpact.length > 0));
    assert.ok(suggestions.some((item) => item.id === 'oil-export-stop'));
    assert.ok(suggestions.some((item) => item.id === 'military-escalation'));
    assert.ok(suggestions.some((item) => item.id === 'sanctions-imposed'));
  });

  it('scores richer signal/map context higher than sparse context for energy disruption prompts', () => {
    const template = SCENARIO_SUGGESTION_TEMPLATES.find((item) => item.id === 'oil-export-stop');
    assert.ok(template);

    const richContext = buildScenarioSuggestionContext({
      state: makeScenarioState(),
      focusQuery: 'اگر صادرات نفت متوقف شود چه ripple effectهایی رخ می‌دهد؟',
    });
    const sparseState = getScenarios({
      trigger: 'اگر در این ناحیه اختلالی رخ دهد',
      query: 'اگر در این ناحیه اختلالی رخ دهد',
      localContextPackets: [],
    });
    const sparseContext = buildScenarioSuggestionContext({
      state: sparseState,
      focusQuery: 'اگر اختلالی رخ دهد',
    });

    assert.ok(richContext && sparseContext);
    const richScore = scoreScenarioSuggestionCandidate(template!, richContext!);
    const sparseScore = scoreScenarioSuggestionCandidate(template!, sparseContext!);

    assert.ok(richScore.total > sparseScore.total);
    assert.match(richScore.why, /سیگنال|لایه|intent|پوشش داده/);
  });
});
