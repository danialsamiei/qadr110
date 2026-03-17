import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getBlackSwans,
  runBlackSwanEngine,
  updateBlackSwans,
} from '../src/ai/black-swan-engine.ts';
import { createPointMapContext } from '../src/platform/operations/map-context.ts';
import { runScenarioEngine } from '../src/ai/scenario-engine.ts';

describe('black swan engine', () => {
  it('detects low-probability high-impact candidates and produces a watchlist', () => {
    const mapContext = createPointMapContext('black-swan-map-1', {
      lat: 26.566,
      lon: 56.25,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'تنگه هرمز',
    }, {
      activeLayers: ['gdelt', 'polymarket', 'ais', 'military'],
      nearbySignals: [
        { id: 'sig-1', label: 'اختلال بیمه حمل', kind: 'market', severity: 'high', occurredAt: '2026-03-17T09:00:00.000Z' },
        { id: 'sig-2', label: 'backchannel calm messaging', kind: 'diplomatic', severity: 'medium', occurredAt: '2026-03-17T09:10:00.000Z' },
      ],
      selectedEntities: ['ایران', 'خلیج فارس'],
      geopoliticalContext: ['بازار انرژی و کشتیرانی به این گلوگاه بسیار حساس است.'],
      dataFreshness: { overallStatus: 'limited', coveragePercent: 58 },
    });

    const baseScenarioOutput = runScenarioEngine({
      trigger: 'اگر تنگه هرمز مسدود شود',
      query: 'قوی سیاه‌های مربوط به انسداد هرمز را تحلیل کن',
      mapContext,
      localContextPackets: [
        {
          id: 'pkt-1',
          title: 'Telecom outage rumor',
          summary: 'weak-signal telecom outage and shipping closure rumor',
          content: 'rumor shipping closure outage',
          sourceLabel: 'OSINT',
          sourceType: 'manual',
          updatedAt: '2026-03-17T09:11:00.000Z',
          score: 0.38,
          tags: ['weak-signal'],
          provenance: { sourceIds: ['src-1'], evidenceIds: ['ev-1'] },
        },
        {
          id: 'pkt-2',
          title: 'Calm diplomatic channel',
          summary: 'stable backchannel and calm messaging',
          content: 'stable calm backchannel',
          sourceLabel: 'Feed',
          sourceType: 'feed',
          updatedAt: '2026-03-17T09:12:00.000Z',
          score: 0.42,
          tags: ['weak-signal'],
          provenance: { sourceIds: ['src-2'], evidenceIds: ['ev-2'] },
        },
      ],
    });

    const output = runBlackSwanEngine({
      trigger: 'اگر تنگه هرمز مسدود شود',
      query: 'قوی سیاه‌های هرمز را بساز',
      mapContext,
      localContextPackets: baseScenarioOutput.contextPackets,
      baseScenarioOutput,
    });

    assert.ok(output.candidates.length >= 1);
    assert.ok(output.watchlist.length >= 1);
    assert.ok(output.assumptionStressTests.length >= 1);
    assert.ok(output.candidates[0]!.low_probability_reason.length > 0);
    assert.ok(output.candidates[0]!.high_impact_reason.length > 0);
    assert.ok(output.candidates[0]!.affected_domains.length >= 1);
    assert.ok(output.structuredOutput.metaScenario?.black_swan_candidates.length);
  });

  it('updates severity over time when signals strengthen', () => {
    const mapContext = createPointMapContext('black-swan-map-2', {
      lat: 35.6892,
      lon: 51.389,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'تهران',
    }, {
      activeLayers: ['gdelt', 'cyberThreats', 'protests'],
      nearbySignals: [
        { id: 'sig-a', label: 'قطعی مخابراتی ناگهانی', kind: 'telecom', severity: 'high', occurredAt: '2026-03-17T11:00:00.000Z' },
      ],
      selectedEntities: ['تهران'],
      dataFreshness: { overallStatus: 'limited', coveragePercent: 52 },
    });

    const state = getBlackSwans({
      trigger: 'اگر فشار اجتماعی و سایبری در تهران تشدید شود',
      query: 'قوی سیاه تهران را بساز',
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
          score: 0.44,
          tags: ['weak-signal'],
          provenance: { sourceIds: ['src-a'], evidenceIds: ['ev-a'] },
        },
      ],
      timeContext: '2026-03-17T11:10:00.000Z',
    });

    const updated = updateBlackSwans({
      previousState: state,
      reason: 'signal-update',
      input: {
        localContextPackets: [
          ...(state.inputSnapshot.localContextPackets ?? []),
          {
            id: 'pkt-b',
            title: 'Closure cascade warning',
            summary: 'closure and collapse warnings rising',
            content: 'closure collapse outage surge',
            sourceLabel: 'Analyst Note',
            sourceType: 'manual',
            updatedAt: '2026-03-17T11:30:00.000Z',
            score: 0.39,
            tags: ['weak-signal', 'closure'],
            provenance: { sourceIds: ['src-b'], evidenceIds: ['ev-b'] },
          },
        ],
        timeContext: '2026-03-17T11:35:00.000Z',
      },
    });

    assert.ok(updated.updatedAt === '2026-03-17T11:35:00.000Z');
    assert.ok(updated.temporalEvolution[updated.candidates[0]!.id]!.length >= 2);
    assert.ok(updated.watchlist.some((item) => item.status === 'rising' || item.status === 'critical'));
  });
});
