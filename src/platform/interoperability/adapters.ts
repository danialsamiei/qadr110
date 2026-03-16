import type { Feature, Geometry } from 'geojson';

import { DEFAULT_PLATFORM_ADAPTERS } from '../capabilities/catalog';
import type { CapabilityAdapterManifest } from '../capabilities/contracts';
import { createEmptyOntologyBundle, mergeOntologyBundles, type IntelligenceOntologyBundle } from '../domain/ontology';
import type {
  AdapterHealth,
  GeospatialOverlayEnvelope,
  InteroperabilityAdapter,
  InteroperabilityContext,
  InvestigationDatasetEnvelope,
  OsintSnapshotPayload,
  PalantirCompatibilityEnvelope,
  SimulationExchangeEnvelope,
  StructuredImportRequest,
  StructuredImportResult,
  VectorBackendSearchRequest,
  VectorBackendSearchResult,
} from './contracts';
import { parseStructuredImport } from './importers';
import {
  normalizeCyberThreats,
  normalizeFlights,
  normalizeNewsItems,
  normalizeStructuredRecords,
  normalizeTelegramItems,
  normalizeVessels,
} from './normalizers';
import { ChromaKnowledgeAdapter, LexicalKnowledgeAdapter, WeaviateKnowledgeAdapter } from '../retrieval/adapters';
import { getBuiltinKnowledgeDocuments } from '../retrieval/knowledge-packs';
import type { KnowledgeDocument, KnowledgeDocumentKind } from '../retrieval/contracts';
import { buildPalantirCompatibilityEnvelope } from '../palantir/ontology-mapping';

function getManifest(adapterId: string): CapabilityAdapterManifest | undefined {
  return DEFAULT_PLATFORM_ADAPTERS.find((manifest) => manifest.id === adapterId);
}

function getHealthFromManifest(
  adapterId: string,
  displayName: string,
  context: InteroperabilityContext,
): AdapterHealth {
  const manifest = getManifest(adapterId);
  if (!manifest) {
    return {
      adapterId,
      availability: 'available',
      missingFlags: [],
      missingConfig: [],
      degradationMessage: `${displayName} is available through the platform boundary.`,
    };
  }

  const missingFlags = manifest.runtimeFeatureFlags.filter((flag) => context.enabledFeatures.size > 0 && !context.enabledFeatures.has(flag));
  const missingConfig = manifest.requiredConfigKeys.filter((key) => !context.configuredKeys.has(key));
  const availability = missingFlags.length > 0
    ? 'disabled'
    : missingConfig.length > 0
      ? 'missing-configuration'
      : manifest.requiredConfigKeys.length > 0
        ? 'configured'
        : 'available';

  return {
    adapterId,
    availability,
    missingFlags,
    missingConfig,
    degradationMessage: manifest.degradation.message,
  };
}

async function buildKnowledgeDocuments(bundle: IntelligenceOntologyBundle): Promise<KnowledgeDocument[]> {
  const builtin = getBuiltinKnowledgeDocuments();
  const imported = bundle.documents.map((document) => ({
    id: document.id,
    kind: (document.kind === 'report' ? 'user-report' : 'analytic-note') as KnowledgeDocumentKind,
    title: document.title,
    summary: document.summary,
    content: document.summary,
    language: (document.language === 'fa' || document.language === 'en' ? document.language : 'mixed') as KnowledgeDocument['language'],
    sourceLabel: document.title,
    sourceUrl: document.url,
    sourceType: 'manual' as const,
    updatedAt: document.time.updatedAt,
    tags: [...(document.tags ?? [])],
    provenance: document.provenance,
  }));
  return [...builtin, ...imported];
}

async function exportGeospatialOverlay(bundle: IntelligenceOntologyBundle): Promise<GeospatialOverlayEnvelope> {
  const features: Array<Feature<Geometry, Record<string, unknown>>> = bundle.geographies.map((geography) => {
    const geometry: Geometry = geography.geometryType === 'point' && geography.centroid
      ? {
          type: 'Point',
          coordinates: [geography.centroid.lon, geography.centroid.lat] as [number, number],
        }
      : geography.geometry as unknown as Geometry;

    return {
      type: 'Feature',
      id: geography.id,
      properties: {
        id: geography.id,
        name: geography.name,
        countryCode: geography.countryCode,
        labels: geography.labels,
      },
      geometry: geometry ?? { type: 'Point', coordinates: [0, 0] },
    };
  });

  return {
    id: 'qadr-geo-overlay',
    label: 'QADR110 interoperability overlay',
    generatedAt: new Date().toISOString(),
    format: 'geojson',
    sourceIds: bundle.sources.map((source) => source.id),
    featureCollection: {
      type: 'FeatureCollection',
      features,
    },
  };
}

async function exportSimulationExchange(
  bundle: IntelligenceOntologyBundle,
  mapContext?: SimulationExchangeEnvelope['mapContext'],
): Promise<SimulationExchangeEnvelope> {
  const primaryScenarios = bundle.scenarios.slice(0, 3);
  const playbooks = bundle.playbooks.slice(0, 3).map((playbook) => ({
    id: playbook.id,
    title: playbook.title,
    objective: playbook.objective,
  }));

  return {
    id: 'qadr-simulation-envelope',
    generatedAt: new Date().toISOString(),
    scenarioIds: primaryScenarios.map((scenario) => scenario.id),
    assumptions: primaryScenarios.flatMap((scenario) => scenario.assumptions).slice(0, 8),
    playbooks,
    mapContext,
    metrics: bundle.resilienceMetrics.flatMap((metric) =>
      metric.dimensions.map((dimension) => ({
        id: `${metric.id}:${dimension.id}`,
        label: dimension.label,
        score: dimension.score,
        rationale: dimension.rationale,
      }))
    ).slice(0, 12),
    defensiveNotes: [
      'Exchange envelope is descriptive and defensive-only.',
      'No offensive tasking, target selection, or action guidance is included.',
    ],
  };
}

class GenericImportAdapter implements InteroperabilityAdapter {
  readonly id = 'generic-structured-import';
  readonly kind = 'generic-import' as const;
  readonly displayName = 'Generic Structured Import';

  getHealth(context: InteroperabilityContext): AdapterHealth {
    return getHealthFromManifest(this.id, this.displayName, context);
  }

  async ingestStructured(request: StructuredImportRequest): Promise<StructuredImportResult> {
    const records = parseStructuredImport(request);
    const bundle = normalizeStructuredRecords(records, request.sourceLabel, request.sourceUrl);
    return {
      adapterId: this.id,
      bundle,
      warnings: records.length === 0 ? ['No records were parsed from the payload.'] : [],
      stats: {
        recordsImported: records.length,
        sourcesCreated: bundle.sources.length,
        evidenceCreated: bundle.evidence.length,
      },
    };
  }

  async exportKnowledgeDocuments(bundle: IntelligenceOntologyBundle): Promise<KnowledgeDocument[]> {
    return buildKnowledgeDocuments(bundle);
  }
}

class OsintSnapshotAdapter implements InteroperabilityAdapter {
  readonly id = 'osint-ingestion-hub';
  readonly kind = 'osint-snapshot' as const;
  readonly displayName = 'OSINT Snapshot Adapter';
  readonly manifest = getManifest(this.id);

  getHealth(context: InteroperabilityContext): AdapterHealth {
    return getHealthFromManifest(this.id, this.displayName, context);
  }

  async normalizeOsintSnapshot(payload: OsintSnapshotPayload): Promise<IntelligenceOntologyBundle> {
    const bundles = [createEmptyOntologyBundle()];
    if (payload.newsItems?.length) bundles.push(normalizeNewsItems(payload.newsItems));
    if (payload.telegramItems?.length) bundles.push(normalizeTelegramItems(payload.telegramItems));
    if (payload.cyberThreats?.length) bundles.push(normalizeCyberThreats(payload.cyberThreats));
    if (payload.flights?.length) bundles.push(normalizeFlights(payload.flights));
    if (payload.vessels?.length) bundles.push(normalizeVessels(payload.vessels));
    return mergeOntologyBundles(...bundles);
  }

  async exportInvestigationDataset(bundle: IntelligenceOntologyBundle): Promise<InvestigationDatasetEnvelope> {
    return {
      id: 'qadr-osint-dataset',
      title: 'QADR110 OSINT operating picture',
      generatedAt: new Date().toISOString(),
      bundle,
      notes: ['Built from existing QADR110 feeds, Telegram OSINT, cyber, aviation, and maritime services.'],
    };
  }
}

class ThreatIntelExchangeAdapter implements InteroperabilityAdapter {
  readonly id = 'misp-stix-bridge';
  readonly kind = 'threat-intelligence' as const;
  readonly displayName = 'Threat Intel Exchange';
  readonly manifest = getManifest(this.id);

  getHealth(context: InteroperabilityContext): AdapterHealth {
    return getHealthFromManifest(this.id, this.displayName, context);
  }

  async ingestStructured(request: StructuredImportRequest): Promise<StructuredImportResult> {
    const records = parseStructuredImport(request);
    const bundle = normalizeStructuredRecords(records, request.sourceLabel, request.sourceUrl);
    return {
      adapterId: this.id,
      bundle,
      warnings: request.format === 'misp' || request.format === 'stix2.1'
        ? []
        : ['Threat-intel bridge expects STIX 2.1 or MISP payloads for best results.'],
      stats: {
        recordsImported: records.length,
        sourcesCreated: bundle.sources.length,
        evidenceCreated: bundle.evidence.length,
      },
    };
  }

  async exportInvestigationDataset(bundle: IntelligenceOntologyBundle): Promise<InvestigationDatasetEnvelope> {
    return {
      id: 'qadr-threat-intel-dataset',
      title: 'Threat-intel exchange dataset',
      generatedAt: new Date().toISOString(),
      bundle,
      notes: ['Vendor-neutral bundle compatible with STIX/TAXII or MISP-style downstream mapping.'],
    };
  }
}

class VectorBackendAdapter implements InteroperabilityAdapter {
  readonly id = 'vector-store-bridge';
  readonly kind = 'vector-backend' as const;
  readonly displayName = 'Vector Retrieval Bridge';
  readonly manifest = getManifest(this.id);

  getHealth(context: InteroperabilityContext): AdapterHealth {
    return getHealthFromManifest(this.id, this.displayName, context);
  }

  async searchKnowledge(
    request: VectorBackendSearchRequest,
    context: InteroperabilityContext,
  ): Promise<VectorBackendSearchResult> {
    const documents = getBuiltinKnowledgeDocuments();
    const lexical = new LexicalKnowledgeAdapter(documents);
    const browserModule = await import('../retrieval/browser-vector');
    const browser = new browserModule.BrowserVectorKnowledgeAdapter();
    const weaviate = new WeaviateKnowledgeAdapter({
      url: context.configValues.WEAVIATE_URL,
      apiKey: context.configValues.WEAVIATE_API_KEY,
      className: 'QadrKnowledge',
    });
    const chroma = new ChromaKnowledgeAdapter({
      url: context.configValues.CHROMA_URL,
      queryUrl: context.configValues.CHROMA_URL,
      collection: 'qadr-knowledge',
    });

    const adapterOrder = request.backendHint
      ? [request.backendHint]
      : ['browser-vector', 'weaviate', 'chroma', 'lexical'];

    for (const backend of adapterOrder) {
      if (backend === 'browser-vector') {
        const hits = await browser.search(request);
        if (hits.length > 0) return { backend, hits };
      } else if (backend === 'weaviate' && weaviate.configured) {
        const hits = await weaviate.search(request);
        if (hits.length > 0) return { backend, hits };
      } else if (backend === 'chroma' && chroma.configured) {
        const hits = await chroma.search(request);
        if (hits.length > 0) return { backend, hits };
      } else if (backend === 'lexical') {
        const hits = await lexical.search(request);
        return { backend, hits };
      }
    }

    return { backend: 'lexical', hits: await lexical.search(request) };
  }

  async exportKnowledgeDocuments(bundle: IntelligenceOntologyBundle): Promise<KnowledgeDocument[]> {
    return buildKnowledgeDocuments(bundle);
  }
}

class GeospatialOverlayAdapter implements InteroperabilityAdapter {
  readonly id = 'geospatial-workbench';
  readonly kind = 'geospatial-overlay' as const;
  readonly displayName = 'Geospatial Overlay Adapter';
  readonly manifest = getManifest(this.id);

  getHealth(context: InteroperabilityContext): AdapterHealth {
    return getHealthFromManifest(this.id, this.displayName, context);
  }

  async exportGeospatialOverlay(bundle: IntelligenceOntologyBundle): Promise<GeospatialOverlayEnvelope> {
    return exportGeospatialOverlay(bundle);
  }
}

class InvestigationDatasetAdapter implements InteroperabilityAdapter {
  readonly id = 'investigation-workbench';
  readonly kind = 'investigation-dataset' as const;
  readonly displayName = 'Investigation Dataset Adapter';
  readonly manifest = getManifest(this.id);

  getHealth(context: InteroperabilityContext): AdapterHealth {
    return getHealthFromManifest(this.id, this.displayName, context);
  }

  async exportInvestigationDataset(bundle: IntelligenceOntologyBundle): Promise<InvestigationDatasetEnvelope> {
    return {
      id: 'qadr-investigation-dataset',
      title: 'QADR110 investigation graph',
      generatedAt: new Date().toISOString(),
      bundle,
      notes: ['Portable JSON graph for analyst review or downstream case-management systems.'],
    };
  }
}

class SimulationExchangeAdapter implements InteroperabilityAdapter {
  readonly id = 'simulation-exchange';
  readonly kind = 'simulation-exchange' as const;
  readonly displayName = 'Simulation Exchange Adapter';
  readonly manifest = getManifest(this.id);

  getHealth(context: InteroperabilityContext): AdapterHealth {
    return getHealthFromManifest(this.id, this.displayName, context);
  }

  async exportSimulationExchange(
    bundle: IntelligenceOntologyBundle,
    _context: InteroperabilityContext,
    mapContext?: SimulationExchangeEnvelope['mapContext'],
  ): Promise<SimulationExchangeEnvelope> {
    return exportSimulationExchange(bundle, mapContext);
  }
}

class PalantirCompatibilityAdapter implements InteroperabilityAdapter {
  readonly id = 'palantir-compatibility';
  readonly kind = 'palantir-compatibility' as const;
  readonly displayName = 'Palantir Compatibility Adapter';
  readonly manifest = getManifest(this.id);

  getHealth(context: InteroperabilityContext): AdapterHealth {
    return getHealthFromManifest(this.id, this.displayName, context);
  }

  async exportPalantirCompatibility(
    bundle: IntelligenceOntologyBundle,
    context: InteroperabilityContext,
  ): Promise<PalantirCompatibilityEnvelope> {
    return buildPalantirCompatibilityEnvelope(bundle, {
      foundryConfigured: Boolean(context.configValues.PALANTIR_FOUNDRY_URL && context.configValues.PALANTIR_FOUNDRY_TOKEN),
    });
  }
}

export const DEFAULT_INTEROPERABILITY_ADAPTERS: InteroperabilityAdapter[] = [
  new GenericImportAdapter(),
  new ThreatIntelExchangeAdapter(),
  new OsintSnapshotAdapter(),
  new VectorBackendAdapter(),
  new GeospatialOverlayAdapter(),
  new InvestigationDatasetAdapter(),
  new SimulationExchangeAdapter(),
  new PalantirCompatibilityAdapter(),
];
