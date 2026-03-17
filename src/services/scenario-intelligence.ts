import type { AppContext, AppModule } from '@/app/app-context';
import {
  compareScenarios,
  getScenarios,
  updateScenarios,
  type ScenarioEngineInput,
  type ScenarioEngineState,
} from '@/ai/scenario-engine';
import { type MapContainerState } from '@/components';
import { getCountryAtCoordinates } from '@/services/country-geometry';
import { dataFreshness } from '@/services/data-freshness';
import { buildGeoContextSnapshot } from '@/services/map-analysis-workspace';
import {
  ASSISTANT_WORKSPACE_EVENT,
  loadAssistantWorkspaceState,
} from '@/services/assistant-workspace';
import {
  buildMapContextCacheKey,
  createPointMapContext,
  type MapContextEnvelope,
} from '@/platform/operations/map-context';
import {
  dispatchScenarioIntelligenceDriftDetected,
  dispatchScenarioIntelligenceStateChanged,
} from '@/platform/operations/scenario-intelligence';
import { debounce } from '@/utils';
import type { AssistantContextPacket, AssistantConversationThread, AssistantSessionContext } from '@/platform/ai/assistant-contracts';
import type { PredictionMarket } from '@/services/prediction';
import type { ClusteredEvent } from '@/types';
import { MARKET_WATCHLIST_EVENT } from '@/services/market-watchlist';
import type { MapPointClickPayload } from '@/components/map-interactions';

type Listener = (state: ScenarioEngineState | null) => void;

class ScenarioIntelligenceStore {
  private state: ScenarioEngineState | null = null;
  private readonly listeners = new Set<Listener>();

  getState(): ScenarioEngineState | null {
    return this.state;
  }

  setState(state: ScenarioEngineState | null): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const scenarioIntelligenceStore = new ScenarioIntelligenceStore();

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function createPacket(params: {
  id: string;
  title: string;
  summary: string;
  sourceLabel: string;
  sourceType: AssistantContextPacket['sourceType'];
  updatedAt: string;
  score: number;
  tags: string[];
  derivedFromIds?: string[];
}): AssistantContextPacket {
  return {
    id: params.id,
    title: params.title,
    summary: params.summary,
    content: `${params.title}\n${params.summary}`,
    sourceLabel: params.sourceLabel,
    sourceType: params.sourceType,
    updatedAt: params.updatedAt,
    score: clamp(params.score),
    tags: params.tags,
    provenance: {
      sourceIds: [params.id],
      evidenceIds: [params.id],
      derivedFromIds: params.derivedFromIds ?? [],
    },
  };
}

function activeThreadContext(): {
  activeThread: AssistantConversationThread | null;
  sessionContext: AssistantSessionContext | null;
  focusQuery?: string;
} {
  const workspace = loadAssistantWorkspaceState();
  const activeThread = workspace.threads.find((thread) => thread.id === workspace.activeThreadId)
    ?? workspace.threads[0]
    ?? null;
  const focusQuery = activeThread?.messages
    .slice()
    .reverse()
    .find((message) => message.role === 'user' && message.content.trim())?.content.trim()
    || activeThread?.sessionContext?.intentHistory?.[activeThread.sessionContext.intentHistory.length - 1]?.query;

  return {
    activeThread,
    sessionContext: activeThread?.sessionContext ?? null,
    focusQuery,
  };
}

function activeLayers(ctx: AppContext, mapState: MapContainerState | null): string[] {
  const layers = Object.entries((mapState?.layers ?? ctx.mapLayers) as unknown as Record<string, boolean>)
    .filter(([, enabled]) => enabled)
    .map(([id]) => id);
  if (ctx.latestClusters.length > 0 || ctx.allNews.length > 0) layers.push('osint', 'gdelt');
  if (ctx.latestPredictions.length > 0) layers.push('polymarket');
  return Array.from(new Set(layers));
}

function buildPredictionPackets(markets: PredictionMarket[]): AssistantContextPacket[] {
  return markets.slice(0, 4).map((market, index) => createPacket({
    id: `scenario-polymarket:${index}:${market.title.slice(0, 48)}`,
    title: market.title,
    summary: `قیمت بله: ${Math.round(market.yesPrice)}%${market.volume ? ` | حجم: ${Math.round(market.volume)}` : ''}`,
    sourceLabel: 'Polymarket',
    sourceType: 'feed',
    updatedAt: market.endDate || new Date().toISOString(),
    score: 0.34 + (1 - Math.abs(50 - market.yesPrice) / 50) * 0.46,
    tags: ['polymarket', 'prediction-market'],
  }));
}

function buildClusterPackets(clusters: ClusteredEvent[]): AssistantContextPacket[] {
  return clusters.slice(0, 4).map((cluster, index) => createPacket({
    id: `scenario-cluster:${cluster.id || index}`,
    title: cluster.primaryTitle,
    summary: [
      `${cluster.sourceCount} منبع`,
      cluster.velocity ? `sentiment=${cluster.velocity.sentiment}` : '',
      cluster.velocity ? `trend=${cluster.velocity.trend}` : '',
    ].filter(Boolean).join(' | '),
    sourceLabel: cluster.primarySource || 'News Cluster',
    sourceType: 'feed',
    updatedAt: cluster.lastUpdated?.toISOString?.() || new Date().toISOString(),
    score: 0.36 + Math.min(0.4, cluster.sourceCount * 0.05),
    tags: ['news-cluster', cluster.velocity?.sentiment || 'neutral'],
  }));
}

function buildSocialSentimentPacket(ctx: AppContext, geoSnapshot: ReturnType<typeof buildGeoContextSnapshot>): AssistantContextPacket | null {
  const protestCount = geoSnapshot.nearbySignals.filter((signal) => signal.kind === 'protest').length;
  const outageCount = geoSnapshot.nearbySignals.filter((signal) => signal.kind === 'outage').length;
  const socialClusters = ctx.latestClusters.filter((cluster) => cluster.velocity?.sentiment === 'negative').length;
  const score = clamp(0.24 + (protestCount * 0.08) + (outageCount * 0.05) + (socialClusters * 0.04));
  if (score < 0.34) return null;

  return createPacket({
    id: `scenario-social:${geoSnapshot.context.id}`,
    title: `فشار اجتماعی پیرامون ${geoSnapshot.country?.name || 'محدوده انتخابی'}`,
    summary: `اعتراض‌های نزدیک: ${protestCount} | outageهای نزدیک: ${outageCount} | خوشه‌های خبری منفی: ${socialClusters}`,
    sourceLabel: 'Social Sentiment Fusion',
    sourceType: 'model',
    updatedAt: new Date().toISOString(),
    score,
    tags: ['social-sentiment', 'fusion'],
  });
}

function buildMapContext(
  ctx: AppContext,
  lat: number,
  lon: number,
  mapState: MapContainerState,
) : { mapContext: MapContextEnvelope; geoSnapshot: ReturnType<typeof buildGeoContextSnapshot>; anchorLabel: string } {
  const country = getCountryAtCoordinates(lat, lon);
  const geoSnapshot = buildGeoContextSnapshot({
    lat,
    lon,
    countryCode: country?.code,
    countryName: country?.name,
    activeLayers: activeLayers(ctx, mapState),
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
  const anchorLabel = country?.name || geoSnapshot.country?.name || 'این محدوده';
  const mapContext = createPointMapContext(
    `scenario-live:${Date.now()}`,
    {
      lat,
      lon,
      label: `کانون سناریو در ${anchorLabel}`,
      countryCode: country?.code,
      countryName: country?.name,
    },
    {
      activeLayers: geoSnapshot.activeLayers,
      timeRange: { label: ctx.currentTimeRange },
      viewport: geoSnapshot.viewport,
      workspaceMode: geoSnapshot.workspaceMode,
      watchlists: geoSnapshot.watchlists,
      selectedEntities: geoSnapshot.selectedEntities,
      nearbySignals: geoSnapshot.nearbySignals,
      dataFreshness: geoSnapshot.dataFreshness,
      contextSummary: geoSnapshot.promptContext,
      geopoliticalContext: geoSnapshot.context.geopoliticalContext,
      sourceClusters: geoSnapshot.context.sourceClusters,
    },
  );
  mapContext.cacheKey = buildMapContextCacheKey(mapContext);
  return { mapContext, geoSnapshot, anchorLabel };
}

function deriveTrigger(anchorLabel: string, geoSnapshot: ReturnType<typeof buildGeoContextSnapshot>, focusQuery?: string): string {
  if (focusQuery?.trim()) return focusQuery.trim();
  const topSignal = geoSnapshot.nearbySignals[0];
  if (topSignal) {
    return `اگر ${topSignal.label} در ${anchorLabel} تشدید شود`;
  }
  return `اگر در ${anchorLabel} یک اختلال راهبردی رخ دهد`;
}

function buildScenarioInput(
  ctx: AppContext,
  lat: number,
  lon: number,
): ScenarioEngineInput | null {
  const mapState = ctx.map?.getState() ?? null;
  if (!mapState) return null;
  const { activeThread, sessionContext, focusQuery } = activeThreadContext();
  const { mapContext, geoSnapshot, anchorLabel } = buildMapContext(ctx, lat, lon, mapState);
  const localContextPackets = [
    ...buildPredictionPackets(ctx.latestPredictions),
    ...buildClusterPackets(ctx.latestClusters),
  ];
  const sentimentPacket = buildSocialSentimentPacket(ctx, geoSnapshot);
  if (sentimentPacket) localContextPackets.push(sentimentPacket);

  return {
    trigger: deriveTrigger(anchorLabel, geoSnapshot, focusQuery),
    query: focusQuery,
    mapContext,
    localContextPackets,
    sessionContext,
    timeContext: new Date().toISOString(),
    maxScenarios: activeThread ? 6 : 5,
  };
}

export class ScenarioIntelligenceEngine implements AppModule {
  private anchor: { lat: number; lon: number } | null = null;
  private state: ScenarioEngineState | null = null;
  private readonly refreshDebounced: (() => void) & { cancel(): void };
  private readonly intelligenceHandler: EventListener;
  private readonly workspaceHandler: EventListener;
  private readonly watchlistHandler: EventListener;

  constructor(private readonly ctx: AppContext) {
    this.refreshDebounced = debounce(() => this.refresh('signal-update'), 320);
    this.intelligenceHandler = (() => this.refresh('intelligence-updated')) as EventListener;
    this.workspaceHandler = (() => this.refresh('session-updated')) as EventListener;
    this.watchlistHandler = (() => this.refresh('watchlist-updated')) as EventListener;
  }

  init(): void {
    this.ctx.map?.onMapClicked((payload) => this.handleMapClick(payload));
    this.ctx.map?.onStateChanged(() => this.handleMapStateChanged());
    this.ctx.map?.setOnLayerChange(() => this.refreshDebounced());
    this.ctx.map?.onTimeRangeChanged(() => this.refreshDebounced());
    document.addEventListener('wm:intelligence-updated', this.intelligenceHandler);
    window.addEventListener(ASSISTANT_WORKSPACE_EVENT, this.workspaceHandler);
    window.addEventListener(MARKET_WATCHLIST_EVENT, this.watchlistHandler);
    this.refresh('initial');
  }

  destroy(): void {
    this.refreshDebounced.cancel();
    document.removeEventListener('wm:intelligence-updated', this.intelligenceHandler);
    window.removeEventListener(ASSISTANT_WORKSPACE_EVENT, this.workspaceHandler);
    window.removeEventListener(MARKET_WATCHLIST_EVENT, this.watchlistHandler);
  }

  private handleMapClick(payload: MapPointClickPayload): void {
    this.anchor = { lat: payload.lat, lon: payload.lon };
    this.refresh('map-click');
  }

  private handleMapStateChanged(): void {
    if (!this.anchor) {
      const center = this.ctx.map?.getCenter();
      if (center) this.anchor = center;
    }
    this.refreshDebounced();
  }

  private refresh(reason: string): void {
    const center = this.anchor ?? this.ctx.map?.getCenter() ?? null;
    if (!center) return;
    const input = buildScenarioInput(this.ctx, center.lat, center.lon);
    if (!input) return;

    const candidate = getScenarios(input);
    const nextState = this.state && this.state.contextKey === candidate.contextKey
      ? updateScenarios({
        previousState: this.state,
        newSignals: candidate.signals,
        query: input.query,
        mapContext: input.mapContext,
        sessionContext: input.sessionContext,
        timeContext: input.timeContext,
        reason,
        maxScenarios: input.maxScenarios,
      })
      : candidate;

    if (!nextState.compare && nextState.scenarios.length >= 2) {
      nextState.compare = compareScenarios(nextState.scenarios[0]!, nextState.scenarios[1]!);
    }

    this.state = nextState;
    scenarioIntelligenceStore.setState(nextState);
    dispatchScenarioIntelligenceStateChanged(document, { state: nextState, reason });
    if (nextState.drift.length > 0) {
      dispatchScenarioIntelligenceDriftDetected(document, {
        state: nextState,
        drift: nextState.drift,
        compare: nextState.compare,
        reason,
      });
    }
  }
}
