import type {
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeRetrievalAdapter,
  KnowledgeRetrievalHit,
  RetrievalSearchRequest,
} from './contracts';
import { chunkKnowledgeDocument } from './knowledge-packs';
import { normalizePersianIntelligenceQuery } from './query-normalization';

function computeFreshnessWeight(updatedAt: string): number {
  const updatedMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedMs)) return 0.7;
  const ageDays = Math.max(0, (Date.now() - updatedMs) / (24 * 60 * 60 * 1000));
  return Number(Math.max(0.45, 1 - Math.min(ageDays / 365, 0.55)).toFixed(2));
}

function lexicalScore(chunk: KnowledgeChunk, terms: string[]): number {
  const haystack = `${chunk.title} ${chunk.content}`.toLowerCase();
  let matches = 0;
  for (const term of terms) {
    if (!term) continue;
    if (haystack.includes(term.toLowerCase())) {
      matches += 1;
    }
  }
  if (matches === 0) return 0;
  const density = Math.min(1, matches / Math.max(terms.length, 1));
  return Number((0.45 + density * 0.45).toFixed(3));
}

function chunkToHit(chunk: KnowledgeChunk, backend: KnowledgeRetrievalHit['backend'], score: number): KnowledgeRetrievalHit {
  const freshnessWeight = computeFreshnessWeight(chunk.updatedAt);
  return {
    id: chunk.id,
    documentId: chunk.documentId,
    title: chunk.title,
    content: chunk.content,
    snippet: chunk.content.slice(0, 320),
    sourceLabel: chunk.sourceLabel,
    sourceUrl: chunk.sourceUrl,
    sourceType: chunk.sourceType,
    updatedAt: chunk.updatedAt,
    score: Number((score * freshnessWeight).toFixed(3)),
    freshnessWeight,
    tags: [...chunk.tags],
    backend,
    provenance: chunk.provenance,
  };
}

export class LexicalKnowledgeAdapter implements KnowledgeRetrievalAdapter {
  readonly id = 'lexical-builtin';
  readonly displayName = 'Built-in Knowledge Pack';
  readonly kind = 'lexical' as const;
  readonly configured = true;

  private readonly chunks: KnowledgeChunk[];

  constructor(documents: KnowledgeDocument[]) {
    this.chunks = documents.flatMap((document) => chunkKnowledgeDocument(document));
  }

  async search(request: RetrievalSearchRequest): Promise<KnowledgeRetrievalHit[]> {
    const normalized = normalizePersianIntelligenceQuery(request.query);
    const terms = normalized.expandedQueries;
    const topK = Math.max(3, request.topK ?? 5);

    return this.chunks
      .map((chunk) => ({ chunk, score: lexicalScore(chunk, terms) }))
      .filter(({ score, chunk }) => score >= (request.minScore ?? 0.2)
        && (!request.tags?.length || request.tags.some((tag) => chunk.tags.includes(tag))))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK)
      .map(({ chunk, score }) => chunkToHit(chunk, 'lexical', score));
  }
}

export interface WeaviateAdapterConfig {
  url?: string;
  apiKey?: string;
  className?: string;
}

export class WeaviateKnowledgeAdapter implements KnowledgeRetrievalAdapter {
  readonly id = 'weaviate';
  readonly displayName = 'Weaviate';
  readonly kind = 'weaviate' as const;
  readonly configured: boolean;

  constructor(private readonly config: WeaviateAdapterConfig) {
    this.configured = Boolean(config.url && config.className);
  }

  async search(request: RetrievalSearchRequest): Promise<KnowledgeRetrievalHit[]> {
    if (!this.configured || !this.config.url || !this.config.className) return [];

    const normalized = normalizePersianIntelligenceQuery(request.query);
    const body = {
      query: `{
        Get {
          ${this.config.className}(
            nearText: { concepts: ${JSON.stringify(normalized.expandedQueries.slice(0, 4))} }
            limit: ${Math.max(3, request.topK ?? 4)}
          ) {
            title
            content
            sourceLabel
            sourceUrl
            sourceType
            updatedAt
            tags
            _additional { certainty id }
          }
        }
      }`,
    };

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.config.apiKey) {
        headers.Authorization = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(new URL('/v1/graphql', this.config.url).toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) return [];

      const payload = await response.json() as {
        data?: { Get?: Record<string, Array<Record<string, unknown>>> };
      };

      const rows = payload.data?.Get?.[this.config.className] ?? [];
      return rows.map((row) => {
        const updatedAt = typeof row.updatedAt === 'string' ? row.updatedAt : new Date().toISOString();
        const certainty = typeof row._additional === 'object' && row._additional && typeof (row._additional as Record<string, unknown>).certainty === 'number'
          ? (row._additional as Record<string, unknown>).certainty as number
          : 0.5;

        return {
          id: typeof row._additional === 'object' && row._additional && typeof (row._additional as Record<string, unknown>).id === 'string'
            ? (row._additional as Record<string, unknown>).id as string
            : `${this.config.className}-${typeof row.title === 'string' ? row.title : 'entry'}`,
          documentId: typeof row.title === 'string' ? row.title : 'weaviate-document',
          title: typeof row.title === 'string' ? row.title : 'Weaviate document',
          content: typeof row.content === 'string' ? row.content : '',
          snippet: typeof row.content === 'string' ? row.content.slice(0, 320) : '',
          sourceLabel: typeof row.sourceLabel === 'string' ? row.sourceLabel : 'Weaviate',
          sourceUrl: typeof row.sourceUrl === 'string' ? row.sourceUrl : undefined,
          sourceType: row.sourceType === 'api' || row.sourceType === 'dataset' ? row.sourceType : 'dataset',
          updatedAt,
          score: Number((certainty * computeFreshnessWeight(updatedAt)).toFixed(3)),
          freshnessWeight: computeFreshnessWeight(updatedAt),
          tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [],
          backend: 'weaviate',
          provenance: {
            sourceIds: [typeof row.title === 'string' ? row.title : 'weaviate'],
            evidenceIds: [typeof row.title === 'string' ? row.title : 'weaviate'],
          },
        } satisfies KnowledgeRetrievalHit;
      });
    } catch {
      return [];
    }
  }
}

export interface ChromaAdapterConfig {
  url?: string;
  queryUrl?: string;
  collection?: string;
  apiKey?: string;
}

export class ChromaKnowledgeAdapter implements KnowledgeRetrievalAdapter {
  readonly id = 'chroma';
  readonly displayName = 'Chroma';
  readonly kind = 'chroma' as const;
  readonly configured: boolean;

  constructor(private readonly config: ChromaAdapterConfig) {
    this.configured = Boolean(config.queryUrl || (config.url && config.collection));
  }

  async search(request: RetrievalSearchRequest): Promise<KnowledgeRetrievalHit[]> {
    if (!this.configured) return [];

    const normalized = normalizePersianIntelligenceQuery(request.query);
    const url = this.config.queryUrl
      || `${this.config.url!.replace(/\/+$/, '')}/api/v1/collections/${encodeURIComponent(this.config.collection!)}/query`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query_texts: normalized.expandedQueries.slice(0, 4),
          n_results: Math.max(3, request.topK ?? 4),
          include: ['documents', 'metadatas', 'distances'],
        }),
      });

      if (!response.ok) return [];

      const payload = await response.json() as {
        ids?: string[][];
        documents?: string[][];
        distances?: number[][];
        metadatas?: Array<Array<Record<string, unknown>>>;
      };

      const ids = payload.ids?.[0] ?? [];
      const docs = payload.documents?.[0] ?? [];
      const distances = payload.distances?.[0] ?? [];
      const metadatas = payload.metadatas?.[0] ?? [];

      return ids.map((id, index) => {
        const metadata = metadatas[index] ?? {};
        const updatedAt = typeof metadata.updatedAt === 'string'
          ? metadata.updatedAt
          : new Date().toISOString();
        const baseScore = 1 - Math.max(0, Math.min(1, Number(distances[index] ?? 0.5)));
        const freshnessWeight = computeFreshnessWeight(updatedAt);

        return {
          id,
          documentId: typeof metadata.documentId === 'string' ? metadata.documentId : id,
          title: typeof metadata.title === 'string' ? metadata.title : 'Chroma document',
          content: docs[index] || '',
          snippet: (docs[index] || '').slice(0, 320),
          sourceLabel: typeof metadata.sourceLabel === 'string' ? metadata.sourceLabel : 'Chroma',
          sourceUrl: typeof metadata.sourceUrl === 'string' ? metadata.sourceUrl : undefined,
          sourceType: metadata.sourceType === 'api' || metadata.sourceType === 'dataset' ? metadata.sourceType : 'dataset',
          updatedAt,
          score: Number((baseScore * freshnessWeight).toFixed(3)),
          freshnessWeight,
          tags: Array.isArray(metadata.tags)
            ? metadata.tags.filter((tag): tag is string => typeof tag === 'string')
            : [],
          backend: 'chroma',
          provenance: {
            sourceIds: [typeof metadata.documentId === 'string' ? metadata.documentId : id],
            evidenceIds: [id],
          },
        } satisfies KnowledgeRetrievalHit;
      });
    } catch {
      return [];
    }
  }
}
