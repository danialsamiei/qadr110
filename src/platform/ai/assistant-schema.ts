import type {
  AssistantScenario,
  AssistantSection,
  AssistantStructuredOutput,
} from './assistant-contracts';
import { createConfidenceRecord } from './assistant-contracts';

function defaultSection(title: string): AssistantSection {
  return {
    title,
    bullets: [],
    narrative: '',
    confidence: createConfidenceRecord(0.45, 'مدل سطح اطمینان صریحی برای این بخش ارائه نکرده است.'),
  };
}

function toStringArray(value: unknown, maxItems = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, maxItems);
}

function toConfidence(section: Record<string, unknown>, fallback: string) {
  const score = typeof section.confidenceScore === 'number'
    ? section.confidenceScore
    : typeof section.score === 'number'
      ? section.score
      : 0.45;
  const rationale = typeof section.confidenceRationale === 'string'
    ? section.confidenceRationale
    : fallback;
  return createConfidenceRecord(score, rationale);
}

function normalizeSection(input: unknown, fallbackTitle: string): AssistantSection {
  if (!input || typeof input !== 'object') {
    return defaultSection(fallbackTitle);
  }

  const record = input as Record<string, unknown>;
  return {
    title: typeof record.title === 'string' ? record.title : fallbackTitle,
    bullets: toStringArray(record.bullets),
    narrative: typeof record.narrative === 'string' ? record.narrative.trim() : '',
    confidence: toConfidence(record, `این بخش با تکیه بر JSON ناقص مدل نرمال‌سازی شد: ${fallbackTitle}`),
  };
}

function normalizeScenarios(input: unknown): AssistantScenario[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 4).map((scenario, index) => {
    const record = scenario && typeof scenario === 'object'
      ? scenario as Record<string, unknown>
      : {};
    const probability = record.probability === 'high' || record.probability === 'low'
      ? record.probability
      : 'medium';

    return {
      title: typeof record.title === 'string' ? record.title : `سناریو ${index + 1}`,
      probability,
      timeframe: typeof record.timeframe === 'string' ? record.timeframe : 'بازه نامشخص',
      description: typeof record.description === 'string' ? record.description.trim() : '',
      indicators: toStringArray(record.indicators, 5),
      confidence: toConfidence(record, 'سطح اطمینان سناریو از روی خروجی ناقص مدل نرمال‌سازی شد.'),
    };
  });
}

export const ASSISTANT_RESPONSE_SCHEMA = {
  name: 'qadr110_assistant_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'reportTitle',
      'executiveSummary',
      'observedFacts',
      'analyticalInference',
      'scenarios',
      'uncertainties',
      'recommendations',
      'resilienceNarrative',
      'followUpSuggestions',
    ],
    properties: {
      reportTitle: { type: 'string' },
      executiveSummary: { type: 'string' },
      observedFacts: { type: 'object' },
      analyticalInference: { type: 'object' },
      scenarios: { type: 'array' },
      uncertainties: { type: 'object' },
      recommendations: { type: 'object' },
      resilienceNarrative: { type: 'object' },
      followUpSuggestions: { type: 'array' },
    },
  },
} as const;

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim().replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/, '').trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

export function coerceAssistantStructuredOutput(value: unknown): AssistantStructuredOutput {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};

  return {
    reportTitle: typeof record.reportTitle === 'string' ? record.reportTitle : 'گزارش تحلیلی QADR110',
    executiveSummary: typeof record.executiveSummary === 'string' ? record.executiveSummary.trim() : '',
    observedFacts: normalizeSection(record.observedFacts, 'واقعیت‌های مشاهده‌شده'),
    analyticalInference: normalizeSection(record.analyticalInference, 'استنباط تحلیلی'),
    scenarios: normalizeScenarios(record.scenarios),
    uncertainties: normalizeSection(record.uncertainties, 'عدم‌قطعیت‌ها'),
    recommendations: normalizeSection(record.recommendations, 'توصیه‌های دفاعی'),
    resilienceNarrative: normalizeSection(record.resilienceNarrative, 'روایت تاب‌آوری'),
    followUpSuggestions: toStringArray(record.followUpSuggestions, 5),
  };
}

export function parseAssistantResponseJson(raw: string): AssistantStructuredOutput | null {
  if (!raw.trim()) return null;

  try {
    return coerceAssistantStructuredOutput(JSON.parse(extractJsonObject(raw)));
  } catch {
    return null;
  }
}
