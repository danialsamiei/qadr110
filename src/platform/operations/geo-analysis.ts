import type { AssistantDomainMode, AssistantEvidenceCard, AssistantRunResponse } from '../ai/assistant-contracts';
import type { AiTaskClass } from '../ai/contracts';
import type { MapContextEnvelope } from './map-context';

export const GEO_ANALYSIS_PANEL_ID = 'geo-analysis-workbench';

export const GEO_ANALYSIS_EVENT_TYPES = {
  stateChanged: 'wm:geo-analysis-state-changed',
  openResult: 'wm:geo-analysis-open-result',
  assistantHandoff: 'wm:geo-analysis-assistant-handoff',
  scenarioHandoff: 'wm:geo-analysis-scenario-handoff',
} as const;

export type GeoAnalysisCategory =
  | 'security'
  | 'defensive-military-monitoring'
  | 'economic'
  | 'social'
  | 'cultural-cognitive'
  | 'infrastructure'
  | 'resilience'
  | 'osint-news'
  | 'forecasting-scenario'
  | 'data-quality';

export type GeoAnalysisMode = 'fast' | 'long';
export type GeoEvidenceDensity = 'low' | 'medium' | 'high';
export type GeoAnalysisJobStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface GeoTrendPoint {
  label: string;
  value: number;
}

export interface GeoNearbySignal {
  id: string;
  label: string;
  kind: string;
  distanceKm: number;
  severity?: string;
  occurredAt?: string;
  sourceLabel?: string;
  locationLabel?: string;
}

export interface GeoRelatedAsset {
  id: string;
  name: string;
  type: string;
  distanceKm: number;
}

export interface GeoDataFreshnessContext {
  overallStatus: 'sufficient' | 'limited' | 'insufficient';
  coveragePercent: number;
  freshSources: string[];
  staleSources: string[];
}

export interface GeoViewportContext {
  zoom: number;
  view: string;
  bounds?: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
}

export interface GeoContextSnapshot {
  context: MapContextEnvelope;
  promptContext: string;
  generatedAt: string;
  center: {
    lat: number;
    lon: number;
  };
  country?: {
    code?: string;
    name: string;
  };
  adminRegion?: string;
  viewport: GeoViewportContext;
  activeLayers: string[];
  workspaceMode: string;
  watchlists: string[];
  selectedEntities: string[];
  nearbySignals: GeoNearbySignal[];
  nearbyInfrastructure: GeoRelatedAsset[];
  sourceDensity: {
    evidenceDensity: GeoEvidenceDensity;
    nearbySignalCount: number;
    nearbyAssetCount: number;
  };
  dataFreshness: GeoDataFreshnessContext;
  trendPreview: GeoTrendPoint[];
}

export interface GeoSuggestionItem {
  id: string;
  category: GeoAnalysisCategory;
  label: string;
  summary: string;
  icon: string;
  mode: GeoAnalysisMode;
  taskClass: AiTaskClass;
  domainMode: AssistantDomainMode;
  promptTemplate: string;
  requiredData: string[];
  confidenceNote?: string;
  priority: number;
}

export interface GeoSuggestionGroup {
  id: GeoAnalysisCategory;
  label: string;
  icon: string;
  items: GeoSuggestionItem[];
}

export interface GeoAnalysisRequestDescriptor {
  id: string;
  suggestion: GeoSuggestionItem;
  title: string;
  query: string;
  promptText: string;
  mapContext: MapContextEnvelope;
  snapshot: GeoContextSnapshot;
  mode: GeoAnalysisMode;
  domainMode: AssistantDomainMode;
  taskClass: AiTaskClass;
  createdAt: string;
  customQuestion?: string;
}

export interface GeoAnalysisJobRecord {
  id: string;
  descriptor: GeoAnalysisRequestDescriptor;
  status: GeoAnalysisJobStatus;
  createdAt: string;
  updatedAt: string;
  autoMinimized: boolean;
  resultId?: string;
  error?: string;
}

export interface GeoAnalysisResultRecord {
  id: string;
  jobId: string;
  descriptor: GeoAnalysisRequestDescriptor;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  unread: boolean;
  status: Exclude<GeoAnalysisJobStatus, 'running'>;
  response?: AssistantRunResponse;
  error?: string;
}

export interface GeoAnalysisWorkspaceState {
  jobs: GeoAnalysisJobRecord[];
  results: GeoAnalysisResultRecord[];
  activeResultId: string | null;
}

export interface GeoAnalysisStateChangedDetail {
  activeResultId: string | null;
  runningJobs: number;
  unreadResults: number;
}

export interface GeoAnalysisOpenResultDetail {
  resultId: string;
}

export interface GeoAnalysisAssistantHandoffDetail {
  resultId: string;
  title: string;
  query: string;
  domainMode: AssistantDomainMode;
  taskClass: AiTaskClass;
  mapContext: MapContextEnvelope;
  evidenceCards: AssistantEvidenceCard[];
}

export interface GeoAnalysisScenarioHandoffDetail {
  resultId: string;
  title: string;
  event: string;
  actors: string[];
  constraints: string[];
  durationDays: number;
}

const CATEGORY_LABELS: Record<GeoAnalysisCategory, { label: string; icon: string }> = {
  security: { label: 'امنیت', icon: 'SEC' },
  'defensive-military-monitoring': { label: 'پایش دفاعی', icon: 'DEF' },
  economic: { label: 'اقتصادی', icon: 'ECO' },
  social: { label: 'اجتماعی', icon: 'SOC' },
  'cultural-cognitive': { label: 'شناختی', icon: 'COG' },
  infrastructure: { label: 'زیرساخت', icon: 'INF' },
  resilience: { label: 'تاب‌آوری', icon: 'RES' },
  'osint-news': { label: 'OSINT/خبر', icon: 'OSI' },
  'forecasting-scenario': { label: 'سناریو', icon: 'SCN' },
  'data-quality': { label: 'کیفیت داده', icon: 'DQ' },
};

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function inferDensityLabel(density: GeoEvidenceDensity): string {
  if (density === 'high') return 'تراکم شواهد بالا';
  if (density === 'medium') return 'تراکم شواهد متوسط';
  return 'تراکم شواهد پایین';
}

export function getGeoCategoryMeta(category: GeoAnalysisCategory): { label: string; icon: string } {
  return CATEGORY_LABELS[category];
}

export function groupGeoSuggestions(items: GeoSuggestionItem[]): GeoSuggestionGroup[] {
  const groups = new Map<GeoAnalysisCategory, GeoSuggestionItem[]>();
  items
    .slice()
    .sort((left, right) => right.priority - left.priority)
    .forEach((item) => {
      const bucket = groups.get(item.category) ?? [];
      bucket.push(item);
      groups.set(item.category, bucket);
    });

  return Array.from(groups.entries()).map(([id, groupedItems]) => ({
    id,
    ...getGeoCategoryMeta(id),
    items: groupedItems,
  }));
}

export function buildGeoConfidenceNote(snapshot: GeoContextSnapshot, requiredData: string[]): string | undefined {
  if (snapshot.dataFreshness.overallStatus === 'insufficient') {
    return 'پوشش داده محدود است؛ نتیجه باید با احتیاط و راستی‌آزمایی تکمیلی خوانده شود.';
  }
  if (snapshot.sourceDensity.evidenceDensity === 'low') {
    return `${inferDensityLabel(snapshot.sourceDensity.evidenceDensity)}؛ بهتر است لایه‌ها و منبع‌های بیشتری فعال شوند.`;
  }
  if (requiredData.length > 0 && snapshot.dataFreshness.staleSources.length > 0) {
    return `برخی وابستگی‌ها ممکن است کهنه باشند: ${snapshot.dataFreshness.staleSources.slice(0, 3).join('، ')}.`;
  }
  return undefined;
}

export function composeGeoAnalysisPrompt(
  descriptor: Pick<GeoAnalysisRequestDescriptor, 'suggestion' | 'snapshot' | 'query' | 'customQuestion'>,
): string {
  const context = descriptor.snapshot.promptContext;
  const dependencyLine = descriptor.suggestion.requiredData.length > 0
    ? `وابستگی‌های داده‌ای قابل اتکا: ${descriptor.suggestion.requiredData.join('، ')}.`
    : '';
  const confidenceLine = descriptor.suggestion.confidenceNote
    ? `یادداشت اطمینان: ${descriptor.suggestion.confidenceNote}`
    : '';
  const customLine = descriptor.customQuestion
    ? `پرسش اختصاصی تحلیلگر: ${descriptor.customQuestion}`
    : '';
  const densityLine = `چگالی شواهد: ${inferDensityLabel(descriptor.snapshot.sourceDensity.evidenceDensity)}. تعداد سیگنال‌های نزدیک: ${descriptor.snapshot.sourceDensity.nearbySignalCount}.`;
  const freshnessLine = `پوشش داده: ${descriptor.snapshot.dataFreshness.coveragePercent}% با وضعیت ${descriptor.snapshot.dataFreshness.overallStatus}.`;

  return [
    descriptor.suggestion.promptTemplate,
    `درخواست اجرایی: ${descriptor.query}`,
    `کانتکست نقشه:\n${context}`,
    densityLine,
    freshnessLine,
    dependencyLine,
    confidenceLine,
    customLine,
    'خروجی باید به فارسی و با بخش‌های «واقعیت‌های مشاهده‌شده»، «استنباط تحلیلی»، «سناریوها»، «عدم‌قطعیت‌ها» و «توصیه‌های دفاعی» تنظیم شود.',
  ].filter(Boolean).join('\n\n');
}

export function buildGeoAnalysisStateChangedDetail(state: GeoAnalysisWorkspaceState): GeoAnalysisStateChangedDetail {
  return {
    activeResultId: state.activeResultId,
    runningJobs: state.jobs.filter((job) => job.status === 'running').length,
    unreadResults: state.results.filter((result) => result.unread).length,
  };
}

export function dispatchGeoAnalysisStateChanged(target: EventTarget, state: GeoAnalysisWorkspaceState): boolean {
  return target.dispatchEvent(new CustomEvent<GeoAnalysisStateChangedDetail>(GEO_ANALYSIS_EVENT_TYPES.stateChanged, {
    detail: buildGeoAnalysisStateChangedDetail(state),
  }));
}

export function dispatchGeoAnalysisOpenResult(target: EventTarget, detail: GeoAnalysisOpenResultDetail): boolean {
  return target.dispatchEvent(new CustomEvent<GeoAnalysisOpenResultDetail>(GEO_ANALYSIS_EVENT_TYPES.openResult, { detail }));
}

export function dispatchGeoAnalysisAssistantHandoff(target: EventTarget, detail: GeoAnalysisAssistantHandoffDetail): boolean {
  return target.dispatchEvent(new CustomEvent<GeoAnalysisAssistantHandoffDetail>(GEO_ANALYSIS_EVENT_TYPES.assistantHandoff, { detail }));
}

export function dispatchGeoAnalysisScenarioHandoff(target: EventTarget, detail: GeoAnalysisScenarioHandoffDetail): boolean {
  return target.dispatchEvent(new CustomEvent<GeoAnalysisScenarioHandoffDetail>(GEO_ANALYSIS_EVENT_TYPES.scenarioHandoff, { detail }));
}

export function scoreGeoForecastConfidence(snapshot: GeoContextSnapshot, response?: AssistantRunResponse): number {
  const scenarioScores = response?.message.structured?.scenarios.map((scenario) => clampScore(scenario.confidence.score)) ?? [];
  if (scenarioScores.length > 0) {
    return clampScore(scenarioScores.reduce((sum, item) => sum + item, 0) / scenarioScores.length);
  }

  const densityBase = snapshot.sourceDensity.evidenceDensity === 'high'
    ? 0.78
    : snapshot.sourceDensity.evidenceDensity === 'medium'
      ? 0.62
      : 0.44;
  const freshnessPenalty = snapshot.dataFreshness.overallStatus === 'sufficient'
    ? 0
    : snapshot.dataFreshness.overallStatus === 'limited'
      ? 0.08
      : 0.18;
  return clampScore(densityBase - freshnessPenalty);
}

export function buildAssistantHandoffQuery(result: GeoAnalysisResultRecord, followUp?: string): string {
  if (followUp) return followUp;
  const summary = result.response?.message.structured?.executiveSummary || result.descriptor.query;
  return `ادامه این تحلیل ژئویی را انجام بده و شکاف‌های اطلاعاتی و اقدام‌های دفاعی کوتاه‌مدت را روشن کن:\n${summary}`;
}

export function buildScenarioHandoffDetail(result: GeoAnalysisResultRecord): GeoAnalysisScenarioHandoffDetail {
  const scenario = result.response?.message.structured?.scenarios[0];
  const actors = result.descriptor.snapshot.selectedEntities.slice(0, 4);
  const constraints = [
    ...result.descriptor.snapshot.dataFreshness.staleSources.slice(0, 2).map((item) => `کهنگی داده ${item}`),
    ...result.descriptor.snapshot.activeLayers.slice(0, 2).map((item) => `وابستگی به لایه ${item}`),
  ].slice(0, 4);

  return {
    resultId: result.id,
    title: result.descriptor.title,
    event: scenario?.description || result.descriptor.query,
    actors,
    constraints,
    durationDays: scenario?.timeframe.includes('۳۰') ? 30 : scenario?.timeframe.includes('۷') ? 7 : 14,
  };
}
