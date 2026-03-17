import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runMetaScenarioEngine } from '../src/ai/meta-scenario-engine.ts';
import { createPointMapContext } from '../src/platform/operations/map-context.ts';
import { createAssistantSessionContext } from '../src/services/ai-orchestrator/session.ts';
import { runScenarioEngine } from '../src/ai/scenario-engine.ts';

describe('meta scenario engine', () => {
  it('fuses scenario pairs into higher-order meta-scenarios and detects conflicts', () => {
    const session = createAssistantSessionContext('meta-session-1');
    session.reusableInsights = [
      {
        id: 'reuse-1',
        query: 'Hormuz combined risk',
        summary: 'ترکیب شوک انرژی، بیمه و posture منطقه‌ای می‌تواند چند مسیر هم‌زمان بسازد.',
        createdAt: '2026-03-17T10:00:00.000Z',
        evidenceCardIds: [],
        relevanceTags: ['forecasting', 'meta'],
      },
    ];

    const mapContext = createPointMapContext('meta-map-1', {
      lat: 26.566,
      lon: 56.25,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'تنگه هرمز',
    }, {
      activeLayers: ['gdelt', 'polymarket', 'ais', 'military'],
      nearbySignals: [
        { id: 'sig-1', label: 'اختلال بیمه حمل', kind: 'market', severity: 'high', occurredAt: '2026-03-17T09:00:00.000Z' },
        { id: 'sig-2', label: 'افزایش سیگنال دریایی', kind: 'shipping', severity: 'high', occurredAt: '2026-03-17T09:10:00.000Z' },
      ],
      selectedEntities: ['ایران', 'حمل‌ونقل انرژی', 'خلیج فارس'],
      geopoliticalContext: ['حساسیت منطقه‌ای و وابستگی انرژی بالا است.'],
      dataFreshness: { overallStatus: 'sufficient', coveragePercent: 82 },
    });

    const baseScenarioOutput = runScenarioEngine({
      trigger: 'اگر تنگه هرمز مسدود شود',
      query: 'اگر تنگه هرمز مسدود شود چه سناریوهای اقتصادی و امنیتی شکل می‌گیرند؟',
      mapContext,
      sessionContext: session,
      localContextPackets: [
        {
          id: 'pkt-1',
          title: 'GDELT maritime stress',
          summary: 'regional security shipping insurance disruption',
          content: 'shipping disruption insurance market energy shock',
          sourceLabel: 'GDELT',
          sourceType: 'api',
          updatedAt: '2026-03-17T09:05:00.000Z',
          score: 0.72,
          tags: ['gdelt'],
          provenance: { sourceIds: ['src-1'], evidenceIds: ['ev-1'] },
        },
        {
          id: 'pkt-2',
          title: 'Backchannel de-escalation rumor',
          summary: 'calm messaging and diplomatic backchannel',
          content: 'diplomatic calm backchannel stabilizing narrative',
          sourceLabel: 'OSINT Note',
          sourceType: 'manual',
          updatedAt: '2026-03-17T09:08:00.000Z',
          score: 0.44,
          tags: ['weak-signal'],
          provenance: { sourceIds: ['src-2'], evidenceIds: ['ev-2'] },
        },
      ],
    });

    const output = runMetaScenarioEngine({
      trigger: 'اگر تنگه هرمز مسدود شود',
      query: 'تعامل سناریوها، جنگ سناریویی و قوی سیاه مربوط به تنگه هرمز را تحلیل کن',
      mapContext,
      sessionContext: session,
      localContextPackets: [
        {
          id: 'pkt-3',
          title: 'Insurance repricing',
          summary: 'insurance market repricing and shipping backlog',
          content: 'shipping backlog insurance repricing energy market',
          sourceLabel: 'Polymarket',
          sourceType: 'api',
          updatedAt: '2026-03-17T09:12:00.000Z',
          score: 0.69,
          tags: ['polymarket'],
          provenance: { sourceIds: ['src-3'], evidenceIds: ['ev-3'] },
        },
        {
          id: 'pkt-4',
          title: 'Calm diplomatic channel',
          summary: 'stabilizing signal from diplomatic channel',
          content: 'diplomatic channel calm stabilizing signal',
          sourceLabel: 'Feed Digest',
          sourceType: 'feed',
          updatedAt: '2026-03-17T09:14:00.000Z',
          score: 0.41,
          tags: ['weak-signal'],
          provenance: { sourceIds: ['src-4'], evidenceIds: ['ev-4'] },
        },
      ],
      baseScenarioOutput,
    });

    assert.ok(output.meta_scenarios.length >= 1);
    assert.ok(output.higher_order_insights.length >= 1);
    assert.ok(output.structuredOutput.metaScenario?.meta_scenarios.length);
    assert.ok(output.structuredOutput.scenarios.length >= 3);
    assert.ok(output.scoring.evaluatedPairs >= 3);
    assert.ok(output.scenario_conflicts.length >= 1);
    assert.ok(Object.keys(output.scenario_conflicts[0]!.probability_redistribution).length === 2);
  });

  it('detects black swan candidates from low-probability high-impact paths and contradictory weak signals', () => {
    const mapContext = createPointMapContext('meta-map-2', {
      lat: 35.6892,
      lon: 51.389,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'تهران',
    }, {
      activeLayers: ['gdelt', 'cyberThreats', 'protests'],
      nearbySignals: [
        { id: 'sig-a', label: 'قطعی مخابراتی ناگهانی', kind: 'telecom', severity: 'high', occurredAt: '2026-03-17T11:00:00.000Z' },
        { id: 'sig-b', label: 'تجمع اعتراضی محدود', kind: 'protest', severity: 'medium', occurredAt: '2026-03-17T11:10:00.000Z' },
      ],
      selectedEntities: ['تهران'],
      dataFreshness: { overallStatus: 'limited', coveragePercent: 54 },
    });

    const output = runMetaScenarioEngine({
      trigger: 'اگر فشار اجتماعی و سایبری در تهران تشدید شود',
      query: 'قوی سیاه و سناریوهای مرتبه دوم تهران را بساز',
      mapContext,
      localContextPackets: [
        {
          id: 'pkt-a',
          title: 'Telecom outage surge',
          summary: 'shutdown telecom outage surge',
          content: 'telecom outage shutdown regime shift indicator',
          sourceLabel: 'GDELT',
          sourceType: 'api',
          updatedAt: '2026-03-17T11:05:00.000Z',
          score: 0.52,
          tags: ['weak-signal'],
          provenance: { sourceIds: ['src-a'], evidenceIds: ['ev-a'] },
        },
        {
          id: 'pkt-b',
          title: 'Calm governance messaging',
          summary: 'stable calm governance messaging',
          content: 'stable calm governance signal',
          sourceLabel: 'Manual',
          sourceType: 'manual',
          updatedAt: '2026-03-17T11:06:00.000Z',
          score: 0.43,
          tags: ['weak-signal'],
          provenance: { sourceIds: ['src-b'], evidenceIds: ['ev-b'] },
        },
      ],
    });

    assert.ok(output.black_swan_candidates.length >= 1);
    assert.ok(output.black_swan_candidates[0]!.broken_assumptions.length >= 1);
    assert.ok(output.black_swan_candidates[0]!.low_probability_reason.length >= 1);
    assert.ok(output.black_swan_candidates[0]!.high_impact_reason.length >= 1);
    assert.ok(output.black_swan_candidates[0]!.recommended_actions.length >= 1);
    assert.ok(output.structuredOutput.metaScenario?.black_swan_candidates.length);
  });
});
