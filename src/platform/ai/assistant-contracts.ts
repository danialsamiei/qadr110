import type {
  ConfidenceBand,
  ConfidenceRecord,
  EvidenceRecord,
  ProvenanceRecord,
  SourceRecord,
} from '../domain/model';
import type { MapContextEnvelope } from '../operations/map-context';
import type { AiGatewayProvider, AiTaskClass } from './contracts';

export type AssistantDomainMode =
  | 'osint-digest'
  | 'security-brief'
  | 'military-monitoring-defensive'
  | 'economic-resilience'
  | 'social-resilience'
  | 'cultural-cognitive-analysis'
  | 'scenario-planning'
  | 'predictive-analysis'
  | 'infrastructure-risk'
  | 'border-dynamics'
  | 'sanctions-impact'
  | 'misinformation-analysis';

export type AssistantMessageRole = 'system' | 'user' | 'assistant';
export type AssistantProbabilityBand = 'low' | 'medium' | 'high';
export type AssistantRunStatus = 'completed' | 'refused' | 'failed';
export type AssistantExportFormat = 'json' | 'markdown' | 'html';

export interface AssistantContextPacket {
  id: string;
  title: string;
  summary: string;
  content: string;
  sourceLabel: string;
  sourceUrl?: string;
  sourceType: SourceRecord['type'];
  updatedAt: string;
  score: number;
  tags: string[];
  provenance: ProvenanceRecord;
}

export interface AssistantSection {
  title: string;
  bullets: string[];
  narrative: string;
  confidence: ConfidenceRecord;
}

export interface AssistantScenario {
  title: string;
  probability: AssistantProbabilityBand;
  timeframe: string;
  description: string;
  indicators: string[];
  confidence: ConfidenceRecord;
}

export interface AssistantEvidenceCard {
  id: string;
  title: string;
  summary: string;
  timeContext: string;
  score: number;
  freshnessWeight: number;
  source: SourceRecord;
  evidence: EvidenceRecord;
  provenance: ProvenanceRecord;
  confidence: ConfidenceRecord;
  tags: string[];
  pinned?: boolean;
}

export interface AssistantStructuredOutput {
  reportTitle: string;
  executiveSummary: string;
  observedFacts: AssistantSection;
  analyticalInference: AssistantSection;
  scenarios: AssistantScenario[];
  uncertainties: AssistantSection;
  recommendations: AssistantSection;
  resilienceNarrative: AssistantSection;
  followUpSuggestions: string[];
}

export interface AssistantMessage {
  id: string;
  role: AssistantMessageRole;
  createdAt: string;
  content: string;
  domainMode?: AssistantDomainMode;
  taskClass?: AiTaskClass;
  structured?: AssistantStructuredOutput;
  evidenceCards?: AssistantEvidenceCard[];
  provider?: string;
  model?: string;
  traceId?: string;
  confidenceBand?: ConfidenceBand;
}

export interface AssistantSavedWorkflow {
  id: string;
  name: string;
  description: string;
  promptId: string;
  domainMode: AssistantDomainMode;
  taskClass: AiTaskClass;
  createdAt: string;
  updatedAt: string;
  promptOverride?: string;
}

export interface AssistantMemoryNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AssistantConversationThread {
  id: string;
  title: string;
  domainMode: AssistantDomainMode;
  taskClass: AiTaskClass;
  createdAt: string;
  updatedAt: string;
  messages: AssistantMessage[];
  pinnedEvidenceIds: string[];
  workflowId?: string;
}

export interface AssistantTraceMetadata {
  traceId: string;
  taskClass: AiTaskClass;
  policyLabel: string;
  providerOrder: AiGatewayProvider[];
  selectedProvider?: string;
  selectedModel?: string;
  startedAt: string;
  completedAt: string;
  cached: boolean;
  timeContext: string;
  warnings: string[];
  profile?: string;
  safetyProfile?: string;
  cacheNamespace?: string;
  providerTags?: string[];
  openRouterProviderOrder?: string[];
}

export interface AssistantRunRequest {
  conversationId: string;
  locale: 'fa-IR';
  domainMode: AssistantDomainMode;
  taskClass: AiTaskClass;
  query: string;
  promptId?: string;
  promptText?: string;
  messages: Array<Pick<AssistantMessage, 'role' | 'content' | 'createdAt'>>;
  mapContext?: MapContextEnvelope | null;
  pinnedEvidence: AssistantEvidenceCard[];
  localContextPackets: AssistantContextPacket[];
  memoryNotes: AssistantMemoryNote[];
  workflowId?: string;
  stream?: boolean;
}

export interface AssistantRefusal {
  reason: string;
  redirect: string;
}

export interface AssistantRunResponse {
  conversationId: string;
  message: AssistantMessage;
  status: AssistantRunStatus;
  provider: string;
  model: string;
  cached: boolean;
  followUpSuggestions: string[];
  evidenceCards: AssistantEvidenceCard[];
  trace: AssistantTraceMetadata;
  refusal?: AssistantRefusal;
}

export const ASSISTANT_DOMAIN_MODE_OPTIONS: Array<{
  id: AssistantDomainMode;
  label: string;
  summary: string;
}> = [
  {
    id: 'osint-digest',
    label: 'هضم OSINT',
    summary: 'خلاصه‌سازی چندمنبعی، تشخیص سیگنال و اولویت‌بندی شواهد.',
  },
  {
    id: 'security-brief',
    label: 'بریـف امنیتی',
    summary: 'ارزیابی ریسک، نشانه‌های تشدید و پیشنهادهای دفاعی.',
  },
  {
    id: 'military-monitoring-defensive',
    label: 'پایش نظامی دفاعی',
    summary: 'پایش تحرکات نظامی، خطوط قرمز و آثار ثانویه صرفاً در چارچوب دفاعی.',
  },
  {
    id: 'economic-resilience',
    label: 'تاب‌آوری اقتصادی',
    summary: 'شوک‌های تحریم، زنجیره تامین، بازار انرژی و پایداری اقتصاد.',
  },
  {
    id: 'social-resilience',
    label: 'تاب‌آوری اجتماعی',
    summary: 'پایداری اجتماعی، سیگنال‌های نارضایتی و ظرفیت سازگاری جامعه.',
  },
  {
    id: 'cultural-cognitive-analysis',
    label: 'تحلیل شناختی-فرهنگی',
    summary: 'جنگ روایت، الگوهای شناختی، و میدان ادراکی.',
  },
  {
    id: 'scenario-planning',
    label: 'برنامه‌ریزی سناریو',
    summary: 'ساخت سناریوهای پایه/خوش‌بینانه/بدبینانه و نشانه‌های راهنما.',
  },
  {
    id: 'predictive-analysis',
    label: 'تحلیل پیش‌بین',
    summary: 'پیش‌بینی کوتاه‌مدت با صراحت درباره عدم‌قطعیت.',
  },
  {
    id: 'infrastructure-risk',
    label: 'ریسک زیرساخت',
    summary: 'ریسک زیرساخت‌های حیاتی، گلوگاه‌ها و راهکارهای تاب‌آوری.',
  },
  {
    id: 'border-dynamics',
    label: 'پویایی مرزی',
    summary: 'تحرکات مرزی، گذرگاه‌ها، و فشارهای منطقه‌ای.',
  },
  {
    id: 'sanctions-impact',
    label: 'اثر تحریم',
    summary: 'ردیابی اثر تحریم‌ها بر تجارت، ارز، انرژی و مسیرهای تطبیق.',
  },
  {
    id: 'misinformation-analysis',
    label: 'تحلیل اطلاعات نادرست',
    summary: 'ردیابی روایت‌های مخدوش، شکاف‌های راستی‌آزمایی و آسیب‌پذیری شناختی.',
  },
];

export const DEFAULT_ASSISTANT_DOMAIN_MODE: AssistantDomainMode = 'osint-digest';

export function createConfidenceRecord(score: number, rationale: string): ConfidenceRecord {
  const boundedScore = Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0));
  let band: ConfidenceBand = 'low';
  if (boundedScore >= 0.85) {
    band = 'very-high';
  } else if (boundedScore >= 0.7) {
    band = 'high';
  } else if (boundedScore >= 0.45) {
    band = 'medium';
  }

  return {
    band,
    score: Number(boundedScore.toFixed(2)),
    uncertainty: Number((1 - boundedScore).toFixed(2)),
    rationale,
  };
}
