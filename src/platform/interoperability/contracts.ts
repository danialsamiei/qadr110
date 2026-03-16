import type { FeatureCollection, Geometry } from 'geojson';

import type { CapabilityAdapterManifest } from '../capabilities/contracts';
import type { IntelligenceOntologyBundle, PlaybookRecord } from '../domain/ontology';
import type { StableIdentifier } from '../domain/ids';
import type { MapContextEnvelope } from '../operations/map-context';
import type { KnowledgeDocument, KnowledgeRetrievalHit, RetrievalSearchRequest } from '../retrieval/contracts';
import type { NewsItem, CyberThreat, MilitaryFlight, MilitaryVessel } from '@/types';
import type { TelegramItem } from '@/services/telegram-intel';

export type InteroperabilityAdapterKind =
  | 'threat-intelligence'
  | 'generic-import'
  | 'osint-snapshot'
  | 'vector-backend'
  | 'geospatial-overlay'
  | 'investigation-dataset'
  | 'simulation-exchange'
  | 'palantir-compatibility';

export type StructuredImportFormat =
  | 'json'
  | 'csv'
  | 'geojson'
  | 'xml'
  | 'stix2.1'
  | 'misp';

export interface InteroperabilityContext {
  enabledFeatures: Set<string>;
  configuredKeys: Set<string>;
  configValues: Partial<Record<string, string>>;
  transport: 'web' | 'tauri' | 'server' | 'worker';
  now: string;
}

export interface AdapterHealth {
  adapterId: string;
  availability: 'configured' | 'available' | 'missing-configuration' | 'disabled';
  missingFlags: string[];
  missingConfig: string[];
  degradationMessage: string;
}

export interface StructuredImportRequest {
  format: StructuredImportFormat;
  content: string;
  sourceLabel: string;
  sourceUrl?: string;
  defaultLanguage?: string;
  tags?: string[];
}

export interface StructuredImportResult {
  adapterId: string;
  bundle: IntelligenceOntologyBundle;
  warnings: string[];
  stats: {
    recordsImported: number;
    sourcesCreated: number;
    evidenceCreated: number;
  };
}

export interface PortableStructuredRecord {
  kind: 'entity' | 'event' | 'indicator' | 'relationship' | 'document' | 'geography' | 'claim';
  id?: string;
  title?: string;
  name?: string;
  summary?: string;
  statement?: string;
  value?: string;
  lat?: number;
  lon?: number;
  countryCode?: string;
  observedAt?: string;
  updatedAt?: string;
  url?: string;
  aliases?: string[];
  tags?: string[];
  sourceType?: string;
  attributes?: Record<string, unknown>;
}

export interface OsintSnapshotPayload {
  newsItems?: NewsItem[];
  telegramItems?: TelegramItem[];
  cyberThreats?: CyberThreat[];
  flights?: MilitaryFlight[];
  vessels?: MilitaryVessel[];
}

export interface InvestigationDatasetEnvelope {
  id: string;
  title: string;
  generatedAt: string;
  bundle: IntelligenceOntologyBundle;
  notes: string[];
}

export interface GeospatialOverlayEnvelope {
  id: string;
  label: string;
  generatedAt: string;
  format: 'geojson';
  sourceIds: StableIdentifier[];
  featureCollection: FeatureCollection<Geometry, Record<string, unknown>>;
}

export interface SimulationExchangeEnvelope {
  id: string;
  generatedAt: string;
  scenarioIds: StableIdentifier[];
  assumptions: string[];
  playbooks: Array<Pick<PlaybookRecord, 'id' | 'title' | 'objective'>>;
  mapContext?: MapContextEnvelope | null;
  metrics: Array<{ id: string; label: string; score: number; rationale: string }>;
  defensiveNotes: string[];
}

export interface PalantirCompatibilityEnvelope {
  id: string;
  generatedAt: string;
  objectTypes: string[];
  objectCount: number;
  relationCount: number;
  resourceIds: string[];
  liveConnectionConfigured: boolean;
  warnings: string[];
}

export interface VectorBackendSearchRequest extends RetrievalSearchRequest {
  backendHint?: 'browser-vector' | 'lexical' | 'weaviate' | 'chroma';
}

export interface VectorBackendSearchResult {
  backend: string;
  hits: KnowledgeRetrievalHit[];
}

export interface InteroperabilityAdapter {
  id: string;
  kind: InteroperabilityAdapterKind;
  displayName: string;
  manifest?: CapabilityAdapterManifest;
  getHealth(context: InteroperabilityContext): AdapterHealth;
  ingestStructured?(request: StructuredImportRequest, context: InteroperabilityContext): Promise<StructuredImportResult>;
  normalizeOsintSnapshot?(payload: OsintSnapshotPayload, context: InteroperabilityContext): Promise<IntelligenceOntologyBundle>;
  searchKnowledge?(request: VectorBackendSearchRequest, context: InteroperabilityContext): Promise<VectorBackendSearchResult>;
  exportInvestigationDataset?(bundle: IntelligenceOntologyBundle, context: InteroperabilityContext): Promise<InvestigationDatasetEnvelope>;
  exportGeospatialOverlay?(bundle: IntelligenceOntologyBundle, context: InteroperabilityContext): Promise<GeospatialOverlayEnvelope>;
  exportSimulationExchange?(
    bundle: IntelligenceOntologyBundle,
    context: InteroperabilityContext,
    mapContext?: MapContextEnvelope | null,
  ): Promise<SimulationExchangeEnvelope>;
  exportKnowledgeDocuments?(bundle: IntelligenceOntologyBundle, context: InteroperabilityContext): Promise<KnowledgeDocument[]>;
  exportPalantirCompatibility?(bundle: IntelligenceOntologyBundle, context: InteroperabilityContext): Promise<PalantirCompatibilityEnvelope>;
}
