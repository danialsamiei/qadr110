import type { AppContext, AppModule } from '@/app/app-context';
import type { ClusteredEvent, CyberThreat, InternetOutage, SocialUnrestEvent } from '@/types';
import type { AiTaskClass } from '@/platform/ai/contracts';
import type { AssistantDomainMode } from '@/platform/ai/assistant-contracts';
import {
  dispatchPromptSuggestionRun,
  type PromptSuggestionCategory,
  type PromptSuggestionItem,
  type PromptSuggestionScoreBreakdown,
} from '@/platform/operations/prompt-intelligence';
import {
  buildMapContextCacheKey,
  createPolygonMapContext,
  dispatchMapContext,
  type MapContextEnvelope,
} from '@/platform/operations/map-context';
import { buildOrchestratorPlan } from '@/services/ai-orchestrator/gateway';
import { normalizeAssistantSessionContext } from '@/services/ai-orchestrator/session';
import { loadAssistantWorkspaceState } from '@/services/assistant-workspace';
import { scenarioIntelligenceStore } from '@/services/scenario-intelligence';
import type { ScenarioEngineScenario, ScenarioEngineState } from '@/ai/scenario-engine';
import { debounce } from '@/utils';

const OVERLAY_ID = 'qadrScenarioMapOverlay';
const STORAGE_KEY = 'qadr110-scenario-map-overlay-layers';

type ScenarioMapLayerKey = 'risk-heatmap' | 'escalation-paths' | 'impact-zones';
type ScenarioHotspotCategory = 'security' | 'infrastructure' | 'social' | 'cyber' | 'economic' | 'osint';
type ScenarioCommand = 'simulate-region' | 'forecast-escalation' | 'conflict-spread';
type MapBounds = NonNullable<NonNullable<MapContextEnvelope['viewport']>['bounds']>;

const HOTSPOT_CATEGORY_LABELS: Record<ScenarioHotspotCategory, string> = {
  security: 'امنیتی',
  infrastructure: 'زیرساختی',
  social: 'اجتماعی',
  cyber: 'سایبری',
  economic: 'اقتصادی',
  osint: 'OSINT',
};

const LAYER_LABELS: Record<ScenarioMapLayerKey, string> = {
  'risk-heatmap': 'هیت‌مپ ریسک',
  'escalation-paths': 'مسیرهای تشدید',
  'impact-zones': 'زون‌های اثر',
};

export interface ScenarioMapHotspot {
  id: string;
  label: string;
  lat: number;
  lon: number;
  category: ScenarioHotspotCategory;
  severity: 'low' | 'medium' | 'high';
  score: number;
  reason: string;
  scenarioIds: string[];
}

export interface ScenarioMapCluster {
  id: string;
  label: string;
  count: number;
  score: number;
  category: ScenarioHotspotCategory;
  hotspotIds: string[];
}

export interface ScenarioMapPath {
  id: string;
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  label: string;
  scenarioId: string;
  weight: number;
}

export interface ScenarioMapZone {
  id: string;
  label: string;
  radiusKm: number;
  intensity: number;
  scenarioId?: string;
}

export interface ScenarioMapCommandDescriptor {
  id: ScenarioCommand;
  label: string;
  taskClass: AiTaskClass;
  domainMode: AssistantDomainMode;
  category: PromptSuggestionCategory;
  promptLead: string;
  query: string;
}

export interface ScenarioMapVisualizationModel {
  anchor: {
    lat: number;
    lon: number;
    label: string;
    bbox?: MapBounds;
    nearbyEntities: string[];
  };
  summary: string;
  hotspots: ScenarioMapHotspot[];
  clusters: ScenarioMapCluster[];
  zones: ScenarioMapZone[];
  paths: ScenarioMapPath[];
  commands: ScenarioMapCommandDescriptor[];
}

export interface ScenarioMapDataSnapshot {
  outages?: InternetOutage[];
  protests?: SocialUnrestEvent[];
  cyberThreats?: CyberThreat[];
  newsClusters?: ClusteredEvent[];
}

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const originLat = toRad(lat1);
  const destLat = toRad(lat2);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(originLat) * Math.cos(destLat) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function pointInBounds(
  lat: number,
  lon: number,
  bounds?: MapBounds,
): boolean {
  if (!bounds) return true;
  return lat >= bounds.south && lat <= bounds.north && lon >= bounds.west && lon <= bounds.east;
}

function impactToRadius(scenario: ScenarioEngineScenario, multiplier: number): number {
  const impact = scenario.impact_score ?? 0.5;
  const probability = scenario.probability_score ?? 0.5;
  return Math.round((70 + impact * 140 + probability * 90) * multiplier);
}

function buildScenarioCommands(anchorLabel: string): ScenarioMapCommandDescriptor[] {
  return [
    {
      id: 'simulate-region',
      label: 'شبیه‌سازی این منطقه',
      taskClass: 'scenario-analysis',
      domainMode: 'scenario-planning',
      category: 'forecast',
      promptLead: 'برای این منطقه سناریوهای محلی، تشدید منطقه‌ای و ripple effect جهانی را شبیه‌سازی کن.',
      query: `simulate this region: ${anchorLabel}`,
    },
    {
      id: 'forecast-escalation',
      label: 'پیش‌بینی تشدید از همین‌جا',
      taskClass: 'forecasting',
      domainMode: 'predictive-analysis',
      category: 'risk',
      promptLead: 'برای این نقطه/منطقه مسیرهای تشدید، triggerها و شرایط ابطال را پیش‌بینی کن.',
      query: `forecast escalation here: ${anchorLabel}`,
    },
    {
      id: 'conflict-spread',
      label: 'اگر منازعه از اینجا سرریز کند',
      taskClass: 'scenario-building',
      domainMode: 'military-monitoring-defensive',
      category: 'deep-analysis',
      promptLead: 'اگر منازعه از این کانون سرریز کند، پیامدهای محلی، منطقه‌ای و جهانی را با زنجیره علّی توضیح بده.',
      query: `what happens if conflict spreads from here?: ${anchorLabel}`,
    },
  ];
}

function findAnchor(state: ScenarioEngineState): ScenarioMapVisualizationModel['anchor'] | null {
  const selection = state.inputSnapshot.mapContext?.selection;
  const bounds = state.inputSnapshot.mapContext?.viewport?.bounds;
  if (!selection) return null;
  if (selection.kind === 'point') {
    return {
      lat: selection.lat,
      lon: selection.lon,
      label: selection.label || selection.countryName || state.anchorLabel,
      bbox: bounds,
      nearbyEntities: (state.inputSnapshot.mapContext?.selectedEntities ?? []).slice(0, 6),
    };
  }
  if (selection.kind === 'polygon' && selection.coordinates.length > 0) {
    const lon = selection.coordinates.reduce((sum, point) => sum + point[0], 0) / selection.coordinates.length;
    const lat = selection.coordinates.reduce((sum, point) => sum + point[1], 0) / selection.coordinates.length;
    return {
      lat,
      lon,
      label: selection.label || state.anchorLabel,
      bbox: bounds,
      nearbyEntities: (state.inputSnapshot.mapContext?.selectedEntities ?? []).slice(0, 6),
    };
  }
  return null;
}

function relevantScenarioIds(scenarios: ScenarioEngineScenario[], category: ScenarioHotspotCategory): string[] {
  return scenarios
    .filter((scenario) => {
      const impacts = Object.keys(scenario.cross_domain_impacts ?? {});
      if (category === 'cyber') return impacts.includes('cyber');
      if (category === 'social') return impacts.includes('public_sentiment');
      if (category === 'infrastructure') return impacts.includes('infrastructure');
      if (category === 'economic') return impacts.includes('economics');
      return impacts.includes('geopolitics') || impacts.length === 0;
    })
    .slice(0, 2)
    .map((scenario) => scenario.id);
}

function buildHotspots(
  state: ScenarioEngineState,
  data: ScenarioMapDataSnapshot,
  anchor: ScenarioMapVisualizationModel['anchor'],
): ScenarioMapHotspot[] {
  const hotspots: ScenarioMapHotspot[] = [];
  const push = (hotspot: ScenarioMapHotspot | null) => {
    if (!hotspot) return;
    if (hotspots.some((item) => item.id === hotspot.id)) return;
    hotspots.push(hotspot);
  };
  const topScenario = state.scenarios[0];
  const baseBoost = (topScenario?.probability_score ?? 0.5) * 0.18 + (topScenario?.impact_score ?? 0.5) * 0.16;

  (data.outages ?? []).forEach((outage) => {
    if (!pointInBounds(outage.lat, outage.lon, anchor.bbox)) return;
    const distance = haversineKm(anchor.lat, anchor.lon, outage.lat, outage.lon);
    if (distance > 500) return;
    const severity = outage.severity === 'total' ? 'high' : outage.severity === 'major' ? 'medium' : 'low';
    push({
      id: `scenario-hotspot:outage:${outage.id}`,
      label: outage.title,
      lat: outage.lat,
      lon: outage.lon,
      category: 'infrastructure',
      severity,
      score: round(clamp(0.42 + baseBoost + (severity === 'high' ? 0.28 : severity === 'medium' ? 0.18 : 0.08))),
      reason: `اختلال زیرساختی در فاصله ${Math.round(distance)}km`,
      scenarioIds: relevantScenarioIds(state.scenarios, 'infrastructure'),
    });
  });

  (data.protests ?? []).forEach((event) => {
    if (!pointInBounds(event.lat, event.lon, anchor.bbox)) return;
    const distance = haversineKm(anchor.lat, anchor.lon, event.lat, event.lon);
    if (distance > 500) return;
    push({
      id: `scenario-hotspot:protest:${event.id}`,
      label: event.title,
      lat: event.lat,
      lon: event.lon,
      category: 'social',
      severity: event.severity,
      score: round(clamp(0.38 + baseBoost + (event.severity === 'high' ? 0.26 : event.severity === 'medium' ? 0.14 : 0.06))),
      reason: `فشار اجتماعی/روایی در فاصله ${Math.round(distance)}km`,
      scenarioIds: relevantScenarioIds(state.scenarios, 'social'),
    });
  });

  (data.cyberThreats ?? []).forEach((threat) => {
    if (!pointInBounds(threat.lat, threat.lon, anchor.bbox)) return;
    const distance = haversineKm(anchor.lat, anchor.lon, threat.lat, threat.lon);
    if (distance > 550) return;
    const severity = threat.severity === 'critical' || threat.severity === 'high' ? 'high' : threat.severity === 'medium' ? 'medium' : 'low';
    push({
      id: `scenario-hotspot:cyber:${threat.id}`,
      label: threat.indicator,
      lat: threat.lat,
      lon: threat.lon,
      category: 'cyber',
      severity,
      score: round(clamp(0.36 + baseBoost + (severity === 'high' ? 0.3 : severity === 'medium' ? 0.16 : 0.08))),
      reason: `فشار سایبری/دیجیتال در فاصله ${Math.round(distance)}km`,
      scenarioIds: relevantScenarioIds(state.scenarios, 'cyber'),
    });
  });

  (data.newsClusters ?? []).forEach((cluster) => {
    if (typeof cluster.lat !== 'number' || typeof cluster.lon !== 'number') return;
    if (!pointInBounds(cluster.lat, cluster.lon, anchor.bbox)) return;
    const distance = haversineKm(anchor.lat, anchor.lon, cluster.lat, cluster.lon);
    if (distance > 650) return;
    push({
      id: `scenario-hotspot:cluster:${cluster.id}`,
      label: cluster.primaryTitle,
      lat: cluster.lat,
      lon: cluster.lon,
      category: cluster.velocity?.sentiment === 'negative' ? 'security' : 'osint',
      severity: cluster.isAlert ? 'high' : cluster.sourceCount >= 6 ? 'medium' : 'low',
      score: round(clamp(0.34 + baseBoost + Math.min(0.24, cluster.sourceCount * 0.03))),
      reason: `خوشه خبری ${cluster.sourceCount} منبعی`,
      scenarioIds: relevantScenarioIds(state.scenarios, 'osint'),
    });
  });

  return hotspots
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
}

function buildClusters(hotspots: ScenarioMapHotspot[]): ScenarioMapCluster[] {
  const buckets = new Map<ScenarioHotspotCategory, ScenarioMapHotspot[]>();
  hotspots.forEach((hotspot) => {
    const list = buckets.get(hotspot.category) ?? [];
    list.push(hotspot);
    buckets.set(hotspot.category, list);
  });

  return Array.from(buckets.entries()).map(([category, items]) => ({
    id: `cluster:${category}`,
    label: HOTSPOT_CATEGORY_LABELS[category],
    count: items.length,
    score: round(items.reduce((sum, item) => sum + item.score, 0) / Math.max(1, items.length)),
    category,
    hotspotIds: items.map((item) => item.id),
  })).sort((left, right) => right.score - left.score);
}

function buildZones(scenarios: ScenarioEngineScenario[]): ScenarioMapZone[] {
  const top = scenarios[0];
  if (!top) return [];
  const second = scenarios[1] ?? top;
  const third = scenarios[2] ?? second;
  return [
    {
      id: 'zone-local-risk',
      label: 'ریسک محلی',
      radiusKm: impactToRadius(top, 0.55),
      intensity: round((top.impact_score ?? 0.5) * 0.9),
      scenarioId: top.id,
    },
    {
      id: 'zone-regional-escalation',
      label: 'تشدید منطقه‌ای',
      radiusKm: impactToRadius(second, 1),
      intensity: round((second.impact_score ?? 0.5) * 0.78),
      scenarioId: second.id,
    },
    {
      id: 'zone-global-ripple',
      label: 'سرریز جهانی',
      radiusKm: impactToRadius(third, 1.6),
      intensity: round((third.impact_score ?? 0.5) * 0.66),
      scenarioId: third.id,
    },
  ];
}

function buildPaths(
  anchor: ScenarioMapVisualizationModel['anchor'],
  hotspots: ScenarioMapHotspot[],
): ScenarioMapPath[] {
  return hotspots.slice(0, 5).map((hotspot, index) => ({
    id: `path:${hotspot.id}`,
    from: { lat: anchor.lat, lon: anchor.lon },
    to: { lat: hotspot.lat, lon: hotspot.lon },
    label: `spillover ${index + 1}`,
    scenarioId: hotspot.scenarioIds[0] || 'scenario-spread',
    weight: round(hotspot.score),
  }));
}

export function buildScenarioMapVisualizationModel(
  state: ScenarioEngineState,
  data: ScenarioMapDataSnapshot,
): ScenarioMapVisualizationModel | null {
  const anchor = findAnchor(state);
  if (!anchor) return null;
  const hotspots = buildHotspots(state, data, anchor);
  const clusters = buildClusters(hotspots);
  const zones = buildZones(state.scenarios);
  const paths = buildPaths(anchor, hotspots);
  const commands = buildScenarioCommands(anchor.label);

  return {
    anchor,
    summary: `برای ${anchor.label}، ${hotspots.length} hotspot، ${clusters.length} cluster و ${zones.length} لایه سناریویی ساخته شد.`,
    hotspots,
    clusters,
    zones,
    paths,
    commands,
  };
}

function loadLayerState(): Record<ScenarioMapLayerKey, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { 'risk-heatmap': true, 'escalation-paths': true, 'impact-zones': true };
    }
    const parsed = JSON.parse(raw) as Partial<Record<ScenarioMapLayerKey, boolean>>;
    return {
      'risk-heatmap': parsed['risk-heatmap'] !== false,
      'escalation-paths': parsed['escalation-paths'] !== false,
      'impact-zones': parsed['impact-zones'] !== false,
    };
  } catch {
    return { 'risk-heatmap': true, 'escalation-paths': true, 'impact-zones': true };
  }
}

function persistLayerState(state: Record<ScenarioMapLayerKey, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function routeLabel(query: string, taskClass: AiTaskClass, domainMode: AssistantDomainMode, mapContext: MapContextEnvelope): string {
  const sessionContext = normalizeAssistantSessionContext(
    loadAssistantWorkspaceState().threads.find((thread) => thread.id === loadAssistantWorkspaceState().activeThreadId)?.sessionContext,
    'scenario-map-overlay',
  );
  const plan = buildOrchestratorPlan({
    conversationId: 'scenario-map-overlay',
    locale: 'fa-IR',
    domainMode,
    taskClass,
    query,
    promptText: query,
    messages: [],
    mapContext,
    pinnedEvidence: [],
    localContextPackets: [],
    memoryNotes: [],
    sessionContext,
  }, sessionContext);

  switch (plan.routeClass) {
    case 'fast-local': return 'محلی سریع';
    case 'reasoning-local': return 'استدلال محلی';
    case 'structured-json': return 'ساخت‌یافته';
    default: return 'ارتقای ابری';
  }
}

export class ScenarioMapOverlay implements AppModule {
  private panelEl: HTMLElement | null = null;
  private model: ScenarioMapVisualizationModel | null = null;
  private layers = loadLayerState();
  private readonly refreshDebounced: (() => void) & { cancel(): void };
  private unsubscribeState: (() => void) | null = null;

  constructor(private readonly ctx: AppContext) {
    this.refreshDebounced = debounce(() => this.refresh(), 180);
  }

  init(): void {
    this.mount();
    this.unsubscribeState = scenarioIntelligenceStore.subscribe(() => this.refresh());
    this.ctx.map?.onStateChanged(() => this.refreshDebounced());
    this.ctx.map?.setOnLayerChange(() => this.refreshDebounced());
    this.ctx.map?.onTimeRangeChanged(() => this.refreshDebounced());
    this.ctx.map?.onMapClicked(() => this.refresh());
    this.refresh();
  }

  destroy(): void {
    this.unsubscribeState?.();
    this.unsubscribeState = null;
    this.refreshDebounced.cancel();
    this.panelEl?.remove();
    this.panelEl = null;
  }

  private mount(): void {
    if (this.panelEl) return;
    const host = this.ctx.container.querySelector<HTMLElement>('#mapSection .map-container')
      || this.ctx.container.querySelector<HTMLElement>('#mapSection')
      || this.ctx.container;
    this.panelEl = document.createElement('aside');
    this.panelEl.id = OVERLAY_ID;
    this.panelEl.className = 'qadr-scenario-map-overlay';
    this.panelEl.addEventListener('click', (event) => this.handleClick(event));
    host.appendChild(this.panelEl);
  }

  private handleClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const layerButton = target.closest<HTMLElement>('[data-scenario-layer]');
    if (layerButton?.dataset.scenarioLayer) {
      const key = layerButton.dataset.scenarioLayer as ScenarioMapLayerKey;
      this.layers[key] = !this.layers[key];
      persistLayerState(this.layers);
      this.render();
      return;
    }
    const commandButton = target.closest<HTMLElement>('[data-scenario-command]');
    if (commandButton?.dataset.scenarioCommand) {
      this.runCommand(commandButton.dataset.scenarioCommand as ScenarioCommand);
      return;
    }
    const hotspotButton = target.closest<HTMLElement>('[data-scenario-hotspot]');
    if (hotspotButton?.dataset.scenarioHotspot && this.model) {
      const hotspot = this.model.hotspots.find((item) => item.id === hotspotButton.dataset.scenarioHotspot);
      if (hotspot) {
        this.ctx.map?.setCenter(hotspot.lat, hotspot.lon, Math.max(6, (this.ctx.map?.getState()?.zoom ?? 6)));
        this.ctx.map?.flashLocation(hotspot.lat, hotspot.lon, 1800);
      }
    }
  }

  private buildPromptSuggestion(command: ScenarioMapCommandDescriptor, mapContext: MapContextEnvelope): PromptSuggestionItem {
    const scoreBreakdown: PromptSuggestionScoreBreakdown = {
      base: 58,
      map: 16,
      layers: Math.min(12, (mapContext.activeLayers ?? []).length * 2),
      trends: 8,
      scenario: 10,
      session: 4,
      freshness: mapContext.dataFreshness?.overallStatus === 'sufficient' ? 10 : 6,
      total: 0,
    };
    scoreBreakdown.total = scoreBreakdown.base + scoreBreakdown.map + scoreBreakdown.layers + scoreBreakdown.trends + scoreBreakdown.scenario + scoreBreakdown.session + scoreBreakdown.freshness;
    return {
      id: `scenario-map:${command.id}`,
      category: command.category,
      label: command.label,
      why: 'چون این ناحیه در سناریوهای جاری کانون ریسک محلی، تشدید منطقه‌ای و سرریز بیرونی است.',
      expectedInsight: 'انتظار می‌رود پیوند میان سناریوی غالب، مسیرهای تشدید و hotspotهای جغرافیایی این ناحیه روشن‌تر و actionable شود.',
      query: command.query,
      promptText: `${command.promptLead}\n\nکانتکست نقشه:\n${mapContext.contextSummary || command.query}`,
      domainMode: command.domainMode,
      taskClass: command.taskClass,
      score: scoreBreakdown.total,
      scoreBreakdown,
      orchestratorRoute: 'reasoning-local',
      routeLabel: routeLabel(command.query, command.taskClass, command.domainMode, mapContext),
    };
  }

  private runCommand(commandId: ScenarioCommand): void {
    const state = scenarioIntelligenceStore.getState();
    if (!state || !this.model) return;
    const command = this.model.commands.find((item) => item.id === commandId);
    if (!command) return;
    const bounds = state.inputSnapshot.mapContext?.viewport?.bounds;
    const mapContext = bounds
      ? createPolygonMapContext(
        `scenario-map-region:${Date.now()}`,
        {
          label: this.model.anchor.label,
          coordinates: [
            [bounds.west, bounds.south],
            [bounds.east, bounds.south],
            [bounds.east, bounds.north],
            [bounds.west, bounds.north],
            [bounds.west, bounds.south],
          ],
          countryCodes: state.inputSnapshot.mapContext?.selection.kind === 'point' && state.inputSnapshot.mapContext.selection.countryCode
            ? [state.inputSnapshot.mapContext.selection.countryCode]
            : undefined,
        },
        {
          activeLayers: state.inputSnapshot.mapContext?.activeLayers,
          timeRange: state.inputSnapshot.mapContext?.timeRange,
          viewport: state.inputSnapshot.mapContext?.viewport,
          workspaceMode: state.inputSnapshot.mapContext?.workspaceMode,
          watchlists: state.inputSnapshot.mapContext?.watchlists,
          selectedEntities: state.inputSnapshot.mapContext?.selectedEntities,
          nearbySignals: state.inputSnapshot.mapContext?.nearbySignals,
          dataFreshness: state.inputSnapshot.mapContext?.dataFreshness,
          contextSummary: state.inputSnapshot.mapContext?.contextSummary,
          geopoliticalContext: state.inputSnapshot.mapContext?.geopoliticalContext,
          sourceClusters: state.inputSnapshot.mapContext?.sourceClusters,
        },
      )
      : (state.inputSnapshot.mapContext as MapContextEnvelope);
    mapContext.cacheKey = buildMapContextCacheKey(mapContext);
    dispatchMapContext(document, mapContext);
    dispatchPromptSuggestionRun(document, {
      source: 'scenario-map-overlay',
      suggestion: this.buildPromptSuggestion(command, mapContext),
      mapContext,
      autoSubmit: true,
    });
  }

  private refresh(): void {
    const state = scenarioIntelligenceStore.getState();
    if (!state) {
      this.model = null;
      this.render();
      return;
    }
    this.model = buildScenarioMapVisualizationModel(state, {
      outages: this.ctx.intelligenceCache.outages,
      protests: this.ctx.intelligenceCache.protests?.events,
      cyberThreats: this.ctx.cyberThreatsCache ?? undefined,
      newsClusters: this.ctx.latestClusters,
    });
    this.render();
  }

  private render(): void {
    if (!this.panelEl) return;
    if (!this.model) {
      this.panelEl.innerHTML = `
        <div class="qadr-scenario-map-card empty">
          <strong>لایه سناریوی نقشه</strong>
          <p>بعد از انتخاب یک نقطه یا محدوده، شبیه‌سازی محلی و لایه‌های سرریز اینجا نمایش داده می‌شود.</p>
        </div>
      `;
      return;
    }

    const state = scenarioIntelligenceStore.getState();
    const projectedAnchor = this.ctx.map?.project(this.model.anchor.lat, this.model.anchor.lon);
    const heatmapZones = this.layers['impact-zones']
      ? this.model.zones.map((zone, index) => {
        const radius = 30 + zone.intensity * 90 + index * 26;
        return `<circle class="qadr-scenario-zone zone-${index + 1}" cx="${projectedAnchor?.x ?? 120}" cy="${projectedAnchor?.y ?? 120}" r="${radius}"></circle>`;
      }).join('')
      : '';
    const hotspotDots = this.model.hotspots.map((hotspot, index) => {
      const projected = this.ctx.map?.project(hotspot.lat, hotspot.lon);
      if (!projected) return '';
      return `
        <button
          type="button"
          class="qadr-scenario-hotspot ${hotspot.category} severity-${hotspot.severity}"
          data-scenario-hotspot="${hotspot.id}"
          style="left:${Math.round(projected.x)}px; top:${Math.round(projected.y)}px"
          aria-label="${hotspot.label}"
        >
          <span>${index + 1}</span>
        </button>
      `;
    }).join('');
    const pathSvg = this.layers['escalation-paths']
      ? this.model.paths.map((path) => {
        const from = this.ctx.map?.project(path.from.lat, path.from.lon);
        const to = this.ctx.map?.project(path.to.lat, path.to.lon);
        if (!from || !to) return '';
        return `<line class="qadr-scenario-path" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke-width="${2 + path.weight * 4}"></line>`;
      }).join('')
      : '';

    this.panelEl.innerHTML = `
      <svg class="qadr-scenario-map-canvas" viewBox="0 0 ${this.panelEl.clientWidth || 420} ${this.panelEl.clientHeight || 320}" preserveAspectRatio="none" aria-hidden="true">
        ${this.layers['risk-heatmap'] ? heatmapZones : ''}
        ${pathSvg}
      </svg>
      <div class="qadr-scenario-hotspots">${hotspotDots}</div>
      <div class="qadr-scenario-map-card">
        <div class="qadr-scenario-map-header">
          <div>
            <span class="qadr-scenario-kicker">Scenario Map</span>
            <strong>${this.model.anchor.label}</strong>
          </div>
          <span class="qadr-scenario-meta">${state?.scenarios.length ?? 0} سناریو | ${this.model.hotspots.length} hotspot</span>
        </div>
        <p class="qadr-scenario-summary">${this.model.summary}</p>
        <div class="qadr-scenario-layers">
          ${(['risk-heatmap', 'escalation-paths', 'impact-zones'] as ScenarioMapLayerKey[]).map((key) => `
            <button type="button" class="${this.layers[key] ? 'active' : ''}" data-scenario-layer="${key}" title="${key}">${LAYER_LABELS[key]}</button>
          `).join('')}
        </div>
        <div class="qadr-scenario-map-actions">
          ${this.model.commands.map((command) => `<button type="button" data-scenario-command="${command.id}">${command.label}</button>`).join('')}
        </div>
        <div class="qadr-scenario-clusters">
          ${this.model.clusters.slice(0, 4).map((cluster) => `
            <article>
              <strong>${cluster.label}</strong>
              <span>${cluster.count} hotspot | ${Math.round(cluster.score * 100)}%</span>
            </article>
          `).join('')}
        </div>
        <div class="qadr-scenario-entities">
          ${this.model.anchor.nearbyEntities.slice(0, 6).map((entity) => `<span>${entity}</span>`).join('')}
        </div>
      </div>
    `;
  }
}
