import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compareScenarios,
  getScenarios,
  runScenarioEngine,
  updateScenarios,
} from '../src/ai/scenario-engine.ts';
import { createPointMapContext } from '../src/platform/operations/map-context.ts';
import { createAssistantSessionContext } from '../src/services/ai-orchestrator/session.ts';

describe('scenario engine', () => {
  it('builds ranked multi-domain scenarios from trigger, map context, osint, and session memory', () => {
    const session = createAssistantSessionContext('scenario-session');
    session.intentHistory = [
      {
        id: 'intent-1',
        query: 'اگر تنگه هرمز بسته شود چه می‌شود؟',
        taskClass: 'scenario-analysis',
        domainMode: 'scenario-planning',
        createdAt: '2026-03-17T08:00:00.000Z',
        inferredIntent: 'forecasting',
        complexity: 'complex',
      },
    ];
    session.reusableInsights = [
      {
        id: 'reuse-1',
        query: 'تحلیل هرمز',
        summary: 'همگرایی Polymarket و GDELT نشان می‌دهد شوک انرژی و لجستیک محتمل است.',
        createdAt: '2026-03-17T08:00:00.000Z',
        evidenceCardIds: [],
        relevanceTags: ['forecasting'],
      },
    ];

    const mapContext = createPointMapContext('map-1', {
      lat: 26.566,
      lon: 56.25,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'تنگه هرمز',
    }, {
      activeLayers: ['gdelt', 'polymarket', 'ais', 'roadTraffic', 'military'],
      nearbySignals: [
        { id: 's1', label: 'اختلال دریایی', kind: 'shipping', severity: 'high', occurredAt: '2026-03-17T07:00:00.000Z' },
        { id: 's2', label: 'تجمع سیگنال‌های GDELT', kind: 'news', occurredAt: '2026-03-17T07:30:00.000Z' },
      ],
      geopoliticalContext: ['فشار منطقه‌ای و حساسیت انرژی رو به افزایش است.'],
      selectedEntities: ['ایران', 'خلیج فارس', 'کشتیرانی انرژی'],
      dataFreshness: { overallStatus: 'sufficient', coveragePercent: 84 },
    });

    const output = runScenarioEngine({
      trigger: 'اگر تنگه هرمز مسدود شود',
      query: 'اگر تنگه هرمز مسدود شود در ۷۲ ساعت و دو هفته بعد چه پیامدهایی رخ می‌دهد؟',
      mapContext,
      localContextPackets: [
        {
          id: 'pkt-1',
          title: 'Polymarket energy risk',
          summary: 'Polymarket shows increased pricing of regional shipping disruption',
          content: 'shipping disruption and oil price stress',
          sourceLabel: 'Polymarket',
          sourceType: 'api',
          updatedAt: '2026-03-17T07:10:00.000Z',
          score: 0.74,
          tags: ['polymarket'],
          provenance: { sourceIds: ['src-1'], evidenceIds: ['ev-1'] },
        },
        {
          id: 'pkt-2',
          title: 'GDELT maritime escalation',
          summary: 'GDELT clusters maritime and regional security reporting near Hormuz',
          content: 'regional security, insurance, logistics',
          sourceLabel: 'GDELT',
          sourceType: 'api',
          updatedAt: '2026-03-17T07:12:00.000Z',
          score: 0.7,
          tags: ['gdelt'],
          provenance: { sourceIds: ['src-2'], evidenceIds: ['ev-2'] },
        },
      ],
      sessionContext: session,
    });

    assert.ok(output.scenarios.length >= 3 && output.scenarios.length <= 7);
    assert.equal(output.anchorLabel, 'تنگه هرمز');
    assert.ok(output.domainScores.economics > 0.4);
    assert.ok(output.domainScores.infrastructure > 0.4);
    assert.ok(output.scenarios.every((scenario) => scenario.causal_chain.length === 4));
    assert.ok(output.scenarios.every((scenario) => scenario.drivers.length > 0));
    assert.ok(output.scenarios.every((scenario) => scenario.indicators_to_watch.length > 0));
    assert.ok(output.scenarios.every((scenario) => scenario.mitigation_options.length > 0));
    assert.ok(output.scenarios.some((scenario) => scenario.impact_level === 'critical' || scenario.impact_level === 'high'));
    assert.ok(output.contextPackets.length >= 2);
    assert.equal(output.structuredOutput.scenarios[0]?.causal_chain?.length, 4);
    assert.ok(output.decisionSupport.scenario_support.length >= 1);
    assert.ok(output.decisionSupport.actionable_insights.length >= 2);
    assert.ok(output.decisionSupport.actor_models.length >= 1);
    assert.equal(output.structuredOutput.decisionSupport?.scenario_support[0]?.scenario_title, output.decisionSupport.scenario_support[0]?.scenario_title);
  });

  it('tracks confidence, drift, and timeline as new signals arrive', () => {
    const mapContext = createPointMapContext('map-2', {
      lat: 35.6892,
      lon: 51.389,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'تهران',
    }, {
      activeLayers: ['gdelt', 'polymarket', 'cyberThreats', 'protests'],
      nearbySignals: [
        { id: 't-1', label: 'اعتراض پراکنده', kind: 'protest', severity: 'medium', occurredAt: '2026-03-17T08:00:00.000Z' },
      ],
      geopoliticalContext: ['فشار روایی و اقتصادی هم‌زمان در حال افزایش است.'],
      selectedEntities: ['تهران', 'ایران'],
      dataFreshness: { overallStatus: 'sufficient', coveragePercent: 78 },
    });

    const state = getScenarios({
      trigger: 'اگر فشار اجتماعی و سایبری در تهران تشدید شود',
      query: 'برای تهران سناریوهای ۷۲ ساعت آینده را با تاکید بر ناهنجاری‌ها بساز',
      mapContext,
      localContextPackets: [
        {
          id: 'pkt-a',
          title: 'GDELT unrest cluster',
          summary: 'GDELT reports rising protest and governance stress signals',
          content: 'protest governance unrest',
          sourceLabel: 'GDELT',
          sourceType: 'api',
          updatedAt: '2026-03-17T08:10:00.000Z',
          score: 0.62,
          tags: ['gdelt'],
          provenance: { sourceIds: ['src-a'], evidenceIds: ['ev-a'] },
        },
      ],
    });

    assert.ok(state.signalFusion.signalCount >= 2);
    assert.ok(state.scenarios.every((scenario) => typeof scenario.confidence_score === 'number'));
    assert.ok(state.compare);
    assert.ok(Object.values(state.timeline).every((timeline) => timeline.length === 1));

    const updated = updateScenarios({
      previousState: state,
      reason: 'intelligence-updated',
      timeContext: '2026-03-17T10:30:00.000Z',
      newSignals: [
        {
          id: 'sig-cyber',
          source: 'gdelt',
          label: 'Cyber outage cluster',
          summary: 'cyber outage telecom disruption in Tehran',
          strength: 0.86,
          polarity: 'escalatory',
          domainWeights: { cyber: 0.94, infrastructure: 0.74, public_sentiment: 0.42 },
          occurredAt: '2026-03-17T10:20:00.000Z',
        },
        {
          id: 'sig-market',
          source: 'polymarket',
          label: 'Market repricing of instability risk',
          summary: 'polymarket odds move toward elevated instability scenario',
          strength: 0.77,
          polarity: 'escalatory',
          domainWeights: { economics: 0.82, geopolitics: 0.58 },
          occurredAt: '2026-03-17T10:21:00.000Z',
        },
      ],
    });

    assert.ok(updated.updatedAt === '2026-03-17T10:30:00.000Z');
    assert.ok(updated.signalFusion.signalCount >= state.signalFusion.signalCount);
    assert.ok(updated.drift.length > 0);
    assert.ok(Object.values(updated.timeline).every((timeline) => timeline.length >= 1));
    assert.ok(updated.scenarios.some((scenario) => scenario.trend_direction === 'up'));
    assert.ok(updated.decisionSupport.critical_uncertainties.length >= 1);
    assert.ok(updated.decisionSupport.strategic_insights.length >= 1);

    const comparison = compareScenarios(updated.scenarios[0]!, updated.scenarios[1]!);
    assert.ok(comparison.strongerScenarioId === updated.scenarios[0]!.id || comparison.strongerScenarioId === updated.scenarios[1]!.id);
  });
});
