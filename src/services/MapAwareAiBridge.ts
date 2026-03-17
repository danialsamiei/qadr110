import type { AppContext, AppModule } from '@/app/app-context';
import type { AssistantSessionContext } from '@/platform/ai/assistant-contracts';
import type { GeoContextSnapshot } from '@/platform/operations/geo-analysis';
import {
  MAP_AWARE_AI_EVENT_TYPES,
  buildMapContextCacheKey,
  createPolygonMapContext,
  dispatchMapContext,
  dispatchPromptSuggestionRun,
  type MapAwareAiInsightDetail,
  type MapContextEnvelope,
  type PromptSuggestionCategory,
  type PromptSuggestionItem,
  type PromptSuggestionScoreBreakdown,
} from '@/platform';
import { buildOrchestratorPlan } from '@/services/ai-orchestrator/gateway';
import { normalizeAssistantSessionContext } from '@/services/ai-orchestrator/session';
import { loadAssistantWorkspaceState } from '@/services/assistant-workspace';
import { getCountryAtCoordinates } from '@/services/country-geometry';
import { dataFreshness } from '@/services/data-freshness';
import { buildGeoContextSnapshot } from '@/services/map-analysis-workspace';
import { buildViewportPolygonCoordinates, resolveMapSelectionLabel } from '@/services/map-aware-ai-utils';
import { debounce } from '@/utils';
import type { MapPointClickPayload } from '@/components/map-interactions';

const PANEL_ID = 'qadrMapAwareAiOverlay';

type MapAwareCommand =
  | 'analyze-area'
  | 'forecast-region'
  | 'detect-anomalies'
  | 'strategic-foresight'
  | 'simulate-region'
  | 'forecast-escalation'
  | 'conflict-spread';

const COMMAND_META: Record<MapAwareCommand, {
  label: string;
  category: PromptSuggestionCategory;
  taskClass: PromptSuggestionItem['taskClass'];
  domainMode: PromptSuggestionItem['domainMode'];
  query: (anchorLabel: string) => string;
  promptLead: string;
}> = {
  'analyze-area': {
    label: 'تحلیل این محدوده',
    category: 'risk',
    taskClass: 'briefing',
    domainMode: 'security-brief',
    query: (anchorLabel) => `این محدوده را تحلیل کن: ${anchorLabel}`,
    promptLead: 'این محدوده را به‌صورت دفاعی و evidence-aware تحلیل کن و واقعیت‌ها، ریسک‌ها، بازیگران و spilloverها را جدا کن.',
  },
  'forecast-region': {
    label: 'پیش‌بینی این منطقه',
    category: 'forecast',
    taskClass: 'forecasting',
    domainMode: 'predictive-analysis',
    query: (anchorLabel) => `برای ${anchorLabel} چه سناریوهایی در ۷۲ ساعت آینده محتمل است؟`,
    promptLead: 'برای این منطقه سناریوهای پایه، خوش‌بینانه و بدبینانه را با triggerها، نشانه‌ها و confidence ارائه کن.',
  },
  'detect-anomalies': {
    label: 'کشف ناهنجاری در همین‌جا',
    category: 'deep-analysis',
    taskClass: 'deduction',
    domainMode: 'scenario-planning',
    query: (anchorLabel) => `در ${anchorLabel} چه ناهنجاری‌ها یا الگوهای خارج از روند دیده می‌شود؟`,
    promptLead: 'برای همین نقطه/محدوده ناهنجاری‌ها، داده‌های متناقض، فرضیه‌های رقیب و شکاف‌های اطلاعاتی را پیدا کن.',
  },
  'strategic-foresight': {
    label: 'پیش‌نگری راهبردی این منطقه',
    category: 'strategy',
    taskClass: 'report-generation',
    domainMode: 'strategic-foresight',
    query: (anchorLabel) => `برای ${anchorLabel} یک جمع‌بندی پیش‌نگری راهبردی بساز.`,
    promptLead: 'برای این منطقه synthesis پیش‌نگری راهبردی بساز: سناریوی غالب، futureهای رقیب، candidateهای قوی‌سیاه، highlights War Room، watchpointها و next promptها را در قالب board-ready ارائه کن.',
  },
  'simulate-region': {
    label: 'شبیه‌سازی این منطقه',
    category: 'forecast',
    taskClass: 'scenario-analysis',
    domainMode: 'scenario-planning',
    query: (anchorLabel) => `برای ${anchorLabel} سناریوهای محلی، منطقه‌ای و جهانی را شبیه‌سازی کن.`,
    promptLead: 'برای این منطقه سناریوهای محلی، تشدید منطقه‌ای و ripple effect جهانی را با زنجیره علّی و شاخص‌های پایش بساز.',
  },
  'forecast-escalation': {
    label: 'پیش‌بینی تشدید از همین‌جا',
    category: 'risk',
    taskClass: 'forecasting',
    domainMode: 'predictive-analysis',
    query: (anchorLabel) => `برای ${anchorLabel} مسیرهای تشدید احتمالی را پیش‌بینی کن.`,
    promptLead: 'برای همین نقطه/محدوده triggerها، مسیرهای تشدید، کانون‌های spillover و شرایط ابطال سناریو را پیش‌بینی کن.',
  },
  'conflict-spread': {
    label: 'اگر منازعه از اینجا سرریز کند',
    category: 'deep-analysis',
    taskClass: 'scenario-building',
    domainMode: 'military-monitoring-defensive',
    query: (anchorLabel) => `اگر منازعه از ${anchorLabel} سرریز کند، چه پیامدهایی رخ می‌دهد؟`,
    promptLead: 'اگر منازعه از این کانون گسترش یابد، پیامدهای محلی، منطقه‌ای و جهانی، hotspotها و impact zoneها را توضیح بده.',
  },
};

function routeLabel(route: PromptSuggestionItem['orchestratorRoute']): string {
  switch (route) {
    case 'fast-local': return 'محلی سریع';
    case 'reasoning-local': return 'استدلال محلی';
    case 'structured-json': return 'ساخت‌یافته';
    default: return 'ارتقای ابری';
  }
}

function getActiveSessionContext(): AssistantSessionContext {
  const workspace = loadAssistantWorkspaceState();
  const activeThread = workspace.threads.find((thread) => thread.id === workspace.activeThreadId)
    ?? workspace.threads[0]
    ?? null;
  return normalizeAssistantSessionContext(activeThread?.sessionContext, activeThread?.id || 'map-aware-ai');
}

function buildActiveLayers(ctx: AppContext): string[] {
  const mapState = ctx.map?.getState();
  const active = Object.entries((mapState?.layers ?? ctx.mapLayers) as unknown as Record<string, boolean>)
    .filter(([, enabled]) => enabled)
    .map(([id]) => id);
  if (ctx.allNews.length > 0 || ctx.latestClusters.length > 0) active.push('osint', 'gdelt');
  if (ctx.latestPredictions.length > 0) active.push('polymarket');
  return Array.from(new Set(active));
}

function buildViewportAreaContext(snapshot: GeoContextSnapshot, label: string): MapContextEnvelope {
  const coordinates = buildViewportPolygonCoordinates(snapshot.viewport.bounds);
  const context = createPolygonMapContext(
    `map-area-${Date.now()}`,
    {
      label,
      coordinates,
      countryCodes: snapshot.country?.code ? [snapshot.country.code] : undefined,
    },
    {
      activeLayers: snapshot.activeLayers,
      timeRange: snapshot.context.timeRange,
      selectedIncidentIds: snapshot.context.selectedIncidentIds,
      viewport: snapshot.viewport,
      workspaceMode: snapshot.workspaceMode,
      watchlists: snapshot.watchlists,
      selectedEntities: snapshot.selectedEntities,
      nearbySignals: snapshot.context.nearbySignals,
      dataFreshness: snapshot.context.dataFreshness,
      geopoliticalContext: snapshot.context.geopoliticalContext,
      sourceClusters: snapshot.context.sourceClusters,
      contextSummary: snapshot.promptContext,
    },
  );
  context.cacheKey = buildMapContextCacheKey(context);
  return context;
}

function buildCommandSuggestion(
  command: MapAwareCommand,
  snapshot: GeoContextSnapshot,
  mapContext: MapContextEnvelope,
): PromptSuggestionItem {
  const meta = COMMAND_META[command];
  const anchorLabel = snapshot.country?.name || resolveMapSelectionLabel(mapContext);
  const query = meta.query(anchorLabel);
  const promptText = [
    meta.promptLead,
    `کانون تحلیل: ${anchorLabel}`,
    `کانتکست نقشه:\n${snapshot.promptContext}`,
  ].join('\n\n');
  const scoreBreakdown: PromptSuggestionScoreBreakdown = {
    base: 54,
    map: Math.min(18, snapshot.sourceDensity.nearbySignalCount * 2 + 6),
    layers: Math.min(12, snapshot.activeLayers.length),
    trends: Math.min(8, snapshot.trendPreview.reduce((sum, point) => sum + point.value, 0)),
    scenario: 0,
    session: Math.min(4, snapshot.selectedEntities.length > 0 ? 4 : 0),
    freshness: snapshot.dataFreshness.overallStatus === 'sufficient' ? 10 : snapshot.dataFreshness.overallStatus === 'limited' ? 6 : 2,
    total: 0,
  };
  scoreBreakdown.total = Math.min(
    100,
    scoreBreakdown.base + scoreBreakdown.map + scoreBreakdown.layers + scoreBreakdown.trends + scoreBreakdown.session + scoreBreakdown.freshness,
  );

  const sessionContext = getActiveSessionContext();
  const plan = buildOrchestratorPlan({
    conversationId: `map-aware:${command}`,
    locale: 'fa-IR',
    domainMode: meta.domainMode,
    taskClass: meta.taskClass,
    query,
    promptText,
    messages: [],
    mapContext,
    pinnedEvidence: [],
    localContextPackets: [],
    memoryNotes: [],
    sessionContext,
  }, sessionContext);

  return {
    id: `map-aware:${command}`,
    category: meta.category,
    label: meta.label,
    why: `چون این انتخاب نقشه ${snapshot.sourceDensity.nearbySignalCount} سیگنال نزدیک، ${snapshot.activeLayers.length} لایه فعال و پوشش ${snapshot.dataFreshness.coveragePercent}% دارد.`,
    expectedInsight: `انتظار می‌رود برای ${anchorLabel} یک مسیر تحلیلی مکان‌محور و actionable با تکیه بر context نقشه و سیگنال‌های نزدیک آشکار شود.`,
    query,
    promptText,
    domainMode: meta.domainMode,
    taskClass: meta.taskClass,
    score: scoreBreakdown.total,
    scoreBreakdown,
    orchestratorRoute: plan.routeClass,
    routeLabel: routeLabel(plan.routeClass),
  };
}

function summarizeClusters(context: MapContextEnvelope): string[] {
  return (context.sourceClusters ?? []).slice(0, 4).map((cluster) => `${cluster.kind}: ${cluster.count}`);
}

export class MapAwareAiBridge implements AppModule {
  private panelEl: HTMLElement | null = null;
  private currentSnapshot: GeoContextSnapshot | null = null;
  private currentAnchor: { lat: number; lon: number } | null = null;
  private readonly snapshotCache = new Map<string, GeoContextSnapshot>();
  private readonly insightCache = new Map<string, MapAwareAiInsightDetail>();
  private readonly debouncedRefresh: (() => void) & { cancel(): void };
  private readonly insightHandler: EventListener;

  constructor(private readonly ctx: AppContext) {
    this.debouncedRefresh = debounce(() => this.refreshCurrentSnapshot('map-state'), 260);
    this.insightHandler = ((event: CustomEvent<MapAwareAiInsightDetail>) => {
      const detail = event.detail;
      const cacheKey = detail.mapContextCacheKey || detail.mapContextId;
      this.insightCache.set(cacheKey, detail);
      this.render();
    }) as EventListener;
  }

  init(): void {
    this.mount();
    this.ctx.map?.onMapClicked((payload) => this.handleMapClick(payload));
    this.ctx.map?.onStateChanged(() => this.debouncedRefresh());
    this.ctx.map?.setOnLayerChange(() => this.debouncedRefresh());
    this.ctx.map?.onTimeRangeChanged(() => this.debouncedRefresh());
    document.addEventListener(MAP_AWARE_AI_EVENT_TYPES.insightUpdated, this.insightHandler);
  }

  destroy(): void {
    this.debouncedRefresh.cancel();
    document.removeEventListener(MAP_AWARE_AI_EVENT_TYPES.insightUpdated, this.insightHandler);
    this.panelEl?.remove();
    this.panelEl = null;
  }

  private mount(): void {
    if (this.panelEl) return;
    const host = this.ctx.container.querySelector<HTMLElement>('#mapSection .map-container')
      || this.ctx.container.querySelector<HTMLElement>('#mapSection')
      || this.ctx.container;
    this.panelEl = document.createElement('aside');
    this.panelEl.id = PANEL_ID;
    this.panelEl.className = 'qadr-map-aware-ai-overlay';
    this.panelEl.setAttribute('aria-live', 'polite');
    this.panelEl.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const command = target?.closest<HTMLElement>('[data-map-aware-command]')?.dataset.mapAwareCommand as MapAwareCommand | undefined;
      if (!command || !this.currentSnapshot) return;
      this.runCommand(command);
    });
    host.appendChild(this.panelEl);
  }

  private handleMapClick(payload: MapPointClickPayload): void {
    this.currentAnchor = { lat: payload.lat, lon: payload.lon };
    this.currentSnapshot = this.resolveSnapshot(payload.lat, payload.lon);
    this.ctx.map?.flashLocation(payload.lat, payload.lon, 1600);
    if (this.currentSnapshot) {
      dispatchMapContext(document, this.currentSnapshot.context);
    }
    this.render();
  }

  private refreshCurrentSnapshot(_reason: string): void {
    if (!this.currentAnchor) {
      this.updateOverlayPosition();
      return;
    }
    this.currentSnapshot = this.resolveSnapshot(this.currentAnchor.lat, this.currentAnchor.lon);
    this.render();
  }

  private resolveSnapshot(lat: number, lon: number): GeoContextSnapshot | null {
    const country = getCountryAtCoordinates(lat, lon);
    const mapState = this.ctx.map?.getState();
    if (!mapState) return null;

    const snapshot = buildGeoContextSnapshot({
      lat,
      lon,
      countryCode: country?.code,
      countryName: country?.name,
      adminRegion: undefined,
      activeLayers: buildActiveLayers(this.ctx),
      timeRangeLabel: this.ctx.currentTimeRange,
      zoom: mapState.zoom,
      view: mapState.view,
      bbox: this.ctx.map?.getBbox(),
      allNews: this.ctx.allNews,
      outages: this.ctx.intelligenceCache.outages,
      protests: this.ctx.intelligenceCache.protests?.events,
      militaryFlights: this.ctx.intelligenceCache.military?.flights,
      militaryVessels: this.ctx.intelligenceCache.military?.vessels,
      cyberThreats: this.ctx.cyberThreatsCache ?? undefined,
      earthquakes: this.ctx.intelligenceCache.earthquakes,
      flightDelays: this.ctx.intelligenceCache.flightDelays,
      freshnessSummary: dataFreshness.getSummary(),
    });

    snapshot.context.selection = {
      kind: 'point',
      lat,
      lon,
      label: country?.name ? `نقطه در ${country.name}` : 'نقطه انتخاب‌شده',
      countryCode: country?.code,
      countryName: country?.name,
    };
    snapshot.context.cacheKey = buildMapContextCacheKey(snapshot.context);

    const cached = this.snapshotCache.get(snapshot.context.cacheKey);
    if (cached) return cached;
    this.snapshotCache.set(snapshot.context.cacheKey, snapshot);
    return snapshot;
  }

  private runCommand(command: MapAwareCommand): void {
    if (!this.currentSnapshot) return;
    const mapContext = command === 'detect-anomalies'
      ? this.currentSnapshot.context
      : buildViewportAreaContext(this.currentSnapshot, command === 'forecast-region' ? 'منطقه قابل پیش‌بینی' : 'محدوده انتخاب‌شده');
    this.currentSnapshot = {
      ...this.currentSnapshot,
      context: mapContext,
    };
    dispatchMapContext(document, mapContext);
    const suggestion = buildCommandSuggestion(command, this.currentSnapshot, mapContext);
    dispatchPromptSuggestionRun(document, {
      source: 'map-aware-overlay',
      suggestion,
      mapContext,
      autoSubmit: true,
    });
    this.render();
  }

  private updateOverlayPosition(): void {
    if (!this.panelEl || !this.currentSnapshot) return;
    const projected = this.ctx.map?.project(this.currentSnapshot.center.lat, this.currentSnapshot.center.lon);
    if (!projected) {
      this.panelEl.classList.remove('is-anchored');
      this.panelEl.style.removeProperty('--qadr-map-anchor-x');
      this.panelEl.style.removeProperty('--qadr-map-anchor-y');
      return;
    }
    this.panelEl.classList.add('is-anchored');
    this.panelEl.style.setProperty('--qadr-map-anchor-x', `${Math.round(projected.x)}px`);
    this.panelEl.style.setProperty('--qadr-map-anchor-y', `${Math.round(projected.y)}px`);
  }

  private render(): void {
    if (!this.panelEl) return;
    const snapshot = this.currentSnapshot;
    if (!snapshot) {
      this.panelEl.innerHTML = `
        <div class="qadr-map-aware-card empty">
          <strong>AI نقشه‌محور</strong>
          <p>برای فعال شدن تحلیل نقشه‌محور، روی یک نقطه یا محدوده روی نقشه کلیک کنید.</p>
        </div>
      `;
      return;
    }

    const insight = this.insightCache.get(snapshot.context.cacheKey || snapshot.context.id);
    const clusterSummary = summarizeClusters(snapshot.context);
    const nearbySignals = snapshot.nearbySignals.slice(0, 4);
    this.panelEl.innerHTML = `
      <div class="qadr-map-aware-card">
        <div class="qadr-map-aware-header">
          <div>
            <span class="qadr-map-aware-kicker">Map-Aware AI</span>
            <strong>${snapshot.country?.name || 'نقطه انتخاب‌شده'}</strong>
          </div>
          <span class="qadr-map-aware-meta">زوم ${snapshot.viewport.zoom.toFixed(1)} | ${snapshot.viewport.view}</span>
        </div>
        <p class="qadr-map-aware-summary">${insight?.summary || snapshot.context.contextSummary || snapshot.promptContext.split('\n')[0]}</p>
        ${clusterSummary.length > 0 ? `<div class="qadr-map-aware-clusters">${clusterSummary.map((item) => `<span>${item}</span>`).join('')}</div>` : ''}
        <div class="qadr-map-aware-signals">
          ${nearbySignals.length > 0 ? nearbySignals.map((signal) => `<div><strong>${signal.kind}</strong><span>${signal.label}</span></div>`).join('') : '<div><strong>سیگنال نزدیک</strong><span>مورد برجسته‌ای ثبت نشده است.</span></div>'}
        </div>
        <div class="qadr-map-aware-actions">
          <button type="button" data-map-aware-command="analyze-area" title="analyze this area">تحلیل این محدوده</button>
          <button type="button" data-map-aware-command="forecast-region" title="forecast this region">پیش‌بینی این منطقه</button>
          <button type="button" data-map-aware-command="detect-anomalies" title="detect anomalies here">کشف ناهنجاری</button>
          <button type="button" data-map-aware-command="strategic-foresight" title="strategic foresight for this region">پیش‌نگری راهبردی</button>
          <button type="button" data-map-aware-command="simulate-region" title="simulate this region">شبیه‌سازی این منطقه</button>
          <button type="button" data-map-aware-command="forecast-escalation" title="forecast escalation here">پیش‌بینی تشدید</button>
          <button type="button" data-map-aware-command="conflict-spread" title="what happens if conflict spreads from here?">سرریز منازعه از اینجا</button>
        </div>
        ${insight?.followUpSuggestions?.length ? `<div class="qadr-map-aware-followups">${insight.followUpSuggestions.slice(0, 3).map((item) => `<span>${item}</span>`).join('')}</div>` : ''}
      </div>
    `;
    this.updateOverlayPosition();
  }
}
