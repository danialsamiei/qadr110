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
import {
  attachFloatingWindowDrag,
  clampFloatingWindowPosition,
  clampFloatingWindowSize,
  loadFloatingWindowState,
  pickFloatingWindowPosition,
  saveFloatingWindowState,
  type FloatingWindowPosition,
  type FloatingWindowSize,
} from '@/services/qadr-floating-window';
import {
  getDesktopWindow,
  registerDesktopWindow,
  setDesktopWindowState,
  subscribeDesktopWindows,
  updateDesktopWindow,
} from '@/services/qadr-desktop-shell';

const PANEL_ID = 'qadrMapAwareAiOverlay';
const WINDOW_ID = 'map-aware-ai-card';
const WINDOW_STORAGE_KEY = 'qadr110-map-aware-window';

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
  private unsubscribeWindowState: (() => void) | null = null;
  private dragCleanup: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private windowPosition = loadFloatingWindowState(WINDOW_STORAGE_KEY).position;
  private windowSize = loadFloatingWindowState(WINDOW_STORAGE_KEY).size ?? null;

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
    registerDesktopWindow({
      id: WINDOW_ID,
      title: 'AI نقشه‌محور',
      state: 'open',
      status: 'limited',
      minimizable: true,
      closable: true,
      kind: 'custom',
    });
    this.mount();
    this.ctx.map?.onMapClicked((payload) => this.handleMapClick(payload));
    this.ctx.map?.onStateChanged(() => this.debouncedRefresh());
    this.ctx.map?.setOnLayerChange(() => this.debouncedRefresh());
    this.ctx.map?.onTimeRangeChanged(() => this.debouncedRefresh());
    document.addEventListener(MAP_AWARE_AI_EVENT_TYPES.insightUpdated, this.insightHandler);
    this.unsubscribeWindowState = subscribeDesktopWindows(() => this.render());
  }

  destroy(): void {
    this.debouncedRefresh.cancel();
    document.removeEventListener(MAP_AWARE_AI_EVENT_TYPES.insightUpdated, this.insightHandler);
    this.unsubscribeWindowState?.();
    this.unsubscribeWindowState = null;
    this.dragCleanup?.();
    this.dragCleanup = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
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
      const windowAction = target?.closest<HTMLElement>('[data-map-aware-window-action]')?.dataset.mapAwareWindowAction;
      if (windowAction === 'minimize') {
        setDesktopWindowState(WINDOW_ID, 'minimized');
        return;
      }
      if (windowAction === 'close') {
        setDesktopWindowState(WINDOW_ID, 'closed');
        return;
      }
      const command = target?.closest<HTMLElement>('[data-map-aware-command]')?.dataset.mapAwareCommand as MapAwareCommand | undefined;
      if (!command || !this.currentSnapshot) return;
      this.runCommand(command);
    });
    host.appendChild(this.panelEl);
  }

  private handleMapClick(payload: MapPointClickPayload): void {
    this.currentAnchor = { lat: payload.lat, lon: payload.lon };
    this.currentSnapshot = this.resolveSnapshot(payload.lat, payload.lon);
    if (getDesktopWindow(WINDOW_ID)?.state !== 'open') {
      setDesktopWindowState(WINDOW_ID, 'open');
    }
    this.ctx.map?.flashLocation(payload.lat, payload.lon, 1600);
    if (this.currentSnapshot) {
      dispatchMapContext(document, this.currentSnapshot.context);
      updateDesktopWindow(WINDOW_ID, { status: 'ready' });
    }
    this.render();
  }

  private refreshCurrentSnapshot(_reason: string): void {
    if (!this.currentAnchor) {
      this.syncWindowGeometry();
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

  private persistWindowPosition(position: FloatingWindowPosition): void {
    this.windowPosition = position;
    saveFloatingWindowState(WINDOW_STORAGE_KEY, { position, size: this.windowSize });
  }

  private persistWindowSize(size: FloatingWindowSize | null): void {
    this.windowSize = size;
    saveFloatingWindowState(WINDOW_STORAGE_KEY, { position: this.windowPosition, size });
  }

  private attachResizeObserver(card: HTMLElement): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.panelEl) return;
      window.requestAnimationFrame(() => {
        if (!this.panelEl || !card.isConnected) return;
        const hostRect = this.panelEl.getBoundingClientRect();
        const nextSize = clampFloatingWindowSize(hostRect, card.offsetWidth, card.offsetHeight, {
          bottomInset: 92,
          minWidth: 320,
          minHeight: 230,
        });
        if (!this.windowSize
          || Math.abs(this.windowSize.width - nextSize.width) > 1
          || Math.abs(this.windowSize.height - nextSize.height) > 1) {
          this.persistWindowSize(nextSize);
          card.style.width = `${Math.round(nextSize.width)}px`;
          card.style.height = `${Math.round(nextSize.height)}px`;
        }
        const currentPosition = this.windowPosition ?? {
          x: Number.parseFloat(card.style.left || '16') || 16,
          y: Number.parseFloat(card.style.top || '16') || 16,
        };
        const nextPosition = clampFloatingWindowPosition(hostRect, nextSize.width, nextSize.height, currentPosition, {
          bottomInset: 92,
        });
        this.persistWindowPosition(nextPosition);
        card.style.left = `${Math.round(nextPosition.x)}px`;
        card.style.top = `${Math.round(nextPosition.y)}px`;
      });
    });
    this.resizeObserver.observe(card);
  }

  private resolveOverlayPosition(card: HTMLElement): FloatingWindowPosition {
    const hostRect = this.panelEl?.getBoundingClientRect();
    if (!hostRect) return { x: 12, y: 12 };
    const projected = this.currentSnapshot ? this.ctx.map?.project(this.currentSnapshot.center.lat, this.currentSnapshot.center.lon) : null;
    const occupied = Array.from(document.querySelectorAll<HTMLElement>('.qadr-scenario-map-card'))
      .filter((el) => el.offsetParent !== null)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return new DOMRect(rect.left - hostRect.left, rect.top - hostRect.top, rect.width, rect.height);
      });
    if (this.windowPosition) {
      return clampFloatingWindowPosition(hostRect, card.offsetWidth, card.offsetHeight, this.windowPosition, { bottomInset: 92 });
    }
    const baseX = projected?.x ?? hostRect.width - card.offsetWidth - 18;
    const baseY = projected?.y ?? 18;
    return pickFloatingWindowPosition(
      hostRect,
      card.offsetWidth,
      card.offsetHeight,
      occupied,
      [
        { x: baseX + 18, y: Math.max(16, baseY - card.offsetHeight - 18) },
        { x: baseX - card.offsetWidth - 18, y: Math.max(16, baseY - card.offsetHeight - 18) },
        { x: hostRect.width - card.offsetWidth - 16, y: 16 },
        { x: hostRect.width - card.offsetWidth - 16, y: Math.max(16, hostRect.height - card.offsetHeight - 96) },
      ],
      { bottomInset: 92 },
    );
  }

  private syncWindowGeometry(): void {
    this.dragCleanup?.();
    this.dragCleanup = null;
    if (!this.panelEl) return;
    const card = this.panelEl.querySelector<HTMLElement>('.qadr-map-aware-card');
    const header = this.panelEl.querySelector<HTMLElement>('.qadr-map-aware-header');
    if (!card || !header) return;
    const hostRect = this.panelEl.getBoundingClientRect();
    if (this.windowSize) {
      const clampedSize = clampFloatingWindowSize(hostRect, this.windowSize.width, this.windowSize.height, {
        bottomInset: 92,
        minWidth: 320,
        minHeight: 230,
      });
      if (!this.windowSize
        || clampedSize.width !== this.windowSize.width
        || clampedSize.height !== this.windowSize.height) {
        this.persistWindowSize(clampedSize);
      }
      card.style.width = `${Math.round(clampedSize.width)}px`;
      card.style.height = `${Math.round(clampedSize.height)}px`;
    } else {
      card.style.removeProperty('width');
      card.style.removeProperty('height');
    }
    const position = this.resolveOverlayPosition(card);
    this.persistWindowPosition(position);
    this.panelEl.classList.remove('is-anchored');
    card.style.left = `${Math.round(position.x)}px`;
    card.style.top = `${Math.round(position.y)}px`;
    card.style.bottom = 'auto';
    this.dragCleanup = attachFloatingWindowDrag(
      header,
      card,
      () => this.panelEl?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight),
      (next) => {
        this.persistWindowPosition(next);
        card.style.left = `${Math.round(next.x)}px`;
        card.style.top = `${Math.round(next.y)}px`;
      },
      () => this.windowPosition ?? position,
      { bottomInset: 92 },
    );
    this.attachResizeObserver(card);
  }

  private render(): void {
    if (!this.panelEl) return;
    const windowRecord = getDesktopWindow(WINDOW_ID);
    const isOpen = windowRecord?.state === 'open';
    const snapshot = this.currentSnapshot;
    if (!snapshot) {
      updateDesktopWindow(WINDOW_ID, { status: 'limited' });
      this.panelEl.innerHTML = `
        ${isOpen ? `
          <div class="qadr-map-aware-card empty">
            <div class="qadr-map-aware-header">
              <div>
                <span class="qadr-map-aware-kicker">Map-Aware AI</span>
                <strong>AI نقشه‌محور</strong>
              </div>
              <div class="qadr-map-aware-window-controls">
                <button type="button" data-map-aware-window-action="minimize" aria-label="مینیمایز">−</button>
                <button type="button" data-map-aware-window-action="close" aria-label="بستن">×</button>
              </div>
            </div>
            <p>برای فعال شدن تحلیل نقشه‌محور، روی یک نقطه یا محدوده روی نقشه کلیک کنید.</p>
          </div>
        ` : ''}
      `;
      this.syncWindowGeometry();
      return;
    }

    const insight = this.insightCache.get(snapshot.context.cacheKey || snapshot.context.id);
    const clusterSummary = summarizeClusters(snapshot.context);
    const nearbySignals = snapshot.nearbySignals.slice(0, 4);
    updateDesktopWindow(WINDOW_ID, { status: insight ? 'ready' : 'loading' });
    this.panelEl.innerHTML = `
      ${isOpen ? `
      <div class="qadr-map-aware-card">
        <div class="qadr-map-aware-header">
          <div>
            <span class="qadr-map-aware-kicker">Map-Aware AI</span>
            <strong>${snapshot.country?.name || 'نقطه انتخاب‌شده'}</strong>
          </div>
          <div class="qadr-map-aware-window-meta">
            <span class="qadr-map-aware-meta">زوم ${snapshot.viewport.zoom.toFixed(1)} | ${snapshot.viewport.view}</span>
            <div class="qadr-map-aware-window-controls">
              <button type="button" data-map-aware-window-action="minimize" aria-label="مینیمایز">−</button>
              <button type="button" data-map-aware-window-action="close" aria-label="بستن">×</button>
            </div>
          </div>
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
      ` : ''}
    `;
    this.syncWindowGeometry();
  }
}
