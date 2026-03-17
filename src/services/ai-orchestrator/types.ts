import type {
  AssistantContextPacket,
  AssistantEvidenceCard,
  AssistantRunRequest,
  AssistantStructuredOutput,
} from '@/platform/ai/assistant-contracts';
import type { AiGatewayProvider } from '@/platform/ai/contracts';
import type {
  AssistantSessionContext,
  OrchestratorNodeName,
  OrchestratorPlan,
  OrchestratorRouteClass,
  OrchestratorToolName,
} from '@/platform/ai/orchestrator-contracts';
import type { SourceRecord } from '@/platform/domain/model';

export type {
  AssistantSessionContext,
  OrchestratorComplexity,
  OrchestratorNodeName,
  OrchestratorPlan,
  OrchestratorRouteClass,
  OrchestratorToolName,
  OrchestratorToolPhase,
  OrchestratorToolSpec,
  OrchestratorTraceSummary,
} from '@/platform/ai/orchestrator-contracts';

export interface OrchestratorToolContext {
  request: AssistantRunRequest;
  sessionContext: AssistantSessionContext;
  evidenceCards: AssistantEvidenceCard[];
  toolResults: OrchestratorToolResult[];
  timeContext: string;
  plan: OrchestratorPlan;
  systemPrompt?: string;
  userPrompt?: string;
}

export interface OrchestratorToolResult {
  tool: OrchestratorToolName;
  ok: boolean;
  summary: string;
  warnings: string[];
  sources: SourceRecord[];
  contextPackets: AssistantContextPacket[];
  durationMs: number;
  data?: Record<string, unknown>;
}

export interface OrchestratorCompletionRequest {
  routeClass: OrchestratorRouteClass;
  taskClass: AssistantRunRequest['taskClass'];
  systemPrompt: string;
  userPrompt: string;
  validate?: (content: string) => boolean;
}

export interface OrchestratorCompletionResult {
  content: string | null;
  provider?: AiGatewayProvider;
  model?: string;
  providerChain: AiGatewayProvider[];
  routeClass: OrchestratorRouteClass;
  warnings: string[];
  attempts: number;
  escalated: boolean;
}

export interface OrchestratorRunResult {
  output: AssistantStructuredOutput;
  sessionContext: AssistantSessionContext;
  plan: OrchestratorPlan;
  nodeTimeline: OrchestratorNodeName[];
  toolResults: OrchestratorToolResult[];
  additionalContextPackets: AssistantContextPacket[];
  optimizedPrompt: string;
  contextSummary: string;
  completion: OrchestratorCompletionResult;
  warnings: string[];
}

export interface OrchestratorRunnerDependencies {
  complete(input: OrchestratorCompletionRequest): Promise<OrchestratorCompletionResult>;
  parse(content: string): AssistantStructuredOutput | null;
  buildFallbackOutput(
    request: AssistantRunRequest,
    evidenceCards: AssistantEvidenceCard[],
  ): AssistantStructuredOutput;
}
