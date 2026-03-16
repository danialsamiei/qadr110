import type {
  AlertRecord,
  AnalyticJobRecord,
  CanonicalRecord,
  ClaimRecord,
  EntityRecord,
  EventRecord,
  GeographyRecord,
  IndicatorRecord,
  RelationshipRecord,
  ResilienceDimension,
  ScenarioRecord,
} from './model';
import type { ConfidenceRecord, EvidenceRecord, OntologyReference, ProvenanceRecord, SourceRecord } from './model';
import type { StableIdentifier } from './ids';

export interface LocalizedAlias {
  language: string;
  value: string;
  transliteration?: string;
  primary?: boolean;
}

export type FreshnessBand = 'live' | 'fresh' | 'aging' | 'stale' | 'historical';

export interface FreshnessRecord {
  retrievedAt: string;
  updatedAt?: string;
  observedAt?: string;
  expiresAt?: string;
  lagHours: number;
  band: FreshnessBand;
}

export interface EvidenceReference {
  evidenceId: StableIdentifier;
  sourceId: StableIdentifier;
  claimId?: StableIdentifier;
  excerpt?: string;
  locator?: string;
  weight?: number;
}

export interface GraphEdgeReference {
  relationshipId: StableIdentifier;
  sourceId: StableIdentifier;
  targetId: StableIdentifier;
  evidenceIds: StableIdentifier[];
  kind: RelationshipRecord['kind'];
  weight?: number;
}

export type DocumentKind = 'document' | 'post' | 'feed' | 'report';

export interface DocumentRecord extends CanonicalRecord {
  kind: DocumentKind;
  title: string;
  summary: string;
  sourceId: StableIdentifier;
  url?: string;
  contentType?: string;
  language?: string;
  aliases?: LocalizedAlias[];
  tags?: string[];
  geographyIds?: StableIdentifier[];
  relatedEntityIds?: StableIdentifier[];
  relatedEventIds?: StableIdentifier[];
}

export interface HypothesisRecord extends CanonicalRecord {
  title: string;
  statement: string;
  status: 'open' | 'supported' | 'contested' | 'dismissed';
  confidenceDelta?: number;
  claimIds: StableIdentifier[];
  evidenceRefs: EvidenceReference[];
}

export interface GeospatialObjectRecord extends CanonicalRecord {
  name: string;
  objectType: 'area-of-interest' | 'route' | 'corridor' | 'hotspot' | 'overlay';
  geometryId?: StableIdentifier;
  countryCodes?: string[];
  layerIds?: string[];
  tags?: string[];
}

export interface PlaybookStep {
  id: string;
  title: string;
  description: string;
  phase: 'monitor' | 'assess' | 'coordinate' | 'mitigate' | 'recover';
  evidenceRefs?: EvidenceReference[];
}

export interface PlaybookRecord extends CanonicalRecord {
  title: string;
  objective: string;
  defensiveOnly: true;
  scenarioIds?: StableIdentifier[];
  alertIds?: StableIdentifier[];
  steps: PlaybookStep[];
}

export interface WatchlistRule {
  id: string;
  label: string;
  indicatorType?: string;
  pattern: string;
  severity: AlertRecord['severity'];
}

export interface WatchlistRecord extends CanonicalRecord {
  title: string;
  scope: 'entity' | 'indicator' | 'route' | 'location' | 'narrative';
  ruleCount: number;
  rules: WatchlistRule[];
  matchedRecordIds?: StableIdentifier[];
}

export interface ResilienceMetricRecord extends CanonicalRecord {
  metricId: string;
  title: string;
  category: 'economic' | 'infrastructure' | 'social' | 'cognitive' | 'logistics' | 'governance';
  value: number;
  unit?: string;
  dimensions: ResilienceDimension[];
  riskDimensions?: Array<{ id: string; label: string; score: number; rationale: string }>;
  geographyIds?: StableIdentifier[];
}

export interface IntelligenceOntologyBundle {
  entities: EntityRecord[];
  geographies: GeographyRecord[];
  events: EventRecord[];
  indicators: IndicatorRecord[];
  relationships: RelationshipRecord[];
  claims: ClaimRecord[];
  sources: SourceRecord[];
  evidence: EvidenceRecord[];
  documents: DocumentRecord[];
  hypotheses: HypothesisRecord[];
  scenarios: ScenarioRecord[];
  playbooks: PlaybookRecord[];
  watchlists: WatchlistRecord[];
  alerts: AlertRecord[];
  resilienceMetrics: ResilienceMetricRecord[];
  jobs: AnalyticJobRecord[];
}

function dedupeById<T extends { id: StableIdentifier }>(items: T[]): T[] {
  const seen = new Map<StableIdentifier, T>();
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.set(item.id, item);
    }
  }
  return Array.from(seen.values());
}

export function createFreshnessRecord(
  retrievedAt: string,
  observedAt?: string,
  updatedAt?: string,
  referenceNow = Date.now(),
): FreshnessRecord {
  const anchor = Date.parse(observedAt || updatedAt || retrievedAt);
  const lagHours = Number.isFinite(anchor)
    ? Number(Math.max(0, (referenceNow - anchor) / 3_600_000).toFixed(1))
    : 0;

  let band: FreshnessBand = 'historical';
  if (lagHours <= 2) {
    band = 'live';
  } else if (lagHours <= 24) {
    band = 'fresh';
  } else if (lagHours <= 72) {
    band = 'aging';
  } else if (lagHours <= 24 * 30) {
    band = 'stale';
  }

  return {
    retrievedAt,
    updatedAt,
    observedAt,
    lagHours,
    band,
  };
}

export function createLocalizedAliases(
  primaryValue: string,
  aliases: string[] = [],
  language = 'und',
): LocalizedAlias[] {
  const values = [primaryValue, ...aliases].map((value) => value.trim()).filter(Boolean);
  return values.map((value, index) => ({
    language,
    value,
    primary: index === 0,
  }));
}

export function createEvidenceReference(
  evidenceId: StableIdentifier,
  sourceId: StableIdentifier,
  extras: Omit<EvidenceReference, 'evidenceId' | 'sourceId'> = {},
): EvidenceReference {
  return {
    evidenceId,
    sourceId,
    ...extras,
  };
}

export function appendOntologyRef(
  record: CanonicalRecord,
  reference: OntologyReference,
): CanonicalRecord {
  const refs = record.ontologyRefs ?? [];
  return {
    ...record,
    ontologyRefs: [...refs, reference],
  };
}

export function mergeOntologyBundles(...bundles: IntelligenceOntologyBundle[]): IntelligenceOntologyBundle {
  return {
    entities: dedupeById(bundles.flatMap((bundle) => bundle.entities)),
    geographies: dedupeById(bundles.flatMap((bundle) => bundle.geographies)),
    events: dedupeById(bundles.flatMap((bundle) => bundle.events)),
    indicators: dedupeById(bundles.flatMap((bundle) => bundle.indicators)),
    relationships: dedupeById(bundles.flatMap((bundle) => bundle.relationships)),
    claims: dedupeById(bundles.flatMap((bundle) => bundle.claims)),
    sources: dedupeById(bundles.flatMap((bundle) => bundle.sources)),
    evidence: dedupeById(bundles.flatMap((bundle) => bundle.evidence)),
    documents: dedupeById(bundles.flatMap((bundle) => bundle.documents)),
    hypotheses: dedupeById(bundles.flatMap((bundle) => bundle.hypotheses)),
    scenarios: dedupeById(bundles.flatMap((bundle) => bundle.scenarios)),
    playbooks: dedupeById(bundles.flatMap((bundle) => bundle.playbooks)),
    watchlists: dedupeById(bundles.flatMap((bundle) => bundle.watchlists)),
    alerts: dedupeById(bundles.flatMap((bundle) => bundle.alerts)),
    resilienceMetrics: dedupeById(bundles.flatMap((bundle) => bundle.resilienceMetrics)),
    jobs: dedupeById(bundles.flatMap((bundle) => bundle.jobs)),
  };
}

export function createEmptyOntologyBundle(): IntelligenceOntologyBundle {
  return {
    entities: [],
    geographies: [],
    events: [],
    indicators: [],
    relationships: [],
    claims: [],
    sources: [],
    evidence: [],
    documents: [],
    hypotheses: [],
    scenarios: [],
    playbooks: [],
    watchlists: [],
    alerts: [],
    resilienceMetrics: [],
    jobs: [],
  };
}

export function createProvenanceFromEvidence(
  sourceIds: StableIdentifier[],
  evidenceIds: StableIdentifier[],
  extras: Omit<ProvenanceRecord, 'sourceIds' | 'evidenceIds'> = {},
): ProvenanceRecord {
  return {
    sourceIds,
    evidenceIds,
    ...extras,
  };
}

export function createConfidence(
  score: number,
  rationale: string,
  uncertainty = 1 - score,
): ConfidenceRecord {
  const boundedScore = Math.max(0, Math.min(1, score));
  return {
    band: boundedScore >= 0.85 ? 'very-high' : boundedScore >= 0.7 ? 'high' : boundedScore >= 0.45 ? 'medium' : 'low',
    score: Number(boundedScore.toFixed(2)),
    uncertainty: Number(Math.max(0, Math.min(1, uncertainty)).toFixed(2)),
    rationale,
  };
}
