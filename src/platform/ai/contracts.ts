export type AiGatewayProvider =
  | 'openrouter'
  | 'custom'
  | 'ollama'
  | 'vllm'
  | 'groq'
  | 'browser';

export type AiRoutingProfile =
  | 'strategic-default'
  | 'local-first'
  | 'browser-only'
  | 'edge-compact';

export type AiTaskClass =
  | 'assistant'
  | 'briefing'
  | 'extraction'
  | 'summarization'
  | 'forecasting'
  | 'scenario-building'
  | 'chart-narration'
  | 'resilience-analysis'
  | 'translation'
  | 'structured-json'
  | 'deduction'
  | 'country-brief'
  | 'classification'
  | 'scenario-analysis'
  | 'report-generation';

export type AiSafetyProfile = 'balanced' | 'strict-defensive' | 'human-review-required';
export type AiTraceLevel = 'off' | 'metadata' | 'prompt-hash' | 'full';

export interface AiTokenBudgetPolicy {
  inputTokenLimit: number;
  outputTokenLimit: number;
  reserveTokens: number;
  cacheEligible: boolean;
}

export interface AiCachingPolicy {
  enabled: boolean;
  ttlSeconds: number;
  cacheNamespace: string;
  cacheKeyFields: string[];
}

export interface AiStreamingConfig {
  enabled: boolean;
  chunkTimeoutMs: number;
  maxLatencyMs: number;
}

export interface AiRetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  providerFailover: boolean;
}

export interface AiOpenRouterRoutingConfig {
  providerOrder?: string[];
  allowFallbacks?: boolean;
  requireParameters?: boolean;
  dataCollection?: 'allow' | 'deny';
  onlyProviders?: string[];
  ignoreProviders?: string[];
}

export interface AiProviderMetadataConfig {
  openRouter?: AiOpenRouterRoutingConfig;
  useResponseHealing?: boolean;
  tags?: string[];
}

export interface AiTracingConfig {
  enabled: boolean;
  level: AiTraceLevel;
  redactFields: string[];
  emitEventName?: string;
}

export interface AiProviderRoute {
  provider: AiGatewayProvider;
  model: string;
  endpointEnv?: string;
  apiKeyEnv?: string;
  supportsStreaming: boolean;
  supportsToolUse: boolean;
  supportsStructuredOutput: boolean;
  local: boolean;
}

export interface AiModelPolicy {
  task: AiTaskClass;
  label?: string;
  profile: AiRoutingProfile;
  preferredProviders: AiGatewayProvider[];
  deniedProviders?: AiGatewayProvider[];
  language?: 'fa' | 'en';
  tokenBudget: AiTokenBudgetPolicy;
  cache: AiCachingPolicy;
  streaming: AiStreamingConfig;
  retry: AiRetryConfig;
  safety: AiSafetyProfile;
  tracing: AiTracingConfig;
  providerMetadata?: AiProviderMetadataConfig;
}

export interface AiGatewayConfig {
  primaryGateway: AiGatewayProvider;
  fallbackProviders: AiGatewayProvider[];
  routes: AiProviderRoute[];
  defaultPolicy: AiModelPolicy;
  policies: AiModelPolicy[];
}
