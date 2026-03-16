import { XMLParser } from 'fast-xml-parser';
import Papa from 'papaparse';

import type { PortableStructuredRecord, StructuredImportRequest } from './contracts';

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function inferKindFromRecord(input: Record<string, unknown>): PortableStructuredRecord['kind'] {
  if (typeof input.statement === 'string') return 'claim';
  if (typeof input.indicator === 'string' || typeof input.value === 'string') return 'indicator';
  if (typeof input.geometry === 'object' || typeof input.latitude === 'number' || typeof input.lat === 'number') return 'geography';
  if (typeof input.summary === 'string' || typeof input.description === 'string') return 'document';
  if (typeof input.title === 'string') return 'event';
  return 'entity';
}

function toPortableRecord(input: Record<string, unknown>): PortableStructuredRecord {
  const kind = typeof input.kind === 'string'
    && ['entity', 'event', 'indicator', 'relationship', 'document', 'geography', 'claim'].includes(input.kind)
    ? input.kind as PortableStructuredRecord['kind']
    : inferKindFromRecord(input);

  const lat = typeof input.lat === 'number'
    ? input.lat
    : typeof input.latitude === 'number'
      ? input.latitude
      : undefined;
  const lon = typeof input.lon === 'number'
    ? input.lon
    : typeof input.longitude === 'number'
      ? input.longitude
      : undefined;

  return {
    kind,
    id: typeof input.id === 'string' ? input.id : undefined,
    title: typeof input.title === 'string' ? input.title : undefined,
    name: typeof input.name === 'string' ? input.name : undefined,
    summary: typeof input.summary === 'string'
      ? input.summary
      : typeof input.description === 'string'
        ? input.description
        : undefined,
    statement: typeof input.statement === 'string' ? input.statement : undefined,
    value: typeof input.value === 'string'
      ? input.value
      : typeof input.indicator === 'string'
        ? input.indicator
        : undefined,
    lat,
    lon,
    countryCode: typeof input.countryCode === 'string'
      ? input.countryCode
      : typeof input.country === 'string'
        ? input.country
        : undefined,
    observedAt: typeof input.observedAt === 'string'
      ? input.observedAt
      : typeof input.timestamp === 'string'
        ? input.timestamp
        : undefined,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : undefined,
    url: typeof input.url === 'string'
      ? input.url
      : typeof input.link === 'string'
        ? input.link
        : undefined,
    aliases: Array.isArray(input.aliases)
      ? input.aliases.filter((item): item is string => typeof item === 'string')
      : [],
    tags: Array.isArray(input.tags)
      ? input.tags.filter((item): item is string => typeof item === 'string')
      : [],
    sourceType: typeof input.sourceType === 'string' ? input.sourceType : undefined,
    attributes: { ...input },
  };
}

function parseJson(content: string): PortableStructuredRecord[] {
  const parsed = JSON.parse(content) as unknown;
  if (Array.isArray(parsed)) {
    return parsed
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map(toPortableRecord);
  }

  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { objects?: unknown[] }).objects)) {
    return ((parsed as { objects: unknown[] }).objects)
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map(toPortableRecord);
  }

  if (parsed && typeof parsed === 'object') {
    return [toPortableRecord(parsed as Record<string, unknown>)];
  }

  return [];
}

function parseCsv(content: string): PortableStructuredRecord[] {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });

  return result.data
    .filter((row) => !!row && typeof row === 'object')
    .map((row) => toPortableRecord(row as unknown as Record<string, unknown>));
}

function parseGeoJson(content: string): PortableStructuredRecord[] {
  const parsed = JSON.parse(content) as {
    type?: string;
    features?: Array<{
      id?: string | number;
      properties?: Record<string, unknown>;
      geometry?: { type?: string; coordinates?: unknown };
    }>;
  };

  if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    return [];
  }

  return parsed.features.map((feature) => {
    const coordinates = Array.isArray(feature.geometry?.coordinates)
      ? feature.geometry.coordinates
      : undefined;
    const point = feature.geometry?.type === 'Point' && Array.isArray(coordinates)
      ? coordinates as [number, number]
      : undefined;
    return toPortableRecord({
      kind: 'geography',
      id: feature.id ? String(feature.id) : undefined,
      title: typeof feature.properties?.name === 'string' ? feature.properties.name : 'GeoJSON feature',
      summary: typeof feature.properties?.description === 'string' ? feature.properties.description : undefined,
      lon: point?.[0],
      lat: point?.[1],
      geometry: feature.geometry,
      ...feature.properties,
    });
  });
}

function collectXmlRows(node: unknown): Record<string, unknown>[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) {
    return node.flatMap((item) => collectXmlRows(item));
  }

  const entries = Object.entries(node as Record<string, unknown>);
  const arrays = entries.filter(([, value]) => Array.isArray(value));
  if (arrays.length > 0) {
    return arrays.flatMap(([, value]) => toArray(value).flatMap((item) => collectXmlRows(item)));
  }

  const scalarEntries = entries.filter(([, value]) => typeof value !== 'object' || value === null);
  if (scalarEntries.length >= 2) {
    return [Object.fromEntries(scalarEntries)];
  }

  return entries.flatMap(([, value]) => collectXmlRows(value));
}

function parseXml(content: string): PortableStructuredRecord[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    parseTagValue: true,
  });
  const parsed = parser.parse(content) as unknown;
  return collectXmlRows(parsed).map(toPortableRecord);
}

function parseStix(content: string): PortableStructuredRecord[] {
  const parsed = JSON.parse(content) as { objects?: unknown[] };
  const objects = Array.isArray(parsed.objects) ? parsed.objects : [];
  return objects
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => {
      const stixType = typeof item.type === 'string' ? item.type : '';
      return toPortableRecord({
        kind: stixType.includes('indicator')
          ? 'indicator'
          : stixType.includes('relationship')
            ? 'relationship'
            : stixType.includes('location')
              ? 'geography'
              : stixType.includes('report')
                ? 'document'
                : stixType.includes('observed-data')
                  ? 'event'
                  : 'entity',
        id: typeof item.id === 'string' ? item.id : undefined,
        title: typeof item.name === 'string' ? item.name : typeof item.title === 'string' ? item.title : stixType,
        summary: typeof item.description === 'string' ? item.description : undefined,
        value: typeof item.pattern === 'string' ? item.pattern : undefined,
        observedAt: typeof item.created === 'string' ? item.created : undefined,
        updatedAt: typeof item.modified === 'string' ? item.modified : undefined,
        attributes: item,
      });
    });
}

function parseMisp(content: string): PortableStructuredRecord[] {
  const parsed = JSON.parse(content) as {
    Event?: {
      info?: string;
      Attribute?: Array<Record<string, unknown>>;
      Object?: Array<Record<string, unknown>>;
    };
  };

  const attributes = parsed.Event?.Attribute ?? [];
  const objects = parsed.Event?.Object ?? [];
  const eventInfo = parsed.Event?.info ?? 'MISP event';

  const attributeRecords = attributes.map((attribute) => toPortableRecord({
    kind: 'indicator',
    id: typeof attribute.uuid === 'string' ? attribute.uuid : undefined,
    title: typeof attribute.category === 'string' ? attribute.category : eventInfo,
    summary: typeof attribute.comment === 'string' ? attribute.comment : eventInfo,
    value: typeof attribute.value === 'string' ? attribute.value : undefined,
    observedAt: typeof attribute.timestamp === 'string' ? attribute.timestamp : undefined,
    attributes: attribute,
  }));

  const objectRecords = objects.map((item) => toPortableRecord({
    kind: 'document',
    id: typeof item.uuid === 'string' ? item.uuid : undefined,
    title: typeof item.name === 'string' ? item.name : eventInfo,
    summary: typeof item.comment === 'string' ? item.comment : eventInfo,
    attributes: item,
  }));

  return [...attributeRecords, ...objectRecords];
}

export function parseStructuredImport(request: StructuredImportRequest): PortableStructuredRecord[] {
  switch (request.format) {
    case 'json':
      return parseJson(request.content);
    case 'csv':
      return parseCsv(request.content);
    case 'geojson':
      return parseGeoJson(request.content);
    case 'xml':
      return parseXml(request.content);
    case 'stix2.1':
      return parseStix(request.content);
    case 'misp':
      return parseMisp(request.content);
    default:
      return [];
  }
}
