import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runWarRoom } from '../src/ai/war-room/index.ts';
import { createPointMapContext } from '../src/platform/operations/map-context.ts';
import { createAssistantSessionContext } from '../src/services/ai-orchestrator/session.ts';

describe('war room engine', () => {
  it('builds an eight-agent, multi-round debate with synthesis and watchpoints', () => {
    const session = createAssistantSessionContext('war-room-1');
    session.intentHistory = [
      {
        query: 'اثر اقتصادی و امنیتی این محدوده را مقایسه کن',
        taskClass: 'scenario-analysis',
        timestamp: '2026-03-17T08:20:00.000Z',
      },
    ];
    session.reusableInsights = [
      {
        id: 'insight-1',
        query: 'تنگه هرمز',
        summary: 'فشار انرژی و لجستیک دریایی هم‌زمان در حال افزایش است.',
        createdAt: '2026-03-17T08:10:00.000Z',
        evidenceCardIds: [],
        relevanceTags: ['energy', 'shipping'],
      },
    ];

    const mapContext = createPointMapContext('map-hormuz', {
      lat: 26.5667,
      lon: 56.25,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'تنگه هرمز',
    }, {
      activeLayers: ['gdelt', 'polymarket', 'osint'],
      workspaceMode: 'scenario-planning',
      nearbySignals: [
        { id: 'sig-1', label: 'افزایش ریسک بیمه کشتیرانی', kind: 'shipping', severity: 'high' },
        { id: 'sig-2', label: 'نوسان شدید قیمت انرژی', kind: 'energy', severity: 'medium' },
      ],
      geopoliticalContext: ['گذرگاه حیاتی انرژی', 'حساسیت بالای واکنش بازیگران منطقه‌ای'],
      selectedEntities: ['مسیر صادرات نفت', 'شبکه حمل‌ونقل دریایی'],
      viewport: { zoom: 7, view: 'map' },
    });

    const result = runWarRoom({
      question: 'اگر عبور و مرور دریایی در تنگه هرمز مختل شود، پیامدهای بعدی چیست؟',
      trigger: 'اختلال در عبور دریایی تنگه هرمز',
      query: 'یک مناظره چندعاملی درباره اختلال در عبور دریایی تنگه هرمز بساز',
      mapContext,
      localContextPackets: [
        {
          id: 'ctx-1',
          title: 'خلاصه سیگنال‌ها',
          summary: 'ریسک انرژی، ترافیک دریایی و فشار بیمه در حال تشدید است.',
          content: 'فشار هم‌زمان بر انرژی، تجارت و روایت رسانه‌ای دیده می‌شود.',
          sourceLabel: 'QADR110',
          sourceType: 'model',
          updatedAt: '2026-03-17T08:25:00.000Z',
          score: 0.66,
          tags: ['energy', 'shipping'],
          provenance: { sourceIds: ['ctx-1'], evidenceIds: ['ctx-1'] },
        },
      ],
      sessionContext: session,
      timeContext: '2026-03-17T08:30:00.000Z',
      challengeIterations: 2,
    });

    assert.equal(result.anchorLabel, 'تنگه هرمز');
    assert.equal(result.agents.length, 8);
    assert.equal(result.mode, 'deep');
    assert.equal(result.roundCount, 6);
    assert.deepEqual(result.rounds.map((round) => round.stage), ['assessment', 'critique', 'revision', 'critique', 'revision', 'synthesis']);
    assert.ok(result.agents.some((agent) => agent.role === 'تحلیل‌گر راهبردی'));
    assert.ok(result.agents.some((agent) => agent.role === 'جمع‌بند اجرایی'));
    assert.ok(result.agents.every((agent) => agent.role_prompt.includes('JSON schema required')));
    assert.ok(result.agents.some((agent) => agent.role_prompt.includes('سیگنال‌های اخیر')));
    assert.ok(result.agents.every((agent) => agent.critiques.length >= 1));
    assert.ok(result.disagreements.length >= 1);
    assert.ok(result.convergences.length >= 1);
    assert.ok(result.debateTranscript.length >= result.rounds.length);
    assert.ok(result.replayTrace.some((item) => item.to_stage === 'completed'));
    assert.equal(result.disagreementMatrix.length, result.agents.length);
    assert.ok(result.qualityControls.evidence_backed_disagreement_ratio > 0);
    assert.ok(result.recommendedWatchpoints.length >= 3);
    assert.ok(result.updatedWatchpoints.length >= 3);
    assert.ok(result.unresolvedUncertainties.length >= 1);
    assert.match(result.executiveSummary, /تنگه هرمز/);
    assert.ok(result.scenarioRanking.length >= 3);
    assert.ok(result.scenarioAdjustments.length >= 1);
    assert.equal(result.scenarioFocus.dominant_scenario_id, result.scenarioRanking[0]?.scenario_id);
    assert.ok(result.executiveRecommendations.length >= 3);
    assert.equal(result.structuredOutput.warRoom?.question, 'اگر عبور و مرور دریایی در تنگه هرمز مختل شود، پیامدهای بعدی چیست؟');
    assert.equal(result.structuredOutput.warRoom?.mode, 'deep');
    assert.equal(result.structuredOutput.warRoom?.agents.length, 8);
    assert.equal(result.structuredOutput.warRoom?.round_count, 6);
    assert.ok((result.structuredOutput.warRoom?.scenario_ranking.length ?? 0) >= 3);
    assert.ok((result.structuredOutput.warRoom?.scenario_adjustments.length ?? 0) >= 1);
    assert.ok((result.structuredOutput.warRoom?.executive_recommendations.length ?? 0) >= 3);
    assert.ok((result.structuredOutput.warRoom?.debate_transcript.length ?? 0) >= result.rounds.length);
    assert.ok(result.metaScenarioOutput.meta_scenarios.length >= 1);
    assert.ok(result.contextPackets.some((packet) => packet.title.includes('War Room')));
  });
});
