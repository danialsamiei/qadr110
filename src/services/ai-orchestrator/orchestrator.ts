import type { AssistantStructuredOutput } from '@/platform/ai/assistant-contracts';
import type { OrchestratorToolSpec } from '@/platform/ai/orchestrator-contracts';

import { buildOrchestratorPlan } from './gateway';
import { OrchestratorToolRegistry } from './plugins';
import {
  composeOrchestratorSystemPrompt,
  composeOrchestratorUserPrompt,
} from './prompt-strategy';
import { buildAssistantSessionContextFromRequest } from './session';
import type {
  OrchestratorRunResult,
  OrchestratorRunnerDependencies,
  OrchestratorToolContext,
  OrchestratorToolResult,
} from './types';

function mergeWarnings(...warningGroups: Array<string[] | undefined>): string[] {
  return Array.from(new Set(warningGroups.flatMap((items) => items ?? []).filter(Boolean)));
}

function aggregateContextSummary(toolResults: OrchestratorToolResult[]): string {
  return toolResults
    .filter((result) => result.ok && result.summary.trim())
    .map((result) => `[${result.tool}] ${result.summary}`)
    .join('\n\n');
}

function collectAdditionalPackets(toolResults: OrchestratorToolResult[]) {
  return toolResults.flatMap((result) => result.contextPackets ?? []);
}

function pickOptimizedPrompt(toolResults: OrchestratorToolResult[], fallbackPrompt: string): string {
  const optimized = toolResults.find((result) => result.tool === 'prompt_optimizer' && result.ok)
    ?.data?.optimizedPrompt;
  return typeof optimized === 'string' && optimized.trim() ? optimized : fallbackPrompt;
}

function pickScenarioStructuredOutput(toolResults: OrchestratorToolResult[]): AssistantStructuredOutput | null {
  const scenarioOutput = toolResults.find((result) => result.tool === 'scenario_engine' && result.ok)
    ?.data?.structuredOutput;
  return scenarioOutput && typeof scenarioOutput === 'object'
    ? scenarioOutput as AssistantStructuredOutput
    : null;
}

function pickStrategicForesightStructuredOutput(toolResults: OrchestratorToolResult[]): AssistantStructuredOutput | null {
  const output = toolResults.find((result) => result.tool === 'strategic_foresight' && result.ok)
    ?.data?.structuredOutput;
  return output && typeof output === 'object'
    ? output as AssistantStructuredOutput
    : null;
}

function pickSimulationStructuredOutput(toolResults: OrchestratorToolResult[]): AssistantStructuredOutput | null {
  const simulationOutput = toolResults.find((result) => result.tool === 'scenario_simulation' && result.ok)
    ?.data?.structuredOutput;
  return simulationOutput && typeof simulationOutput === 'object'
    ? simulationOutput as AssistantStructuredOutput
    : null;
}

function pickMetaStructuredOutput(toolResults: OrchestratorToolResult[]): AssistantStructuredOutput | null {
  const metaOutput = toolResults.find((result) => result.tool === 'meta_scenario_engine' && result.ok)
    ?.data?.structuredOutput;
  return metaOutput && typeof metaOutput === 'object'
    ? metaOutput as AssistantStructuredOutput
    : null;
}

function pickBlackSwanStructuredOutput(toolResults: OrchestratorToolResult[]): AssistantStructuredOutput | null {
  const output = toolResults.find((result) => result.tool === 'detect_black_swans' && result.ok)
    ?.data?.structuredOutput;
  return output && typeof output === 'object'
    ? output as AssistantStructuredOutput
    : null;
}

function pickWarRoomStructuredOutput(toolResults: OrchestratorToolResult[]): AssistantStructuredOutput | null {
  const output = toolResults.find((result) => (result.tool === 'run_war_room' || result.tool === 'war_room_on_scenarios') && result.ok)
    ?.data?.structuredOutput;
  return output && typeof output === 'object'
    ? output as AssistantStructuredOutput
    : null;
}

function mergeStructuredOutputs(
  baseOutput: AssistantStructuredOutput,
  strategicForesightOutput: AssistantStructuredOutput | null,
  scenarioOutput: AssistantStructuredOutput | null,
  metaOutput: AssistantStructuredOutput | null,
  simulationOutput: AssistantStructuredOutput | null,
  blackSwanOutput: AssistantStructuredOutput | null,
  warRoomOutput: AssistantStructuredOutput | null,
): AssistantStructuredOutput {
  if (!strategicForesightOutput && !scenarioOutput && !metaOutput && !simulationOutput && !blackSwanOutput && !warRoomOutput) return baseOutput;
  const toolOutput = strategicForesightOutput ?? warRoomOutput ?? simulationOutput ?? metaOutput ?? blackSwanOutput ?? scenarioOutput;
  const scenarioFallback = strategicForesightOutput ?? warRoomOutput ?? scenarioOutput ?? metaOutput ?? blackSwanOutput ?? simulationOutput;
  const fallbackScenarios = scenarioFallback?.scenarios ?? [];
  const mergedScenarios = (baseOutput.scenarios.length > 0 ? baseOutput.scenarios : fallbackScenarios)
    .map((scenario, index) => ({
      ...(scenarioFallback?.scenarios[index] ?? {}),
      ...scenario,
      indicators: scenario.indicators?.length ? scenario.indicators : (fallbackScenarios[index]?.indicators ?? []),
      indicators_to_watch: scenario.indicators_to_watch?.length
        ? scenario.indicators_to_watch
        : (fallbackScenarios[index]?.indicators_to_watch ?? scenario.indicators ?? []),
      drivers: scenario.drivers?.length ? scenario.drivers : (fallbackScenarios[index]?.drivers ?? []),
      causal_chain: scenario.causal_chain?.length ? scenario.causal_chain : (fallbackScenarios[index]?.causal_chain ?? []),
      mitigation_options: scenario.mitigation_options?.length
        ? scenario.mitigation_options
        : (fallbackScenarios[index]?.mitigation_options ?? []),
      second_order_effects: scenario.second_order_effects?.length
        ? scenario.second_order_effects
        : (fallbackScenarios[index]?.second_order_effects ?? []),
      cross_domain_impacts: scenario.cross_domain_impacts && Object.keys(scenario.cross_domain_impacts).length > 0
        ? scenario.cross_domain_impacts
        : fallbackScenarios[index]?.cross_domain_impacts,
    }));

  return {
    ...(scenarioOutput ?? {}),
    ...(toolOutput ?? {}),
    ...baseOutput,
    scenarios: mergedScenarios,
    simulation: baseOutput.simulation ?? simulationOutput?.simulation ?? scenarioOutput?.simulation,
    metaScenario: baseOutput.metaScenario ?? strategicForesightOutput?.metaScenario ?? metaOutput?.metaScenario ?? blackSwanOutput?.metaScenario ?? scenarioOutput?.metaScenario ?? simulationOutput?.metaScenario,
    warRoom: baseOutput.warRoom ?? strategicForesightOutput?.warRoom ?? warRoomOutput?.warRoom,
    followUpSuggestions: Array.from(new Set([
      ...baseOutput.followUpSuggestions,
      ...(strategicForesightOutput?.followUpSuggestions ?? []),
      ...(scenarioOutput?.followUpSuggestions ?? []),
      ...(metaOutput?.followUpSuggestions ?? []),
      ...(simulationOutput?.followUpSuggestions ?? []),
      ...(blackSwanOutput?.followUpSuggestions ?? []),
      ...(warRoomOutput?.followUpSuggestions ?? []),
    ])).slice(0, 6),
  };
}

async function runToolSpec(
  registry: OrchestratorToolRegistry,
  spec: OrchestratorToolSpec,
  baseContext: OrchestratorToolContext,
): Promise<OrchestratorToolResult> {
  const chain = [spec.name, ...(spec.fallbackTools ?? [])];
  const warnings: string[] = [];

  for (const toolName of chain) {
    try {
      const result = await registry.get(toolName).execute(baseContext);
      if (toolName !== spec.name && result.ok) {
        return {
          ...result,
          warnings: [...result.warnings, `ابزار fallback به‌جای ${spec.name} اجرا شد: ${toolName}`],
        };
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${toolName}: ${message}`);
    }
  }

  return {
    tool: spec.name,
    ok: false,
    summary: '',
    warnings,
    sources: [],
    contextPackets: [],
    durationMs: 0,
  };
}

export class QadrAiOrchestrator {
  constructor(
    private readonly tools: OrchestratorToolRegistry,
    private readonly deps: OrchestratorRunnerDependencies,
  ) {}

  async run(input: OrchestratorToolContext['request'] & {
    evidenceCards: OrchestratorToolContext['evidenceCards'];
    timeContext: string;
  }): Promise<OrchestratorRunResult> {
    const request = {
      ...input,
      sessionContext: input.sessionContext,
    };
    const sessionContext = buildAssistantSessionContextFromRequest(request);
    const plan = buildOrchestratorPlan(request, sessionContext);
    const nodeTimeline: OrchestratorRunResult['nodeTimeline'] = ['planning', 'tool-selection'];

    const toolResults: OrchestratorToolResult[] = [];
    nodeTimeline.push('execution');

    for (const spec of plan.toolPlan.filter((item) => item.phase === 'execution')) {
      const result = await runToolSpec(this.tools, spec, {
        request,
        sessionContext,
        evidenceCards: input.evidenceCards,
        toolResults,
        timeContext: input.timeContext,
        plan,
      });
      toolResults.push(result);
    }

    const contextSummary = aggregateContextSummary(toolResults);
    const optimizedPrompt = pickOptimizedPrompt(toolResults, request.promptText || request.query);
    const strategicForesightStructuredOutput = pickStrategicForesightStructuredOutput(toolResults);
    const scenarioStructuredOutput = pickScenarioStructuredOutput(toolResults);
    const metaStructuredOutput = pickMetaStructuredOutput(toolResults);
    const simulationStructuredOutput = pickSimulationStructuredOutput(toolResults);
    const blackSwanStructuredOutput = pickBlackSwanStructuredOutput(toolResults);
    const warRoomStructuredOutput = pickWarRoomStructuredOutput(toolResults);
    const systemPrompt = composeOrchestratorSystemPrompt({
      request,
      timeContext: input.timeContext,
      plan,
      sessionContext,
    });
    const userPrompt = composeOrchestratorUserPrompt({
      request,
      sessionContext,
      contextSummary,
      optimizedPrompt,
      timeContext: input.timeContext,
    });

    nodeTimeline.push('reflection');
    let completion = await this.deps.complete({
      routeClass: plan.routeClass,
      taskClass: request.taskClass,
      systemPrompt,
      userPrompt,
      validate: (content) => Boolean(this.deps.parse(content)),
    });

    let output = completion.content ? this.deps.parse(completion.content) : null;

    if (!output) {
      nodeTimeline.push('retry-escalation');
      const retryTool = plan.toolPlan.find((item) => item.phase === 'retry' && item.name === 'openrouter_call');
      if (retryTool) {
        const retryResult = await runToolSpec(this.tools, retryTool, {
          request,
          sessionContext,
          evidenceCards: input.evidenceCards,
          toolResults,
          timeContext: input.timeContext,
          plan,
          systemPrompt,
          userPrompt,
        });
        toolResults.push(retryResult);
        const retryContent = typeof retryResult.data?.content === 'string'
          ? retryResult.data.content
          : null;
        output = retryContent ? this.deps.parse(retryContent) : null;
        if (retryContent) {
          completion = {
            content: retryContent,
            provider: 'openrouter',
            model: String(retryResult.data?.model || 'openrouter'),
            providerChain: ['openrouter'],
            routeClass: 'cloud-escalation',
            warnings: retryResult.warnings,
            attempts: 1,
            escalated: true,
          };
        }
      }

      if (!output) {
        completion = await this.deps.complete({
          routeClass: 'cloud-escalation',
          taskClass: request.taskClass,
          systemPrompt,
          userPrompt,
          validate: (content) => Boolean(this.deps.parse(content)),
        });
        output = completion.content ? this.deps.parse(completion.content) : null;
      }
    }

    const additionalPackets = collectAdditionalPackets(toolResults);
    const evidenceCards = input.evidenceCards;
    const finalOutput = output
      ? mergeStructuredOutputs(output, strategicForesightStructuredOutput, scenarioStructuredOutput, metaStructuredOutput, simulationStructuredOutput, blackSwanStructuredOutput, warRoomStructuredOutput)
      : strategicForesightStructuredOutput
        ? mergeStructuredOutputs(strategicForesightStructuredOutput, strategicForesightStructuredOutput, scenarioStructuredOutput, metaStructuredOutput, simulationStructuredOutput, blackSwanStructuredOutput, warRoomStructuredOutput)
        : warRoomStructuredOutput
        ? mergeStructuredOutputs(warRoomStructuredOutput, strategicForesightStructuredOutput, scenarioStructuredOutput, metaStructuredOutput, simulationStructuredOutput, blackSwanStructuredOutput, warRoomStructuredOutput)
        : simulationStructuredOutput
        ? mergeStructuredOutputs(simulationStructuredOutput, strategicForesightStructuredOutput, scenarioStructuredOutput, metaStructuredOutput, simulationStructuredOutput, blackSwanStructuredOutput, warRoomStructuredOutput)
        : (scenarioStructuredOutput && (metaStructuredOutput || blackSwanStructuredOutput || warRoomStructuredOutput)
          ? mergeStructuredOutputs(scenarioStructuredOutput, strategicForesightStructuredOutput, scenarioStructuredOutput, metaStructuredOutput, null, blackSwanStructuredOutput, warRoomStructuredOutput)
          : null)
        || strategicForesightStructuredOutput
        || warRoomStructuredOutput
        || metaStructuredOutput
        || blackSwanStructuredOutput
        || scenarioStructuredOutput
        || this.deps.buildFallbackOutput(request, evidenceCards);
    const warnings = mergeWarnings(
      toolResults.flatMap((result) => result.warnings),
      completion.warnings,
      output
        ? []
        : strategicForesightStructuredOutput
          ? ['مسیر مولد JSON معتبر نداشت و خروجی ساخت‌یافته حالت پیش‌نگری راهبردی استفاده شد.']
        : simulationStructuredOutput
          ? ['مسیر مولد JSON معتبر نداشت و خروجی ساخت‌یافته شبیه‌ساز سناریو استفاده شد.']
          : warRoomStructuredOutput
            ? ['مسیر مولد JSON معتبر نداشت و خروجی ساخت‌یافته اتاق چندعاملی استفاده شد.']
          : metaStructuredOutput && scenarioStructuredOutput
            ? ['مسیر مولد JSON معتبر نداشت و خروجی ساخت‌یافته سناریو با لایه متا-سناریو استفاده شد.']
          : blackSwanStructuredOutput
            ? ['مسیر مولد JSON معتبر نداشت و خروجی ساخت‌یافته موتور قوی سیاه استفاده شد.']
          : metaStructuredOutput
            ? ['مسیر مولد JSON معتبر نداشت و خروجی ساخت‌یافته متا-سناریو استفاده شد.']
          : scenarioStructuredOutput
          ? ['مسیر مولد JSON معتبر نداشت و خروجی ساخت‌یافته موتور سناریو استفاده شد.']
          : ['مسیر مولد JSON معتبر نداشت و fallback evidence-first اجرا شد.'],
    );

    return {
      output: finalOutput,
      sessionContext,
      plan,
      nodeTimeline,
      toolResults,
      additionalContextPackets: additionalPackets,
      optimizedPrompt,
      contextSummary,
      completion,
      warnings,
    };
  }
}
