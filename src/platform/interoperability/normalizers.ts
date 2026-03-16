import type { CyberThreat, MilitaryFlight, MilitaryVessel, NewsItem } from '@/types';
import type { TelegramItem } from '@/services/telegram-intel';

import { buildStableId } from '../domain/ids';
import type { EventRecord, SourceRecord } from '../domain/model';
import { createConfidence, createEmptyOntologyBundle, createLocalizedAliases, createProvenanceFromEvidence, type DocumentRecord, type IntelligenceOntologyBundle } from '../domain/ontology';
import type { PortableStructuredRecord } from './contracts';

function isoNow(): string {
  return new Date().toISOString();
}

function timeBounds(observedAt?: string): EventRecord['time'] {
  const now = isoNow();
  return {
    createdAt: now,
    updatedAt: observedAt || now,
    observedAt,
  };
}

function buildSource(
  namespace: string,
  sourceName: string,
  type: SourceRecord['type'],
  extras: Partial<Omit<SourceRecord, 'id' | 'type' | 'title' | 'retrievedAt' | 'reliability'>> = {},
): SourceRecord {
  return {
    id: buildStableId(namespace, 'source', sourceName),
    type,
    title: sourceName,
    retrievedAt: isoNow(),
    reliability: createConfidence(0.7, `Source ${sourceName} imported through ${namespace}.`),
    ...extras,
  };
}

function buildEvidence(
  namespace: string,
  sourceId: string,
  summary: string,
  locator?: string,
  excerpt?: string,
) {
  return {
    id: buildStableId(namespace, 'evidence', `${sourceId}-${summary.slice(0, 48)}`),
    sourceId,
    summary,
    excerpt,
    locator,
    collectedAt: isoNow(),
  };
}

function addUnique<T extends { id: string }>(target: T[], item: T): void {
  if (!target.some((entry) => entry.id === item.id)) {
    target.push(item);
  }
}

function addGeographyPoint(
  bundle: IntelligenceOntologyBundle,
  namespace: string,
  label: string,
  lat?: number,
  lon?: number,
  countryCode?: string,
): string | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  const geographyId = buildStableId(namespace, 'geography', `${label}-${lat}-${lon}`);
  addUnique(bundle.geographies, {
    id: geographyId,
    labels: ['geography'],
    name: label,
    geometryType: 'point',
    countryCode,
    centroid: { lat: lat!, lon: lon! },
    time: timeBounds(),
    confidence: createConfidence(0.72, 'Location inferred from imported coordinates.'),
    provenance: createProvenanceFromEvidence([], []),
    audit: { revision: 1, createdBy: 'qadr110', tags: ['interoperability'] },
  });
  return geographyId;
}

export function normalizeStructuredRecords(
  records: PortableStructuredRecord[],
  sourceLabel: string,
  sourceUrl?: string,
): IntelligenceOntologyBundle {
  const bundle = createEmptyOntologyBundle();
  const source = buildSource('interop', sourceLabel, 'dataset', { url: sourceUrl });
  addUnique(bundle.sources, source);

  for (const [index, record] of records.entries()) {
    const recordId = record.id || `${record.kind}-${index + 1}`;
    const entityId = buildStableId('interop', record.kind, recordId);
    const evidence = buildEvidence('interop', source.id, record.summary || record.title || record.name || recordId, record.url);
    addUnique(bundle.evidence, evidence);
    const provenance = createProvenanceFromEvidence([source.id], [evidence.id]);
    const confidence = createConfidence(0.64, 'Imported from structured external data.');
    const geographyId = addGeographyPoint(bundle, 'interop', record.title || record.name || recordId, record.lat, record.lon, record.countryCode);

    if (record.kind === 'entity') {
      addUnique(bundle.entities, {
        id: entityId,
        kind: 'actor',
        name: record.name || record.title || recordId,
        aliases: record.aliases,
        labels: ['imported-entity'],
        time: timeBounds(record.observedAt),
        confidence,
        provenance,
        audit: { revision: 1, createdBy: 'qadr110', tags: record.tags },
        geographyIds: geographyId ? [geographyId] : undefined,
        attributes: record.attributes,
      });
      continue;
    }

    if (record.kind === 'event') {
      addUnique(bundle.events, {
        id: entityId,
        kind: geographyId ? 'incident' : 'media',
        title: record.title || record.name || recordId,
        summary: record.summary || record.statement || 'Imported event',
        labels: ['imported-event'],
        time: timeBounds(record.observedAt),
        confidence,
        provenance,
        audit: { revision: 1, createdBy: 'qadr110', tags: record.tags },
        geographyIds: geographyId ? [geographyId] : undefined,
      });
      continue;
    }

    if (record.kind === 'indicator') {
      addUnique(bundle.indicators, {
        id: entityId,
        indicatorType: record.attributes?.type && typeof record.attributes.type === 'string' ? record.attributes.type : 'external-indicator',
        value: record.value || record.title || recordId,
        normalizedValue: (record.value || '').toLowerCase(),
        relatedEventIds: [],
        labels: ['imported-indicator'],
        time: timeBounds(record.observedAt),
        confidence,
        provenance,
        audit: { revision: 1, createdBy: 'qadr110', tags: record.tags },
      });
      continue;
    }

    if (record.kind === 'geography') {
      addUnique(bundle.geographies, {
        id: entityId,
        name: record.title || record.name || recordId,
        geometryType: geographyId ? 'point' : 'polygon',
        countryCode: record.countryCode,
        centroid: geographyId && Number.isFinite(record.lat) && Number.isFinite(record.lon)
          ? { lat: record.lat!, lon: record.lon! }
          : undefined,
        geometry: record.attributes?.geometry as Record<string, unknown> | undefined,
        labels: ['imported-geography'],
        time: timeBounds(record.observedAt),
        confidence,
        provenance,
        audit: { revision: 1, createdBy: 'qadr110', tags: record.tags },
      });
      continue;
    }

    if (record.kind === 'claim') {
      addUnique(bundle.claims, {
        id: entityId,
        statement: record.statement || record.summary || record.title || recordId,
        status: 'reported',
        subjectIds: [],
        labels: ['imported-claim'],
        time: timeBounds(record.observedAt),
        confidence,
        provenance,
        audit: { revision: 1, createdBy: 'qadr110', tags: record.tags },
      });
      continue;
    }

    if (record.kind === 'relationship') {
      const sourceId = typeof record.attributes?.sourceId === 'string'
        ? record.attributes.sourceId
        : buildStableId('interop', 'node', `${recordId}-source`);
      const targetId = typeof record.attributes?.targetId === 'string'
        ? record.attributes.targetId
        : buildStableId('interop', 'node', `${recordId}-target`);
      addUnique(bundle.relationships, {
        id: entityId,
        kind: 'references',
        sourceId,
        targetId,
        labels: ['imported-relationship'],
        time: timeBounds(record.observedAt),
        confidence,
        provenance,
        audit: { revision: 1, createdBy: 'qadr110', tags: record.tags },
        weight: 0.5,
      });
      continue;
    }

    addUnique(bundle.documents, {
      id: entityId,
      kind: record.kind === 'document' ? 'document' : 'report',
      title: record.title || record.name || recordId,
      summary: record.summary || 'Imported document',
      sourceId: source.id,
      url: record.url,
      language: 'mixed',
      aliases: createLocalizedAliases(record.title || record.name || recordId, record.aliases),
      tags: record.tags,
      labels: ['imported-document'],
      time: timeBounds(record.observedAt),
      confidence,
      provenance,
      audit: { revision: 1, createdBy: 'qadr110', tags: record.tags },
      geographyIds: geographyId ? [geographyId] : undefined,
    });
  }

  return bundle;
}

export function normalizeNewsItems(items: NewsItem[]): IntelligenceOntologyBundle {
  const bundle = createEmptyOntologyBundle();

  for (const item of items) {
    const source = buildSource('osint', item.source, 'rss');
    addUnique(bundle.sources, source);

    const documentId = buildStableId('osint', 'document', item.link || item.title);
    const evidence = buildEvidence('osint', source.id, item.title, item.link);
    addUnique(bundle.evidence, evidence);
    const provenance = createProvenanceFromEvidence([source.id], [evidence.id]);
    const geographyId = addGeographyPoint(bundle, 'osint', item.locationName || item.title, item.lat, item.lon);
    const confidence = createConfidence(item.isAlert ? 0.74 : 0.63, `Imported from feed ${item.source}.`);

    const document: DocumentRecord = {
      id: documentId,
      kind: 'report',
      title: item.title,
      summary: item.title,
      sourceId: source.id,
      url: item.link,
      language: item.lang || 'mixed',
      tags: [item.monitorColor || 'news', item.isAlert ? 'alert' : 'routine'],
      labels: ['osint', 'news-item'],
      time: timeBounds(item.pubDate.toISOString()),
      confidence,
      provenance,
      audit: { revision: 1, createdBy: 'qadr110', tags: [item.source] },
      geographyIds: geographyId ? [geographyId] : undefined,
    };
    addUnique(bundle.documents, document);

    const eventId = buildStableId('osint', 'event', item.link || item.title);
    addUnique(bundle.events, {
      id: eventId,
      kind: item.isAlert ? 'incident' : 'media',
      title: item.title,
      summary: item.title,
      labels: ['feed-event'],
      time: timeBounds(item.pubDate.toISOString()),
      confidence,
      provenance,
      audit: { revision: 1, createdBy: 'qadr110', tags: [item.source] },
      geographyIds: geographyId ? [geographyId] : undefined,
    });

    const claimId = buildStableId('osint', 'claim', item.link || item.title);
    addUnique(bundle.claims, {
      id: claimId,
      statement: item.title,
      status: 'reported',
      subjectIds: [eventId],
      labels: ['headline-claim'],
      time: timeBounds(item.pubDate.toISOString()),
      confidence,
      provenance,
      audit: { revision: 1, createdBy: 'qadr110', tags: [item.source] },
      evidenceWeight: 0.62,
    });

    addUnique(bundle.relationships, {
      id: buildStableId('osint', 'relationship', `${eventId}-${source.id}`),
      kind: 'reported-by',
      sourceId: eventId,
      targetId: source.id,
      labels: ['provenance'],
      time: timeBounds(item.pubDate.toISOString()),
      confidence,
      provenance,
      audit: { revision: 1, createdBy: 'qadr110', tags: ['source-link'] },
      weight: 0.8,
    });

    if (item.isAlert) {
      addUnique(bundle.alerts, {
        id: buildStableId('osint', 'alert', item.link || item.title),
        severity: 'watch',
        headline: item.title,
        description: `Headline alert from ${item.source}`,
        labels: ['osint-alert'],
        time: timeBounds(item.pubDate.toISOString()),
        confidence,
        provenance,
        audit: { revision: 1, createdBy: 'qadr110', tags: [item.source] },
        relatedEventIds: [eventId],
      });
    }
  }

  return bundle;
}

export function normalizeTelegramItems(items: TelegramItem[]): IntelligenceOntologyBundle {
  const bundle = createEmptyOntologyBundle();

  for (const item of items) {
    const source = buildSource('telegram', item.channelTitle || item.channel, 'message', {
      url: item.url,
      publisher: item.channel,
      language: 'mixed',
    });
    addUnique(bundle.sources, source);
    const evidence = buildEvidence('telegram', source.id, item.text, item.url);
    addUnique(bundle.evidence, evidence);
    const provenance = createProvenanceFromEvidence([source.id], [evidence.id]);
    const confidence = createConfidence(item.earlySignal ? 0.58 : 0.52, 'Telegram OSINT is treated as low-confidence until corroborated.');

    addUnique(bundle.documents, {
      id: buildStableId('telegram', 'document', item.id),
      kind: 'post',
      title: item.channelTitle,
      summary: item.text.slice(0, 240),
      sourceId: source.id,
      url: item.url,
      language: 'mixed',
      tags: [...item.tags, item.topic],
      labels: ['telegram', 'osint-post'],
      time: timeBounds(item.ts),
      confidence,
      provenance,
      audit: { revision: 1, createdBy: 'qadr110', tags: [item.channel, item.topic] },
    });
  }

  return bundle;
}

export function normalizeCyberThreats(threats: CyberThreat[]): IntelligenceOntologyBundle {
  const bundle = createEmptyOntologyBundle();

  for (const threat of threats) {
    const source = buildSource('cyber', threat.source, 'api');
    addUnique(bundle.sources, source);
    const evidence = buildEvidence('cyber', source.id, threat.indicator, undefined, threat.malwareFamily);
    addUnique(bundle.evidence, evidence);
    const provenance = createProvenanceFromEvidence([source.id], [evidence.id]);
    const geographyId = addGeographyPoint(bundle, 'cyber', threat.country || threat.indicator, threat.lat, threat.lon, threat.country);
    const confidence = createConfidence(
      threat.severity === 'critical' ? 0.88 : threat.severity === 'high' ? 0.76 : 0.61,
      `Threat imported from ${threat.source}.`,
    );

    const indicatorId = buildStableId('cyber', 'indicator', threat.id || threat.indicator);
    addUnique(bundle.indicators, {
      id: indicatorId,
      indicatorType: threat.indicatorType,
      value: threat.indicator,
      normalizedValue: threat.indicator.toLowerCase(),
      relatedEventIds: [],
      labels: ['cyber', 'ioc'],
      time: timeBounds(threat.lastSeen || threat.firstSeen),
      confidence,
      provenance,
      audit: { revision: 1, createdBy: 'qadr110', tags: threat.tags },
    });

    const eventId = buildStableId('cyber', 'event', threat.id || threat.indicator);
    addUnique(bundle.events, {
      id: eventId,
      kind: 'cyber',
      title: `${threat.type}: ${threat.indicator}`,
      summary: threat.country || threat.malwareFamily || threat.type,
      indicatorIds: [indicatorId],
      geographyIds: geographyId ? [geographyId] : undefined,
      labels: ['cyber-threat'],
      time: timeBounds(threat.lastSeen || threat.firstSeen),
      confidence,
      provenance,
      audit: { revision: 1, createdBy: 'qadr110', tags: threat.tags },
    });

    addUnique(bundle.alerts, {
      id: buildStableId('cyber', 'alert', threat.id || threat.indicator),
      severity: threat.severity === 'critical' ? 'critical' : threat.severity === 'high' ? 'high' : 'elevated',
      headline: threat.indicator,
      description: `${threat.type} detected from ${threat.source}`,
      relatedEventIds: [eventId],
      labels: ['cyber-alert'],
      time: timeBounds(threat.lastSeen || threat.firstSeen),
      confidence,
      provenance,
      audit: { revision: 1, createdBy: 'qadr110', tags: threat.tags },
    });
  }

  return bundle;
}

export function normalizeFlights(flights: MilitaryFlight[]): IntelligenceOntologyBundle {
  const bundle = createEmptyOntologyBundle();

  for (const flight of flights) {
    const source = buildSource('aviation', flight.operatorCountry, 'sensor');
    addUnique(bundle.sources, source);
    const evidence = buildEvidence('aviation', source.id, flight.callsign, flight.registration);
    addUnique(bundle.evidence, evidence);
    const provenance = createProvenanceFromEvidence([source.id], [evidence.id]);
    const geographyId = addGeographyPoint(bundle, 'aviation', flight.callsign, flight.lat, flight.lon);
    const confidence = createConfidence(
      flight.confidence === 'high' ? 0.86 : flight.confidence === 'medium' ? 0.71 : 0.55,
      'Imported from live military flight tracking.',
    );

    const entityId = buildStableId('aviation', 'asset', flight.id || flight.hexCode);
    addUnique(bundle.entities, {
      id: entityId,
      kind: 'asset',
      name: flight.callsign,
      aliases: [flight.hexCode, flight.aircraftModel].filter((value): value is string => Boolean(value)),
      geographyIds: geographyId ? [geographyId] : undefined,
      labels: ['flight', 'tracked-asset'],
      time: timeBounds(flight.lastSeen.toISOString()),
      confidence,
      provenance,
      audit: { revision: 1, createdBy: 'qadr110', tags: [flight.operator, flight.aircraftType] },
      attributes: {
        aircraftType: flight.aircraftType,
        operator: flight.operator,
        speed: flight.speed,
        altitude: flight.altitude,
      },
    });

    addUnique(bundle.events, {
      id: buildStableId('aviation', 'event', flight.id || flight.hexCode),
      kind: 'aviation',
      title: `${flight.callsign} ${flight.aircraftType}`,
      summary: `${flight.operatorCountry} / ${flight.operator}`,
      actorIds: [entityId],
      geographyIds: geographyId ? [geographyId] : undefined,
      labels: ['flight-event'],
      time: timeBounds(flight.lastSeen.toISOString()),
      confidence,
      provenance,
      audit: { revision: 1, createdBy: 'qadr110', tags: [flight.operatorCountry] },
    });
  }

  return bundle;
}

export function normalizeVessels(vessels: MilitaryVessel[]): IntelligenceOntologyBundle {
  const bundle = createEmptyOntologyBundle();

  for (const vessel of vessels) {
    const source = buildSource('maritime', vessel.operatorCountry, 'sensor');
    addUnique(bundle.sources, source);
    const evidence = buildEvidence('maritime', source.id, vessel.name, vessel.destination);
    addUnique(bundle.evidence, evidence);
    const provenance = createProvenanceFromEvidence([source.id], [evidence.id]);
    const geographyId = addGeographyPoint(bundle, 'maritime', vessel.name, vessel.lat, vessel.lon);
    const confidence = createConfidence(
      vessel.confidence === 'high' ? 0.84 : vessel.confidence === 'medium' ? 0.68 : 0.53,
      'Imported from maritime monitoring feed.',
    );

    const entityId = buildStableId('maritime', 'asset', vessel.id || vessel.mmsi);
    addUnique(bundle.entities, {
      id: entityId,
      kind: 'asset',
      name: vessel.name,
      aliases: [vessel.mmsi, vessel.hullNumber].filter((value): value is string => Boolean(value)),
      geographyIds: geographyId ? [geographyId] : undefined,
      labels: ['vessel', 'tracked-asset'],
      time: timeBounds(vessel.lastAisUpdate.toISOString()),
      confidence,
      provenance,
      audit: { revision: 1, createdBy: 'qadr110', tags: [vessel.vesselType, vessel.operatorCountry] },
      attributes: {
        vesselType: vessel.vesselType,
        operator: vessel.operator,
        destination: vessel.destination,
        speed: vessel.speed,
      },
    });

    addUnique(bundle.events, {
      id: buildStableId('maritime', 'event', vessel.id || vessel.mmsi),
      kind: 'maritime',
      title: vessel.name,
      summary: vessel.destination || vessel.operatorCountry,
      actorIds: [entityId],
      geographyIds: geographyId ? [geographyId] : undefined,
      labels: ['maritime-event'],
      time: timeBounds(vessel.lastAisUpdate.toISOString()),
      confidence,
      provenance,
      audit: { revision: 1, createdBy: 'qadr110', tags: [vessel.operatorCountry] },
    });
  }

  return bundle;
}
