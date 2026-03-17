import type {
  AssistantContextPacket,
  AssistantEvidenceCard,
  AssistantRunRequest,
  AssistantStructuredOutput,
} from '../../../../src/platform/ai/assistant-contracts';
import type {
  OrchestratorNodeName,
  OrchestratorRouteClass,
  OrchestratorToolName,
} from '../../../../src/platform/ai/orchestrator-contracts';
import { QadrAiOrchestrator } from '../../../../src/services/ai-orchestrator/orchestrator';
import {
  resolveProviderChain,
  routeClassToRoutingHint,
} from '../../../../src/services/ai-orchestrator/gateway';
import { callLlm } from '../../../_shared/llm';

import { createServerOrchestratorToolRegistry } from './orchestrator-tools';

export async function runAssistantOrchestrator(input: {
  request: AssistantRunRequest;
  evidenceCards: AssistantEvidenceCard[];
  timeContext: string;
  parse(content: string): AssistantStructuredOutput | null;
  buildFallbackOutput(
    request: AssistantRunRequest,
    evidenceCards: AssistantEvidenceCard[],
  ): AssistantStructuredOutput;
}): Promise<{
  output: AssistantStructuredOutput;
  provider: string;
  model: string;
  routeClass: OrchestratorRouteClass;
  nodeTimeline: OrchestratorNodeName[];
  toolPlan: OrchestratorToolName[];
  sessionReuseCount: number;
  warnings: string[];
  additionalContextPackets: AssistantContextPacket[];
}> {
  const registry = createServerOrchestratorToolRegistry();
  const orchestrator = new QadrAiOrchestrator(registry, {
    complete: async (request) => {
      const providerChain = resolveProviderChain(input.request.taskClass, request.routeClass);
      const result = await callLlm({
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
        temperature: 0.2,
        maxTokens: 1_900,
        timeoutMs: request.taskClass === 'forecasting' || request.taskClass === 'scenario-analysis'
          ? 120_000
          : 60_000,
        retries: request.routeClass === 'cloud-escalation' ? 2 : 1,
        retryDelayMs: 500,
        providerChain,
        routingHint: routeClassToRoutingHint(request.routeClass),
        validate: request.validate,
      });

      return {
        content: result?.content || null,
        provider: result?.provider,
        model: result?.model,
        providerChain,
        routeClass: request.routeClass,
        warnings: result?.content ? [] : ['مسیر مدل برای route فعلی خروجی معتبری نداد.'],
        attempts: 1,
        escalated: request.routeClass === 'cloud-escalation',
      };
    },
    parse: input.parse,
    buildFallbackOutput: input.buildFallbackOutput,
  });

  const result = await orchestrator.run({
    ...input.request,
    evidenceCards: input.evidenceCards,
    timeContext: input.timeContext,
  });

  return {
    output: result.output,
    provider: result.completion.provider || 'fallback',
    model: result.completion.model || 'retrieval-fallback',
    routeClass: result.completion.routeClass,
    nodeTimeline: result.nodeTimeline,
    toolPlan: result.plan.toolPlan.map((item) => item.name),
    sessionReuseCount: result.sessionContext.reusableInsights.length,
    warnings: result.warnings,
    additionalContextPackets: result.additionalContextPackets,
  };
}
