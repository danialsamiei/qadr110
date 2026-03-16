import type {
  AiGatewayConfig,
  AiGatewayProvider,
  AiModelPolicy,
  AiOpenRouterRoutingConfig,
  AiRoutingProfile,
  AiTaskClass,
} from './contracts';

const ROUTES = [
  {
    provider: 'openrouter',
    model: 'openrouter/auto',
    endpointEnv: 'OPENROUTER_API_URL',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    supportsStreaming: true,
    supportsToolUse: false,
    supportsStructuredOutput: true,
    local: false,
  },
  {
    provider: 'ollama',
    model: 'llama3.1:8b',
    endpointEnv: 'OLLAMA_API_URL',
    apiKeyEnv: 'OLLAMA_API_KEY',
    supportsStreaming: true,
    supportsToolUse: false,
    supportsStructuredOutput: true,
    local: true,
  },
  {
    provider: 'vllm',
    model: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    endpointEnv: 'VLLM_API_URL',
    apiKeyEnv: 'VLLM_API_KEY',
    supportsStreaming: true,
    supportsToolUse: false,
    supportsStructuredOutput: true,
    local: true,
  },
  {
    provider: 'groq',
    model: 'llama-3.1-8b-instant',
    endpointEnv: 'GROQ_API_URL',
    apiKeyEnv: 'GROQ_API_KEY',
    supportsStreaming: true,
    supportsToolUse: false,
    supportsStructuredOutput: true,
    local: false,
  },
  {
    provider: 'browser',
    model: 'transformersjs/t5-small',
    supportsStreaming: false,
    supportsToolUse: false,
    supportsStructuredOutput: false,
    local: true,
  },
] as const;

const PROFILE_ORDER: Record<AiRoutingProfile, AiGatewayProvider[]> = {
  'strategic-default': ['openrouter', 'ollama', 'vllm', 'groq', 'browser'],
  'local-first': ['ollama', 'vllm', 'browser', 'openrouter', 'groq'],
  'browser-only': ['browser'],
  'edge-compact': ['openrouter', 'groq', 'browser'],
};

function getOpenRouterRouting(task: AiTaskClass): AiOpenRouterRoutingConfig {
  switch (task) {
    case 'extraction':
    case 'structured-json':
    case 'classification':
      return {
        providerOrder: ['openai', 'google-vertex', 'anthropic'],
        allowFallbacks: true,
        requireParameters: true,
        dataCollection: 'deny',
      };
    case 'translation':
      return {
        providerOrder: ['google-vertex', 'openai', 'anthropic'],
        allowFallbacks: true,
        requireParameters: false,
        dataCollection: 'deny',
      };
    case 'forecasting':
    case 'scenario-building':
    case 'scenario-analysis':
    case 'resilience-analysis':
    case 'deduction':
      return {
        providerOrder: ['anthropic', 'openai', 'google-vertex'],
        allowFallbacks: true,
        requireParameters: false,
        dataCollection: 'deny',
      };
    default:
      return {
        providerOrder: ['openai', 'anthropic', 'google-vertex'],
        allowFallbacks: true,
        requireParameters: false,
        dataCollection: 'deny',
      };
  }
}

function createPolicy(
  task: AiTaskClass,
  profile: AiRoutingProfile,
  outputTokenLimit: number,
  cacheNamespace: string,
  options: {
    label?: string;
    safety?: AiModelPolicy['safety'];
  } = {},
): AiModelPolicy {
  const openRouterRouting = getOpenRouterRouting(task);
  const structuredTask = task === 'extraction'
    || task === 'classification'
    || task === 'structured-json';

  return {
    task,
    label: options.label,
    profile,
    preferredProviders: [...PROFILE_ORDER[profile]],
    language: 'fa',
    tokenBudget: {
      inputTokenLimit: 10_000,
      outputTokenLimit,
      reserveTokens: Math.min(1_024, Math.floor(outputTokenLimit * 0.25)),
      cacheEligible: true,
    },
    cache: {
      enabled: true,
      ttlSeconds: task === 'classification' ? 86_400 : 7_200,
      cacheNamespace,
      cacheKeyFields: ['task', 'provider', 'model', 'lang', 'geoContextHash', 'inputHash'],
    },
    streaming: {
      enabled: !structuredTask,
      chunkTimeoutMs: 10_000,
      maxLatencyMs: task === 'deduction'
        || task === 'scenario-analysis'
        || task === 'forecasting'
        || task === 'scenario-building'
        || task === 'resilience-analysis'
        ? 120_000
        : 30_000,
    },
    retry: {
      maxAttempts: structuredTask ? 3 : 2,
      baseDelayMs: structuredTask ? 700 : 400,
      providerFailover: true,
    },
    safety: options.safety ?? (task === 'scenario-analysis'
      || task === 'scenario-building'
      || task === 'forecasting'
      || task === 'resilience-analysis'
      || task === 'deduction'
      || task === 'assistant'
      ? 'strict-defensive'
      : 'balanced'),
    tracing: {
      enabled: true,
      level: 'prompt-hash',
      redactFields: ['apiKey', 'authorization', 'userPrompt'],
      emitEventName: 'wm:analysis-started',
    },
    providerMetadata: {
      openRouter: openRouterRouting,
      useResponseHealing: structuredTask,
      tags: ['persian-first', 'evidence-aware', 'defensive-only'],
    },
  };
}

export const DEFAULT_AI_GATEWAY_CONFIG: AiGatewayConfig = {
  primaryGateway: 'openrouter',
  fallbackProviders: ['ollama', 'vllm', 'groq', 'browser'],
  routes: [...ROUTES],
  defaultPolicy: createPolicy('assistant', 'strategic-default', 1_600, 'ai:assistant', {
    label: 'دستیار راهبردی فارسی',
  }),
  policies: [
    createPolicy('assistant', 'strategic-default', 1_600, 'ai:assistant', {
      label: 'دستیار راهبردی فارسی',
    }),
    createPolicy('briefing', 'strategic-default', 900, 'ai:briefing', {
      label: 'بریـف تحلیلی',
    }),
    createPolicy('extraction', 'edge-compact', 600, 'ai:extraction', {
      label: 'استخراج ساخت‌یافته',
    }),
    createPolicy('summarization', 'strategic-default', 260, 'ai:summarization', {
      label: 'خلاصه‌سازی',
    }),
    createPolicy('forecasting', 'strategic-default', 1_300, 'ai:forecasting', {
      label: 'پیش‌بینی',
    }),
    createPolicy('scenario-building', 'strategic-default', 1_400, 'ai:scenario-building', {
      label: 'سناریوسازی',
    }),
    createPolicy('chart-narration', 'edge-compact', 650, 'ai:chart-narration', {
      label: 'روایت نموداری',
    }),
    createPolicy('resilience-analysis', 'strategic-default', 1_500, 'ai:resilience-analysis', {
      label: 'تحلیل تاب‌آوری',
    }),
    createPolicy('translation', 'edge-compact', 500, 'ai:translation', {
      label: 'ترجمه تحلیلی',
    }),
    createPolicy('structured-json', 'edge-compact', 700, 'ai:structured-json', {
      label: 'JSON ساخت‌یافته',
    }),
    createPolicy('deduction', 'strategic-default', 1_500, 'ai:deduction', {
      label: 'استنتاج موقعیت',
    }),
    createPolicy('country-brief', 'strategic-default', 950, 'ai:country-brief', {
      label: 'بریـف کشوری',
    }),
    createPolicy('classification', 'edge-compact', 80, 'ai:classification', {
      label: 'طبقه‌بندی',
    }),
    createPolicy('scenario-analysis', 'strategic-default', 1_600, 'ai:scenario-analysis', {
      label: 'تحلیل سناریو',
    }),
    createPolicy('report-generation', 'local-first', 2_000, 'ai:report-generation', {
      label: 'گزارش نهایی',
    }),
  ],
};

export function getAiProviderOrder(
  profile: AiRoutingProfile = DEFAULT_AI_GATEWAY_CONFIG.defaultPolicy.profile,
): AiGatewayProvider[] {
  return [...PROFILE_ORDER[profile]];
}

export function getPolicyForTask(task: AiTaskClass): AiModelPolicy {
  return DEFAULT_AI_GATEWAY_CONFIG.policies.find((policy) => policy.task === task)
    ?? DEFAULT_AI_GATEWAY_CONFIG.defaultPolicy;
}

export function getProviderModel(provider: AiGatewayProvider): string {
  return DEFAULT_AI_GATEWAY_CONFIG.routes.find((route) => route.provider === provider)?.model
    ?? provider;
}

export function isLocalAiProvider(provider: AiGatewayProvider): boolean {
  return Boolean(DEFAULT_AI_GATEWAY_CONFIG.routes.find((route) => route.provider === provider)?.local);
}
