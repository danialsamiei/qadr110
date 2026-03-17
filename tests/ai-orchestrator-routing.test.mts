import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPointMapContext } from '../src/platform/operations/map-context.ts';
import { buildOrchestratorPlan, resolveProviderChain, routeClassToRoutingHint } from '../src/services/ai-orchestrator/gateway.ts';
import { createAssistantSessionContext } from '../src/services/ai-orchestrator/session.ts';

describe('AI orchestrator routing', () => {
  it('keeps structured tasks on the structured-json route', () => {
    const plan = buildOrchestratorPlan({
      conversationId: 'conv-1',
      locale: 'fa-IR',
      domainMode: 'osint-digest',
      taskClass: 'structured-json',
      query: 'خروجی را به JSON ساخت‌یافته تبدیل کن',
      messages: [],
      pinnedEvidence: [],
      localContextPackets: [],
      memoryNotes: [],
      promptText: '',
    }, createAssistantSessionContext('conv-1'));

    assert.equal(plan.routeClass, 'structured-json');
    assert.equal(routeClassToRoutingHint(plan.routeClass), 'structured');
    assert.deepEqual(plan.toolPlan.map((item) => item.name).slice(-2), ['summarize_context', 'prompt_optimizer']);
  });

  it('uses local-first reasoning with map context and cloud escalation only for deeper sessions', () => {
    const session = createAssistantSessionContext('conv-2');
    session.reusableInsights = [
      { id: 'i1', query: 'q1', summary: 's1', createdAt: new Date().toISOString(), evidenceCardIds: [], relevanceTags: [] },
      { id: 'i2', query: 'q2', summary: 's2', createdAt: new Date().toISOString(), evidenceCardIds: [], relevanceTags: [] },
      { id: 'i3', query: 'q3', summary: 's3', createdAt: new Date().toISOString(), evidenceCardIds: [], relevanceTags: [] },
    ];

    const mapContext = createPointMapContext('map-1', {
      lat: 35.6892,
      lon: 51.389,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'تهران',
    }, {
      activeLayers: ['news', 'roadTraffic'],
      viewport: { zoom: 8, view: 'map' },
    });

    const plan = buildOrchestratorPlan({
      conversationId: 'conv-2',
      locale: 'fa-IR',
      domainMode: 'scenario-planning',
      taskClass: 'scenario-analysis',
      query: 'برای این نقطه تحلیل عمیق cascade و سناریوی ۷ روزه بساز',
      messages: [],
      mapContext,
      pinnedEvidence: [],
      localContextPackets: [],
      memoryNotes: [],
      promptText: '',
    }, session);

    assert.equal(plan.routeClass, 'cloud-escalation');
    assert.ok(plan.toolPlan.some((item) => item.name === 'map_context'));
    assert.ok(plan.toolPlan.some((item) => item.name === 'scenario_engine'));
    assert.ok(plan.toolPlan.some((item) => item.name === 'meta_scenario_engine'));
    assert.ok(plan.toolPlan.some((item) => item.name === 'openrouter_call' && item.phase === 'retry'));
    assert.equal(resolveProviderChain('scenario-analysis', plan.routeClass)[0], 'openrouter');
  });

  it('adds scenario simulation tooling for what-if and branching queries', () => {
    const plan = buildOrchestratorPlan({
      conversationId: 'conv-3',
      locale: 'fa-IR',
      domainMode: 'scenario-planning',
      taskClass: 'scenario-analysis',
      query: 'اگر از این نقطه درگیری گسترش پیدا کند یک decision tree و branch simulation بساز',
      messages: [],
      pinnedEvidence: [],
      localContextPackets: [],
      memoryNotes: [],
      promptText: '',
    }, createAssistantSessionContext('conv-3'));

    assert.ok(plan.toolPlan.some((item) => item.name === 'scenario_engine'));
    assert.ok(plan.toolPlan.some((item) => item.name === 'meta_scenario_engine'));
    assert.ok(plan.toolPlan.some((item) => item.name === 'scenario_simulation'));
  });

  it('routes black swan and assumption-stress queries into the dedicated detection tool', () => {
    const plan = buildOrchestratorPlan({
      conversationId: 'conv-4',
      locale: 'fa-IR',
      domainMode: 'scenario-planning',
      taskClass: 'scenario-analysis',
      query: 'قوی سیاه این محدوده و شکست فرض‌های baseline را تحلیل کن',
      messages: [],
      pinnedEvidence: [],
      localContextPackets: [],
      memoryNotes: [],
      promptText: '',
    }, createAssistantSessionContext('conv-4'));

    assert.ok(plan.toolPlan.some((item) => item.name === 'scenario_engine'));
    assert.ok(plan.toolPlan.some((item) => item.name === 'detect_black_swans'));
  });

  it('routes multi-agent debate queries into the war room toolchain', () => {
    const mapContext = createPointMapContext('map-5', {
      lat: 29.3759,
      lon: 47.9774,
      countryCode: 'KW',
      countryName: 'کویت',
      label: 'شمال خلیج فارس',
    }, {
      activeLayers: ['gdelt', 'polymarket'],
      viewport: { zoom: 6, view: 'map' },
    });

    const plan = buildOrchestratorPlan({
      conversationId: 'conv-5',
      locale: 'fa-IR',
      domainMode: 'scenario-planning',
      taskClass: 'scenario-analysis',
      query: 'یک war room چندعاملی بساز و عامل‌ها درباره تشدید منطقه‌ای این محدوده با هم مناظره کنند',
      messages: [],
      mapContext,
      pinnedEvidence: [],
      localContextPackets: [],
      memoryNotes: [],
      promptText: '',
    }, createAssistantSessionContext('conv-5'));

    assert.ok(plan.toolPlan.some((item) => item.name === 'map_context'));
    assert.ok(plan.toolPlan.some((item) => item.name === 'scenario_engine'));
    assert.ok(plan.toolPlan.some((item) => item.name === 'meta_scenario_engine'));
    assert.ok(plan.toolPlan.some((item) => item.name === 'run_war_room'));
  });

  it('routes scenario-dominance and black-swan challenge queries into the scenario-linked war room tool', () => {
    const plan = buildOrchestratorPlan({
      conversationId: 'conv-6',
      locale: 'fa-IR',
      domainMode: 'scenario-planning',
      taskClass: 'scenario-analysis',
      query: 'کدام سناریو بیش برآورد شده، کدام سناریو کم برآورد شده و چه قوی سیاهی نگاه غالب را تهدید می‌کند؟',
      messages: [],
      pinnedEvidence: [],
      localContextPackets: [],
      memoryNotes: [],
      promptText: '',
    }, createAssistantSessionContext('conv-6'));

    assert.ok(plan.toolPlan.some((item) => item.name === 'scenario_engine'));
    assert.ok(plan.toolPlan.some((item) => item.name === 'meta_scenario_engine'));
    assert.ok(plan.toolPlan.some((item) => item.name === 'war_room_on_scenarios'));
  });

  it('routes strategic foresight queries into the integrated foresight toolchain', () => {
    const mapContext = createPointMapContext('map-7', {
      lat: 35.6892,
      lon: 51.389,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'تهران',
    }, {
      activeLayers: ['gdelt', 'polymarket', 'roadTraffic'],
      viewport: { zoom: 8, view: 'map' },
      nearbySignals: [
        { id: 'sig-1', kind: 'outage', label: 'اختلال محلی', severity: 'medium' },
      ],
    });

    const plan = buildOrchestratorPlan({
      conversationId: 'conv-7',
      locale: 'fa-IR',
      domainMode: 'strategic-foresight',
      taskClass: 'report-generation',
      query: 'برای این منطقه یک strategic foresight board-ready بساز و آینده‌های رقیب را توضیح بده',
      messages: [],
      mapContext,
      pinnedEvidence: [],
      localContextPackets: [],
      memoryNotes: [],
      promptText: '',
    }, createAssistantSessionContext('conv-7'));

    assert.ok(plan.toolPlan.some((item) => item.name === 'scenario_engine'));
    assert.ok(plan.toolPlan.some((item) => item.name === 'meta_scenario_engine'));
    assert.ok(plan.toolPlan.some((item) => item.name === 'detect_black_swans'));
    assert.ok(plan.toolPlan.some((item) => item.name === 'strategic_foresight'));
  });
});
