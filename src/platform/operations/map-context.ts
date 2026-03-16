export const MAP_CONTEXT_EVENT = 'wm:map-context';

export interface MapTimeRange {
  start?: string;
  end?: string;
  label?: string;
}

export interface MapViewportContext {
  zoom?: number;
  view?: string;
  bounds?: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
}

export interface MapNearbySignalContext {
  id: string;
  label: string;
  kind: string;
  distanceKm?: number;
  severity?: string;
  occurredAt?: string;
}

export interface MapDataFreshnessContext {
  overallStatus?: 'sufficient' | 'limited' | 'insufficient';
  coveragePercent?: number;
  freshSources?: string[];
  staleSources?: string[];
  evidenceDensity?: 'low' | 'medium' | 'high';
}

export interface MapPointSelection {
  kind: 'point';
  label?: string;
  lat: number;
  lon: number;
  countryCode?: string;
  countryName?: string;
}

export interface MapPolygonSelection {
  kind: 'polygon';
  label?: string;
  coordinates: Array<[number, number]>;
  countryCodes?: string[];
}

export interface MapCountrySelection {
  kind: 'country';
  countryCode: string;
  countryName: string;
}

export interface MapLayerSelection {
  kind: 'layer';
  layerId: string;
  layerLabel?: string;
}

export interface MapIncidentSelection {
  kind: 'incident';
  incidentId: string;
  label: string;
}

export type MapSelection =
  | MapPointSelection
  | MapPolygonSelection
  | MapCountrySelection
  | MapLayerSelection
  | MapIncidentSelection;

export interface MapContextEnvelope {
  id: string;
  createdAt: string;
  selection: MapSelection;
  activeLayers?: string[];
  timeRange?: MapTimeRange;
  selectedIncidentIds?: string[];
  viewport?: MapViewportContext;
  workspaceMode?: string;
  watchlists?: string[];
  selectedEntities?: string[];
  nearbySignals?: MapNearbySignalContext[];
  dataFreshness?: MapDataFreshnessContext;
}

export function createPointMapContext(
  id: string,
  selection: Omit<MapPointSelection, 'kind'>,
  extras: Pick<
    MapContextEnvelope,
    | 'activeLayers'
    | 'timeRange'
    | 'selectedIncidentIds'
    | 'viewport'
    | 'workspaceMode'
    | 'watchlists'
    | 'selectedEntities'
    | 'nearbySignals'
    | 'dataFreshness'
  > = {},
): MapContextEnvelope {
  return {
    id,
    createdAt: new Date().toISOString(),
    selection: { kind: 'point', ...selection },
    ...extras,
  };
}

export function describeMapContextForPrompt(context: MapContextEnvelope): string {
  const parts: string[] = [];

  if (context.selection.kind === 'point') {
    parts.push(`نقطه روی نقشه: ${context.selection.lat.toFixed(4)}, ${context.selection.lon.toFixed(4)}`);
    if (context.selection.countryName) {
      parts.push(`کشور: ${context.selection.countryName} (${context.selection.countryCode || 'نامشخص'})`);
    }
  } else if (context.selection.kind === 'country') {
    parts.push(`انتخاب کشور: ${context.selection.countryName} (${context.selection.countryCode})`);
  } else if (context.selection.kind === 'polygon') {
    parts.push(`چندضلعی انتخاب‌شده با ${context.selection.coordinates.length} راس`);
  } else if (context.selection.kind === 'layer') {
    parts.push(`تمرکز روی لایه: ${context.selection.layerLabel || context.selection.layerId}`);
  } else {
    parts.push(`تمرکز روی رخداد: ${context.selection.label}`);
  }

  if (context.activeLayers?.length) {
    parts.push(`لایه‌های فعال: ${context.activeLayers.join('، ')}`);
  }
  if (context.timeRange?.label || context.timeRange?.start || context.timeRange?.end) {
    parts.push(`بازه زمانی: ${context.timeRange.label || `${context.timeRange.start || '?'} تا ${context.timeRange.end || '?'}`}`);
  }
  if (context.viewport?.view || context.viewport?.zoom != null) {
    const zoom = context.viewport.zoom != null ? context.viewport.zoom.toFixed(1) : '?';
    parts.push(`نمای نقشه: ${context.viewport.view || 'نامشخص'} | زوم: ${zoom}`);
  }
  if (context.workspaceMode) {
    parts.push(`حالت فضای کار: ${context.workspaceMode}`);
  }
  if (context.selectedEntities?.length) {
    parts.push(`بازیگران/موجودیت‌های منتخب: ${context.selectedEntities.slice(0, 5).join('، ')}`);
  }
  if (context.watchlists?.length) {
    parts.push(`Watchlistها: ${context.watchlists.slice(0, 5).join('، ')}`);
  }
  if (context.nearbySignals?.length) {
    const nearby = context.nearbySignals
      .slice(0, 4)
      .map((signal) => signal.distanceKm != null
        ? `${signal.label} (${signal.kind}، ${signal.distanceKm.toFixed(0)}km)`
        : `${signal.label} (${signal.kind})`);
    parts.push(`سیگنال‌های نزدیک: ${nearby.join('، ')}`);
  }
  if (context.dataFreshness?.coveragePercent != null || context.dataFreshness?.overallStatus) {
    parts.push(`پوشش داده: ${context.dataFreshness.coveragePercent ?? '?'}% | وضعیت: ${context.dataFreshness.overallStatus || 'نامشخص'}`);
  }

  return parts.join('\n');
}

export function dispatchMapContext(target: EventTarget, context: MapContextEnvelope): boolean {
  return target.dispatchEvent(new CustomEvent(MAP_CONTEXT_EVENT, { detail: context }));
}
