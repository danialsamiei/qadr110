import type { IntelligenceOntologyBundle } from '../domain/ontology';
import type { StableIdentifier } from '../domain/ids';

export interface InvestigationNode {
  id: StableIdentifier;
  label: string;
  kind: string;
  confidence: number;
}

export interface InvestigationEdge {
  id: StableIdentifier;
  sourceId: StableIdentifier;
  targetId: StableIdentifier;
  kind: string;
  weight: number;
  evidenceIds: StableIdentifier[];
}

export interface LinkAnalysisResult {
  nodes: InvestigationNode[];
  edges: InvestigationEdge[];
}

export interface EntityResolutionCandidate {
  canonicalId: StableIdentifier;
  duplicateIds: StableIdentifier[];
  sharedAliases: string[];
  confidence: number;
}

export interface SourceCorrelationResult {
  sourceId: StableIdentifier;
  documentCount: number;
  evidenceCount: number;
  relatedEventIds: StableIdentifier[];
}

export interface DuplicateCluster {
  id: string;
  recordIds: StableIdentifier[];
  reason: string;
  similarity: number;
}

export interface TimelineEntry {
  id: StableIdentifier;
  title: string;
  timestamp: string;
  type: 'event' | 'document' | 'alert';
}

export interface GeospatialCorrelation {
  leftId: StableIdentifier;
  rightId: StableIdentifier;
  distanceKm: number;
}

export interface WatchlistMatchResult {
  watchlistId: StableIdentifier;
  matchedRecordIds: StableIdentifier[];
  matchedPatterns: string[];
}

export interface PromptReadyEvidenceBundle {
  summary: string;
  evidenceIds: StableIdentifier[];
  sourceIds: StableIdentifier[];
  eventIds: StableIdentifier[];
}

export interface InvestigationWorkbench {
  bundle: IntelligenceOntologyBundle;
  linkAnalysis: LinkAnalysisResult;
  entityResolution: EntityResolutionCandidate[];
  sourceCorrelation: SourceCorrelationResult[];
  duplicateClusters: DuplicateCluster[];
  timeline: TimelineEntry[];
  geospatialCorrelation: GeospatialCorrelation[];
  watchlistMatches: WatchlistMatchResult[];
  promptEvidence: PromptReadyEvidenceBundle;
}
