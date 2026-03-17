import type { AssistantSessionContext } from '@/platform/ai/assistant-contracts';
import type { MapContextEnvelope } from '@/platform/operations/map-context';
import type {
  ScenarioDomain,
  ScenarioEngineDriftRecord,
  ScenarioSignalFusionSummary,
  ScenarioEngineState,
  ScenarioSignalRecord,
} from '@/ai/scenario-engine';

export type ScenarioSuggestionCategory =
  | 'energy'
  | 'security'
  | 'sanctions'
  | 'infrastructure'
  | 'social'
  | 'cyber'
  | 'humanitarian'
  | 'de-escalation';

export interface ScenarioSuggestionScoreBreakdown {
  base: number;
  map: number;
  signals: number;
  intent: number;
  drift: number;
  impact: number;
  freshness: number;
  total: number;
}

export interface ScenarioSuggestionItem {
  id: string;
  category: ScenarioSuggestionCategory;
  label: string;
  query: string;
  why: string;
  potentialImpact: string;
  score: number;
  scoreBreakdown: ScenarioSuggestionScoreBreakdown;
  modeHint: 'fast' | 'deep';
  intensityHint: number;
  probabilityBiasHint: number;
}

export interface ScenarioSuggestionContextSnapshot {
  anchorLabel: string;
  mapContext: MapContextEnvelope | null;
  activeLayers: string[];
  selectedEntities: string[];
  recentSignals: ScenarioSignalRecord[];
  driftRecords: ScenarioEngineDriftRecord[];
  signalFusion: ScenarioSignalFusionSummary;
  dataRichness: number;
  sessionContext: AssistantSessionContext | null;
  focusQuery?: string;
  predictionCount: number;
  topScenarioTitles: string[];
}

interface CandidateTemplate {
  id: string;
  category: ScenarioSuggestionCategory;
  label: string;
  query: (anchorLabel: string) => string;
  impact: (anchorLabel: string) => string;
  baseScore: number;
  keywords: string[];
  layerHints: string[];
  signalHints: string[];
  domainHints: ScenarioDomain[];
  driftBias: Array<ScenarioEngineDriftRecord['direction']>;
  modeHint: 'fast' | 'deep';
  intensityHint: number;
  probabilityBiasHint: number;
}

const MIN_RESULTS = 5;
const MAX_RESULTS = 8;

export const SCENARIO_SUGGESTION_TEMPLATES: CandidateTemplate[] = [
  {
    id: 'oil-export-stop',
    category: 'energy',
    label: 'اگر صادرات نفت این منطقه متوقف شود',
    query: (anchorLabel) => `اگر صادرات نفت از ${anchorLabel} متوقف شود، ۳ تا ۵ گام بعدی و ripple effectهای منطقه‌ای و جهانی چه خواهد بود؟`,
    impact: (anchorLabel) => `اختلال در صادرات انرژی از ${anchorLabel} می‌تواند به شوک قیمت، فشار بیمه/حمل و سرریز زنجیره تامین منجر شود.`,
    baseScore: 48,
    keywords: ['oil', 'export', 'energy', 'نفت', 'صادرات', 'انرژی'],
    layerHints: ['ais', 'waterways', 'maritime', 'economic', 'polymarket', 'sanctions'],
    signalHints: ['shipping', 'energy', 'market', 'بندر', 'کشتیرانی', 'انرژی'],
    domainHints: ['economics', 'infrastructure', 'geopolitics'],
    driftBias: ['increase', 'emerged'],
    modeHint: 'deep',
    intensityHint: 0.82,
    probabilityBiasHint: 0.12,
  },
  {
    id: 'military-escalation',
    category: 'security',
    label: 'اگر تشدید نظامی در اینجا افزایش یابد',
    query: (anchorLabel) => `اگر posture دفاعی و تشدید نظامی پیرامون ${anchorLabel} افزایش یابد، در ۷۲ ساعت بعد چه شاخه‌هایی محتمل است؟`,
    impact: (anchorLabel) => `تشدید پیرامون ${anchorLabel} می‌تواند posture بازیگران، ریسک خطای محاسباتی و spillover امنیتی منطقه‌ای را بالا ببرد.`,
    baseScore: 50,
    keywords: ['military', 'escalation', 'security', 'نظامی', 'تشدید', 'امنیت'],
    layerHints: ['military', 'flights', 'ais', 'gdelt', 'osint'],
    signalHints: ['military', 'security', 'attack', 'نظامی', 'امنیتی'],
    domainHints: ['geopolitics', 'infrastructure'],
    driftBias: ['increase', 'emerged'],
    modeHint: 'deep',
    intensityHint: 0.8,
    probabilityBiasHint: 0.14,
  },
  {
    id: 'sanctions-imposed',
    category: 'sanctions',
    label: 'اگر دور تازه‌ای از تحریم‌ها اعمال شود',
    query: (anchorLabel) => `اگر دور تازه‌ای از تحریم‌ها علیه بازیگران مرتبط با ${anchorLabel} اعمال شود، چه سناریوهای اقتصادی و لجستیکی شکل می‌گیرد؟`,
    impact: (anchorLabel) => `تحریم‌های تازه علیه ${anchorLabel} می‌تواند trade routing، هزینه تامین، فشار ارزی و رفتار بازار را تغییر دهد.`,
    baseScore: 44,
    keywords: ['sanction', 'trade', 'market', 'تحریم', 'تجارت', 'بازار'],
    layerHints: ['sanctions', 'economic', 'polymarket', 'roadTraffic'],
    signalHints: ['sanction', 'market', 'trade', 'تحریم', 'بازار', 'تجارت'],
    domainHints: ['economics', 'geopolitics'],
    driftBias: ['increase', 'emerged'],
    modeHint: 'deep',
    intensityHint: 0.7,
    probabilityBiasHint: 0.08,
  },
  {
    id: 'logistics-corridor',
    category: 'infrastructure',
    label: 'اگر مسیرهای لجستیکی این ناحیه مختل شوند',
    query: (anchorLabel) => `اگر مسیرهای لجستیکی و گلوگاه‌های زیرساختی ${anchorLabel} مختل شوند، چه cascadeهایی در ۳ تا ۵ گام بعدی رخ می‌دهد؟`,
    impact: (anchorLabel) => `اختلال لجستیکی در ${anchorLabel} می‌تواند backlog، فشار خدمات عمومی و وابستگی متقابل زیرساخت‌ها را آشکار کند.`,
    baseScore: 46,
    keywords: ['logistics', 'corridor', 'infrastructure', 'لجستیک', 'کریدور', 'زیرساخت'],
    layerHints: ['roadTraffic', 'flights', 'ais', 'outages', 'datacenters'],
    signalHints: ['traffic', 'outage', 'shipping', 'ترافیک', 'اختلال', 'زیرساخت'],
    domainHints: ['infrastructure', 'economics'],
    driftBias: ['increase', 'emerged'],
    modeHint: 'fast',
    intensityHint: 0.72,
    probabilityBiasHint: 0.06,
  },
  {
    id: 'social-unrest',
    category: 'social',
    label: 'اگر فشار اجتماعی و نارضایتی اوج بگیرد',
    query: (anchorLabel) => `اگر فشار اجتماعی، نارضایتی یا جابجایی جمعیت در ${anchorLabel} اوج بگیرد، چه شاخه‌های اجتماعی-امنیتی محتمل است؟`,
    impact: (anchorLabel) => `فشار اجتماعی در ${anchorLabel} می‌تواند خدمات عمومی، narrative control و ثبات موضعی را تحت فشار قرار دهد.`,
    baseScore: 42,
    keywords: ['social', 'protest', 'sentiment', 'اجتماعی', 'اعتراض', 'افکار'],
    layerHints: ['protests', 'gdelt', 'osint', 'outages'],
    signalHints: ['protest', 'riot', 'social', 'اعتراض', 'ناآرام', 'اجتماعی'],
    domainHints: ['public_sentiment', 'geopolitics'],
    driftBias: ['increase', 'emerged'],
    modeHint: 'fast',
    intensityHint: 0.68,
    probabilityBiasHint: 0.04,
  },
  {
    id: 'cyber-pressure',
    category: 'cyber',
    label: 'اگر اختلال سایبری همزمان رخ دهد',
    query: (anchorLabel) => `اگر همزمان با فشار میدانی، اختلال یا موج فشار سایبری در ${anchorLabel} رخ دهد، چه پیامدهای چنددامنه‌ای محتمل است؟`,
    impact: (anchorLabel) => `فشار سایبری علیه ${anchorLabel} می‌تواند همزمان visibility، ارتباطات و تاب‌آوری زیرساختی را تضعیف کند.`,
    baseScore: 43,
    keywords: ['cyber', 'digital', 'network', 'سایبر', 'دیجیتال', 'شبکه'],
    layerHints: ['cyberThreats', 'outages', 'datacenters', 'osint'],
    signalHints: ['cyber', 'network', 'outage', 'سایبر', 'شبکه', 'قطع'],
    domainHints: ['cyber', 'infrastructure'],
    driftBias: ['increase', 'emerged'],
    modeHint: 'deep',
    intensityHint: 0.74,
    probabilityBiasHint: 0.08,
  },
  {
    id: 'humanitarian-stress',
    category: 'humanitarian',
    label: 'اگر بحران به فشار انسانی و خدماتی تبدیل شود',
    query: (anchorLabel) => `اگر بحران در ${anchorLabel} به فشار انسانی، جابجایی جمعیت یا strain خدمات عمومی تبدیل شود، چه outcomesهایی رخ می‌دهد؟`,
    impact: (anchorLabel) => `فشار انسانی در ${anchorLabel} می‌تواند بار خدمات، نیازهای لجستیکی و ریسک spillover به مناطق مجاور را بالا ببرد.`,
    baseScore: 40,
    keywords: ['humanitarian', 'displacement', 'service', 'انسانی', 'جابجایی', 'خدمات'],
    layerHints: ['protests', 'outages', 'roadTraffic', 'gdelt'],
    signalHints: ['displacement', 'outage', 'social', 'جابجایی', 'خدمات', 'اعتراض'],
    domainHints: ['public_sentiment', 'infrastructure'],
    driftBias: ['increase', 'emerged'],
    modeHint: 'fast',
    intensityHint: 0.66,
    probabilityBiasHint: 0.02,
  },
  {
    id: 'deescalation-window',
    category: 'de-escalation',
    label: 'اگر پنجره کاهش تنش باز شود',
    query: (anchorLabel) => `اگر در ${anchorLabel} پنجره کاهش تنش یا deconfliction باز شود، کدام شاخه‌های تثبیت‌گر محتمل‌ترند و چه شروطی دارند؟`,
    impact: (anchorLabel) => `کاهش تنش در ${anchorLabel} می‌تواند throughput، ثبات روایت و هزینه‌های بازار را به‌صورت شکننده بهبود دهد.`,
    baseScore: 36,
    keywords: ['de-escalation', 'stabilize', 'ceasefire', 'کاهش تنش', 'ثبات', 'آتش بس'],
    layerHints: ['gdelt', 'osint', 'polymarket'],
    signalHints: ['de-escalation', 'stabiliz', 'recover', 'کاهش تنش', 'ثبات', 'بازگشایی'],
    domainHints: ['geopolitics', 'economics'],
    driftBias: ['decrease', 'stabilized'],
    modeHint: 'fast',
    intensityHint: 0.42,
    probabilityBiasHint: -0.12,
  },
];

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function uniqueStrings(values: string[], maxItems = 8): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, maxItems);
}

function overlapCount(needles: string[], haystack: string[]): number {
  const normalized = haystack.map((item) => item.toLowerCase());
  return needles.filter((needle) => normalized.some((candidate) => candidate.includes(needle.toLowerCase()))).length;
}

function recentSignalTokens(signals: ScenarioSignalRecord[]): string[] {
  return signals.flatMap((signal) => [signal.label, signal.summary]);
}

function driftTokens(records: ScenarioEngineDriftRecord[]): string[] {
  return records.flatMap((record) => [record.title, record.reason, ...record.signalLabels]);
}

function sessionTokens(sessionContext: AssistantSessionContext | null): string[] {
  if (!sessionContext) return [];
  return [
    ...sessionContext.intentHistory.slice(-4).flatMap((item) => [item.query, item.inferredIntent]),
    ...sessionContext.reusableInsights.slice(-4).map((item) => item.summary),
    ...(sessionContext.activeIntentSummary ? [sessionContext.activeIntentSummary] : []),
  ].filter(Boolean);
}

function mapScore(template: CandidateTemplate, context: ScenarioSuggestionContextSnapshot): number {
  const layerMatches = overlapCount(template.layerHints, context.activeLayers);
  const entityBoost = context.selectedEntities.length > 0 ? Math.min(4, context.selectedEntities.length * 1.2) : 0;
  const geoBoost = context.mapContext ? 4 : 0;
  return Math.min(18, (layerMatches * 4) + entityBoost + geoBoost);
}

function signalScore(template: CandidateTemplate, context: ScenarioSuggestionContextSnapshot): number {
  const signalMatches = overlapCount(template.signalHints, recentSignalTokens(context.recentSignals));
  const domainMatches = context.recentSignals.filter((signal) => template.domainHints.some((domain) => (signal.domainWeights?.[domain] ?? 0) >= 0.4)).length;
  return Math.min(22, (signalMatches * 4) + (domainMatches * 3));
}

function intentScore(template: CandidateTemplate, context: ScenarioSuggestionContextSnapshot): number {
  const tokens = [
    context.focusQuery || '',
    ...sessionTokens(context.sessionContext),
    ...context.topScenarioTitles,
  ];
  const hits = overlapCount(template.keywords, tokens);
  return Math.min(18, hits * 4);
}

function driftScore(template: CandidateTemplate, context: ScenarioSuggestionContextSnapshot): number {
  const driftMatches = context.driftRecords.filter((record) => template.driftBias.includes(record.direction)).length;
  const keywordMatches = overlapCount(template.signalHints, driftTokens(context.driftRecords));
  return Math.min(14, (driftMatches * 4) + (keywordMatches * 2));
}

function impactScore(template: CandidateTemplate, context: ScenarioSuggestionContextSnapshot): number {
  const agreementBoost = context.signalFusion.agreement * 6;
  const anomalyBoost = context.signalFusion.anomalyScore * 5;
  const predictionBoost = template.layerHints.includes('polymarket') ? Math.min(5, context.predictionCount * 1.5) : 0;
  const polarityBoost = context.signalFusion.dominantPolarity === 'escalatory' && template.category !== 'de-escalation'
    ? 3
    : context.signalFusion.dominantPolarity === 'stabilizing' && template.category === 'de-escalation'
      ? 3
      : 0;
  return Math.min(18, agreementBoost + anomalyBoost + predictionBoost + polarityBoost);
}

function freshnessScore(context: ScenarioSuggestionContextSnapshot): number {
  return Math.max(2, Math.round(clamp(context.dataRichness) * 10));
}

function composeWhy(
  template: CandidateTemplate,
  context: ScenarioSuggestionContextSnapshot,
  breakdown: ScenarioSuggestionScoreBreakdown,
): string {
  const reasons = [
    context.recentSignals.length > 0 ? `${context.recentSignals.length} سیگنال اخیر نزدیک` : '',
    breakdown.map >= 8 ? 'هم‌راستایی قوی با لایه‌ها و context نقشه' : '',
    breakdown.drift >= 6 ? 'drift سناریویی تازه ثبت شده' : '',
    breakdown.intent >= 6 ? 'هم‌راستایی با intent یا حافظه جلسه' : '',
    template.category === 'de-escalation' && context.signalFusion.dominantPolarity === 'stabilizing' ? 'نشانه‌های محدودکننده تنش دیده می‌شود' : '',
    template.category !== 'de-escalation' && context.signalFusion.dominantPolarity === 'escalatory' ? 'همگرایی سیگنال‌ها به سمت تشدید است' : '',
    breakdown.freshness >= 6 ? 'پوشش داده مناسب است' : 'پوشش داده محدود اما قابل استفاده است',
  ].filter(Boolean);
  return `چون ${uniqueStrings(reasons, 4).join('، ')}.`;
}

export function scoreScenarioSuggestionCandidate(
  template: CandidateTemplate,
  context: ScenarioSuggestionContextSnapshot,
): { total: number; breakdown: ScenarioSuggestionScoreBreakdown; why: string } {
  const map = mapScore(template, context);
  const signals = signalScore(template, context);
  const intent = intentScore(template, context);
  const drift = driftScore(template, context);
  const impact = impactScore(template, context);
  const freshness = freshnessScore(context);
  const total = Math.min(100, template.baseScore + map + signals + intent + drift + impact + freshness);
  const breakdown: ScenarioSuggestionScoreBreakdown = {
    base: template.baseScore,
    map,
    signals,
    intent,
    drift,
    impact,
    freshness,
    total,
  };
  return {
    total,
    breakdown,
    why: composeWhy(template, context, breakdown),
  };
}

function selectDiverseSuggestions(items: ScenarioSuggestionItem[]): ScenarioSuggestionItem[] {
  const grouped = new Map<ScenarioSuggestionCategory, ScenarioSuggestionItem[]>();
  items.forEach((item) => {
    const bucket = grouped.get(item.category) ?? [];
    bucket.push(item);
    grouped.set(item.category, bucket);
  });
  grouped.forEach((bucket) => bucket.sort((a, b) => b.score - a.score));

  const selected: ScenarioSuggestionItem[] = [];
  grouped.forEach((bucket) => {
    if (bucket[0]) selected.push(bucket[0]);
  });

  const chosenIds = new Set(selected.map((item) => item.id));
  const rest = items
    .filter((item) => !chosenIds.has(item.id))
    .sort((a, b) => b.score - a.score);

  for (const item of rest) {
    if (selected.length >= MAX_RESULTS) break;
    selected.push(item);
  }

  return selected
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(MIN_RESULTS, Math.min(MAX_RESULTS, selected.length)));
}

export function buildScenarioSuggestionContext(input: {
  state: ScenarioEngineState | null;
  focusQuery?: string;
}): ScenarioSuggestionContextSnapshot | null {
  const state = input.state;
  if (!state) return null;
  return {
    anchorLabel: state.anchorLabel,
    mapContext: state.inputSnapshot.mapContext ?? null,
    activeLayers: state.inputSnapshot.mapContext?.activeLayers ?? [],
    selectedEntities: state.inputSnapshot.mapContext?.selectedEntities ?? [],
    recentSignals: state.signals.slice(-10),
    driftRecords: state.drift.slice(0, 6),
    signalFusion: state.signalFusion,
    dataRichness: state.dataRichness,
    sessionContext: state.inputSnapshot.sessionContext ?? null,
    focusQuery: input.focusQuery || state.inputSnapshot.query || state.trigger,
    predictionCount: state.signals.filter((signal) => signal.source === 'polymarket').length,
    topScenarioTitles: state.scenarios.slice(0, 4).map((scenario) => scenario.title),
  };
}

export function generateScenarioSuggestions(context: ScenarioSuggestionContextSnapshot): ScenarioSuggestionItem[] {
  const candidates = SCENARIO_SUGGESTION_TEMPLATES.map((template) => {
    const scoring = scoreScenarioSuggestionCandidate(template, context);
    return {
      id: template.id,
      category: template.category,
      label: template.label,
      query: template.query(context.anchorLabel),
      why: scoring.why,
      potentialImpact: template.impact(context.anchorLabel),
      score: scoring.total,
      scoreBreakdown: scoring.breakdown,
      modeHint: template.modeHint,
      intensityHint: template.intensityHint,
      probabilityBiasHint: template.probabilityBiasHint,
    } satisfies ScenarioSuggestionItem;
  }).sort((a, b) => b.score - a.score);

  return selectDiverseSuggestions(candidates);
}
