import { hashString } from '@/utils/hash';

import type { IntelligenceOntologyBundle } from '../domain/ontology';
import type {
  EntityResolutionCandidate,
  GeospatialCorrelation,
  InvestigationEdge,
  InvestigationNode,
  InvestigationWorkbench,
  LinkAnalysisResult,
  PromptReadyEvidenceBundle,
  SourceCorrelationResult,
  TimelineEntry,
  WatchlistMatchResult,
} from './contracts';

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function textFingerprint(value: string): string {
  return normalizeText(value)
    .split(/[^a-z0-9\u0600-\u06ff]+/i)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

export function buildLinkAnalysis(bundle: IntelligenceOntologyBundle): LinkAnalysisResult {
  const nodes: InvestigationNode[] = [
    ...bundle.entities.map((entity) => ({
      id: entity.id,
      label: entity.name,
      kind: entity.kind,
      confidence: entity.confidence.score,
    })),
    ...bundle.events.map((event) => ({
      id: event.id,
      label: event.title,
      kind: event.kind,
      confidence: event.confidence.score,
    })),
    ...bundle.indicators.map((indicator) => ({
      id: indicator.id,
      label: indicator.value,
      kind: indicator.indicatorType,
      confidence: indicator.confidence.score,
    })),
  ];

  const edges: InvestigationEdge[] = bundle.relationships.map((relationship) => ({
    id: relationship.id,
    sourceId: relationship.sourceId,
    targetId: relationship.targetId,
    kind: relationship.kind,
    weight: relationship.weight ?? relationship.confidence.score,
    evidenceIds: relationship.provenance.evidenceIds,
  }));

  return { nodes, edges };
}

export function resolveEntities(bundle: IntelligenceOntologyBundle): EntityResolutionCandidate[] {
  const groups = new Map<string, EntityResolutionCandidate>();

  for (const entity of bundle.entities) {
    const aliases = [entity.name, ...(entity.aliases ?? [])].map(normalizeText).filter(Boolean);
    const key = aliases.sort().join('|');
    if (!key) continue;

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        canonicalId: entity.id,
        duplicateIds: [],
        sharedAliases: aliases,
        confidence: entity.confidence.score,
      });
      continue;
    }

    existing.duplicateIds.push(entity.id);
    existing.sharedAliases = Array.from(new Set([...existing.sharedAliases, ...aliases]));
    existing.confidence = Number(Math.max(existing.confidence, entity.confidence.score).toFixed(2));
  }

  return Array.from(groups.values()).filter((entry) => entry.duplicateIds.length > 0);
}

export function correlateSources(bundle: IntelligenceOntologyBundle): SourceCorrelationResult[] {
  return bundle.sources.map((source) => {
    const evidenceCount = bundle.evidence.filter((evidence) => evidence.sourceId === source.id).length;
    const relatedEventIds = bundle.events
      .filter((event) => event.provenance.sourceIds.includes(source.id))
      .map((event) => event.id);
    const documentCount = bundle.documents.filter((document) => document.sourceId === source.id).length;

    return {
      sourceId: source.id,
      documentCount,
      evidenceCount,
      relatedEventIds,
    };
  });
}

export function clusterNearDuplicates(bundle: IntelligenceOntologyBundle) {
  const documents = bundle.documents.map((document) => ({
    id: document.id,
    fingerprint: textFingerprint(`${document.title} ${document.summary}`),
  }));
  const groups = new Map<string, string[]>();

  for (const document of documents) {
    const list = groups.get(document.fingerprint) ?? [];
    list.push(document.id);
    groups.set(document.fingerprint, list);
  }

  return Array.from(groups.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([fingerprint, recordIds]) => ({
      id: `dup-${hashString(fingerprint)}`,
      recordIds,
      reason: 'identical normalized token set',
      similarity: 0.95,
    }));
}

export function synthesizeTimeline(bundle: IntelligenceOntologyBundle): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...bundle.events.map((event) => ({
      id: event.id,
      title: event.title,
      timestamp: event.time.observedAt || event.time.updatedAt,
      type: 'event' as const,
    })),
    ...bundle.documents.map((document) => ({
      id: document.id,
      title: document.title,
      timestamp: document.time.observedAt || document.time.updatedAt,
      type: 'document' as const,
    })),
    ...bundle.alerts.map((alert) => ({
      id: alert.id,
      title: alert.headline,
      timestamp: alert.time.observedAt || alert.time.updatedAt,
      type: 'alert' as const,
    })),
  ];

  return entries.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
}

export function correlateGeospatial(bundle: IntelligenceOntologyBundle, maxDistanceKm = 75): GeospatialCorrelation[] {
  const points = bundle.geographies
    .filter((geography) => geography.centroid)
    .map((geography) => ({
      id: geography.id,
      lat: geography.centroid!.lat,
      lon: geography.centroid!.lon,
    }));

  const results: GeospatialCorrelation[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const left = points[index];
    if (!left) continue;
    for (let inner = index + 1; inner < points.length; inner += 1) {
      const right = points[inner];
      if (!right) continue;
      const distanceKm = haversineDistanceKm(left.lat, left.lon, right.lat, right.lon);
      if (distanceKm <= maxDistanceKm) {
        results.push({
          leftId: left.id,
          rightId: right.id,
          distanceKm: Number(distanceKm.toFixed(1)),
        });
      }
    }
  }

  return results;
}

export function matchWatchlists(bundle: IntelligenceOntologyBundle): WatchlistMatchResult[] {
  const haystack = [
    ...bundle.entities.map((entity) => ({ id: entity.id, text: `${entity.name} ${(entity.aliases ?? []).join(' ')}` })),
    ...bundle.documents.map((document) => ({ id: document.id, text: `${document.title} ${document.summary}` })),
    ...bundle.indicators.map((indicator) => ({ id: indicator.id, text: indicator.value })),
  ];

  return bundle.watchlists.map((watchlist) => {
    const matchedRecordIds = new Set<string>();
    const matchedPatterns = new Set<string>();

    for (const rule of watchlist.rules) {
      const pattern = normalizeText(rule.pattern);
      for (const record of haystack) {
        if (normalizeText(record.text).includes(pattern)) {
          matchedRecordIds.add(record.id);
          matchedPatterns.add(rule.pattern);
        }
      }
    }

    return {
      watchlistId: watchlist.id,
      matchedRecordIds: Array.from(matchedRecordIds),
      matchedPatterns: Array.from(matchedPatterns),
    };
  }).filter((result) => result.matchedRecordIds.length > 0);
}

export function buildPromptEvidenceBundle(bundle: IntelligenceOntologyBundle): PromptReadyEvidenceBundle {
  const topEvidence = bundle.evidence.slice(0, 8);
  const topEvents = bundle.events.slice(0, 5);
  return {
    summary: [`${bundle.sources.length} منبع`, `${bundle.events.length} رویداد`, `${bundle.evidence.length} شواهد`].join(' / '),
    evidenceIds: topEvidence.map((evidence) => evidence.id),
    sourceIds: bundle.sources.slice(0, 5).map((source) => source.id),
    eventIds: topEvents.map((event) => event.id),
  };
}

export function buildInvestigationWorkbench(bundle: IntelligenceOntologyBundle): InvestigationWorkbench {
  return {
    bundle,
    linkAnalysis: buildLinkAnalysis(bundle),
    entityResolution: resolveEntities(bundle),
    sourceCorrelation: correlateSources(bundle),
    duplicateClusters: clusterNearDuplicates(bundle),
    timeline: synthesizeTimeline(bundle),
    geospatialCorrelation: correlateGeospatial(bundle),
    watchlistMatches: matchWatchlists(bundle),
    promptEvidence: buildPromptEvidenceBundle(bundle),
  };
}
