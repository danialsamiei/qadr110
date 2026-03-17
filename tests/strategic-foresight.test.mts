import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runStrategicForesight } from '../src/ai/strategic-foresight.ts';
import { createPointMapContext } from '../src/platform/operations/map-context.ts';
import { createAssistantSessionContext } from '../src/services/ai-orchestrator/session.ts';

describe('strategic foresight mode', () => {
  it('combines scenario, meta-scenario, black-swan, and war-room layers into one synthesis', () => {
    const mapContext = createPointMapContext('foresight-map', {
      lat: 26.5668,
      lon: 56.2485,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'تنگه هرمز',
    }, {
      activeLayers: ['gdelt', 'polymarket', 'roadTraffic', 'ais'],
      viewport: { zoom: 7, view: 'map' },
      nearbySignals: [
        { id: 'sig-1', kind: 'shipping', label: 'اختلال در کریدور دریایی', severity: 'high' },
        { id: 'sig-2', kind: 'energy', label: 'فشار بازار انرژی', severity: 'medium' },
      ],
      selectedEntities: ['Hormuz', 'energy exports'],
      geopoliticalContext: ['گلوگاه انرژی', 'ریسک بیمه حمل'],
    });
    const session = createAssistantSessionContext('foresight-session');
    session.reusableInsights.push({
      id: 'insight-1',
      query: 'energy stress',
      summary: 'فشار بر انرژی و ترافیک دریایی در حال افزایش است.',
      createdAt: '2026-03-17T08:00:00.000Z',
      evidenceCardIds: [],
      relevanceTags: ['energy', 'shipping'],
    });

    const output = runStrategicForesight({
      question: 'برای تنگه هرمز یک جمع‌بندی پیش‌نگری راهبردی بساز.',
      trigger: 'اختلال در تنگه هرمز',
      query: 'اگر اختلال در تنگه هرمز تشدید شود چه آینده‌های رقیبی شکل می‌گیرد؟',
      mapContext,
      sessionContext: session,
      includeWarRoom: true,
      localContextPackets: [
        {
          id: 'pkt-1',
          title: 'فشار بیمه حمل',
          summary: 'هزینه بیمه حمل انرژی بالا رفته است.',
          content: 'shipping insurance stress',
          sourceLabel: 'OSINT',
          sourceType: 'feed',
          updatedAt: '2026-03-17T08:30:00.000Z',
          score: 0.72,
          tags: ['energy', 'shipping', 'insurance'],
          provenance: { sourceIds: ['pkt-1'], evidenceIds: ['pkt-1'] },
        },
      ],
      timeContext: '2026-03-17T08:30:00.000Z',
    });

    assert.ok(output.executiveSummary.length > 0);
    assert.ok(output.dominantScenarios.length >= 1);
    assert.ok(output.competingFutures.length >= 1);
    assert.ok(output.blackSwanCandidates.length >= 1);
    assert.ok(output.watchIndicators.length >= 1);
    assert.ok(output.recommendedNextPrompts.length >= 3);
    assert.ok(output.structuredOutput.metaScenario);
    assert.ok(output.structuredOutput.warRoom);
    assert.match(output.structuredOutput.reportTitle, /پیش‌نگری راهبردی/);
  });
});
