import { mlWorker, type VectorSearchResult } from '@/services/ml-worker';

import type {
  KnowledgeDocument,
  KnowledgeRetrievalAdapter,
  KnowledgeRetrievalHit,
  RetrievalSearchRequest,
} from './contracts';
import { chunkKnowledgeDocument } from './knowledge-packs';
import { normalizePersianIntelligenceQuery } from './query-normalization';

const INGEST_STATE_KEY = 'qadr110-browser-knowledge-state';

function loadIngestState(): Record<string, string> {
  try {
    const raw = localStorage.getItem(INGEST_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function saveIngestState(state: Record<string, string>): void {
  localStorage.setItem(INGEST_STATE_KEY, JSON.stringify(state));
}

function computeFreshnessWeight(updatedAt: string): number {
  const updatedMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedMs)) return 0.7;
  const ageDays = Math.max(0, (Date.now() - updatedMs) / (24 * 60 * 60 * 1000));
  return Number(Math.max(0.45, 1 - Math.min(ageDays / 365, 0.55)).toFixed(2));
}

function toHit(result: VectorSearchResult): KnowledgeRetrievalHit {
  const updatedAt = result.updatedAt || new Date(result.pubDate || Date.now()).toISOString();
  const freshnessWeight = computeFreshnessWeight(updatedAt);
  const effectiveScore = Number((result.score * freshnessWeight).toFixed(3));
  return {
    id: result.id || `${result.source}-${result.url || result.text.slice(0, 24)}`,
    documentId: result.id || `${result.source}-${result.url || result.text.slice(0, 24)}`,
    title: result.source,
    content: result.text,
    snippet: result.text.slice(0, 280),
    sourceLabel: result.source,
    sourceUrl: result.url,
    sourceType: 'manual',
    updatedAt,
    score: effectiveScore,
    freshnessWeight,
    tags: [...(result.tags ?? [])],
    backend: 'browser-vector',
    provenance: {
      sourceIds: [result.source],
      evidenceIds: [result.id || result.source],
    },
  };
}

export class BrowserVectorKnowledgeAdapter implements KnowledgeRetrievalAdapter {
  readonly id = 'browser-vector';
  readonly displayName = 'Browser Vector Store';
  readonly kind = 'browser-vector' as const;
  configured = true;

  private async ensureReady(): Promise<boolean> {
    const ready = await mlWorker.init().catch(() => false);
    if (!ready) return false;
    const loaded = await mlWorker.loadModel('embeddings').catch(() => false);
    return loaded;
  }

  async ingest(documents: KnowledgeDocument[]): Promise<number> {
    if (!(await this.ensureReady())) return 0;

    const state = loadIngestState();
    const pending = documents.filter((document) => state[document.id] !== document.updatedAt);
    if (pending.length === 0) return 0;

    const items = pending.flatMap((document) => chunkKnowledgeDocument(document).map((chunk) => ({
      text: `${chunk.title}\n${chunk.content}`,
      pubDate: new Date(chunk.updatedAt).getTime(),
      source: chunk.sourceLabel,
      url: chunk.sourceUrl || `qadr://knowledge/${chunk.documentId}#${chunk.id}`,
      tags: [`doc:${chunk.documentId}`, ...chunk.tags],
    })));

    const stored = await mlWorker.vectorStoreIngest(items);
    pending.forEach((document) => {
      state[document.id] = document.updatedAt;
    });
    saveIngestState(state);
    return stored;
  }

  async search(request: RetrievalSearchRequest): Promise<KnowledgeRetrievalHit[]> {
    if (!(await this.ensureReady())) return [];

    const normalized = normalizePersianIntelligenceQuery(request.query);
    const topK = Math.max(3, request.topK ?? 6);
    const minScore = request.minScore ?? 0.2;
    const results = await mlWorker.vectorStoreSearch(normalized.expandedQueries, topK * 2, minScore);

    return results
      .map(toHit)
      .filter((hit) => !request.tags?.length || request.tags.some((tag) => hit.tags.includes(tag)))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }
}
