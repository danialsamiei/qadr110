import type { AppContext, AppModule } from '@/app/app-context';
import type { MapContainerState } from '@/components';
import type { ScenarioEngineState } from '@/ai/scenario-engine';
import type { PredictionMarket } from '@/services/prediction';
import type { AiTaskClass } from '@/platform/ai/contracts';
import type { GeoContextSnapshot, GeoSuggestionItem } from '@/platform/operations/geo-analysis';
import type { MapContextEnvelope } from '@/platform/operations/map-context';
import type { AssistantConversationThread, AssistantSessionContext } from '@/platform/ai/assistant-contracts';
import { ANALYSIS_EVENT_TYPES } from '@/platform/operations/analysis-events';
import { buildOrchestratorPlan } from '@/services/ai-orchestrator/gateway';
import { normalizeAssistantSessionContext } from '@/services/ai-orchestrator/session';
import { loadAssistantWorkspaceState } from '@/services/assistant-workspace';
import { getCountryAtCoordinates } from '@/services/country-geometry';
import { dataFreshness } from '@/services/data-freshness';
import { buildGeoContextSnapshot, buildGeoSuggestions } from '@/services/map-analysis-workspace';
import { debounce } from '@/utils';
import {
  createPointMapContext,
  MAP_CONTEXT_EVENT,
  type MapNearbySignalContext,
} from '@/platform/operations/map-context';
import {
  dispatchPromptSuggestionRun,
  dispatchPromptSuggestionStateChanged,
  PROMPT_INTELLIGENCE_AGENT_PROFILE,
  type PromptSuggestionCategory,
  type PromptSuggestionItem,
  type PromptSuggestionScoreBreakdown,
  type PromptSuggestionState,
} from '@/platform/operations/prompt-intelligence';
import { scenarioIntelligenceStore } from '@/services/scenario-intelligence';
import { SCENARIO_INTELLIGENCE_EVENT_TYPES } from '@/platform/operations/scenario-intelligence';

const PANEL_ID = 'qadrPromptIntelPanel';
const COLLAPSED_KEY = 'qadr110-prompt-intel-collapsed';
const MIN_RESULTS = 5;
const MAX_RESULTS = 8;

interface CandidateTemplate {
  id: string;
  category: PromptSuggestionCategory;
  label: string;
  basePrompt: string;
  taskClass: AiTaskClass;
  domainMode: PromptSuggestionItem['domainMode'];
  baseScore: number;
  keywords: string[];
  layerHints: string[];
  requiresPredictions?: boolean;
  prefersDenseSignals?: boolean;
  prefersSession?: boolean;
  geoSuggestionId?: string;
}

export interface PromptSuggestionContextSnapshot {
  anchorLabel: string;
  mapState: MapContainerState | null;
  mapContext: MapContextEnvelope | null;
  scenarioState: ScenarioEngineState | null;
  geoSnapshot: GeoContextSnapshot;
  sessionContext: AssistantSessionContext;
  activeThread: AssistantConversationThread | null;
  activeLayers: string[];
  nearbySignals: GeoContextSnapshot['nearbySignals'];
  trendingSignals: string[];
  predictionSignals: PredictionMarket[];
  freshnessStatus: GeoContextSnapshot['dataFreshness']['overallStatus'];
  focusQuery?: string;
}

export const PROMPT_SUGGESTION_TEMPLATES: CandidateTemplate[] = [
  {
    id: 'osint-digest',
    category: 'osint',
    label: 'خلاصه OSINT این محدوده',
    basePrompt: 'برای این محدوده یک digest فارسی OSINT بساز و واقعیت‌ها، استنباط، عدم‌قطعیت و گام‌های پایش بعدی را جدا کن.',
    taskClass: 'briefing',
    domainMode: 'osint-digest',
    baseScore: 50,
    keywords: ['osint', 'digest', 'signal', 'news', 'feed'],
    layerHints: ['osint', 'gdelt', 'hotspots', 'protests', 'conflicts', 'outages', 'cyberThreats'],
    prefersDenseSignals: true,
    geoSuggestionId: 'geo-osint-digest',
  },
  {
    id: 'recent-signals',
    category: 'osint',
    label: 'جمع‌بندی سیگنال‌ها و خبرهای اخیر',
    basePrompt: 'خبرها، هشدارها، رخدادهای نزدیک و سیگنال‌های چندمنبعی این محدوده را با اولویت محلی جمع‌بندی کن و توضیح بده چرا هر مورد مهم است.',
    taskClass: 'summarization',
    domainMode: 'osint-digest',
    baseScore: 46,
    keywords: ['recent', 'signal', 'news', 'gdelt'],
    layerHints: ['osint', 'gdelt', 'hotspots', 'protests', 'conflicts', 'outages'],
    geoSuggestionId: 'geo-recent-signals',
  },
  {
    id: 'scenario-72h',
    category: 'forecast',
    label: 'سناریوهای ۷۲ ساعت آینده',
    basePrompt: 'برای این محدوده سناریوهای پایه، خوش‌بینانه و بدبینانه ۷۲ ساعت آینده را با triggerها، نشانه‌ها و spilloverها توضیح بده.',
    taskClass: 'forecasting',
    domainMode: 'predictive-analysis',
    baseScore: 48,
    keywords: ['scenario', '72h', 'forecast', 'trajectory'],
    layerHints: ['polymarket', 'conflicts', 'protests', 'military', 'flights', 'ais'],
    prefersDenseSignals: true,
    requiresPredictions: true,
    geoSuggestionId: 'geo-scenario-tree',
  },
  {
    id: 'trend-correlation',
    category: 'forecast',
    label: 'روندها و تغییر جهت‌ها',
    basePrompt: 'روندهای امنیتی، اجتماعی، زیرساختی و اطلاعاتی این محدوده را تحلیل کن و تفاوت ثبات در برابر وخامت را روشن کن.',
    taskClass: 'scenario-analysis',
    domainMode: 'predictive-analysis',
    baseScore: 42,
    keywords: ['trend', 'trajectory', 'forecast', 'shift'],
    layerHints: ['gdelt', 'roadTraffic', 'protests', 'outages', 'cyberThreats'],
    prefersDenseSignals: true,
    geoSuggestionId: 'geo-trend-analysis',
  },
  {
    id: 'geopolitical-risk',
    category: 'risk',
    label: 'تحلیل ریسک ژئوپلیتیک این منطقه',
    basePrompt: 'ریسک ژئوپلیتیک، بازیگران موثر، آسیب‌پذیری‌ها و محرک‌های تشدید در این محدوده را ارزیابی کن.',
    taskClass: 'briefing',
    domainMode: 'security-brief',
    baseScore: 52,
    keywords: ['risk', 'geopolitical', 'threat', 'security'],
    layerHints: ['osint', 'gdelt', 'military', 'conflicts', 'protests', 'outages', 'cyberThreats'],
    prefersDenseSignals: true,
  },
  {
    id: 'infrastructure-exposure',
    category: 'risk',
    label: 'آسیب‌پذیری زیرساخت و لجستیک',
    basePrompt: 'وابستگی‌های زیرساختی، گلوگاه‌ها، اختلال زنجیره تامین و ریسک‌های آبشاری در این محدوده را تحلیل کن.',
    taskClass: 'resilience-analysis',
    domainMode: 'infrastructure-risk',
    baseScore: 47,
    keywords: ['infrastructure', 'logistics', 'cascade', 'exposure'],
    layerHints: ['roadTraffic', 'flights', 'ais', 'waterways', 'outages', 'datacenters'],
    geoSuggestionId: 'geo-logistics-exposure',
  },
  {
    id: 'economic-correlation',
    category: 'strategy',
    label: 'همبستگی سیگنال‌ها با اثر اقتصادی',
    basePrompt: 'سیگنال‌های اخیر را با اثر اقتصادی، لجستیکی، تحریم‌پذیری و احساسات بازار correlate کن و خروجی دفاعی بده.',
    taskClass: 'report-generation',
    domainMode: 'economic-resilience',
    baseScore: 44,
    keywords: ['economic', 'market', 'correlate', 'impact', 'sanction'],
    layerHints: ['economic', 'polymarket', 'roadTraffic', 'waterways', 'ais', 'sanctions'],
    requiresPredictions: true,
    geoSuggestionId: 'geo-economic-shock',
  },
  {
    id: 'actor-spillovers',
    category: 'strategy',
    label: 'بازیگران، spilloverها و پیامدهای ثانویه',
    basePrompt: 'بازیگران، نهادها، زیرساخت‌ها و جغرافیاهای مرتبط با این محدوده را شناسایی کن و مسیرهای spillover را توضیح بده.',
    taskClass: 'scenario-analysis',
    domainMode: 'scenario-planning',
    baseScore: 45,
    keywords: ['actor', 'spillover', 'second-order', 'dependency'],
    layerHints: ['osint', 'military', 'hotspots', 'outages', 'roadTraffic'],
    prefersSession: true,
    geoSuggestionId: 'geo-spillovers',
  },
  {
    id: 'strategic-foresight-brief',
    category: 'strategy',
    label: 'کارگاه پیش‌نگری راهبردی این محدوده',
    basePrompt: 'برای این محدوده یک synthesis پیش‌نگری راهبردی فارسی بساز: سناریوهای غالب، futureهای رقیب، candidateهای قوی‌سیاه، highlights مناظره چندعاملی، watchpointها و next promptها را در قالب board-ready ارائه کن.',
    taskClass: 'report-generation',
    domainMode: 'strategic-foresight',
    baseScore: 49,
    keywords: ['foresight', 'board-ready', 'competing futures', 'strategic'],
    layerHints: ['osint', 'gdelt', 'polymarket', 'roadTraffic', 'outages', 'military', 'ais'],
    requiresPredictions: true,
    prefersDenseSignals: true,
    prefersSession: true,
  },
  {
    id: 'polymarket-gdelt-correlation',
    category: 'deep-analysis',
    label: 'همبستگی Polymarket / GDELT / OSINT',
    basePrompt: 'بازارهای پیش‌بینی، خبرها و سیگنال‌های OSINT این محدوده را کنار هم بگذار و بگو کجا همگرا و کجا واگرا هستند.',
    taskClass: 'scenario-analysis',
    domainMode: 'predictive-analysis',
    baseScore: 41,
    keywords: ['polymarket', 'gdelt', 'correlate', 'convergence', 'divergence'],
    layerHints: ['polymarket', 'gdelt', 'osint', 'roadTraffic', 'military', 'protests'],
    requiresPredictions: true,
    prefersSession: true,
  },
  {
    id: 'competing-hypotheses',
    category: 'deep-analysis',
    label: 'فرضیه‌های رقیب و نقاط کور',
    basePrompt: 'برای وضعیت این محدوده فرضیه‌های رقیب، نقاط کور، داده‌های متناقض و شرایط ابطال هر روایت را مشخص کن.',
    taskClass: 'deduction',
    domainMode: 'scenario-planning',
    baseScore: 43,
    keywords: ['hypothesis', 'blind spot', 'deep', 'contradiction'],
    layerHints: ['osint', 'gdelt', 'cyberThreats', 'protests', 'outages', 'hotspots'],
    prefersSession: true,
    prefersDenseSignals: true,
    geoSuggestionId: 'geo-data-gaps',
  },
];

function loadCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored === null) {
      return true;
    }
    return stored === '1';
  } catch {
    return true;
  }
}

function saveCollapsed(value: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
  } catch {
    // ignore storage failures
  }
}

function countEnabledLayers(layers: Record<string, boolean>): string[] {
  return Object.entries(layers)
    .filter(([, enabled]) => enabled)
    .map(([id]) => id);
}

function normalizePseudoLayers(ctx: AppContext, mapState: MapContainerState | null): string[] {
  const active = countEnabledLayers((mapState?.layers ?? ctx.mapLayers) as unknown as Record<string, boolean>);
  if (ctx.allNews.length > 0 || ctx.latestClusters.length > 0) {
    active.push('osint', 'gdelt');
  }
  if (ctx.latestPredictions.length > 0) {
    active.push('polymarket');
  }
  return Array.from(new Set(active));
}

function deriveTrendingSignals(ctx: AppContext, mapState: MapContainerState | null, countryName?: string): string[] {
  const region = mapState?.view ?? ctx.resolvedLocation;
  const normalizedCountry = countryName?.toLowerCase();
  const predictionTitles = ctx.latestPredictions
    .filter((item) =>
      (item.regions?.includes(region) ?? false)
      || (normalizedCountry ? item.title.toLowerCase().includes(normalizedCountry) : false))
    .slice(0, 4)
    .map((item) => item.title);
  const clusterTitles = ctx.latestClusters
    .filter((item) =>
      !normalizedCountry
      || item.primaryTitle.toLowerCase().includes(normalizedCountry))
    .slice(0, 4)
    .map((item) => item.primaryTitle);
  return Array.from(new Set([...predictionTitles, ...clusterTitles])).slice(0, 6);
}

function buildAnchorLabel(mapContext: MapContextEnvelope | null, countryName?: string): string {
  if (mapContext?.selection.kind === 'country') return mapContext.selection.countryName;
  if (mapContext?.selection.kind === 'point') return mapContext.selection.label || mapContext.selection.countryName || 'این نقطه';
  if (mapContext?.selection.kind === 'polygon') return mapContext.selection.label || 'این محدوده';
  if (mapContext?.selection.kind === 'layer') return mapContext.selection.layerLabel || mapContext.selection.layerId;
  if (mapContext?.selection.kind === 'incident') return mapContext.selection.label;
  return countryName || 'این محدوده';
}

function getActiveThreadContext(): {
  activeThread: AssistantConversationThread | null;
  sessionContext: AssistantSessionContext;
} {
  const workspace = loadAssistantWorkspaceState();
  const activeThread = workspace.threads.find((thread) => thread.id === workspace.activeThreadId)
    ?? workspace.threads[0]
    ?? null;
  return {
    activeThread,
    sessionContext: normalizeAssistantSessionContext(activeThread?.sessionContext, activeThread?.id || 'prompt-engine'),
  };
}

function resolveFocusQuery(activeThread: AssistantConversationThread | null, sessionContext: AssistantSessionContext): string | undefined {
  const latestIntent = sessionContext.intentHistory[sessionContext.intentHistory.length - 1];
  if (latestIntent?.query) return latestIntent.query;
  if (!activeThread) return undefined;
  for (let index = activeThread.messages.length - 1; index >= 0; index -= 1) {
    const message = activeThread.messages[index];
    if (message?.role === 'user' && message.content.trim()) {
      return message.content.trim();
    }
  }
  return undefined;
}

function buildPromptSuggestionContextSnapshot(
  ctx: AppContext,
  mapContext: MapContextEnvelope | null,
): PromptSuggestionContextSnapshot | null {
  const center = ctx.map?.getCenter();
  const mapState = ctx.map?.getState() ?? null;
  if (!center || !mapState) return null;

  const selectedCountryCode = ctx.countryBriefPage?.isVisible() ? ctx.countryBriefPage.getCode() : undefined;
  const selectedCountryName = ctx.countryBriefPage?.isVisible() ? ctx.countryBriefPage.getName() : undefined;
  const geoCountry = getCountryAtCoordinates(center.lat, center.lon, selectedCountryCode ? [selectedCountryCode] : undefined);
  const countryCode = selectedCountryCode || geoCountry?.code;
  const countryName = selectedCountryName || geoCountry?.name;
  const activeLayers = normalizePseudoLayers(ctx, mapState);
  const geoSnapshot = buildGeoContextSnapshot({
    lat: center.lat,
    lon: center.lon,
    countryCode,
    countryName,
    adminRegion: undefined,
    activeLayers,
    timeRangeLabel: ctx.currentTimeRange,
    zoom: mapState.zoom,
    view: mapState.view,
    bbox: ctx.map?.getBbox(),
    allNews: ctx.allNews,
    outages: ctx.intelligenceCache.outages,
    protests: ctx.intelligenceCache.protests?.events,
    militaryFlights: ctx.intelligenceCache.military?.flights,
    militaryVessels: ctx.intelligenceCache.military?.vessels,
    cyberThreats: ctx.cyberThreatsCache ?? undefined,
    earthquakes: ctx.intelligenceCache.earthquakes,
    flightDelays: ctx.intelligenceCache.flightDelays,
    freshnessSummary: dataFreshness.getSummary(),
  });

  const { activeThread, sessionContext } = getActiveThreadContext();
  return {
    anchorLabel: buildAnchorLabel(mapContext || geoSnapshot.context, countryName),
    mapState,
    mapContext: mapContext || geoSnapshot.context,
    scenarioState: scenarioIntelligenceStore.getState(),
    geoSnapshot,
    sessionContext,
    activeThread,
    activeLayers,
    nearbySignals: geoSnapshot.nearbySignals,
    trendingSignals: deriveTrendingSignals(ctx, mapState, countryName),
    predictionSignals: ctx.latestPredictions
      .filter((item) => item.regions?.includes(mapState.view) || !item.regions?.length)
      .slice(0, 6),
    freshnessStatus: geoSnapshot.dataFreshness.overallStatus,
    focusQuery: resolveFocusQuery(activeThread, sessionContext),
  };
}

function overlapCount(candidates: string[], haystack: string[]): number {
  const normalizedHaystack = haystack.map((item) => item.toLowerCase());
  return candidates.filter((item) => normalizedHaystack.some((candidate) => candidate.includes(item.toLowerCase()))).length;
}

function mapCategoryToLabel(category: PromptSuggestionCategory): string {
  switch (category) {
    case 'osint': return 'OSINT';
    case 'forecast': return 'پیش‌بینی';
    case 'risk': return 'ریسک';
    case 'strategy': return 'راهبرد';
    default: return 'تحلیل عمیق';
  }
}

function routeLabel(route: PromptSuggestionItem['orchestratorRoute']): string {
  switch (route) {
    case 'fast-local': return 'محلی سریع';
    case 'reasoning-local': return 'استدلال محلی';
    case 'structured-json': return 'ساخت‌یافته';
    default: return 'ارتقای ابری';
  }
}

function composeQuery(template: CandidateTemplate, anchorLabel: string): string {
  switch (template.id) {
    case 'scenario-72h':
      return `در ۷۲ ساعت آینده برای ${anchorLabel} چه سناریوهایی ممکن است شکل بگیرد؟`;
    case 'economic-correlation':
      return `سیگنال‌های اخیر ${anchorLabel} را با اثر اقتصادی و لجستیکی correlate کن.`;
    case 'polymarket-gdelt-correlation':
      return `سیگنال‌های Polymarket و GDELT در ${anchorLabel} کجا همگرا و کجا واگرا هستند؟`;
    case 'geopolitical-risk':
      return `ریسک ژئوپلیتیک ${anchorLabel} را تحلیل کن.`;
    default:
      return `${template.label} برای ${anchorLabel}`;
  }
}

function composePrompt(
  template: CandidateTemplate,
  context: PromptSuggestionContextSnapshot,
  geoHint?: GeoSuggestionItem,
): string {
  const trendLines = context.trendingSignals.length > 0
    ? `سیگنال‌های روند/Polymarket/GDELT:\n- ${context.trendingSignals.join('\n- ')}`
    : '';
  const nearbyLines = context.nearbySignals.length > 0
    ? `سیگنال‌های نزدیک:\n- ${context.nearbySignals.slice(0, 5).map((signal) => `${signal.label} (${signal.kind})`).join('\n- ')}`
    : '';
  const sessionLines = context.sessionContext.intentHistory.length > 0
    ? `history جلسه:\n- ${context.sessionContext.intentHistory.slice(-3).map((item) => item.query).join('\n- ')}`
    : '';
  const basePrompt = geoHint?.promptTemplate || template.basePrompt;

  return [
    basePrompt,
    geoHint?.summary ? `چرایی پایه ژئو-تحلیل: ${geoHint.summary}` : '',
    `کانون تحلیل: ${context.anchorLabel}`,
    context.focusQuery ? `پرسش/تمرکز جاری کاربر: ${context.focusQuery}` : '',
    `زوم و نمای نقشه: ${context.mapState?.zoom.toFixed(1) || '?'} / ${context.mapState?.view || 'global'}`,
    `لایه‌های فعال: ${context.activeLayers.join('، ') || 'بدون لایه فعال'}`,
    nearbyLines,
    trendLines,
    sessionLines,
    `کانتکست نقشه:\n${context.geoSnapshot.promptContext}`,
    'پاسخ باید در بخش‌های «واقعیت‌های مشاهده‌شده»، «استنباط تحلیلی»، «سناریوها»، «عدم‌قطعیت‌ها» و «توصیه‌های دفاعی» تنظیم شود و توضیح دهد چرا این پرامپت در این لحظه مهم است.',
  ].filter(Boolean).join('\n\n');
}

export function scorePromptSuggestionCandidate(
  template: CandidateTemplate,
  context: PromptSuggestionContextSnapshot,
): { total: number; breakdown: PromptSuggestionScoreBreakdown; why: string } {
  const signalCount = context.nearbySignals.length;
  const layerMatches = overlapCount(template.layerHints, context.activeLayers);
  const trendMatches = template.requiresPredictions
    ? Math.max(0, context.predictionSignals.length)
    : overlapCount(template.keywords, context.trendingSignals);
  const sessionTokens = [
    context.focusQuery || '',
    ...(context.sessionContext.intentHistory.slice(-3).map((item) => item.inferredIntent)),
    ...(context.sessionContext.reusableInsights.slice(-3).map((item) => item.summary)),
    ...(context.activeThread?.messages.slice(-2).map((message) => message.content) ?? []),
  ].filter(Boolean);
  const sessionMatches = overlapCount(template.keywords, sessionTokens);
  const scenarioTokens = [
    ...(context.scenarioState?.scenarios.slice(0, 3).flatMap((scenario) => [scenario.title, ...scenario.drivers.slice(0, 2)]) ?? []),
    ...(context.scenarioState?.drift.slice(0, 3).flatMap((record) => [record.direction, record.reason]) ?? []),
  ].filter(Boolean);
  const scenarioMatches = overlapCount(template.keywords, scenarioTokens);

  const mapScore = Math.min(18, signalCount * (template.prefersDenseSignals ? 4 : 2)) + (context.mapContext ? 4 : 0);
  const layerScore = Math.min(16, layerMatches * 5);
  const trendScore = Math.min(14, trendMatches * (template.requiresPredictions ? 4 : 3));
  const scenarioScore = Math.min(12, scenarioMatches * 4)
    + Math.min(4, (context.scenarioState?.scenarios.length ?? 0) > 0 ? 4 : 0);
  const sessionScore = Math.min(14, sessionMatches * 4)
    + (template.prefersSession ? Math.min(4, context.sessionContext.reusableInsights.length * 2) : 0);
  const freshnessScore = context.freshnessStatus === 'sufficient'
    ? 10
    : context.freshnessStatus === 'limited'
      ? 6
      : 2;

  const total = Math.min(100, template.baseScore + mapScore + layerScore + trendScore + scenarioScore + sessionScore + freshnessScore);
  const whyParts = [
    signalCount > 0 ? `${signalCount} سیگنال نزدیک` : '',
    layerMatches > 0 ? `${layerMatches} لایه هم‌راستا` : '',
    trendMatches > 0 ? `${trendMatches} سیگنال روند/بازار` : '',
    scenarioMatches > 0 ? 'هم‌راستا با state سناریو' : '',
    sessionMatches > 0 ? 'هم‌راستا با پرسش/حافظه جلسه' : '',
    freshnessScore >= 6 ? 'پوشش داده مناسب' : 'پوشش داده محدود',
  ].filter(Boolean);

  return {
    total,
    breakdown: {
      base: template.baseScore,
      map: mapScore,
      layers: layerScore,
      trends: trendScore,
      scenario: scenarioScore,
      session: sessionScore,
      freshness: freshnessScore,
      total,
    },
    why: `چون ${whyParts.join('، ')}.`,
  };
}

function composeExpectedInsight(
  template: CandidateTemplate,
  context: PromptSuggestionContextSnapshot,
): string {
  const topScenario = context.scenarioState?.scenarios[0]?.title;
  const topSignal = context.nearbySignals[0]?.label;
  const intent = context.focusQuery || context.sessionContext.activeIntentSummary || context.anchorLabel;

  switch (template.category) {
    case 'osint':
      return `انتظار می‌رود تصویر روشن‌تری از سیگنال‌های کلیدی، تعارض داده‌ها و میزان اتکاپذیری شواهد پیرامون ${context.anchorLabel} به‌دست آید.`;
    case 'forecast':
      return `انتظار می‌رود مسیرهای محتمل کوتاه‌مدت، triggerهای تشدید و نسبت آن‌ها با ${topScenario || 'سناریوی غالب'} روشن‌تر شود.`;
    case 'risk':
      return `انتظار می‌رود آسیب‌پذیری‌های عملیاتی و ریسک‌های آبشاری مرتبط با ${topSignal || context.anchorLabel} دقیق‌تر اولویت‌بندی شوند.`;
    case 'strategy':
      return `انتظار می‌رود از دل ${intent} یک پرسش راهبردی قابل تصمیم و گزینه‌های پایش/اقدام روشن استخراج شود.`;
    default:
      return `انتظار می‌رود یک زاویه جایگزین، فرضیه رقیب یا شکاف تحلیلی مهم درباره ${context.anchorLabel} آشکار شود.`;
  }
}

function selectDiverseSuggestions(items: PromptSuggestionItem[]): PromptSuggestionItem[] {
  const grouped = new Map<PromptSuggestionCategory, PromptSuggestionItem[]>();
  items.forEach((item) => {
    const bucket = grouped.get(item.category) ?? [];
    bucket.push(item);
    grouped.set(item.category, bucket);
  });
  grouped.forEach((bucket) => bucket.sort((a, b) => b.score - a.score));

  const chosen: PromptSuggestionItem[] = [];
  const categories: PromptSuggestionCategory[] = ['osint', 'forecast', 'risk', 'strategy', 'deep-analysis'];
  categories.forEach((category) => {
    const first = grouped.get(category)?.[0];
    if (first) chosen.push(first);
  });

  const existingIds = new Set(chosen.map((item) => item.id));
  const rest = items
    .filter((item) => !existingIds.has(item.id))
    .sort((a, b) => b.score - a.score);

  for (const item of rest) {
    if (chosen.length >= MAX_RESULTS) break;
    chosen.push(item);
  }

  return chosen.slice(0, Math.max(MIN_RESULTS, Math.min(MAX_RESULTS, chosen.length)));
}

export function generatePromptSuggestions(context: PromptSuggestionContextSnapshot): PromptSuggestionItem[] {
  const geoSuggestions = buildGeoSuggestions(context.geoSnapshot)
    .flatMap((group) => group.items)
    .reduce<Record<string, GeoSuggestionItem>>((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});

  const candidates = PROMPT_SUGGESTION_TEMPLATES.map((template) => {
    const scoring = scorePromptSuggestionCandidate(template, context);
    const query = composeQuery(template, context.anchorLabel);
    const geoHint = template.geoSuggestionId ? geoSuggestions[template.geoSuggestionId] : undefined;
    const promptText = composePrompt(template, context, geoHint);
    const plan = buildOrchestratorPlan({
      conversationId: `prompt-suggestion:${template.id}`,
      locale: 'fa-IR',
      domainMode: template.domainMode,
      taskClass: template.taskClass,
      query,
      promptText,
      messages: [],
      mapContext: context.mapContext,
      pinnedEvidence: [],
      localContextPackets: [],
      memoryNotes: [],
      sessionContext: context.sessionContext,
    }, context.sessionContext);

    return {
      id: template.id,
      category: template.category,
      label: template.label,
      why: `${scoring.why} مسیر اجرا: ${routeLabel(plan.routeClass)}.`,
      expectedInsight: composeExpectedInsight(template, context),
      query,
      promptText,
      domainMode: template.domainMode,
      taskClass: template.taskClass,
      score: scoring.total,
      scoreBreakdown: scoring.breakdown,
      orchestratorRoute: plan.routeClass,
      routeLabel: routeLabel(plan.routeClass),
    } satisfies PromptSuggestionItem;
  }).sort((a, b) => b.score - a.score);

  return selectDiverseSuggestions(candidates);
}

export class PromptSuggestionEngine implements AppModule {
  private readonly ctx: AppContext;
  private panelEl: HTMLElement | null = null;
  private collapsed = loadCollapsed();
  private lastMapContext: MapContextEnvelope | null = null;
  private latestContext: PromptSuggestionContextSnapshot | null = null;
  private pulseTimer: number | null = null;
  private latestState: PromptSuggestionState | null = null;
  private readonly debouncedRefresh: (() => void) & { cancel(): void };
  private readonly mapContextHandler: EventListener;
  private readonly analysisCompleteHandler: EventListener;
  private readonly scenarioStateHandler: EventListener;
  private readonly refreshActionHandler = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const actionEl = target.closest<HTMLElement>('[data-prompt-intel-action]');
    if (actionEl) {
      const action = actionEl.dataset.promptIntelAction;
      if (action === 'toggle') {
        this.collapsed = !this.collapsed;
        saveCollapsed(this.collapsed);
        this.render();
      } else if (action === 'refresh') {
        this.refresh('manual');
      }
      return;
    }

    const suggestionEl = target.closest<HTMLElement>('[data-prompt-suggestion-id]');
    if (!suggestionEl || !this.latestState) return;
    const suggestion = this.latestState.suggestions.find((item) => item.id === suggestionEl.dataset.promptSuggestionId);
    if (!suggestion) return;
    this.focusAssistantPanel();
    const mapContext = this.lastMapContext ?? this.buildFallbackMapContext();
    dispatchPromptSuggestionRun(document, {
      source: 'floating-panel',
      suggestion,
      mapContext,
      autoSubmit: true,
    });
  };

  constructor(ctx: AppContext) {
    this.ctx = ctx;
    this.debouncedRefresh = debounce(() => this.refreshNow(), 260);
    this.mapContextHandler = ((event: CustomEvent<MapContextEnvelope>) => {
      this.lastMapContext = event.detail;
      this.debouncedRefresh();
    }) as EventListener;
    this.analysisCompleteHandler = (() => {
      this.debouncedRefresh();
    }) as EventListener;
    this.scenarioStateHandler = (() => {
      this.debouncedRefresh();
    }) as EventListener;
  }

  init(): void {
    this.mount();
    this.ctx.map?.onStateChanged(() => this.debouncedRefresh());
    this.ctx.map?.setOnLayerChange(() => this.debouncedRefresh());
    this.ctx.map?.onTimeRangeChanged(() => this.debouncedRefresh());
    document.addEventListener(MAP_CONTEXT_EVENT, this.mapContextHandler);
    document.addEventListener(ANALYSIS_EVENT_TYPES.completed, this.analysisCompleteHandler);
    document.addEventListener(ANALYSIS_EVENT_TYPES.failed, this.analysisCompleteHandler);
    document.addEventListener(SCENARIO_INTELLIGENCE_EVENT_TYPES.stateChanged, this.scenarioStateHandler);
    this.pulseTimer = window.setInterval(() => this.refreshNow(), 60_000);
    this.refreshNow();
  }

  destroy(): void {
    this.debouncedRefresh.cancel();
    if (this.pulseTimer != null) {
      window.clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
    document.removeEventListener(MAP_CONTEXT_EVENT, this.mapContextHandler);
    document.removeEventListener(ANALYSIS_EVENT_TYPES.completed, this.analysisCompleteHandler);
    document.removeEventListener(ANALYSIS_EVENT_TYPES.failed, this.analysisCompleteHandler);
    document.removeEventListener(SCENARIO_INTELLIGENCE_EVENT_TYPES.stateChanged, this.scenarioStateHandler);
    if (this.panelEl) {
      this.panelEl.removeEventListener('click', this.refreshActionHandler);
      this.panelEl.remove();
      this.panelEl = null;
    }
  }

  public refresh(_reason = 'manual'): void {
    this.debouncedRefresh();
  }

  private refreshNow(): void {
    const context = buildPromptSuggestionContextSnapshot(this.ctx, this.lastMapContext);
    if (!context) return;
    this.latestContext = context;
    const suggestions = generatePromptSuggestions(context);
    this.latestState = {
      updatedAt: new Date().toISOString(),
      anchorLabel: context.anchorLabel,
      suggestions,
    };
    dispatchPromptSuggestionStateChanged(document, this.latestState);
    this.render();
  }

  private mount(): void {
    if (this.panelEl) return;
    const host = this.ctx.container.querySelector<HTMLElement>('#mapSection .map-container')
      || this.ctx.container.querySelector<HTMLElement>('#mapSection')
      || this.ctx.container;
    this.panelEl = document.createElement('aside');
    this.panelEl.id = PANEL_ID;
    this.panelEl.className = 'qadr-prompt-intel-panel';
    this.panelEl.setAttribute('aria-label', 'پیشنهادهای هوشمند');
    this.panelEl.setAttribute('role', 'complementary');
    this.panelEl.addEventListener('click', this.refreshActionHandler);
    host.appendChild(this.panelEl);
  }

  private buildFallbackMapContext(): MapContextEnvelope | null {
    if (!this.latestContext?.mapState) return null;
    const center = this.latestContext.geoSnapshot.center;
    const nearbySignals: MapNearbySignalContext[] = this.latestContext.nearbySignals.slice(0, 6).map((signal) => ({
      id: signal.id,
      label: signal.label,
      kind: signal.kind,
      distanceKm: signal.distanceKm,
      severity: signal.severity,
      occurredAt: signal.occurredAt,
    }));
    return createPointMapContext(`prompt-intel:${Date.now()}`, {
      lat: center.lat,
      lon: center.lon,
      label: this.latestContext.anchorLabel,
      countryCode: this.latestContext.geoSnapshot.country?.code,
      countryName: this.latestContext.geoSnapshot.country?.name,
    }, {
      activeLayers: this.latestContext.activeLayers,
      timeRange: { label: this.ctx.currentTimeRange },
      viewport: this.latestContext.geoSnapshot.viewport,
      workspaceMode: this.latestContext.geoSnapshot.workspaceMode,
      watchlists: this.latestContext.geoSnapshot.watchlists,
      selectedEntities: this.latestContext.geoSnapshot.selectedEntities,
      nearbySignals,
      dataFreshness: {
        overallStatus: this.latestContext.geoSnapshot.dataFreshness.overallStatus,
        coveragePercent: this.latestContext.geoSnapshot.dataFreshness.coveragePercent,
        freshSources: this.latestContext.geoSnapshot.dataFreshness.freshSources,
        staleSources: this.latestContext.geoSnapshot.dataFreshness.staleSources,
        evidenceDensity: this.latestContext.geoSnapshot.sourceDensity.evidenceDensity,
      },
    });
  }

  private focusAssistantPanel(): void {
    const panel = document.querySelector<HTMLElement>('[data-panel="qadr-assistant"]');
    if (!panel) return;
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    panel.classList.add('panel-flash-outline');
    window.setTimeout(() => panel.classList.remove('panel-flash-outline'), 1200);
  }

  private render(): void {
    if (!this.panelEl) return;
    const suggestions = this.latestState?.suggestions ?? [];
    const anchorLabel = this.latestState?.anchorLabel || 'نقشه';
    const stamp = this.latestState?.updatedAt
      ? new Date(this.latestState.updatedAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
      : '--:--';

    this.panelEl.classList.toggle('is-collapsed', this.collapsed);
    this.panelEl.innerHTML = `
      <div class="qadr-prompt-intel-shell">
        <div class="qadr-prompt-intel-header">
          <div class="qadr-prompt-intel-heading">
            <span class="qadr-prompt-intel-kicker">Prompt Intelligence</span>
            <strong>پیشنهادهای هوشمند</strong>
            <span class="qadr-prompt-intel-anchor">${anchorLabel}</span>
          </div>
          <div class="qadr-prompt-intel-actions">
            <button type="button" class="qadr-prompt-intel-icon" data-prompt-intel-action="refresh" aria-label="بازآوری">⟳</button>
            <button type="button" class="qadr-prompt-intel-icon" data-prompt-intel-action="toggle" aria-label="${this.collapsed ? 'باز کردن پیشنهادهای هوشمند' : 'جمع کردن پیشنهادهای هوشمند'}" aria-expanded="${this.collapsed ? 'false' : 'true'}" aria-controls="qadrPromptIntelList">${this.collapsed ? '‹' : '›'}</button>
          </div>
        </div>
        <div class="qadr-prompt-intel-meta">
          <span>آخرین بازآوری: ${stamp}</span>
          <span>${suggestions.length} پیشنهاد</span>
          <span>${PROMPT_INTELLIGENCE_AGENT_PROFILE.role}</span>
        </div>
        <div class="qadr-prompt-intel-compact-list" id="qadrPromptIntelCompactList" ${this.collapsed ? '' : 'hidden'}>
          ${suggestions.length > 0 ? suggestions.map((item) => `
            <button type="button" class="qadr-prompt-intel-compact-card" data-prompt-suggestion-id="${item.id}">
              <strong class="qadr-prompt-intel-compact-title">${item.label}</strong>
            </button>
          `).join('') : '<div class="qadr-prompt-intel-empty">فعلا کانتکست کافی برای پیشنهاد پویا در دسترس نیست.</div>'}
        </div>
        <div class="qadr-prompt-intel-list" id="qadrPromptIntelList" ${this.collapsed ? 'hidden' : ''}>
          ${suggestions.length > 0 ? suggestions.map((item) => `
            <button type="button" class="qadr-prompt-intel-card" data-prompt-suggestion-id="${item.id}">
              <div class="qadr-prompt-intel-card-top">
                <span class="qadr-prompt-intel-badge category-${item.category}">${mapCategoryToLabel(item.category)}</span>
                <span class="qadr-prompt-intel-route">${item.routeLabel}</span>
              </div>
              <strong class="qadr-prompt-intel-title">${item.label}</strong>
              <p class="qadr-prompt-intel-query">${item.query}</p>
              <p class="qadr-prompt-intel-why">${item.why}</p>
              <p class="qadr-prompt-intel-insight">${item.expectedInsight}</p>
              <div class="qadr-prompt-intel-score">امتیاز ارتباط: ${item.score}</div>
            </button>
          `).join('') : '<div class="qadr-prompt-intel-empty">فعلا کانتکست کافی برای پیشنهاد پویا در دسترس نیست.</div>'}
        </div>
      </div>
    `;
  }
}
