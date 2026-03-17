import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildWarRoomDisagreementMatrix,
  createWarRoomDebateState,
  evaluateWarRoomQuality,
  recordWarRoomRound,
  resolveWarRoomControls,
  selectWarRoomAgents,
  transitionWarRoomState,
} from '../src/ai/war-room/index.ts';
import type { AssistantWarRoomAgent, AssistantWarRoomRound } from '../src/platform/ai/assistant-contracts.ts';

describe('war room debate state', () => {
  it('supports fast/deep controls and explicit include/exclude agent selection', () => {
    const fastControls = resolveWarRoomControls({ mode: 'fast', challengeIterations: 3 });
    const deepControls = resolveWarRoomControls({
      mode: 'deep',
      challengeIterations: 3,
      includedAgentIds: ['strategic-analyst', 'skeptic-red-team', 'executive-synthesizer'],
      excludedAgentIds: ['skeptic-red-team'],
    });

    assert.equal(fastControls.challengeIterations, 1);
    assert.equal(selectWarRoomAgents(fastControls).length, 6);
    assert.deepEqual(selectWarRoomAgents(deepControls).map((agent) => agent.id), ['strategic-analyst', 'executive-synthesizer']);
  });

  it('records rounds, replay trace, disagreement matrix, and quality controls', () => {
    const agents: AssistantWarRoomAgent[] = [
      {
        id: 'strategic-analyst',
        role: 'تحلیل‌گر راهبردی',
        label: 'Strategic Analyst',
        role_prompt: 'assessment prompt',
        position: 'سناریوی غالب همچنان انرژی‌محور است.',
        revised_position: 'پس از challenge، مسیر انرژی و spillover منطقه‌ای همچنان مهم است.',
        confidence_score: 0.66,
        confidence_note: 'test',
        supporting_points: ['قیمت نفت', 'ترافیک دریایی'],
        watchpoints: ['قیمت نفت', 'بیمه حمل'],
        assumptions: ['بازار به‌طور کامل قفل نمی‌شود'],
        critiques: [{
          target_agent_id: 'economic-analyst',
          summary: 'تحلیل اقتصادی timing شوک را کم‌برآورد کرده است.',
          marker: 'challenge',
        }],
      },
      {
        id: 'economic-analyst',
        role: 'تحلیل‌گر اقتصادی',
        label: 'Economic Analyst',
        role_prompt: 'assessment prompt',
        position: 'شوک هزینه و throughput باید در مرکز تحلیل بماند.',
        revised_position: 'پس از challenge، trade-off کوتاه‌مدت و بیمه حمل برجسته‌تر شد.',
        confidence_score: 0.64,
        confidence_note: 'test',
        supporting_points: ['throughput', 'بیمه'],
        watchpoints: ['throughput', 'قیمت نفت'],
        assumptions: ['بیمه حمل کاملا قطع نمی‌شود'],
        critiques: [{
          target_agent_id: 'strategic-analyst',
          summary: 'تحلیل راهبردی shock قیمت و هزینه حمل را کم دیده است.',
          marker: 'challenge',
        }],
      },
    ];

    const controls = resolveWarRoomControls({ mode: 'deep', challengeIterations: 2 });
    let state = createWarRoomDebateState({
      question: 'اگر shock انرژی تشدید شود چه رخ می‌دهد؟',
      anchorLabel: 'تنگه هرمز',
      controls,
      agents,
      startedAt: '2026-03-17T10:00:00.000Z',
    });

    const rounds: AssistantWarRoomRound[] = [
      {
        id: 'round-1',
        title: 'assessment',
        stage: 'assessment',
        summary: 'assessment',
        entries: agents.map((agent) => ({
          agent_id: agent.id,
          label: agent.label,
          content: agent.position,
          target_agent_ids: [],
          markers: ['support'],
        })),
      },
      {
        id: 'round-2',
        title: 'critique',
        stage: 'critique',
        summary: 'critique',
        entries: agents.map((agent) => ({
          agent_id: agent.id,
          label: agent.label,
          content: agent.critiques[0]!.summary,
          target_agent_ids: [agent.critiques[0]!.target_agent_id],
          markers: ['challenge'],
        })),
      },
    ];

    rounds.forEach((round, index) => {
      state = recordWarRoomRound(state, round, {
        roundIndex: index + 1,
        promptByAgentId: Object.fromEntries(agents.map((agent) => [agent.id, agent.role_prompt])),
        evidenceByAgentId: Object.fromEntries(agents.map((agent) => [agent.id, agent.supporting_points])),
      });
    });
    state = transitionWarRoomState(state, {
      toStage: 'completed',
      roundIndex: 3,
      summary: 'completed',
    });

    const matrix = buildWarRoomDisagreementMatrix(agents, state.transcript);
    const quality = evaluateWarRoomQuality({
      agents,
      transcript: state.transcript,
      disagreementsCount: 2,
      convergencesCount: 1,
    });

    assert.equal(state.rounds.length, 2);
    assert.equal(state.currentStage, 'completed');
    assert.ok(state.transcript.length >= 4);
    assert.ok(state.replayTrace.some((item) => item.to_stage === 'assessment'));
    assert.ok(state.replayTrace.some((item) => item.to_stage === 'critique'));
    assert.ok(state.replayTrace.some((item) => item.to_stage === 'completed'));
    assert.equal(matrix.length, 2);
    assert.ok(matrix[0]!.cells[0]!.disagreement_score > 0);
    assert.equal(quality.repetitive_debate, false);
    assert.ok(quality.evidence_backed_disagreement_ratio > 0);
  });
});
