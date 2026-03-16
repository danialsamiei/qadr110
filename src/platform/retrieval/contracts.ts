import type { ProvenanceRecord, SourceKind } from '../domain/model';

export type KnowledgeDocumentKind =
  | 'project-doc'
  | 'user-report'
  | 'osint-summary'
  | 'country-brief'
  | 'resilience-framework'
  | 'glossary'
  | 'analytic-note';

export type RetrievalBackendKind =
  | 'browser-vector'
  | 'lexical'
  | 'weaviate'
  | 'chroma';

export interface KnowledgeDocument {
  id: string;
  kind: KnowledgeDocumentKind;
  title: string;
  summary: string;
  content: string;
  language: 'fa' | 'en' | 'mixed';
  sourceLabel: string;
  sourceUrl?: string;
  sourceType: SourceKind;
  updatedAt: string;
  tags: string[];
  provenance: ProvenanceRecord;
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  title: string;
  content: string;
  sourceLabel: string;
  sourceUrl?: string;
  sourceType: SourceKind;
  updatedAt: string;
  tags: string[];
  tokenEstimate: number;
  sequence: number;
  provenance: ProvenanceRecord;
}

export interface QueryNormalizationResult {
  normalizedQuery: string;
  expandedQueries: string[];
  language: 'fa' | 'en' | 'mixed';
  terminologyMatches: string[];
}

export interface RetrievalSearchRequest {
  query: string;
  topK?: number;
  minScore?: number;
  tags?: string[];
}

export interface KnowledgeRetrievalHit {
  id: string;
  documentId: string;
  title: string;
  content: string;
  snippet: string;
  sourceLabel: string;
  sourceUrl?: string;
  sourceType: SourceKind;
  updatedAt: string;
  score: number;
  freshnessWeight: number;
  tags: string[];
  backend: RetrievalBackendKind;
  provenance: ProvenanceRecord;
}

export interface KnowledgeRetrievalAdapter {
  id: string;
  displayName: string;
  kind: RetrievalBackendKind;
  configured: boolean;
  ingest?(documents: KnowledgeDocument[]): Promise<number>;
  search(request: RetrievalSearchRequest): Promise<KnowledgeRetrievalHit[]>;
}
