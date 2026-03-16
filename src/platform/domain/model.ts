import type { StableIdentifier } from './ids';

export type ConfidenceBand = 'low' | 'medium' | 'high' | 'very-high';
export type SourceKind = 'rss' | 'api' | 'manual' | 'dataset' | 'model' | 'web' | 'sensor' | 'feed' | 'message';
export type ClaimStatus = 'reported' | 'corroborated' | 'contested' | 'retracted' | 'modeled';
export type EntityKind =
  | 'actor'
  | 'person'
  | 'organization'
  | 'country'
  | 'location'
  | 'unit'
  | 'asset'
  | 'platform'
  | 'network'
  | 'group'
  | 'concept';
export type EventKind =
  | 'incident'
  | 'anomaly'
  | 'policy'
  | 'protest'
  | 'conflict'
  | 'cyber'
  | 'aviation'
  | 'maritime'
  | 'infrastructure'
  | 'economic'
  | 'logistics'
  | 'humanitarian'
  | 'environmental'
  | 'media'
  | 'scenario';
export type RelationshipKind =
  | 'located-in'
  | 'controls'
  | 'targets'
  | 'supports'
  | 'opposes'
  | 'owns'
  | 'same-as'
  | 'near'
  | 'mentions'
  | 'references'
  | 'impacts'
  | 'travels-through'
  | 'reported-by'
  | 'corroborates'
  | 'derived-from'
  | 'member-of';
export type AlertSeverity = 'info' | 'watch' | 'elevated' | 'high' | 'critical';
export type AnalyticJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TimeBounds {
  createdAt: string;
  updatedAt: string;
  observedAt?: string;
  validFrom?: string;
  validTo?: string;
}

export interface ConfidenceRecord {
  band: ConfidenceBand;
  score: number;
  uncertainty: number;
  rationale?: string;
}

export interface AuditMetadata {
  revision: number;
  createdBy: string;
  updatedBy?: string;
  traceId?: string;
  jobId?: StableIdentifier;
  checksum?: string;
  tags?: string[];
}

export interface OntologyReference {
  scheme: string;
  term: string;
  label?: string;
  version?: string;
}

export interface SourceRecord {
  id: StableIdentifier;
  type: SourceKind;
  title: string;
  url?: string;
  publisher?: string;
  language?: string;
  license?: string;
  collectionMethod?: string;
  retrievedAt: string;
  reliability: ConfidenceRecord;
  legalBasis?: string;
}

export interface EvidenceRecord {
  id: StableIdentifier;
  sourceId: StableIdentifier;
  summary: string;
  excerpt?: string;
  locator?: string;
  contentHash?: string;
  mimeType?: string;
  collectedAt: string;
}

export interface ProvenanceRecord {
  sourceIds: StableIdentifier[];
  evidenceIds: StableIdentifier[];
  derivedFromIds?: StableIdentifier[];
  chainOfCustody?: string[];
}

export interface CanonicalRecord {
  id: StableIdentifier;
  labels: string[];
  ontologyRefs?: OntologyReference[];
  time: TimeBounds;
  confidence: ConfidenceRecord;
  provenance: ProvenanceRecord;
  audit: AuditMetadata;
}

export interface EntityRecord extends CanonicalRecord {
  kind: EntityKind;
  name: string;
  aliases?: string[];
  externalRefs?: Array<{ system: string; id: string }>;
  geographyIds?: StableIdentifier[];
  attributes?: Record<string, unknown>;
}

export interface GeographyRecord extends CanonicalRecord {
  geometryType: 'point' | 'polygon' | 'country' | 'route' | 'bbox';
  countryCode?: string;
  name: string;
  centroid?: { lat: number; lon: number };
  geometry?: Record<string, unknown>;
}

export interface EventRecord extends CanonicalRecord {
  kind: EventKind;
  title: string;
  summary: string;
  actorIds?: StableIdentifier[];
  geographyIds?: StableIdentifier[];
  indicatorIds?: StableIdentifier[];
  claimIds?: StableIdentifier[];
}

export interface IndicatorRecord extends CanonicalRecord {
  indicatorType: string;
  value: string;
  normalizedValue?: string;
  relatedEntityIds?: StableIdentifier[];
  relatedEventIds?: StableIdentifier[];
}

export interface ClaimRecord extends CanonicalRecord {
  statement: string;
  status: ClaimStatus;
  subjectIds: StableIdentifier[];
  objectIds?: StableIdentifier[];
  evidenceWeight?: number;
}

export interface RelationshipRecord extends CanonicalRecord {
  kind: RelationshipKind;
  sourceId: StableIdentifier;
  targetId: StableIdentifier;
  weight?: number;
}

export interface ScenarioDimension {
  id: string;
  label: string;
  score: number;
  rationale: string;
}

export interface ScenarioRecord extends CanonicalRecord {
  title: string;
  timeframe: string;
  assumptions: string[];
  dimensions: ScenarioDimension[];
  defensivePlaybookRefs?: string[];
}

export interface RiskDimension {
  id: string;
  label: string;
  score: number;
  rationale: string;
}

export interface ResilienceDimension {
  id: string;
  label: string;
  score: number;
  rationale: string;
}

export interface AlertRecord extends CanonicalRecord {
  severity: AlertSeverity;
  headline: string;
  description: string;
  relatedEventIds?: StableIdentifier[];
  relatedScenarioIds?: StableIdentifier[];
}

export interface AnalyticJobRecord extends CanonicalRecord {
  jobType: string;
  status: AnalyticJobStatus;
  inputRefs: StableIdentifier[];
  outputRefs?: StableIdentifier[];
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}
