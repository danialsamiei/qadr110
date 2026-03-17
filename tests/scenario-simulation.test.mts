import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runScenarioSimulation } from '../src/ai/scenario-simulation.ts';
import { createPointMapContext } from '../src/platform/operations/map-context.ts';
import { createAssistantSessionContext } from '../src/services/ai-orchestrator/session.ts';

describe('scenario simulation', () => {
  it('builds branching futures, steps, and a decision graph from a hypothetical event', () => {
    const session = createAssistantSessionContext('sim-1');
    session.intentHistory = [
      {
        id: 'intent-1',
        query: 'اگر اختلال در مسیر انرژی منطقه‌ای رخ دهد',
        taskClass: 'scenario-analysis',
        createdAt: '2026-03-17T08:00:00.000Z',
        inferredIntent: 'simulation',
        complexity: 'complex',
      },
    ];
    const mapContext = createPointMapContext('map-sim-1', {
      lat: 26.566,
      lon: 56.25,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'تنگه هرمز',
    }, {
      activeLayers: ['gdelt', 'polymarket', 'ais', 'military'],
      nearbySignals: [
        { id: 'sig-1', label: 'اختلال کشتیرانی', kind: 'shipping', severity: 'high', occurredAt: '2026-03-17T08:10:00.000Z' },
        { id: 'sig-2', label: 'خوشه خبری GDELT', kind: 'news', occurredAt: '2026-03-17T08:12:00.000Z' },
      ],
      geopoliticalContext: ['منطقه در معرض فشار انرژی و محاسبه‌گری امنیتی است.'],
      selectedEntities: ['ایران', 'خلیج فارس', 'انرژی'],
      dataFreshness: { overallStatus: 'sufficient', coveragePercent: 81 },
    });

    const output = runScenarioSimulation({
      hypotheticalEvent: 'اگر تنگه هرمز برای ۷۲ ساعت مختل شود',
      trigger: 'اگر تنگه هرمز برای ۷۲ ساعت مختل شود',
      query: 'اگر تنگه هرمز برای ۷۲ ساعت مختل شود',
      mode: 'fast',
      mapContext,
      sessionContext: session,
      localContextPackets: [
        {
          id: 'pkt-1',
          title: 'Polymarket repricing',
          summary: 'Odds move toward shipping disruption',
          content: 'shipping disruption and energy stress',
          sourceLabel: 'Polymarket',
          sourceType: 'api',
          updatedAt: '2026-03-17T08:15:00.000Z',
          score: 0.72,
          tags: ['polymarket'],
          provenance: { sourceIds: ['src-1'], evidenceIds: ['ev-1'] },
        },
      ],
      availableTools: ['map_context', 'osint_fetch', 'web_search', 'scenario_engine', 'summarize_context'],
    });

    assert.ok(output.branches.length >= 3 && output.branches.length <= 5);
    assert.ok(output.branches.every((branch) => branch.steps.length >= 3 && branch.steps.length <= 5));
    assert.ok(output.branches.every((branch) => branch.tool_plan.length > 0));
    assert.ok(output.graph.nodes.length > output.branches.length);
    assert.ok(output.graph.edges.length >= output.branches.length);
    assert.ok(output.structuredOutput.simulation);
    assert.equal(output.structuredOutput.simulation?.branches.length, output.branches.length);
  });

  it('expands the tree and tool plan in deep mode with stronger escalation controls', () => {
    const fastOutput = runScenarioSimulation({
      hypotheticalEvent: 'اگر فشار اجتماعی و سایبری در تهران تشدید شود',
      trigger: 'اگر فشار اجتماعی و سایبری در تهران تشدید شود',
      query: 'اگر فشار اجتماعی و سایبری در تهران تشدید شود',
      mode: 'fast',
      localContextPackets: [],
      availableTools: ['map_context', 'osint_fetch', 'scenario_engine', 'summarize_context'],
    });

    const deepOutput = runScenarioSimulation({
      hypotheticalEvent: 'اگر فشار اجتماعی و سایبری در تهران تشدید شود',
      trigger: 'اگر فشار اجتماعی و سایبری در تهران تشدید شود',
      query: 'اگر فشار اجتماعی و سایبری در تهران تشدید شود',
      mode: 'deep',
      controls: {
        probabilityBias: 0.2,
        intensity: 0.9,
        actorBehavior: {
          coordination: false,
          escalationBias: true,
          marketSensitivity: true,
          informationDisorder: true,
        },
        constraints: {
          logisticsFragility: true,
          sanctionsPressure: true,
          diplomaticBackchannel: false,
          cyberPressure: true,
        },
      },
      localContextPackets: [],
      availableTools: ['map_context', 'osint_fetch', 'web_search', 'scenario_engine', 'summarize_context', 'prompt_optimizer', 'openrouter_call'],
    });

    assert.ok(deepOutput.branches[0]!.steps.length >= fastOutput.branches[0]!.steps.length);
    assert.ok(deepOutput.branches.some((branch) => branch.tool_plan.includes('openrouter_call')));
    assert.ok(deepOutput.graph.nodes.length >= fastOutput.graph.nodes.length);
    assert.equal(deepOutput.structuredOutput.simulation?.mode, 'deep');
  });
});
