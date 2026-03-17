import type { AssistantRunRequest } from '@/platform/ai/assistant-contracts';
import type { AiGatewayProvider } from '@/platform/ai/contracts';
import { getPolicyForTask } from '@/platform/ai/policy';
import type {
  AssistantSessionContext,
  OrchestratorPlan,
  OrchestratorRouteClass,
} from '@/platform/ai/orchestrator-contracts';

import {
  buildToolPlan,
  classifyOrchestratorComplexity,
  inferOrchestratorIntent,
} from './prompt-strategy';

export type GatewayRoutingHint = 'fast' | 'reasoning' | 'structured' | 'escalation';

const ROUTE_CHAINS: Record<OrchestratorRouteClass, AiGatewayProvider[]> = {
  'fast-local': ['ollama', 'custom', 'browser', 'vllm', 'openrouter', 'groq'],
  'reasoning-local': ['vllm', 'custom', 'ollama', 'openrouter', 'groq', 'browser'],
  'cloud-escalation': ['openrouter', 'custom', 'vllm', 'ollama', 'groq', 'browser'],
  'structured-json': ['vllm', 'custom', 'ollama', 'openrouter', 'groq'],
};

function uniqueProviders(items: AiGatewayProvider[]): AiGatewayProvider[] {
  return items.filter((item, index) => items.indexOf(item) === index);
}

export function routeClassToRoutingHint(routeClass: OrchestratorRouteClass): GatewayRoutingHint {
  if (routeClass === 'fast-local') return 'fast';
  if (routeClass === 'structured-json') return 'structured';
  if (routeClass === 'cloud-escalation') return 'escalation';
  return 'reasoning';
}

export function resolveProviderChain(
  taskClass: AssistantRunRequest['taskClass'],
  routeClass: OrchestratorRouteClass,
): AiGatewayProvider[] {
  const policy = getPolicyForTask(taskClass);
  const denied = new Set(policy.deniedProviders ?? []);
  const chain = uniqueProviders([
    ...ROUTE_CHAINS[routeClass],
    ...policy.preferredProviders,
  ]);
  return chain.filter((provider) => !denied.has(provider));
}

function resolveRouteClass(request: AssistantRunRequest, sessionContext: AssistantSessionContext): OrchestratorRouteClass {
  if (request.taskClass === 'structured-json' || request.taskClass === 'classification' || request.taskClass === 'extraction') {
    return 'structured-json';
  }

  const complexity = classifyOrchestratorComplexity(request);
  const query = request.query.toLowerCase();
  const explicitEscalation = query.includes('deep reasoning')
    || query.includes('analysis tree')
    || query.includes('cascade')
    || query.includes('زنجیره')
    || query.includes('تحلیل عمیق');

  if (explicitEscalation || (complexity === 'complex' && sessionContext.reusableInsights.length >= 3)) {
    return 'cloud-escalation';
  }

  if (complexity === 'fast') return 'fast-local';
  return 'reasoning-local';
}

export function buildOrchestratorPlan(
  request: AssistantRunRequest,
  sessionContext: AssistantSessionContext,
): OrchestratorPlan {
  const intent = inferOrchestratorIntent(request.query, request.taskClass, request.domainMode);
  const complexity = classifyOrchestratorComplexity(request);
  const routeClass = resolveRouteClass(request, sessionContext);
  const providerChain = resolveProviderChain(request.taskClass, routeClass);
  const toolPlan = buildToolPlan(request, sessionContext, routeClass, intent);

  return {
    intent,
    complexity,
    routeClass,
    rationale: [
      `task=${request.taskClass}`,
      `intent=${intent}`,
      `complexity=${complexity}`,
      `providers=${providerChain.join('>')}`,
    ].join(' | '),
    providerChain,
    toolPlan,
  };
}
