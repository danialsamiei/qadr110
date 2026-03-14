export type OrchestratorIntent =
  | 'trend-analysis'
  | 'conflict-monitoring'
  | 'media-monitoring'
  | 'resilience-monitoring'
  | 'general-intel';

export type ToolPluginId =
  | 'web-search'
  | 'gdelt'
  | 'netblocks'
  | 'google-trends'
  | 'media-pipelines'
  | 'internal-panels';

export type ModelProvider = 'openrouter' | 'ollama' | 'vllm';

export interface SourceRecord {
  id: string;
  title: string;
  url?: string;
  provider: ToolPluginId;
  publishedAt?: string;
  reliability?: number;
}

export interface ToolResult {
  pluginId: ToolPluginId;
  summary: string;
  sources: SourceRecord[];
  latencyMs: number;
  confidence: number;
  riskFlags: string[];
}

export interface ModelRoutingDecision {
  provider: ModelProvider;
  model: string;
  reason: string;
  estimatedCostUsd: number;
  estimatedLatencyMs: number;
  estimatedQuality: number;
}

export interface PolicyConstraints {
  maxCostUsd?: number;
  maxLatencyMs?: number;
  minQuality?: number;
}

export interface OrchestratorQuery {
  query: string;
  locale?: string;
  constraints?: PolicyConstraints;
  preferredProviders?: ModelProvider[];
}

export interface Citation {
  index: number;
  sourceId: string;
  title: string;
  url?: string;
  provider: ToolPluginId;
}

export interface CitationRendering {
  answerWithCitations: string;
  citations: Citation[];
}

export interface OrchestratorOutput {
  answer: string;
  sources: SourceRecord[];
  confidence: number;
  riskFlags: string[];
  nextActions: string[];
  meta: {
    intent: OrchestratorIntent;
    sourcePlan: ToolPluginId[];
    modelDecision: ModelRoutingDecision;
    stages: ReadonlyArray<'intent-detection' | 'source-routing' | 'model-routing' | 'synthesis' | 'citation-rendering'>;
  };
}

export interface ToolPlugin {
  id: ToolPluginId;
  execute(context: ToolExecutionContext): Promise<ToolResult>;
}

export interface ToolExecutionContext {
  query: string;
  intent: OrchestratorIntent;
  locale: string;
}
