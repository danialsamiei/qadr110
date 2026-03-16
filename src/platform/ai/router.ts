import type {
  AiGatewayProvider,
  AiModelPolicy,
  AiOpenRouterRoutingConfig,
  AiTaskClass,
} from './contracts';
import type { AssistantTraceMetadata } from './assistant-contracts';
import { getPolicyForTask } from './policy';

const TASK_LABELS: Record<AiTaskClass, string> = {
  assistant: 'دستیار راهبردی فارسی',
  briefing: 'بریـف راهبردی',
  extraction: 'استخراج ساخت‌یافته',
  summarization: 'خلاصه‌سازی',
  forecasting: 'پیش‌بینی تحلیلی',
  'scenario-building': 'سناریوسازی',
  'chart-narration': 'روایت‌سازی نموداری',
  'resilience-analysis': 'تحلیل تاب‌آوری',
  translation: 'ترجمه تحلیلی',
  'structured-json': 'خروجی JSON ساخت‌یافته',
  deduction: 'استنتاج موقعیت',
  'country-brief': 'بریـف کشوری',
  classification: 'طبقه‌بندی رویداد',
  'scenario-analysis': 'تحلیل سناریو',
  'report-generation': 'تولید گزارش',
};

function createTraceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface AiExecutionTrace {
  traceId: string;
  task: AiTaskClass;
  label: string;
  profile: string;
  providerOrder: AiGatewayProvider[];
  selectedProvider?: AiGatewayProvider;
  selectedModel?: string;
  cacheNamespace: string;
  safety: string;
  startedAt: string;
  tags: string[];
  openRouterProviderOrder?: string[];
}

export function getPolicyLabel(task: AiTaskClass): string {
  return TASK_LABELS[task];
}

export function getOpenRouterRoutingHints(task: AiTaskClass): AiOpenRouterRoutingConfig | undefined {
  return getPolicyForTask(task).providerMetadata?.openRouter;
}

export function createAiExecutionTrace(
  policy: AiModelPolicy,
  selectedProvider?: AiGatewayProvider,
  selectedModel?: string,
): AiExecutionTrace {
  return {
    traceId: createTraceId(),
    task: policy.task,
    label: policy.label || getPolicyLabel(policy.task),
    profile: policy.profile,
    providerOrder: [...policy.preferredProviders],
    selectedProvider,
    selectedModel,
    cacheNamespace: policy.cache.cacheNamespace,
    safety: policy.safety,
    startedAt: new Date().toISOString(),
    tags: [...(policy.providerMetadata?.tags ?? [])],
    openRouterProviderOrder: [...(policy.providerMetadata?.openRouter?.providerOrder ?? [])],
  };
}

export function toAssistantTraceMetadata(
  trace: AiExecutionTrace,
  options: {
    completedAt: string;
    cached: boolean;
    timeContext: string;
    warnings?: string[];
  },
): AssistantTraceMetadata {
  return {
    traceId: trace.traceId,
    taskClass: trace.task,
    policyLabel: trace.label,
    providerOrder: [...trace.providerOrder],
    selectedProvider: trace.selectedProvider,
    selectedModel: trace.selectedModel,
    startedAt: trace.startedAt,
    completedAt: options.completedAt,
    cached: options.cached,
    timeContext: options.timeContext,
    warnings: [...(options.warnings ?? [])],
    profile: trace.profile,
    safetyProfile: trace.safety,
    cacheNamespace: trace.cacheNamespace,
    providerTags: [...trace.tags],
    openRouterProviderOrder: [...(trace.openRouterProviderOrder ?? [])],
  };
}

export function summarizeProviderRoute(policy: AiModelPolicy): string {
  const route = policy.preferredProviders.join(' -> ');
  const openRouterRoute = policy.providerMetadata?.openRouter?.providerOrder?.join(' > ');
  return openRouterRoute ? `${route} | OpenRouter: ${openRouterRoute}` : route;
}
