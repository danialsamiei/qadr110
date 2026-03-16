import type {
  CyberThreat,
  Earthquake,
  InternetOutage,
  MilitaryFlight,
  MilitaryVessel,
  NewsItem,
  SocialUnrestEvent,
} from '@/types';
import type { AirportDelayAlert } from '@/services/aviation';
import { aviationWatchlist } from '@/services/aviation/watchlist';
import { dataFreshness, type DataFreshnessSummary } from '@/services/data-freshness';
import { getMarketWatchlistEntries } from '@/services/market-watchlist';
import { AI_DATA_CENTERS } from '@/config/ai-datacenters';
import { MILITARY_BASES, NUCLEAR_FACILITIES, UNDERSEA_CABLES } from '@/config/geo';
import { PIPELINES } from '@/config/pipelines';
import { AnalysisJobQueue } from '@/platform/operations/analysis-job-queue';
import { isDemoModeEnabled } from '@/platform/operations/demo-mode';
import { createPointMapContext } from '@/platform/operations/map-context';
import {
  GEO_ANALYSIS_PANEL_ID,
  dispatchGeoAnalysisAssistantHandoff,
  dispatchGeoAnalysisOpenResult,
  dispatchGeoAnalysisScenarioHandoff,
  dispatchGeoAnalysisStateChanged,
  type GeoAnalysisCategory,
  type GeoAnalysisJobRecord,
  type GeoAnalysisRequestDescriptor,
  type GeoAnalysisResultRecord,
  type GeoAnalysisWorkspaceState,
  type GeoContextSnapshot,
  type GeoDataFreshnessContext,
  type GeoNearbySignal,
  type GeoRelatedAsset,
  type GeoSuggestionGroup,
  type GeoSuggestionItem,
  type GeoTrendPoint,
  buildAssistantHandoffQuery,
  buildGeoConfidenceNote,
  buildGeoAnalysisStateChangedDetail,
  buildScenarioHandoffDetail,
  composeGeoAnalysisPrompt,
  getGeoCategoryMeta,
  groupGeoSuggestions,
  scoreGeoForecastConfidence,
} from '@/platform/operations/geo-analysis';
import type { AssistantConversationThread, AssistantEvidenceCard } from '@/platform/ai/assistant-contracts';
import type { AiTaskClass } from '@/platform/ai/contracts';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type GeoEarthquake = Earthquake | {
  id: string;
  place: string;
  magnitude: number;
  occurredAt: number;
  location?: {
    latitude: number;
    longitude: number;
  };
};

export interface GeoContextSnapshotInput {
  lat: number;
  lon: number;
  countryCode?: string;
  countryName?: string;
  adminRegion?: string;
  activeLayers: string[];
  timeRangeLabel?: string;
  zoom: number;
  view: string;
  bbox?: string | null;
  allNews?: NewsItem[];
  outages?: InternetOutage[];
  protests?: SocialUnrestEvent[];
  militaryFlights?: MilitaryFlight[];
  militaryVessels?: MilitaryVessel[];
  cyberThreats?: CyberThreat[];
  earthquakes?: GeoEarthquake[];
  flightDelays?: AirportDelayAlert[];
  freshnessSummary?: DataFreshnessSummary;
}

export interface GeoAnalysisRunInput {
  descriptor: GeoAnalysisRequestDescriptor;
  autoMinimize?: boolean;
}

export interface MapAnalysisWorkspaceListener {
  (state: GeoAnalysisWorkspaceState): void;
}

const STORAGE_KEY = 'qadr110-map-analysis-workspace';
const MAX_JOBS = 24;
const MAX_RESULTS = 32;
const DEFAULT_TARGET: EventTarget = typeof document !== 'undefined' ? document : new EventTarget();

function getWorkspaceVariant(): string {
  try {
    return typeof import.meta !== 'undefined' && import.meta.env?.VITE_VARIANT
      ? String(import.meta.env.VITE_VARIANT)
      : 'full';
  } catch {
    return 'full';
  }
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

function midpoint(points: [number, number][]): { lat: number; lon: number } | null {
  if (points.length === 0) return null;
  const middle = points[Math.floor(points.length / 2)]!;
  return { lon: middle[0], lat: middle[1] };
}

function findNearbyInfrastructure(lat: number, lon: number): GeoRelatedAsset[] {
  const points: GeoRelatedAsset[] = [];

  PIPELINES.forEach((pipeline) => {
    const point = midpoint(pipeline.points);
    if (!point) return;
    const distanceKm = haversineKm(lat, lon, point.lat, point.lon);
    if (distanceKm <= 320) {
      points.push({ id: pipeline.id, name: pipeline.name, type: 'pipeline', distanceKm });
    }
  });

  UNDERSEA_CABLES.forEach((cable) => {
    const point = midpoint(cable.points);
    if (!point) return;
    const distanceKm = haversineKm(lat, lon, point.lat, point.lon);
    if (distanceKm <= 320) {
      points.push({ id: cable.id, name: cable.name, type: 'cable', distanceKm });
    }
  });

  AI_DATA_CENTERS.forEach((datacenter) => {
    const distanceKm = haversineKm(lat, lon, datacenter.lat, datacenter.lon);
    if (distanceKm <= 320) {
      points.push({ id: datacenter.id, name: datacenter.name, type: 'datacenter', distanceKm });
    }
  });

  MILITARY_BASES.forEach((base) => {
    const distanceKm = haversineKm(lat, lon, base.lat, base.lon);
    if (distanceKm <= 320) {
      points.push({ id: base.id, name: base.name, type: 'base', distanceKm });
    }
  });

  NUCLEAR_FACILITIES.forEach((site) => {
    const distanceKm = haversineKm(lat, lon, site.lat, site.lon);
    if (distanceKm <= 320) {
      points.push({ id: site.id, name: site.name, type: 'nuclear', distanceKm });
    }
  });

  return points.sort((left, right) => left.distanceKm - right.distanceKm).slice(0, 6);
}

function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toIsoDate(value: Date | string | undefined | null): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function parseBbox(bbox?: string | null): GeoContextSnapshot['viewport']['bounds'] | undefined {
  if (!bbox) return undefined;
  const parts = bbox.split(',').map((item) => Number.parseFloat(item));
  if (parts.length !== 4 || parts.some((item) => !Number.isFinite(item))) return undefined;
  const west = parts[0]!;
  const south = parts[1]!;
  const east = parts[2]!;
  const north = parts[3]!;
  return { west, south, east, north };
}

function inferEvidenceDensity(signalCount: number, assetCount: number, freshness: GeoDataFreshnessContext): GeoContextSnapshot['sourceDensity']['evidenceDensity'] {
  const coverage = freshness.coveragePercent ?? 0;
  const weighted = signalCount * 1.3 + assetCount * 0.8 + coverage / 25;
  if (weighted >= 10) return 'high';
  if (weighted >= 5) return 'medium';
  return 'low';
}

function normalizeFreshness(summary?: DataFreshnessSummary): GeoDataFreshnessContext {
  const sources = dataFreshness.getAllSources();
  return {
    overallStatus: summary?.overallStatus ?? 'limited',
    coveragePercent: summary?.coveragePercent ?? 0,
    freshSources: sources
      .filter((item) => item.status === 'fresh')
      .map((item) => item.name)
      .slice(0, 6),
    staleSources: sources
      .filter((item) => item.status === 'stale' || item.status === 'very_stale' || item.status === 'no_data' || item.status === 'error')
      .map((item) => item.name)
      .slice(0, 6),
  };
}

function summarizeWatchlists(): string[] {
  const market = getMarketWatchlistEntries().slice(0, 4).map((item) => item.name || item.symbol);
  const aviation = aviationWatchlist.get();
  return [
    ...market,
    ...aviation.airports.slice(0, 2),
    ...aviation.routes.slice(0, 2),
  ].slice(0, 8);
}

function buildSelectedEntities(countryName: string | undefined, nearbySignals: GeoNearbySignal[], nearbyInfrastructure: GeoRelatedAsset[]): string[] {
  const entities = new Set<string>();
  if (countryName) entities.add(countryName);
  nearbySignals.slice(0, 4).forEach((signal) => entities.add(signal.label));
  nearbyInfrastructure.slice(0, 4).forEach((asset) => entities.add(asset.name));
  return Array.from(entities).slice(0, 8);
}

function buildTrendPreview(signals: GeoNearbySignal[]): GeoTrendPoint[] {
  const now = Date.now();
  const windows = [
    { label: '۶س', ms: 6 * 60 * 60 * 1000 },
    { label: '۲۴س', ms: 24 * 60 * 60 * 1000 },
    { label: '۷۲س', ms: 72 * 60 * 60 * 1000 },
    { label: '۷ر', ms: 7 * 24 * 60 * 60 * 1000 },
  ];

  return windows.map((window) => ({
    label: window.label,
    value: signals.filter((signal) => {
      const ts = signal.occurredAt ? new Date(signal.occurredAt).getTime() : NaN;
      return Number.isFinite(ts) && now - ts <= window.ms;
    }).length,
  }));
}

function collectNearbySignals(input: GeoContextSnapshotInput): GeoNearbySignal[] {
  const maxDistanceKm = 450;
  const center = { lat: input.lat, lon: input.lon };
  const signals: GeoNearbySignal[] = [];

  (input.allNews ?? []).forEach((item) => {
    if (item.lat == null || item.lon == null) return;
    const distanceKm = haversineKm(center.lat, center.lon, item.lat, item.lon);
    if (distanceKm > maxDistanceKm) return;
    signals.push({
      id: `news:${item.link || item.title}`,
      label: item.title,
      kind: 'خبر',
      distanceKm,
      occurredAt: toIsoDate(item.pubDate),
      sourceLabel: item.source,
      locationLabel: item.locationName,
    });
  });

  (input.outages ?? []).forEach((item) => {
    const distanceKm = haversineKm(center.lat, center.lon, item.lat, item.lon);
    if (distanceKm > maxDistanceKm) return;
    signals.push({
      id: `outage:${item.id}`,
      label: item.title,
      kind: 'قطعی',
      distanceKm,
      severity: item.severity,
      occurredAt: toIsoDate(item.pubDate),
      sourceLabel: item.country,
      locationLabel: item.region,
    });
  });

  (input.protests ?? []).forEach((item) => {
    const distanceKm = haversineKm(center.lat, center.lon, item.lat, item.lon);
    if (distanceKm > maxDistanceKm) return;
    signals.push({
      id: `protest:${item.id}`,
      label: item.title,
      kind: 'اعتراض',
      distanceKm,
      severity: item.severity,
      occurredAt: toIsoDate(item.time),
      sourceLabel: item.country,
      locationLabel: item.city,
    });
  });

  (input.militaryFlights ?? []).forEach((item) => {
    const distanceKm = haversineKm(center.lat, center.lon, item.lat, item.lon);
    if (distanceKm > 650) return;
    signals.push({
      id: `flight:${item.id}`,
      label: `${item.callsign} / ${item.operatorCountry}`,
      kind: 'پرواز نظامی',
      distanceKm,
      severity: item.isInteresting ? 'high' : item.confidence,
      occurredAt: toIsoDate(item.lastSeen),
      sourceLabel: item.operatorCountry,
      locationLabel: item.destination || item.origin,
    });
  });

  (input.militaryVessels ?? []).forEach((item) => {
    const distanceKm = haversineKm(center.lat, center.lon, item.lat, item.lon);
    if (distanceKm > 650) return;
    signals.push({
      id: `vessel:${item.id}`,
      label: item.name,
      kind: 'شناور',
      distanceKm,
      severity: item.isDark ? 'high' : item.confidence,
      occurredAt: toIsoDate(item.lastAisUpdate),
      sourceLabel: item.operatorCountry,
      locationLabel: item.nearChokepoint || item.destination,
    });
  });

  (input.cyberThreats ?? []).forEach((item) => {
    const distanceKm = haversineKm(center.lat, center.lon, item.lat, item.lon);
    if (distanceKm > maxDistanceKm) return;
    signals.push({
      id: `cyber:${item.id}`,
      label: item.indicator,
      kind: 'سایبری',
      distanceKm,
      severity: item.severity,
      occurredAt: item.lastSeen || item.firstSeen,
      sourceLabel: item.source,
      locationLabel: item.country,
    });
  });

  (input.earthquakes ?? []).forEach((item) => {
    const lat = 'lat' in item ? item.lat : item.location?.latitude;
    const lon = 'lon' in item ? item.lon : item.location?.longitude;
    if (lat == null || lon == null) return;
    const distanceKm = haversineKm(center.lat, center.lon, lat, lon);
    if (distanceKm > 800) return;
    signals.push({
      id: `quake:${item.id}`,
      label: item.place,
      kind: 'زلزله',
      distanceKm,
      severity: item.magnitude >= 6 ? 'high' : item.magnitude >= 5 ? 'medium' : 'low',
      occurredAt: 'time' in item ? toIsoDate(item.time) : toIsoDate(new Date(item.occurredAt)),
      sourceLabel: 'USGS',
    });
  });

  (input.flightDelays ?? []).forEach((item) => {
    const distanceKm = haversineKm(center.lat, center.lon, item.lat, item.lon);
    if (distanceKm > 550) return;
    signals.push({
      id: `airport:${item.id}`,
      label: item.name,
      kind: 'اختلال هوایی',
      distanceKm,
      severity: item.severity,
      occurredAt: toIsoDate(item.updatedAt),
      sourceLabel: item.country,
      locationLabel: item.city,
    });
  });

  return signals
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, 12);
}

function inferMapSelection(snapshot: Pick<GeoContextSnapshot, 'country' | 'nearbySignals' | 'nearbyInfrastructure' | 'viewport' | 'center'>): GeoContextSnapshot['context']['selection'] {
  const nearestSignal = snapshot.nearbySignals[0];
  if (nearestSignal && nearestSignal.distanceKm <= 18) {
    return {
      kind: 'incident',
      incidentId: nearestSignal.id,
      label: nearestSignal.label,
    };
  }

  const nearestAsset = snapshot.nearbyInfrastructure[0];
  if (nearestAsset && nearestAsset.distanceKm <= 24) {
    return {
      kind: 'layer',
      layerId: nearestAsset.type,
      layerLabel: nearestAsset.name,
    };
  }

  if (snapshot.country?.name && snapshot.viewport.zoom <= 2.3) {
    return {
      kind: 'country',
      countryCode: snapshot.country.code || 'unknown',
      countryName: snapshot.country.name,
    };
  }

  return {
    kind: 'point',
    lat: snapshot.center.lat,
    lon: snapshot.center.lon,
    countryCode: snapshot.country?.code,
    countryName: snapshot.country?.name,
    label: 'geo-click',
  };
}

function hasLayer(snapshot: GeoContextSnapshot, layerIds: string[]): boolean {
  return snapshot.activeLayers.some((layer) => layerIds.includes(layer));
}

function hasSignalKind(snapshot: GeoContextSnapshot, kinds: string[]): boolean {
  return snapshot.nearbySignals.some((signal) => kinds.includes(signal.kind));
}

function makeSuggestion(
  snapshot: GeoContextSnapshot,
  config: Omit<GeoSuggestionItem, 'confidenceNote'> & { confidenceNote?: string | ((snapshot: GeoContextSnapshot) => string | undefined) },
): GeoSuggestionItem {
  const confidenceNote = typeof config.confidenceNote === 'function'
    ? config.confidenceNote(snapshot)
    : config.confidenceNote;
  return {
    ...config,
    confidenceNote: confidenceNote || buildGeoConfidenceNote(snapshot, config.requiredData),
  };
}

export function buildGeoSuggestions(snapshot: GeoContextSnapshot): GeoSuggestionGroup[] {
  const items: GeoSuggestionItem[] = [
    makeSuggestion(snapshot, {
      id: 'geo-osint-digest',
      category: 'osint-news',
      label: 'خلاصه اطلاعات OSINT این نقطه',
      summary: 'خلاصه چندمنبعی وضعیت نقطه/محدوده با تفکیک واقعیت، استنباط، عدم‌قطعیت و پیشنهاد پایش.',
      icon: 'OSI',
      mode: 'fast',
      taskClass: 'summarization',
      domainMode: 'osint-digest',
      promptTemplate: 'برای نقطه/محدوده انتخاب‌شده یک digest فارسی OSINT بساز. از سیگنال‌های نزدیک، بازیگران مرتبط، رخدادهای اخیر، خبرها/فیدهای موجود و لایه‌های فعال استفاده کن و واقعیت‌ها، استنباط و عدم‌قطعیت را جدا کن.',
      requiredData: ['خبرهای ژئوکد شده', 'سیگنال‌های نزدیک'],
      priority: 100,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-recent-signals',
      category: 'osint-news',
      label: 'جمع‌بندی اخبار و سیگنال‌های اخیر این محدوده',
      summary: 'جمع‌بندی خبرها، هشدارها و سیگنال‌های OSINT اثرگذار بر این محدوده با توضیح اهمیت هر مورد.',
      icon: 'SEC',
      mode: 'fast',
      taskClass: 'briefing',
      domainMode: 'osint-digest',
      promptTemplate: 'مهم‌ترین خبرها، هشدارها و سیگنال‌های OSINT موثر بر نقطه/محدوده انتخاب‌شده را در بازه زمانی فعال جمع‌بندی کن. برای هر مورد بگو چرا مهم است و در پایان یک جمع‌بندی اجرایی فارسی بده.',
      requiredData: ['خبرها', 'اعتراض‌ها', 'قطعی‌ها'],
      priority: 96,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-trend-analysis',
      category: 'forecasting-scenario',
      label: 'تحلیل روند این نقطه/محدوده',
      summary: 'تحلیل روندهای اخیر در امنیت، اقتصاد، جامعه، زیرساخت و میدان اطلاعاتی با تاکید بر شکاف شواهد.',
      icon: 'TRD',
      mode: 'long',
      taskClass: 'forecasting',
      domainMode: 'predictive-analysis',
      promptTemplate: 'روندهای اخیر موثر بر این نقطه/محدوده را در حوزه امنیت، اقتصاد، جامعه، زیرساخت و میدان اطلاعاتی تحلیل کن. تغییر جهت‌ها، ثبات در برابر وخامت، و شکاف‌های شواهد/داده را مشخص کن.',
      requiredData: ['سیگنال‌های زمانی', 'بازه زمانی فعال'],
      priority: 92,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-scenario-tree',
      category: 'forecasting-scenario',
      label: 'پیش‌بینی کوتاه‌مدت برای این نقطه',
      summary: 'سه سناریوی پایه، خوش‌بینانه و بدبینانه برای این نقطه/محدوده با trigger و spillover.',
      icon: 'SCN',
      mode: 'long',
      taskClass: 'forecasting',
      domainMode: 'scenario-planning',
      promptTemplate: 'برای نقطه/محدوده انتخاب‌شده یک پیش‌بینی کوتاه‌مدت با سناریوهای پایه، خوش‌بینانه و بدبینانه بساز. triggerها، شاخص‌های پایش، سطح اطمینان و spilloverهای محتمل را مشخص کن.',
      requiredData: ['روندهای اخیر', 'بازیگران نزدیک', 'پوشش داده کافی'],
      priority: 90,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-resilience-impact',
      category: 'resilience',
      label: 'اثر این نقطه بر تاب‌آوری',
      summary: 'اثر متقابل این نقطه و تاب‌آوری ملی/منطقه‌ای در ابعاد زیرساخت، لجستیک، اقتصاد، جامعه و امنیت.',
      icon: 'RES',
      mode: 'long',
      taskClass: 'resilience-analysis',
      domainMode: hasLayer(snapshot, ['economic', 'sanctions']) ? 'economic-resilience' : 'infrastructure-risk',
      promptTemplate: 'ارزیابی کن این نقطه چگونه بر تاب‌آوری ملی/منطقه‌ای اثر می‌گذارد یا از آن اثر می‌پذیرد. ابعاد زیرساخت، لجستیک، انسجام اجتماعی، اقتصاد، محیط اطلاعاتی و تاب‌آوری امنیتی را پوشش بده.',
      requiredData: ['شاخص‌های تاب‌آوری', 'زیرساخت‌های نزدیک', 'پوشش چندمنبعی'],
      priority: 88,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-spillovers',
      category: 'security',
      label: 'بازیگران و عوامل مرتبط',
      summary: 'شناسایی بازیگران، نهادها، سامانه‌های زیرساختی و جغرافیاهای مجاور مرتبط با این نقطه/محدوده.',
      icon: 'ACT',
      mode: 'fast',
      taskClass: 'assistant',
      domainMode: 'security-brief',
      promptTemplate: 'مرتبط‌ترین بازیگران، نهادها، سامانه‌های زیرساختی و جغرافیاهای همجوار را برای این نقطه/محدوده شناسایی کن و مسیرهای تاثیرگذاری/وابستگی را توضیح بده.',
      requiredData: ['بازیگران منتخب', 'لایه‌های فعال'],
      priority: 84,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-logistics-exposure',
      category: 'infrastructure',
      label: 'آسیب‌پذیری زیرساختی این محدوده',
      summary: 'شناسایی زیرساخت‌های حیاتی، وابستگی‌ها، bottleneckها و ریسک‌های آبشاری مرتبط با این محدوده.',
      icon: 'INF',
      mode: 'fast',
      taskClass: 'briefing',
      domainMode: 'infrastructure-risk',
      promptTemplate: 'زیرساخت‌های حیاتی نزدیک این نقطه/محدوده را شناسایی کن. وابستگی‌ها، bottleneckها و ریسک‌های آبشاری را توضیح بده و توصیه‌های پایش دفاعی ارائه کن.',
      requiredData: ['زیرساخت‌های نزدیک', 'قطعی‌ها', 'اختلال حمل‌ونقل'],
      priority: 82,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-narrative-exposure',
      category: 'cultural-cognitive',
      label: 'تحلیل شناختی/رسانه‌ای این نقطه',
      summary: 'تحلیل روایت‌ها، مواجهه با اطلاعات نادرست، توجه رسانه‌ای و چارچوب‌بندی آنلاین مرتبط با این نقطه/منطقه.',
      icon: 'COG',
      mode: 'long',
      taskClass: 'briefing',
      domainMode: 'misinformation-analysis',
      promptTemplate: 'نفوذ روایت، مواجهه با اطلاعات نادرست، توجه رسانه‌ای و framing آنلاین مرتبط با این نقطه/منطقه را تحلیل کن. پیامدهای امنیت شناختی را توضیح بده و ادعاهای ضعیف را از موارد تاییدشده جدا کن.',
      requiredData: ['خروجی OSINT', 'خبرها و claims'],
      priority: 78,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-data-gaps',
      category: 'data-quality',
      label: 'شکاف‌های داده و ابهام‌ها',
      summary: 'کدام داده‌ها/شاخص‌ها یا منابع کم هستند و چه تناقض‌هایی مانع تحلیل مطمئن می‌شوند.',
      icon: 'DQ',
      mode: 'fast',
      taskClass: 'structured-json',
      domainMode: 'osint-digest',
      promptTemplate: 'شکاف‌های داده، سیگنال‌های متناقض، شاخص‌های گمشده و محرک‌های عدم‌قطعیت در تحلیل این نقطه/محدوده را فهرست کن. پیشنهاد بده چه چیزی را باید بعدی پایش کرد.',
      requiredData: ['پوشش freshness', 'لایه‌های فعال', 'سیگنال‌های نزدیک'],
      priority: 72,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-resilience-point',
      category: 'resilience',
      label: 'تاب‌آوری همین نقطه',
      summary: 'ارزیابی تاب‌آوری این نقطه مشخص: زیرساخت‌های محلی، دسترسی به خدمات، آسیب‌پذیری‌ها و ظرفیت بازیابی.',
      icon: 'RPT',
      mode: 'fast',
      taskClass: 'resilience-analysis',
      domainMode: 'infrastructure-risk',
      promptTemplate: 'تاب‌آوری این نقطه مشخص را ارزیابی کن. زیرساخت‌های محلی (برق، آب، ارتباطات، بیمارستان)، دسترسی به خدمات اورژانسی، آسیب‌پذیری‌های فیزیکی و ظرفیت بازیابی را بررسی کن. امتیاز تاب‌آوری ۰-۱۰۰ بده.',
      requiredData: ['زیرساخت‌های نزدیک', 'سیگنال‌های نزدیک'],
      priority: 89,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-resilience-compare-points',
      category: 'resilience',
      label: 'مقایسه تاب‌آوری این نقطه با نقاط دیگر',
      summary: 'مقایسه چندبعدی تاب‌آوری این نقطه با نقاط مشابه یا نقاط استراتژیک نزدیک.',
      icon: 'RCP',
      mode: 'long',
      taskClass: 'resilience-analysis',
      domainMode: 'infrastructure-risk',
      promptTemplate: 'تاب‌آوری این نقطه را با نقاط مشابه یا استراتژیک نزدیک مقایسه کن. ابعاد زیرساخت، دسترسی، آسیب‌پذیری، ظرفیت بازیابی و انسجام اجتماعی را در جدول مقایسه‌ای ارائه کن. نقاط قوت و ضعف هر موقعیت را مشخص کن.',
      requiredData: ['شاخص‌های تاب‌آوری', 'زیرساخت‌های نزدیک', 'پوشش چندمنبعی'],
      priority: 87,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-resilience-region',
      category: 'resilience',
      label: 'تاب‌آوری استان/منطقه/ایالت',
      summary: 'ارزیابی تاب‌آوری کل استان، منطقه یا ایالتی که این نقطه در آن واقع شده است.',
      icon: 'RRG',
      mode: 'long',
      taskClass: 'resilience-analysis',
      domainMode: 'infrastructure-risk',
      promptTemplate: 'تاب‌آوری کل استان/منطقه/ایالتی که این نقطه در آن قرار دارد را ارزیابی کن. ابعاد زیرساخت، اقتصاد، لجستیک، بهداشت، انرژی، ارتباطات، انسجام اجتماعی و امنیت را پوشش بده. نقاط بحرانی و bottleneckهای منطقه‌ای را شناسایی کن.',
      requiredData: ['شاخص‌های تاب‌آوری', 'ناحیه/استان', 'زیرساخت‌های منطقه'],
      priority: 85,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-resilience-compare-regions',
      category: 'resilience',
      label: 'مقایسه تاب‌آوری مناطق/استان‌ها/ایالات',
      summary: 'مقایسه تاب‌آوری این منطقه با مناطق، استان‌ها یا ایالات مشابه یا همسایه.',
      icon: 'RCR',
      mode: 'long',
      taskClass: 'resilience-analysis',
      domainMode: 'infrastructure-risk',
      promptTemplate: 'تاب‌آوری استان/منطقه/ایالت این نقطه را با مناطق همسایه یا مشابه مقایسه کن. جدول مقایسه‌ای با ابعاد زیرساخت، اقتصاد، بهداشت، انرژی، امنیت و انسجام اجتماعی ارائه بده. رتبه‌بندی و توصیه‌های بهبود برای هر منطقه بیاور.',
      requiredData: ['شاخص‌های تاب‌آوری', 'ناحیه/استان', 'مناطق همسایه'],
      priority: 83,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-resilience-country-compare',
      category: 'resilience',
      label: 'مقایسه تاب‌آوری این کشور با کشورهای دیگر',
      summary: 'مقایسه تاب‌آوری ملی کشور این نقطه با کشورهای peer و رقیب در ابعاد ۱۴‌گانه.',
      icon: 'RCC',
      mode: 'long',
      taskClass: 'resilience-analysis',
      domainMode: 'economic-resilience',
      promptTemplate: 'تاب‌آوری ملی کشوری که این نقطه در آن قرار دارد را با کشورهای مشابه، همسایه و رقیب مقایسه کن. ابعاد ۱۴‌گانه تاب‌آوری شامل نظامی، اقتصادی، اجتماعی، زیرساختی، انرژی، غذا، بهداشت، ارتباطات، سایبری، لجستیک، حکمرانی، شناختی، محیط‌زیست و مالی را پوشش بده. جدول رتبه‌بندی و radar chart ارائه کن.',
      requiredData: ['شاخص‌های تاب‌آوری', 'CII', 'اطلاعات کشور'],
      priority: 81,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-social-media-trends',
      category: 'osint-news',
      label: 'ترندهای شبکه‌های اجتماعی و منابع OSINT',
      summary: 'ترندهای مرتبط در توییتر، اینستاگرام، فیسبوک، تلگرام، سایت‌های خبری و صفحات OSINT برای این نقطه.',
      icon: 'SMT',
      mode: 'long',
      taskClass: 'extraction',
      domainMode: 'osint-digest',
      promptTemplate: 'ترندهای مرتبط با این نقطه/محدوده را در شبکه‌های اجتماعی و منابع OSINT بررسی کن: توییتر/X (هشتگ‌ها و حساب‌های کلیدی)، اینستاگرام (صفحات خبری و محلی)، فیسبوک (گروه‌ها و صفحات)، تلگرام (کانال‌ها و گروه‌های OSINT)، سایت‌های خبری محلی و بین‌المللی. موضوعات داغ، روایت‌های غالب، هشتگ‌های پرتکرار و حساب‌های تاثیرگذار را لیست کن.',
      requiredData: ['خبرها', 'خروجی OSINT', 'claims'],
      priority: 76,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-wartime-status',
      category: 'security',
      label: 'وضعیت جنگی این نقطه (اقتصادی/نظامی/اجتماعی/فرهنگی)',
      summary: 'آخرین اطلاعات مرتبط با شرایط اقتصادی، نظامی، اجتماعی و فرهنگی این نقطه در زمان جنگ یا بحران.',
      icon: 'WAR',
      mode: 'long',
      taskClass: 'briefing',
      domainMode: 'security-brief',
      promptTemplate: 'وضعیت جامع این نقطه/محدوده در شرایط جنگی یا بحرانی را گزارش کن. چهار بعد را پوشش بده: ۱) اقتصادی: وضعیت بازار، تحریم‌ها، تامین کالا، نرخ ارز، فعالیت تجاری ۲) نظامی: استقرار نیروها، تحرکات، سامانه‌های دفاعی، تهدیدات فعال ۳) اجتماعی: جابه‌جایی جمعیت، وضعیت بهداشت، امنیت غذایی، روحیه مردم ۴) فرهنگی: وضعیت رسانه‌ها، محدودیت‌های اطلاعاتی، روایت‌های غالب، وضعیت ارتباطات. برای هر بخش سطح بحران (عادی/هشدار/بحرانی) مشخص کن.',
      requiredData: ['سیگنال‌های نزدیک', 'خبرها', 'شاخص‌های تاب‌آوری'],
      priority: 74,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-md-export',
      category: 'data-quality',
      label: 'خروجی .md خلاصه وضعیت با تاریخ جهانی/منطقه‌ای/ایرانی',
      summary: 'تولید خلاصه وضعیت در فرمت Markdown با ساعت و تاریخ UTC، منطقه‌ای و شمسی.',
      icon: 'EXP',
      mode: 'fast',
      taskClass: 'structured-json',
      domainMode: 'osint-digest',
      promptTemplate: 'یک خلاصه وضعیت Markdown برای این نقطه/محدوده تولید کن. شامل: ۱) هدر با نام نقطه/کشور و مختصات ۲) تاریخ و ساعت سه‌گانه: UTC (جهانی)، ساعت منطقه‌ای (timezone محلی)، تاریخ شمسی ایرانی ۳) خلاصه وضعیت امنیتی ۴) خلاصه وضعیت اقتصادی ۵) خلاصه وضعیت اجتماعی ۶) سیگنال‌های فعال ۷) توصیه‌های پایش. خروجی باید قابل کپی و استفاده مستقیم در گزارش باشد.',
      requiredData: ['سیگنال‌های نزدیک', 'خبرها', 'پوشش freshness'],
      priority: 70,
    }),
    makeSuggestion(snapshot, {
      id: 'geo-broadcast-channels',
      category: 'osint-news',
      label: 'کانال‌های رادیویی/تلویزیونی اینترنتی این نقطه',
      summary: 'فهرست کانال‌های رادیویی، تلویزیونی و رسانه‌ای قابل دسترسی در اینترنت برای این نقطه با لینک مستقیم.',
      icon: 'BRC',
      mode: 'fast',
      taskClass: 'extraction',
      domainMode: 'osint-digest',
      promptTemplate: 'فهرست کانال‌های رادیویی و تلویزیونی قابل مشاهده یا دسترسی در اینترنت برای این نقطه/کشور/منطقه را ارائه بده. شامل: ۱) تلویزیون‌های خبری دولتی و خصوصی ۲) رادیوهای خبری و محلی ۳) وب‌سایت‌های پخش زنده ۴) کانال‌های یوتیوب خبری ۵) پادکست‌ها و رادیوهای اینترنتی. برای هر مورد نام، زبان، نوع (دولتی/خصوصی/مستقل) و لینک دسترسی ذکر کن.',
      requiredData: ['اطلاعات کشور', 'ناحیه/استان'],
      priority: 68,
    }),
  ];

  if (hasLayer(snapshot, ['military', 'flights', 'bases']) || hasSignalKind(snapshot, ['پرواز نظامی', 'شناور'])) {
    items.push(makeSuggestion(snapshot, {
      id: 'geo-defensive-military',
      category: 'defensive-military-monitoring',
      label: 'پایش دفاعی تحرکات نظامی',
      summary: 'تحرکات هوایی/دریایی و نشانه‌های posture صرفاً در چارچوب دفاعی.',
      icon: 'DEF',
      mode: 'long',
      taskClass: 'scenario-analysis',
      domainMode: 'military-monitoring-defensive',
      promptTemplate: 'تحرکات نظامی نزدیک این موقعیت را فقط در چارچوب پایش دفاعی تحلیل کن؛ posture، خطوط قرمز، spilloverهای منطقه‌ای و نشانه‌های تشدید را توضیح بده.',
      requiredData: ['پروازهای نظامی', 'شناورهای نظامی', 'لایه‌های دفاعی'],
      priority: 94,
    }));
  }

  if (hasLayer(snapshot, ['economic', 'sanctions', 'roadTraffic', 'ais', 'waterways']) || hasSignalKind(snapshot, ['قطعی', 'اختلال هوایی', 'شناور'])) {
    items.push(makeSuggestion(snapshot, {
      id: 'geo-economic-shock',
      category: 'economic',
      label: 'تحلیل اثرات اقتصادی این نقطه',
      summary: 'تحلیل اهمیت اقتصادی و آسیب‌پذیری این نقطه با تمرکز بر تجارت، لجستیک، حساسیت تحریم و سرریز کوتاه‌مدت.',
      icon: 'ECO',
      mode: 'long',
      taskClass: 'report-generation',
      domainMode: 'economic-resilience',
      promptTemplate: 'اهمیت اقتصادی و آسیب‌پذیری این نقطه/محدوده را تحلیل کن: تجارت، لجستیک، حساسیت تحریم، احساسات بازار و spillover اقتصادی کوتاه‌مدت. پیشنهادهای پایش دفاعی ارائه کن.',
      requiredData: ['ترافیک و حمل‌ونقل', 'شاخص‌های اقتصادی', 'مسیرهای لجستیکی'],
      priority: 86,
    }));
  }

  if (hasLayer(snapshot, ['protests']) || hasSignalKind(snapshot, ['اعتراض'])) {
    items.push(makeSuggestion(snapshot, {
      id: 'geo-social-stress',
      category: 'social',
      label: 'تحلیل تنش اجتماعی این محدوده',
      summary: 'ارزیابی تنش اجتماعی، ریسک اعتراض، فشار جابه‌جایی، فشار خدمات عمومی و عوامل انسجام پیرامون این محدوده.',
      icon: 'SOC',
      mode: 'long',
      taskClass: 'briefing',
      domainMode: 'social-resilience',
      promptTemplate: 'تنش اجتماعی، ریسک اعتراض، فشار جابه‌جایی، فشار خدمات عمومی و عوامل انسجام پیرامون این نقطه/محدوده را ارزیابی کن. سیگنال‌های تاییدشده را از شاخص‌های ضعیف جدا کن.',
      requiredData: ['اعتراض‌ها', 'خبرهای محلی', 'روایت‌های غالب'],
      priority: 80,
    }));
  }

  return groupGeoSuggestions(items);
}

export function buildGeoContextSnapshot(input: GeoContextSnapshotInput): GeoContextSnapshot {
  const nearbySignals = collectNearbySignals(input);
  const nearbyInfrastructure = findNearbyInfrastructure(input.lat, input.lon);
  const freshness = normalizeFreshness(input.freshnessSummary);
  const selectedEntities = buildSelectedEntities(input.countryName, nearbySignals, nearbyInfrastructure);
  const evidenceDensity = inferEvidenceDensity(nearbySignals.length, nearbyInfrastructure.length, freshness);
  const snapshotBase: GeoContextSnapshot = {
    context: createPointMapContext(
      createId('map-context'),
      {
        lat: input.lat,
        lon: input.lon,
        countryCode: input.countryCode,
        countryName: input.countryName,
        label: 'geo-analysis',
      },
      {
        activeLayers: input.activeLayers,
        timeRange: { label: input.timeRangeLabel },
        viewport: {
          zoom: input.zoom,
          view: input.view,
          bounds: parseBbox(input.bbox),
        },
        workspaceMode: `variant:${getWorkspaceVariant()}`,
        watchlists: summarizeWatchlists(),
        selectedEntities,
        nearbySignals,
        dataFreshness: {
          ...freshness,
          evidenceDensity,
        },
      },
    ),
    generatedAt: new Date().toISOString(),
    promptContext: '',
    center: { lat: input.lat, lon: input.lon },
    country: input.countryName ? { code: input.countryCode, name: input.countryName } : undefined,
    adminRegion: input.adminRegion,
    viewport: {
      zoom: input.zoom,
      view: input.view,
      bounds: parseBbox(input.bbox),
    },
    activeLayers: input.activeLayers,
    workspaceMode: `variant:${getWorkspaceVariant()}`,
    watchlists: summarizeWatchlists(),
    selectedEntities,
    nearbySignals,
    nearbyInfrastructure,
    sourceDensity: {
      evidenceDensity,
      nearbySignalCount: nearbySignals.length,
      nearbyAssetCount: nearbyInfrastructure.length,
    },
    dataFreshness: freshness,
    trendPreview: buildTrendPreview(nearbySignals),
  };

  snapshotBase.context.selection = inferMapSelection(snapshotBase);
  snapshotBase.promptContext = [
    snapshotBase.country?.name ? `کشور/نقطه تمرکز: ${snapshotBase.country.name}` : `مختصات: ${input.lat.toFixed(4)}, ${input.lon.toFixed(4)}`,
    input.adminRegion ? `ناحیه/استان: ${input.adminRegion}` : '',
    snapshotBase.activeLayers.length > 0 ? `لایه‌های فعال: ${snapshotBase.activeLayers.join('، ')}` : '',
    input.timeRangeLabel ? `بازه زمانی: ${input.timeRangeLabel}` : '',
    snapshotBase.nearbySignals.length > 0
      ? `سیگنال‌های نزدیک: ${snapshotBase.nearbySignals.slice(0, 5).map((signal) => `${signal.label} (${signal.kind})`).join('، ')}`
      : 'سیگنال نزدیک محدودی ثبت شده است.',
    snapshotBase.nearbyInfrastructure.length > 0
      ? `زیرساخت‌های نزدیک: ${snapshotBase.nearbyInfrastructure.slice(0, 4).map((asset) => `${asset.name} (${asset.type})`).join('، ')}`
      : '',
    `پوشش داده: ${snapshotBase.dataFreshness.coveragePercent}% با وضعیت ${snapshotBase.dataFreshness.overallStatus}.`,
  ].filter(Boolean).join('\n');

  return snapshotBase;
}

const MAP_SUGGESTION_LOOKUP = new Map<string, GeoSuggestionItem>();

const EXTERNAL_GEO_SUGGESTION_ID_MAP: Record<string, string> = {
  geo_osint_digest: 'geo-osint-digest',
  geo_recent_news_summary: 'geo-recent-signals',
  geo_trend_analysis: 'geo-trend-analysis',
  geo_short_term_forecast: 'geo-scenario-tree',
  geo_resilience_impact: 'geo-resilience-impact',
  geo_infrastructure_exposure: 'geo-logistics-exposure',
  geo_economic_exposure: 'geo-economic-shock',
  geo_social_tension: 'geo-social-stress',
  geo_cognitive_influence: 'geo-narrative-exposure',
  geo_related_actors: 'geo-spillovers',
  geo_data_gaps: 'geo-data-gaps',
  geo_custom_analyst_query: 'geo-custom-question',
};

function refreshSuggestionLookup(groups: GeoSuggestionGroup[]): void {
  MAP_SUGGESTION_LOOKUP.clear();
  groups.forEach((group) => {
    group.items.forEach((item) => {
      MAP_SUGGESTION_LOOKUP.set(item.id, item);
      // Alias snake_case IDs (provided by external registries) to canonical kebab-case IDs
      // without breaking any persisted results.
      MAP_SUGGESTION_LOOKUP.set(item.id.replace(/-/g, '_'), item);
    });
  });

  Object.entries(EXTERNAL_GEO_SUGGESTION_ID_MAP).forEach(([externalId, canonicalId]) => {
    const resolved = MAP_SUGGESTION_LOOKUP.get(canonicalId);
    if (!resolved) return;
    MAP_SUGGESTION_LOOKUP.set(externalId, resolved);
  });
}

function focusPanel(panelId: string): void {
  if (typeof document === 'undefined') return;
  const panel = document.querySelector<HTMLElement>(`[data-panel="${panelId}"]`);
  if (!panel) return;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  panel.classList.add('panel-flash-outline');
  window.setTimeout(() => panel.classList.remove('panel-flash-outline'), 1200);
}

function trimState(state: GeoAnalysisWorkspaceState): GeoAnalysisWorkspaceState {
  return {
    ...state,
    jobs: state.jobs.slice(0, MAX_JOBS),
    results: state.results.slice(0, MAX_RESULTS),
  };
}

function createSyntheticThread(result: GeoAnalysisResultRecord): AssistantConversationThread {
  return {
    id: result.id,
    title: result.descriptor.title,
    domainMode: result.descriptor.domainMode,
    taskClass: result.descriptor.taskClass,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
    pinnedEvidenceIds: [],
    messages: [
      {
        id: `${result.id}-user`,
        role: 'user',
        createdAt: result.createdAt,
        content: result.descriptor.query,
        domainMode: result.descriptor.domainMode,
        taskClass: result.descriptor.taskClass,
      },
      ...(result.response ? [result.response.message] : []),
    ],
  };
}

export class MapAnalysisWorkspaceStore {
  private state: GeoAnalysisWorkspaceState;
  private readonly listeners = new Set<MapAnalysisWorkspaceListener>();
  private readonly queue: AnalysisJobQueue;

  constructor(
    private readonly target: EventTarget = DEFAULT_TARGET,
    private readonly storage: StorageLike | null = getBrowserStorage(),
    queue?: AnalysisJobQueue,
  ) {
    this.queue = queue ?? new AnalysisJobQueue(target);
    this.state = this.load();
  }

  getState(): GeoAnalysisWorkspaceState {
    return this.state;
  }

  subscribe(listener: MapAnalysisWorkspaceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async run(input: GeoAnalysisRunInput): Promise<GeoAnalysisResultRecord | null> {
    const { descriptor } = input;
    const autoMinimize = input.autoMinimize ?? descriptor.mode === 'long';
    const now = descriptor.createdAt;
    const jobRecord: GeoAnalysisJobRecord = {
      id: descriptor.id,
      descriptor,
      status: 'running',
      createdAt: now,
      updatedAt: now,
      autoMinimized: autoMinimize,
    };

    this.state = trimState({
      ...this.state,
      jobs: [jobRecord, ...this.state.jobs.filter((job) => job.id !== descriptor.id)],
    });
    this.emit();

    const runPromise = this.queue.enqueue({
      id: descriptor.id,
      kind: 'map-analysis',
      title: descriptor.title,
      promptId: descriptor.suggestion.id,
      mapContextId: descriptor.mapContext.id,
      surface: 'map',
      mode: descriptor.mode,
      run: async (signal) => {
        const { runPersianAssistant } = await import('@/services/intelligence-assistant');
        return runPersianAssistant({
          conversationId: descriptor.id,
          domainMode: descriptor.domainMode,
          taskClass: descriptor.taskClass,
          query: descriptor.query,
          promptId: descriptor.suggestion.id,
          promptText: descriptor.promptText,
          messages: [
            {
              role: 'user',
              content: descriptor.query,
              createdAt: descriptor.createdAt,
            },
          ],
          pinnedEvidence: [],
          memoryNotes: [],
          knowledgeDocuments: [],
          mapContext: descriptor.mapContext,
          signal,
        });
      },
    });

    if (autoMinimize) {
      this.queue.minimize(descriptor.id, 'map-auto-minimize');
    }

    try {
      const response = await runPromise;
      const resultId = createId('geo-result');
      const result: GeoAnalysisResultRecord = {
        id: resultId,
        jobId: descriptor.id,
        descriptor,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pinned: false,
        unread: autoMinimize,
        status: 'completed',
        response,
      };

      this.state = trimState({
        ...this.state,
        activeResultId: autoMinimize ? this.state.activeResultId : result.id,
        jobs: this.state.jobs.map((job) => job.id === descriptor.id
          ? { ...job, status: 'completed', updatedAt: result.updatedAt, resultId: result.id }
          : job),
        results: [result, ...this.state.results.filter((item) => item.id !== result.id)],
      });
      this.emit();
      return result;
    } catch (error) {
      const status = error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'failed';
      const message = error instanceof Error ? error.message : String(error);
      this.state = trimState({
        ...this.state,
        jobs: this.state.jobs.map((job) => job.id === descriptor.id
          ? { ...job, status, updatedAt: new Date().toISOString(), error: message }
          : job),
      });
      this.emit();
      return null;
    }
  }

  cancel(jobId: string): boolean {
    return this.queue.cancel(jobId, 'map-user-cancel');
  }

  openResult(resultId: string): void {
    const result = this.state.results.find((item) => item.id === resultId);
    if (!result) return;
    result.unread = false;
    result.updatedAt = new Date().toISOString();
    this.state = {
      ...this.state,
      activeResultId: resultId,
      results: this.state.results.map((item) => item.id === resultId ? result : item),
    };
    this.emit();
    dispatchGeoAnalysisOpenResult(this.target, { resultId });
    focusPanel(GEO_ANALYSIS_PANEL_ID);
  }

  dismissResultNotification(resultId: string): void {
    const result = this.state.results.find((item) => item.id === resultId);
    if (!result || !result.unread) return;
    result.unread = false;
    result.updatedAt = new Date().toISOString();
    this.state = {
      ...this.state,
      results: this.state.results.map((item) => item.id === resultId ? result : item),
    };
    this.emit();
  }

  togglePinned(resultId: string): void {
    const result = this.state.results.find((item) => item.id === resultId);
    if (!result) return;
    result.pinned = !result.pinned;
    result.updatedAt = new Date().toISOString();
    this.state = {
      ...this.state,
      results: this.state.results.map((item) => item.id === resultId ? result : item)
        .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.updatedAt.localeCompare(left.updatedAt)),
    };
    this.emit();
  }

  async rerun(resultId: string): Promise<GeoAnalysisResultRecord | null> {
    const result = this.state.results.find((item) => item.id === resultId);
    if (!result) return null;
    const suggestion = MAP_SUGGESTION_LOOKUP.get(result.descriptor.suggestion.id) || result.descriptor.suggestion;
    const descriptor: GeoAnalysisRequestDescriptor = {
      ...result.descriptor,
      id: createId('geo-job'),
      createdAt: new Date().toISOString(),
      suggestion,
      promptText: composeGeoAnalysisPrompt({
        suggestion,
        snapshot: result.descriptor.snapshot,
        query: result.descriptor.query,
        customQuestion: result.descriptor.customQuestion,
      }),
    };
    return this.run({ descriptor, autoMinimize: descriptor.mode === 'long' });
  }

  exportResult(resultId: string, format: 'json' | 'markdown' | 'html'): void {
    const result = this.state.results.find((item) => item.id === resultId);
    if (!result?.response) return;
    void import('@/services/intelligence-assistant').then(({ exportAssistantThread }) => {
      exportAssistantThread(createSyntheticThread(result), result.response!.message, format);
    });
  }

  openInAssistant(resultId: string, followUp?: string): void {
    const result = this.state.results.find((item) => item.id === resultId);
    if (!result) return;
    dispatchGeoAnalysisAssistantHandoff(this.target, {
      resultId,
      title: result.descriptor.title,
      query: buildAssistantHandoffQuery(result, followUp),
      domainMode: result.descriptor.domainMode,
      taskClass: result.descriptor.taskClass,
      mapContext: result.descriptor.mapContext,
      evidenceCards: result.response?.evidenceCards ?? result.response?.message.evidenceCards ?? [],
    });
    focusPanel('qadr-assistant');
  }

  openInScenario(resultId: string): void {
    const result = this.state.results.find((item) => item.id === resultId);
    if (!result) return;
    dispatchGeoAnalysisScenarioHandoff(this.target, buildScenarioHandoffDetail(result));
    focusPanel('scenario-planner');
  }

  private emit(): void {
    this.persist(this.state);
    dispatchGeoAnalysisStateChanged(this.target, this.state);
    this.listeners.forEach((listener) => listener(this.state));
  }

  private load(): GeoAnalysisWorkspaceState {
    if (!this.storage) {
      return { jobs: [], results: [], activeResultId: null };
    }
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return { jobs: [], results: [], activeResultId: null };
      const parsed = JSON.parse(raw) as Partial<GeoAnalysisWorkspaceState>;
      return trimState({
        jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
        results: Array.isArray(parsed.results) ? parsed.results : [],
        activeResultId: typeof parsed.activeResultId === 'string' ? parsed.activeResultId : null,
      });
    } catch {
      return { jobs: [], results: [], activeResultId: null };
    }
  }

  private persist(state: GeoAnalysisWorkspaceState): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(trimState(state)));
    } catch {
      // Ignore storage quota errors.
    }
  }
}

function nextDomainForCustomQuestion(query: string): { domainMode: GeoSuggestionItem['domainMode']; taskClass: AiTaskClass } {
  if (/تاب[\u200c ]?آوری|resilience|زیرساخت|infrastructure/i.test(query)) {
    return { domainMode: 'infrastructure-risk', taskClass: 'resilience-analysis' };
  }
  if (/سناریو|forecast|پیش[\u200c ]?بینی/i.test(query)) {
    return { domainMode: 'scenario-planning', taskClass: 'forecasting' };
  }
  if (/روایت|اطلاعات نادرست|disinformation|narrative/i.test(query)) {
    return { domainMode: 'misinformation-analysis', taskClass: 'summarization' };
  }
  return { domainMode: 'osint-digest', taskClass: 'assistant' };
}

export function createGeoAnalysisDescriptor(
  snapshot: GeoContextSnapshot,
  suggestion: GeoSuggestionItem,
  customQuestion?: string,
): GeoAnalysisRequestDescriptor {
  const query = customQuestion?.trim() || suggestion.label;
  const routing = customQuestion ? nextDomainForCustomQuestion(customQuestion) : {
    domainMode: suggestion.domainMode,
    taskClass: suggestion.taskClass,
  };
  const descriptor: GeoAnalysisRequestDescriptor = {
    id: createId('geo-job'),
    suggestion,
    title: customQuestion?.trim() ? `پرسش اختصاصی: ${customQuestion.trim().slice(0, 48)}` : suggestion.label,
    query,
    promptText: '',
    mapContext: snapshot.context,
    snapshot,
    mode: suggestion.mode,
    domainMode: routing.domainMode,
    taskClass: routing.taskClass,
    createdAt: new Date().toISOString(),
    customQuestion: customQuestion?.trim() || undefined,
  };
  descriptor.promptText = composeGeoAnalysisPrompt({
    suggestion: {
      ...suggestion,
      domainMode: routing.domainMode,
      taskClass: routing.taskClass,
    },
    snapshot,
    query,
    customQuestion: descriptor.customQuestion,
  });
  return descriptor;
}

export function buildGeoSuggestionGroups(snapshot: GeoContextSnapshot): GeoSuggestionGroup[] {
  const groups = buildGeoSuggestions(snapshot);
  refreshSuggestionLookup(groups);
  return groups;
}

export function createCustomGeoSuggestion(question: string): GeoSuggestionItem {
  const routing = nextDomainForCustomQuestion(question);
  return {
    id: 'geo-custom-question',
    category: 'osint-news',
    label: 'تحلیل سفارشی درباره همین نقطه',
    summary: 'پرسش سفارشی درباره نقطه/محدوده انتخاب‌شده با اتکا به کانتکست نقشه و شواهد موجود.',
    icon: 'ASK',
    mode: /سناریو|forecast|پیش[\u200c ]?بینی/i.test(question) ? 'long' : 'fast',
    taskClass: routing.taskClass,
    domainMode: routing.domainMode,
    promptTemplate: 'به پرسش اختصاصی تحلیلگر درباره همین نقطه/محدوده پاسخ بده. از کانتکست نقشه، بازیگران نزدیک و سیگنال‌های موجود استفاده کن. واقعیت، استنباط و عدم‌قطعیت را جدا و از ادعاهای بی‌پشتوانه پرهیز کن.',
    requiredData: ['کانتکست نقشه', 'سیگنال‌های نزدیک'],
    confidenceNote: undefined,
    priority: 110,
  };
}

export function getActiveMapAnalysisResult(state: GeoAnalysisWorkspaceState): GeoAnalysisResultRecord | null {
  if (!state.activeResultId) return state.results[0] ?? null;
  return state.results.find((result) => result.id === state.activeResultId) ?? state.results[0] ?? null;
}

export function getMapAnalysisUnreadResults(state: GeoAnalysisWorkspaceState): GeoAnalysisResultRecord[] {
  return state.results.filter((result) => result.unread);
}

export function getMapAnalysisRunningJobs(state: GeoAnalysisWorkspaceState): GeoAnalysisJobRecord[] {
  return state.jobs.filter((job) => job.status === 'running');
}

export function buildMapAnalysisSummary(result: GeoAnalysisResultRecord): {
  title: string;
  summary: string;
  confidenceScore: number;
} {
  const summary = result.response?.message.structured?.executiveSummary || result.error || result.descriptor.query;
  return {
    title: result.descriptor.title,
    summary,
    confidenceScore: scoreGeoForecastConfidence(result.descriptor.snapshot, result.response),
  };
}

export function buildMapAnalysisEvidenceCards(result: GeoAnalysisResultRecord): AssistantEvidenceCard[] {
  return result.response?.evidenceCards ?? result.response?.message.evidenceCards ?? [];
}

export function createMapAnalysisStateChangedDetail(state: GeoAnalysisWorkspaceState): ReturnType<typeof buildGeoAnalysisStateChangedDetail> {
  return buildGeoAnalysisStateChangedDetail(state);
}

export function inferGeoCategoryLabel(category: GeoAnalysisCategory): string {
  return getGeoCategoryMeta(category).label;
}

export function buildForecastConfidenceLabel(result: GeoAnalysisResultRecord): string {
  const score = scoreGeoForecastConfidence(result.descriptor.snapshot, result.response);
  if (score >= 0.82) return 'اطمینان بالا';
  if (score >= 0.6) return 'اطمینان متوسط';
  return 'اطمینان محدود';
}

export const mapAnalysisWorkspace = new MapAnalysisWorkspaceStore();

export async function seedDemoMapAnalyses(): Promise<void> {
  if (!isDemoModeEnabled()) return;

  const now = Date.now();
  const lat = 35.6892;
  const lon = 51.3890;
  const demoNews: NewsItem[] = [
    {
      source: 'QADR110 Demo (synthetic)',
      title: 'نمونه خبر (synthetic): اختلال کوتاه‌مدت در مسیرهای حمل‌ونقل گزارش شد',
      link: 'https://example.invalid/demo/news/1',
      pubDate: new Date(now - 3 * 60 * 60 * 1000),
      isAlert: true,
      lat,
      lon,
      locationName: 'تهران',
      lang: 'fa',
    },
    {
      source: 'QADR110 Demo (synthetic)',
      title: 'نمونه خبر (synthetic): افزایش توجه رسانه‌ای به یک گلوگاه زیرساختی',
      link: 'https://example.invalid/demo/news/2',
      pubDate: new Date(now - 12 * 60 * 60 * 1000),
      isAlert: false,
      lat: lat + 0.25,
      lon: lon + 0.18,
      locationName: 'حومه تهران',
      lang: 'fa',
    },
  ];

  const snapshot = buildGeoContextSnapshot({
    lat,
    lon,
    countryCode: 'IR',
    countryName: 'ایران',
    adminRegion: 'تهران (نمونه)',
    activeLayers: ['gdelt-intel', 'telegram-intel', 'roadTraffic', 'ais', 'economic', 'sanctions', 'cyberThreats', 'protests'],
    timeRangeLabel: '48h (demo)',
    zoom: 5.1,
    view: 'mena',
    bbox: null,
    allNews: demoNews,
    outages: [],
    protests: [],
    militaryFlights: [],
    militaryVessels: [],
    cyberThreats: [],
    earthquakes: [],
    flightDelays: [],
    freshnessSummary: dataFreshness.getSummary(),
  });

  const groups = buildGeoSuggestionGroups(snapshot);
  const suggestions = groups.flatMap((group) => group.items);

  const runById = async (suggestionId: string): Promise<void> => {
    const suggestion = suggestions.find((item) => item.id === suggestionId);
    if (!suggestion) return;
    const descriptor = createGeoAnalysisDescriptor(snapshot, suggestion);
    await mapAnalysisWorkspace.run({ descriptor, autoMinimize: descriptor.mode === 'long' });
  };

  await runById('geo-osint-digest');
  await runById('geo-recent-signals');
  await runById('geo-scenario-tree');
  await runById('geo-resilience-impact');
  await runById('geo-data-gaps');
}
