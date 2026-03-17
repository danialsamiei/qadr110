import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { OrchestratorToolRegistry } from '../src/services/ai-orchestrator/plugins.ts';
import { QadrAiOrchestrator } from '../src/services/ai-orchestrator/orchestrator.ts';
import type { OrchestratorTool } from '../src/services/ai-orchestrator/plugins.ts';
import type { OrchestratorToolContext } from '../src/services/ai-orchestrator/types.ts';
import { createAssistantSessionContext } from '../src/services/ai-orchestrator/session.ts';

const jsonResponse = JSON.stringify({
  reportTitle: 'نمونه orchestrator',
  executiveSummary: 'خروجی JSON معتبر',
  observedFacts: { title: 'واقعیت', bullets: [], narrative: '', confidenceScore: 0.6 },
  analyticalInference: { title: 'تحلیل', bullets: [], narrative: '', confidenceScore: 0.55 },
  scenarios: [],
  uncertainties: { title: 'عدم‌قطعیت', bullets: [], narrative: '', confidenceScore: 0.4 },
  recommendations: { title: 'توصیه', bullets: [], narrative: '', confidenceScore: 0.5 },
  resilienceNarrative: { title: 'تاب‌آوری', bullets: [], narrative: '', confidenceScore: 0.5 },
  followUpSuggestions: ['گام بعدی'],
});

class StaticTool implements OrchestratorTool {
  constructor(public readonly name: OrchestratorTool['name'], private readonly data: Partial<ReturnType<OrchestratorTool['execute'] extends (...args: any[]) => Promise<infer T> ? () => T : never>>) {}

  async execute(_context: OrchestratorToolContext) {
    return {
      tool: this.name,
      ok: true,
      summary: this.name,
      warnings: [],
      sources: [],
      contextPackets: [],
      durationMs: 1,
      data: this.data as Record<string, unknown>,
    };
  }
}

describe('AI orchestrator runner', () => {
  it('retries through cloud escalation when the first completion is invalid', async () => {
    let completionCalls = 0;
    const registry = new OrchestratorToolRegistry([
      new StaticTool('summarize_context', { contextSummary: 'ctx' }),
      new StaticTool('prompt_optimizer', { optimizedPrompt: 'optimized' }),
      new StaticTool('openrouter_call', { content: jsonResponse, model: 'openrouter/test' }),
    ]);

    const orchestrator = new QadrAiOrchestrator(registry, {
      complete: async () => {
        completionCalls += 1;
        return {
          content: completionCalls === 1 ? 'not-json' : jsonResponse,
          provider: completionCalls === 1 ? 'ollama' : 'openrouter',
          model: completionCalls === 1 ? 'ollama/small' : 'openrouter/test',
          providerChain: ['ollama', 'openrouter'],
          routeClass: completionCalls === 1 ? 'fast-local' : 'cloud-escalation',
          warnings: [],
          attempts: 1,
          escalated: completionCalls > 1,
        };
      },
      parse: (content) => {
        try {
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      buildFallbackOutput: () => ({
        reportTitle: 'fallback',
        executiveSummary: 'fallback',
        observedFacts: { title: 'واقعیت', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        analyticalInference: { title: 'تحلیل', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        scenarios: [],
        uncertainties: { title: 'عدم‌قطعیت', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        recommendations: { title: 'توصیه', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        resilienceNarrative: { title: 'تاب‌آوری', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        followUpSuggestions: [],
      }),
    });

    const result = await orchestrator.run({
      conversationId: 'conv-runner',
      locale: 'fa-IR',
      domainMode: 'osint-digest',
      taskClass: 'assistant',
      query: 'یک خلاصه فارسی بده',
      messages: [],
      pinnedEvidence: [],
      localContextPackets: [],
      memoryNotes: [],
      promptText: '',
      sessionContext: createAssistantSessionContext('conv-runner'),
      evidenceCards: [],
      timeContext: '2026-03-17T00:00:00.000Z',
    });

    assert.equal(result.output.reportTitle, 'نمونه orchestrator');
    assert.ok(result.nodeTimeline.includes('retry-escalation'));
    assert.equal(result.completion.provider, 'openrouter');
    assert.equal(result.optimizedPrompt, 'optimized');
  });

  it('falls back to scenario engine structured output when llm json stays invalid', async () => {
    const scenarioStructured = {
      reportTitle: 'موتور سناریو',
      executiveSummary: 'خروجی ساخت‌یافته از موتور سناریو',
      observedFacts: { title: 'واقعیت', bullets: ['trigger'], narrative: 'trigger', confidence: { band: 'medium', score: 0.5, uncertainty: 0.5 } },
      analyticalInference: { title: 'تحلیل', bullets: ['multi-domain'], narrative: 'multi-domain', confidence: { band: 'medium', score: 0.54, uncertainty: 0.46 } },
      scenarios: [
        {
          id: 'scenario-1',
          title: 'سناریوی ۱',
          probability: 'medium',
          probability_score: 0.58,
          timeframe: 'چند روز',
          time_horizon: 'چند روز',
          description: 'شرح',
          indicators: ['indicator'],
          indicators_to_watch: ['indicator'],
          drivers: ['driver'],
          causal_chain: [
            { stage: 'event', summary: 'event', affected_domains: ['geopolitics'] },
            { stage: 'reaction', summary: 'reaction', affected_domains: ['economics'] },
            { stage: 'escalation', summary: 'escalation', affected_domains: ['infrastructure'] },
            { stage: 'outcome', summary: 'outcome', affected_domains: ['public_sentiment'] },
          ],
          mitigation_options: ['monitor'],
          impact_level: 'high',
          uncertainty_level: 'medium',
          confidence: { band: 'medium', score: 0.55, uncertainty: 0.45 },
        },
      ],
      uncertainties: { title: 'عدم‌قطعیت', bullets: [], narrative: '', confidence: { band: 'low', score: 0.3, uncertainty: 0.7 } },
      recommendations: { title: 'توصیه', bullets: ['monitor'], narrative: '', confidence: { band: 'medium', score: 0.5, uncertainty: 0.5 } },
      resilienceNarrative: { title: 'تاب‌آوری', bullets: ['resilience'], narrative: '', confidence: { band: 'medium', score: 0.5, uncertainty: 0.5 } },
      followUpSuggestions: ['follow-up'],
    };

    const registry = new OrchestratorToolRegistry([
      new StaticTool('scenario_engine', { structuredOutput: scenarioStructured }),
      new StaticTool('summarize_context', { contextSummary: 'ctx' }),
      new StaticTool('prompt_optimizer', { optimizedPrompt: 'optimized' }),
    ]);

    const orchestrator = new QadrAiOrchestrator(registry, {
      complete: async () => ({
        content: 'still-not-json',
        provider: 'ollama',
        model: 'ollama/small',
        providerChain: ['ollama'],
        routeClass: 'reasoning-local',
        warnings: [],
        attempts: 1,
        escalated: false,
      }),
      parse: () => null,
      buildFallbackOutput: () => ({
        reportTitle: 'fallback',
        executiveSummary: 'fallback',
        observedFacts: { title: 'واقعیت', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        analyticalInference: { title: 'تحلیل', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        scenarios: [],
        uncertainties: { title: 'عدم‌قطعیت', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        recommendations: { title: 'توصیه', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        resilienceNarrative: { title: 'تاب‌آوری', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        followUpSuggestions: [],
      }),
    });

    const result = await orchestrator.run({
      conversationId: 'conv-scenario',
      locale: 'fa-IR',
      domainMode: 'scenario-planning',
      taskClass: 'scenario-analysis',
      query: 'اگر تنگه هرمز بسته شود چه می‌شود؟',
      messages: [],
      pinnedEvidence: [],
      localContextPackets: [],
      memoryNotes: [],
      promptText: '',
      sessionContext: createAssistantSessionContext('conv-scenario'),
      evidenceCards: [],
      timeContext: '2026-03-17T00:00:00.000Z',
    });

    assert.equal(result.output.reportTitle, 'موتور سناریو');
    assert.equal(result.output.scenarios[0]?.causal_chain?.length, 4);
    assert.match(result.warnings.join(' '), /موتور سناریو/);
  });

  it('merges meta-scenario tool output into scenario fallback output', async () => {
    const scenarioStructured = {
      reportTitle: 'موتور سناریو',
      executiveSummary: 'خروجی ساخت‌یافته از موتور سناریو',
      observedFacts: { title: 'واقعیت', bullets: ['trigger'], narrative: 'trigger', confidence: { band: 'medium', score: 0.5, uncertainty: 0.5 } },
      analyticalInference: { title: 'تحلیل', bullets: ['multi-domain'], narrative: 'multi-domain', confidence: { band: 'medium', score: 0.54, uncertainty: 0.46 } },
      scenarios: [{
        id: 'scenario-1',
        title: 'سناریوی ۱',
        probability: 'medium',
        probability_score: 0.58,
        timeframe: 'چند روز',
        time_horizon: 'چند روز',
        description: 'شرح',
        indicators: ['indicator'],
        indicators_to_watch: ['indicator'],
        drivers: ['driver'],
        causal_chain: [
          { stage: 'event', summary: 'event', affected_domains: ['geopolitics'] },
          { stage: 'reaction', summary: 'reaction', affected_domains: ['economics'] },
          { stage: 'escalation', summary: 'escalation', affected_domains: ['infrastructure'] },
          { stage: 'outcome', summary: 'outcome', affected_domains: ['public_sentiment'] },
        ],
        mitigation_options: ['monitor'],
        impact_level: 'high',
        uncertainty_level: 'medium',
        confidence: { band: 'medium', score: 0.55, uncertainty: 0.45 },
      }],
      uncertainties: { title: 'عدم‌قطعیت', bullets: [], narrative: '', confidence: { band: 'low', score: 0.3, uncertainty: 0.7 } },
      recommendations: { title: 'توصیه', bullets: ['monitor'], narrative: '', confidence: { band: 'medium', score: 0.5, uncertainty: 0.5 } },
      resilienceNarrative: { title: 'تاب‌آوری', bullets: ['resilience'], narrative: '', confidence: { band: 'medium', score: 0.5, uncertainty: 0.5 } },
      followUpSuggestions: ['follow-up'],
    };
    const metaStructured = {
      ...scenarioStructured,
      reportTitle: 'موتور متا-سناریو',
      executiveSummary: 'لایه دوم سناریویی فعال شد.',
      metaScenario: {
        executive_summary: 'interactionهای مرتبه‌دوم شناسایی شد.',
        higher_order_insights: ['futureهای رقابتی باید جداگانه پایش شوند.'],
        meta_scenarios: [{
          id: 'meta-1',
          title: 'جنگ سناریویی',
          source_scenarios: ['scenario-1', 'scenario-2'],
          relationship_type: 'competing',
          summary: 'دو آینده برای plausibility رقابت می‌کنند.',
          combined_probability: 'medium',
          impact_level: 'high',
          uncertainty_level: 'medium',
          critical_dependencies: ['driver'],
          trigger_indicators: ['indicator'],
          watchpoints: ['indicator'],
          strategic_implications: ['winner می‌تواند تغییر کند.'],
          recommended_actions: ['winner را پایش کن'],
        }],
        scenario_conflicts: [{
          id: 'conflict-1',
          left_scenario_id: 'scenario-1',
          right_scenario_id: 'scenario-2',
          relationship_type: 'competing',
          interaction_strength: 0.65,
          direction: 'toward:scenario-1',
          summary: 'رقابت برای plausibility',
          probability_redistribution: { 'scenario-1': 0.57, 'scenario-2': 0.43 },
          decisive_indicators: ['indicator'],
        }],
        black_swan_candidates: [],
      },
      followUpSuggestions: ['meta-follow-up'],
    };

    const registry = new OrchestratorToolRegistry([
      new StaticTool('scenario_engine', { structuredOutput: scenarioStructured }),
      new StaticTool('meta_scenario_engine', { structuredOutput: metaStructured }),
      new StaticTool('summarize_context', { contextSummary: 'ctx' }),
      new StaticTool('prompt_optimizer', { optimizedPrompt: 'optimized' }),
    ]);

    const orchestrator = new QadrAiOrchestrator(registry, {
      complete: async () => ({
        content: 'still-not-json',
        provider: 'ollama',
        model: 'ollama/small',
        providerChain: ['ollama'],
        routeClass: 'reasoning-local',
        warnings: [],
        attempts: 1,
        escalated: false,
      }),
      parse: () => null,
      buildFallbackOutput: () => ({
        reportTitle: 'fallback',
        executiveSummary: 'fallback',
        observedFacts: { title: 'واقعیت', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        analyticalInference: { title: 'تحلیل', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        scenarios: [],
        uncertainties: { title: 'عدم‌قطعیت', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        recommendations: { title: 'توصیه', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        resilienceNarrative: { title: 'تاب‌آوری', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        followUpSuggestions: [],
      }),
    });

    const result = await orchestrator.run({
      conversationId: 'conv-meta',
      locale: 'fa-IR',
      domainMode: 'scenario-planning',
      taskClass: 'scenario-analysis',
      query: 'interaction و Black Swan را تحلیل کن',
      messages: [],
      pinnedEvidence: [],
      localContextPackets: [],
      memoryNotes: [],
      promptText: '',
      sessionContext: createAssistantSessionContext('conv-meta'),
      evidenceCards: [],
      timeContext: '2026-03-17T00:00:00.000Z',
    });

    assert.equal(result.output.reportTitle, 'موتور سناریو');
    assert.equal(result.output.metaScenario?.meta_scenarios.length, 1);
    assert.ok(result.output.followUpSuggestions.includes('meta-follow-up'));
    assert.match(result.warnings.join(' '), /متا-سناریو/);
  });

  it('falls back to scenario simulation structured output when simulation is the richer tool result', async () => {
    const simulationStructured = {
      reportTitle: 'شبیه‌ساز تعاملی',
      executiveSummary: 'خروجی ساخت‌یافته از شبیه‌ساز سناریو',
      observedFacts: { title: 'واقعیت', bullets: ['trigger'], narrative: 'trigger', confidence: { band: 'medium', score: 0.5, uncertainty: 0.5 } },
      analyticalInference: { title: 'تحلیل', bullets: ['branching'], narrative: 'branching', confidence: { band: 'medium', score: 0.58, uncertainty: 0.42 } },
      scenarios: [],
      simulation: {
        title: 'Decision tree',
        event: 'اگر تنگه هرمز بسته شود',
        mode: 'deep',
        compare_summary: 'شاخه اول از نظر اثر و احتمال جلوتر است.',
        controls_summary: ['مد اجرا: عمیق'],
        branches: [
          {
            id: 'branch-1',
            title: 'شاخه اول',
            description: 'شرح',
            probability: 'high',
            probability_score: 0.71,
            impact_level: 'high',
            impact_score: 0.78,
            uncertainty_level: 'medium',
            time_horizon: 'چند روز',
            local_risks: ['اختلال محلی'],
            regional_spillovers: ['سرریز منطقه‌ای'],
            global_ripple_effects: ['اثر جهانی'],
            controls_summary: ['مد اجرا: عمیق'],
            tool_plan: ['scenario_engine'],
            steps: [
              {
                id: 'step-1',
                title: 'گام ۱',
                stage: 'event',
                summary: 'رویداد آغازین',
                probability_score: 0.68,
                impact_score: 0.7,
                uncertainty_level: 'medium',
                indicators_to_watch: ['indicator'],
                tool_calls: ['scenario_engine'],
              },
            ],
          },
        ],
        graph: {
          nodes: [
            { id: 'root', label: 'root', kind: 'root' },
            { id: 'branch-1', label: 'شاخه اول', kind: 'branch', branch_id: 'branch-1' },
          ],
          edges: [
            { from: 'root', to: 'branch-1', label: 'احتمال ۷۱٪' },
          ],
        },
      },
      uncertainties: { title: 'عدم‌قطعیت', bullets: [], narrative: '', confidence: { band: 'low', score: 0.3, uncertainty: 0.7 } },
      recommendations: { title: 'توصیه', bullets: ['monitor'], narrative: '', confidence: { band: 'medium', score: 0.5, uncertainty: 0.5 } },
      resilienceNarrative: { title: 'تاب‌آوری', bullets: ['resilience'], narrative: '', confidence: { band: 'medium', score: 0.5, uncertainty: 0.5 } },
      followUpSuggestions: ['follow-up'],
    };

    const registry = new OrchestratorToolRegistry([
      new StaticTool('scenario_simulation', { structuredOutput: simulationStructured }),
      new StaticTool('summarize_context', { contextSummary: 'ctx' }),
      new StaticTool('prompt_optimizer', { optimizedPrompt: 'optimized' }),
    ]);

    const orchestrator = new QadrAiOrchestrator(registry, {
      complete: async () => ({
        content: 'still-not-json',
        provider: 'ollama',
        model: 'ollama/small',
        providerChain: ['ollama'],
        routeClass: 'reasoning-local',
        warnings: [],
        attempts: 1,
        escalated: false,
      }),
      parse: () => null,
      buildFallbackOutput: () => ({
        reportTitle: 'fallback',
        executiveSummary: 'fallback',
        observedFacts: { title: 'واقعیت', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        analyticalInference: { title: 'تحلیل', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        scenarios: [],
        uncertainties: { title: 'عدم‌قطعیت', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        recommendations: { title: 'توصیه', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        resilienceNarrative: { title: 'تاب‌آوری', bullets: [], narrative: '', confidence: { band: 'low', score: 0.2, uncertainty: 0.8 } },
        followUpSuggestions: [],
      }),
    });

    const result = await orchestrator.run({
      conversationId: 'conv-simulation',
      locale: 'fa-IR',
      domainMode: 'scenario-planning',
      taskClass: 'scenario-analysis',
      query: 'اگر از این نقطه درگیری گسترش یابد یک decision tree بساز',
      messages: [],
      pinnedEvidence: [],
      localContextPackets: [],
      memoryNotes: [],
      promptText: '',
      sessionContext: createAssistantSessionContext('conv-simulation'),
      evidenceCards: [],
      timeContext: '2026-03-17T00:00:00.000Z',
    });

    assert.equal(result.output.reportTitle, 'شبیه‌ساز تعاملی');
    assert.equal(result.output.simulation?.branches.length, 1);
    assert.match(result.warnings.join(' '), /شبیه‌ساز سناریو/);
  });
});
