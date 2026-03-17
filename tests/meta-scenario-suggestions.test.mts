import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getScenarios, updateScenarios } from '../src/ai/scenario-engine.ts';
import {
  buildMetaScenarioSuggestionContext,
  generateMetaScenarioSuggestions,
  groupMetaScenarioSuggestions,
  META_SCENARIO_SUGGESTION_TEMPLATES,
  scoreMetaScenarioSuggestionCandidate,
} from '../src/ai/meta-scenario-suggestions.ts';
import { createPointMapContext } from '../src/platform/operations/map-context.ts';
import { createAssistantSessionContext } from '../src/services/ai-orchestrator/session.ts';

function makeRichScenarioState() {
  const session = createAssistantSessionContext('meta-suggestion-session');
  session.intentHistory = [
    {
      id: 'intent-1',
      query: 'کدام سناریوهای تنگه هرمز به هم نیرو می‌دهند و کدامشان شکننده‌اند؟',
      taskClass: 'scenario-analysis',
      domainMode: 'scenario-planning',
      createdAt: '2026-03-17T08:00:00.000Z',
      inferredIntent: 'meta-scenario reasoning',
      complexity: 'complex',
    },
  ];
  session.reusableInsights = [
    {
      id: 'reuse-1',
      query: 'هرمز',
      summary: 'هم‌پوشانی شوک انرژی، ریسک بیمه و posture نظامی می‌تواند ranking سناریوها را جابه‌جا کند.',
      createdAt: '2026-03-17T08:05:00.000Z',
      evidenceCardIds: [],
      relevanceTags: ['meta', 'conflict', 'black-swan'],
    },
  ];

  const mapContext = createPointMapContext('meta-suggestion-map', {
    lat: 26.566,
    lon: 56.25,
    countryCode: 'IR',
    countryName: 'ایران',
    label: 'تنگه هرمز',
  }, {
    activeLayers: ['gdelt', 'polymarket', 'ais', 'military', 'outages', 'roadTraffic'],
    nearbySignals: [
      { id: 'sig-1', label: 'اختلال دریایی', kind: 'shipping', severity: 'high', occurredAt: '2026-03-17T08:10:00.000Z' },
      { id: 'sig-2', label: 'افزایش posture نظامی', kind: 'military', severity: 'high', occurredAt: '2026-03-17T08:12:00.000Z' },
      { id: 'sig-3', label: 'ناهمخوانی در پیام‌های دیپلماتیک', kind: 'news', severity: 'medium', occurredAt: '2026-03-17T08:16:00.000Z' },
    ],
    geopoliticalContext: ['این گلوگاه به energy flows، deconfliction و بیمه حمل حساس است.'],
    selectedEntities: ['ایران', 'خلیج فارس', 'کشتیرانی انرژی'],
    dataFreshness: { overallStatus: 'sufficient', coveragePercent: 87 },
  });

  const state = getScenarios({
    trigger: 'اگر در تنگه هرمز اختلال راهبردی رخ دهد',
    query: 'متا-سناریوها، تعارض‌ها و قوی‌سیاه‌های محتمل تنگه هرمز را بررسی کن',
    mapContext,
    sessionContext: session,
    localContextPackets: [
      {
        id: 'pkt-1',
        title: 'GDELT maritime escalation',
        summary: 'maritime escalation and insurance friction',
        content: 'shipping disruption insurance maritime escalation',
        sourceLabel: 'GDELT',
        sourceType: 'api',
        updatedAt: '2026-03-17T08:13:00.000Z',
        score: 0.76,
        tags: ['gdelt'],
        provenance: { sourceIds: ['src-1'], evidenceIds: ['ev-1'] },
      },
      {
        id: 'pkt-2',
        title: 'Polymarket repricing',
        summary: 'market reprices energy and shipping risk',
        content: 'energy market shipping repricing oil risk',
        sourceLabel: 'Polymarket',
        sourceType: 'api',
        updatedAt: '2026-03-17T08:14:00.000Z',
        score: 0.74,
        tags: ['polymarket'],
        provenance: { sourceIds: ['src-2'], evidenceIds: ['ev-2'] },
      },
      {
        id: 'pkt-3',
        title: 'Contradictory diplomatic whisper',
        summary: 'stabilizing rumor conflicts with hard escalation signals',
        content: 'stabilizing rumor weak signal contradiction backchannel calm',
        sourceLabel: 'OSINT Note',
        sourceType: 'manual',
        updatedAt: '2026-03-17T08:15:00.000Z',
        score: 0.43,
        tags: ['weak-signal'],
        provenance: { sourceIds: ['src-3'], evidenceIds: ['ev-3'] },
      },
    ],
  });

  return updateScenarios({
    previousState: state,
    reason: 'intelligence-updated',
    timeContext: '2026-03-17T09:00:00.000Z',
    newSignals: [
      {
        id: 'sig-4',
        source: 'polymarket',
        label: 'Oil shock repricing',
        summary: 'oil shock repricing increases fragility of baseline shipping assumptions',
        strength: 0.82,
        polarity: 'escalatory',
        domainWeights: { economics: 0.88, geopolitics: 0.61, infrastructure: 0.42 },
        occurredAt: '2026-03-17T08:56:00.000Z',
      },
      {
        id: 'sig-5',
        source: 'news-cluster',
        label: 'Conflicting de-escalation narrative',
        summary: 'contradictory reports suggest hidden dependency on diplomatic channel',
        strength: 0.54,
        polarity: 'stabilizing',
        domainWeights: { geopolitics: 0.58, public_sentiment: 0.39 },
        occurredAt: '2026-03-17T08:58:00.000Z',
      },
    ],
  });
}

describe('meta scenario suggestion engine', () => {
  it('generates grouped higher-order prompts with why and expected analytic value', () => {
    const state = makeRichScenarioState();
    const context = buildMetaScenarioSuggestionContext({
      state,
      focusQuery: 'کدام سناریوها هم‌افزا هستند و کدام قوی‌سیاه forecast غالب را می‌شکند؟',
    });

    assert.ok(context);

    const suggestions = generateMetaScenarioSuggestions(context!);
    const groups = groupMetaScenarioSuggestions(suggestions);

    assert.ok(suggestions.length >= 5 && suggestions.length <= 10);
    assert.deepEqual(
      new Set(suggestions.map((item) => item.category)),
      new Set(['fusion', 'conflict', 'black-swan', 'strategy', 'uncertainty']),
    );
    assert.ok(suggestions.every((item) => item.promptText.length > 12));
    assert.ok(suggestions.every((item) => item.whyItMatters.startsWith('چون ')));
    assert.ok(suggestions.every((item) => item.expectedAnalyticValue.length > 16));
    assert.ok(groups.some((group) => group.category === 'black-swan'));
    assert.ok(groups.some((group) => group.category === 'fusion'));
    assert.ok(suggestions.some((item) => /قوی سیاه|قوی‌سیاه/.test(item.promptText)));
  });

  it('scores rich conflict and black-swan context higher than sparse context', () => {
    const richState = makeRichScenarioState();
    const sparseState = getScenarios({
      trigger: 'اگر در این منطقه اختلالی رخ دهد',
      query: 'سناریوهای پایه را بساز',
      localContextPackets: [],
    });

    const richContext = buildMetaScenarioSuggestionContext({
      state: richState,
      focusQuery: 'اگر سناریوی غالب شکست بخورد چه چیزی جایگزین می‌شود؟',
    });
    const sparseContext = buildMetaScenarioSuggestionContext({
      state: sparseState,
      focusQuery: 'اگر اختلالی رخ دهد',
    });

    assert.ok(richContext && sparseContext);

    const blackSwanTemplate = META_SCENARIO_SUGGESTION_TEMPLATES.find((item) => item.id === 'black-swan-invalidator');
    const conflictTemplate = META_SCENARIO_SUGGESTION_TEMPLATES.find((item) => item.id === 'conflict-dominance');

    assert.ok(blackSwanTemplate);
    assert.ok(conflictTemplate);

    const richBlackSwan = scoreMetaScenarioSuggestionCandidate(blackSwanTemplate!, richContext!);
    const sparseBlackSwan = scoreMetaScenarioSuggestionCandidate(blackSwanTemplate!, sparseContext!);
    const richConflict = scoreMetaScenarioSuggestionCandidate(conflictTemplate!, richContext!);
    const sparseConflict = scoreMetaScenarioSuggestionCandidate(conflictTemplate!, sparseContext!);

    assert.ok(richBlackSwan.total > sparseBlackSwan.total);
    assert.ok(richConflict.total > sparseConflict.total);
    assert.match(richBlackSwan.why, /قوی‌سیاه|تعارض|context نقشه|drift|intent/);
    assert.notEqual(sparseBlackSwan.why, 'چون .');
  });
});
