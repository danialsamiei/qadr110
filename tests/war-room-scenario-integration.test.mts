import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runWarRoom } from '../src/ai/war-room/index.ts';
import { createPointMapContext } from '../src/platform/operations/map-context.ts';
import { createAssistantSessionContext } from '../src/services/ai-orchestrator/session.ts';

describe('war room scenario integration', () => {
  it('derives revised scenario ranking, adjustments, and focus from scenario/meta evidence', () => {
    const session = createAssistantSessionContext('war-room-scenario-layer');
    session.intentHistory = [
      {
        query: 'کدام سناریو بیش‌برآورد شده و کدام سناریو کم‌برآورد شده است؟',
        taskClass: 'scenario-analysis',
        timestamp: '2026-03-17T09:15:00.000Z',
      },
    ];

    const mapContext = createPointMapContext('map-war-room-scenario', {
      lat: 26.5667,
      lon: 56.25,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'تنگه هرمز',
    }, {
      activeLayers: ['gdelt', 'polymarket', 'osint'],
      nearbySignals: [
        { id: 'sig-1', label: 'افزایش ریسک بیمه کشتیرانی', kind: 'shipping', severity: 'high' },
        { id: 'sig-2', label: 'نوسان شدید قیمت انرژی', kind: 'energy', severity: 'high' },
      ],
      geopoliticalContext: ['گذرگاه حیاتی انرژی'],
      viewport: { zoom: 7, view: 'map' },
    });

    const result = runWarRoom({
      question: 'کدام سناریو در این محدوده بیش‌برآورد شده، کدام سناریو کم‌برآورد شده و چه قوی‌سیاهی نگاه غالب را تهدید می‌کند؟',
      trigger: 'رقابت سناریویی در تنگه هرمز',
      query: 'رتبه‌بندی سناریوها را در War Room بازبینی کن',
      mapContext,
      sessionContext: session,
      localContextPackets: [
        {
          id: 'packet-1',
          title: 'افزایش فشار بیمه و انرژی',
          summary: 'ریسک انرژی و حمل‌ونقل دریایی در حال تشدید است.',
          content: 'energy shock insurance shipping escalation',
          sourceLabel: 'QADR110',
          sourceType: 'model',
          updatedAt: '2026-03-17T09:20:00.000Z',
          score: 0.72,
          tags: ['energy', 'shipping'],
          provenance: { sourceIds: ['packet-1'], evidenceIds: ['packet-1'] },
        },
      ],
      timeContext: '2026-03-17T09:22:00.000Z',
    });

    assert.ok(result.scenarioRanking.length >= 3);
    assert.ok(result.scenarioRanking.every((item) => item.revised_rank >= 1));
    assert.ok(result.scenarioRanking.some((item) => item.stance === 'dominant' || item.stance === 'replacement' || item.stance === 'contested'));
    assert.ok(result.scenarioAdjustments.every((item) => item.updated_watchpoints.length >= 1));
    assert.ok(result.scenarioFocus.scenario_shift_summary.length > 0);
    assert.ok(result.executiveRecommendations.some((item) => item.includes('سناریو')));
    assert.ok(result.updatedWatchpoints.length >= result.executiveRecommendations.length - 1);
  });
});
