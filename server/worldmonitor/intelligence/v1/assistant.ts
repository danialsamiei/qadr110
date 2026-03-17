import { cachedFetchJsonWithMeta } from '../../../_shared/redis';
import {
  parseAssistantResponseJson,
} from '../../../../src/platform/ai/assistant-schema';
import { buildMapContextCacheKey } from '../../../../src/platform/operations/map-context';
import {
  createConfidenceRecord,
  type AssistantContextPacket,
  type AssistantEvidenceCard,
  type AssistantMessage,
  type AssistantRunRequest,
  type AssistantRunResponse,
  type AssistantStructuredOutput,
} from '../../../../src/platform/ai/assistant-contracts';
import { evaluateAssistantSafety } from '../../../../src/platform/ai/assistant-safety';
import { getPolicyForTask } from '../../../../src/platform/ai/policy';
import { createAiExecutionTrace, toAssistantTraceMetadata } from '../../../../src/platform/ai/router';
import {
  ChromaKnowledgeAdapter,
  LexicalKnowledgeAdapter,
  WeaviateKnowledgeAdapter,
  getBuiltinKnowledgeDocuments,
  type KnowledgeRetrievalHit,
} from '../../../../src/platform/retrieval';
import type { ConfidenceRecord, EvidenceRecord, SourceRecord } from '../../../../src/platform/domain/model';
import { sha256Hex } from './_shared';
import { runAssistantOrchestrator } from './orchestrator';

const ASSISTANT_CACHE_TTL_SECONDS = 900;
const MAX_QUERY_LEN = 1200;
const MAX_PROMPT_LEN = 2400;
const MAX_CONTEXT_PACKETS = 12;
const MAX_MEMORY_NOTES = 6;
const MAX_MESSAGE_HISTORY = 6;

function sanitizeText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function sanitizeContextPackets(packets: AssistantContextPacket[]): AssistantContextPacket[] {
  return packets
    .filter((packet) => packet && typeof packet.title === 'string' && typeof packet.content === 'string')
    .slice(0, MAX_CONTEXT_PACKETS)
    .map((packet) => ({
      ...packet,
      title: sanitizeText(packet.title, 180),
      summary: sanitizeText(packet.summary, 280),
      content: sanitizeText(packet.content, 900),
      tags: [...packet.tags].slice(0, 8),
    }));
}

function buildTimeContext(request: AssistantRunRequest): string {
  const now = new Date().toISOString();
  const mapLabel = request.mapContext?.timeRange?.label;
  return mapLabel ? `${now} | window=${mapLabel}` : now;
}

function dedupePackets(packets: AssistantContextPacket[]): AssistantContextPacket[] {
  const seen = new Set<string>();
  const deduped: AssistantContextPacket[] = [];

  for (const packet of packets) {
    const key = `${packet.sourceUrl || ''}|${packet.title}|${packet.summary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(packet);
  }

  return deduped;
}

function resolveStableMapCacheKey(request: AssistantRunRequest): string | undefined {
  if (!request.mapContext) return undefined;
  return request.mapContext.cacheKey || buildMapContextCacheKey(request.mapContext);
}

function toContextPacket(hit: KnowledgeRetrievalHit): AssistantContextPacket {
  return {
    id: hit.id,
    title: hit.title,
    summary: hit.snippet,
    content: hit.content,
    sourceLabel: hit.sourceLabel,
    sourceUrl: hit.sourceUrl,
    sourceType: hit.sourceType,
    updatedAt: hit.updatedAt,
    score: hit.score,
    tags: [...hit.tags],
    provenance: hit.provenance,
  };
}

async function collectServerContextPackets(request: AssistantRunRequest): Promise<AssistantContextPacket[]> {
  const builtin = getBuiltinKnowledgeDocuments();
  const lexicalAdapter = new LexicalKnowledgeAdapter(builtin);
  const weaviateAdapter = new WeaviateKnowledgeAdapter({
    url: process.env.WEAVIATE_URL,
    apiKey: process.env.WEAVIATE_API_KEY,
    className: process.env.WEAVIATE_COLLECTION,
  });
  const chromaAdapter = new ChromaKnowledgeAdapter({
    url: process.env.CHROMA_URL,
    queryUrl: process.env.CHROMA_QUERY_URL,
    collection: process.env.CHROMA_COLLECTION,
    apiKey: process.env.CHROMA_API_KEY,
  });

  const [lexicalHits, weaviateHits, chromaHits] = await Promise.all([
    lexicalAdapter.search({ query: request.query, topK: 4, minScore: 0.2 }),
    weaviateAdapter.search({ query: request.query, topK: 4, minScore: 0.2 }),
    chromaAdapter.search({ query: request.query, topK: 4, minScore: 0.2 }),
  ]);

  return [
    ...lexicalHits,
    ...weaviateHits,
    ...chromaHits,
  ].map(toContextPacket);
}

function packetToSource(packet: AssistantContextPacket): SourceRecord {
  const reliability = createConfidenceRecord(
    Math.max(0.35, Math.min(0.95, packet.score || 0.5)),
    `این منبع از مسیر بازیابی با برچسب ${packet.sourceLabel} جمع‌آوری شده است.`,
  );

  return {
    id: `source:${packet.id}`,
    type: packet.sourceType,
    title: packet.sourceLabel,
    url: packet.sourceUrl,
    publisher: packet.sourceLabel,
    language: /[\u0600-\u06ff]/.test(packet.content) ? 'fa' : 'mixed',
    collectionMethod: 'retrieval',
    retrievedAt: packet.updatedAt,
    reliability,
    legalBasis: 'OSINT / user-provided material',
  };
}

function packetToEvidence(packet: AssistantContextPacket): EvidenceRecord {
  return {
    id: `evidence:${packet.id}`,
    sourceId: `source:${packet.id}`,
    summary: packet.summary,
    excerpt: packet.content.slice(0, 500),
    locator: packet.sourceUrl || packet.title,
    collectedAt: packet.updatedAt,
    mimeType: 'text/plain',
  };
}

function packetToEvidenceCard(packet: AssistantContextPacket, pinned = false): AssistantEvidenceCard {
  const source = packetToSource(packet);
  const evidence = packetToEvidence(packet);
  const freshnessWeight = Math.max(0.45, Math.min(1, packet.score || 0.5));
  const confidence = createConfidenceRecord(
    Math.max(0.35, Math.min(0.95, (packet.score || 0.5) * freshnessWeight)),
    'این امتیاز از نمره بازیابی و وزن‌دهی تازگی منبع محاسبه شده است.',
  );

  return {
    id: packet.id,
    title: packet.title,
    summary: packet.summary,
    timeContext: packet.updatedAt,
    score: Number((packet.score || 0.5).toFixed(3)),
    freshnessWeight: Number(freshnessWeight.toFixed(3)),
    source,
    evidence,
    provenance: packet.provenance,
    confidence,
    tags: [...packet.tags],
    pinned,
  };
}

function buildSection(title: string, bullets: string[], narrative: string, confidence: ConfidenceRecord): AssistantStructuredOutput['observedFacts'] {
  return { title, bullets, narrative, confidence };
}

function buildDeterministicOutput(
  request: AssistantRunRequest,
  evidenceCards: AssistantEvidenceCard[],
): AssistantStructuredOutput {
  const observedBullets = evidenceCards.slice(0, 4).map((card) => `${card.title}: ${card.summary}`);
  const commonConfidence = createConfidenceRecord(0.44, 'Fallback response built from retrieved evidence only.');

  return {
    reportTitle: `جمع‌بندی بازیابی دفاعی: ${request.query.slice(0, 72)}`,
    executiveSummary: evidenceCards.length > 0
      ? `براساس ${evidenceCards.length} مدرک بازیابی‌شده، یک جمع‌بندی بازیابی‌محور ساخته شد چون مدل اصلی پاسخ ساخت‌یافته‌ی معتبر برنگرداند.`
      : 'شواهد کافی برای تحلیل مولد قابل اتکا در دسترس نبود.',
    observedFacts: buildSection('واقعیت‌های مشاهده‌شده', observedBullets, observedBullets.join('\n'), commonConfidence),
    analyticalInference: buildSection(
      'استنباط تحلیلی',
      ['مسیر اصلی AI پاسخ معتبر JSON تولید نکرد.', 'این پاسخ جایگزین فقط برای تداوم تحلیل است.'],
      'برای نتیجه نهایی لازم است مسیر OpenRouter یا خودمیزبان دوباره اجرا شود یا شواهد بیشتری اضافه شود.',
      createConfidenceRecord(0.32, 'در حالت fallback کیفیت استنباط محدود است و باید با اجرای مسیر اصلی تکمیل شود.'),
    ),
    scenarios: [
      {
        title: 'سناریوی پایه',
        probability: 'medium',
        timeframe: 'کوتاه‌مدت',
        description: 'داده‌ها نیازمند تکمیل با مسیر مولد اصلی هستند.',
        indicators: evidenceCards.slice(0, 3).map((card) => card.title),
        confidence: createConfidenceRecord(0.28, 'این سناریو بدون خروجی معتبر و تأییدشده مدل مولد ساخته شده است.'),
      },
    ],
    uncertainties: buildSection(
      'عدم‌قطعیت‌ها',
      ['پاسخ مولد اصلی در دسترس نبود یا JSON معتبر نساخت.', 'بازیابی فعلی ممکن است کل طیف شواهد را پوشش ندهد.'],
      'باید فرضیات مهم با شواهد بیشتر و مدل اصلی بازبینی شوند.',
      createConfidenceRecord(0.26, 'در وضعیت fallback عدم‌قطعیت بالا است و نیاز به بازاجرا وجود دارد.'),
    ),
    recommendations: buildSection(
      'توصیه‌های دفاعی',
      ['یک بار دیگر مسیر اصلی AI را اجرا کن.', 'در صورت نیاز شواهد بیشتری پین یا بارگذاری کن.', 'ادعاهای مهم را با حداقل دو منبع مستقل تطبیق بده.'],
      'تا زمان بازگشت مسیر اصلی، فقط از این پاسخ جایگزین برای تداوم تحلیل استفاده کن.',
      createConfidenceRecord(0.4, 'توصیه‌های دفاعی در حالت fallback به‌صورت محافظه‌کارانه نگه داشته شده‌اند.'),
    ),
    resilienceNarrative: buildSection(
      'روایت تاب‌آوری',
      ['حافظه فضای کار و بازیابی محلی حفظ شده است.'],
      'حتی در اختلال مسیر ابری، کدپایه می‌تواند بازیابی و حافظه تحلیل را نگه دارد.',
      createConfidenceRecord(0.48, 'این روایت تاب‌آوری بر پایه رفتار واقعی پلتفرم در حفظ حافظه و بازیابی محلی ساخته شده است.'),
    ),
    followUpSuggestions: ['اجرای مجدد route اصلی', 'افزودن evidence بیشتر', 'بازبینی assumptions'],
  };
}

function buildRefusalResponse(request: AssistantRunRequest, reason: string, redirect: string): AssistantRunResponse {
  const policy = getPolicyForTask(request.taskClass);
  const now = new Date().toISOString();
  const trace = createAiExecutionTrace(policy);
  const message: AssistantMessage = {
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    createdAt: now,
    content: `${reason}\n${redirect}`,
    domainMode: request.domainMode,
    taskClass: request.taskClass,
    structured: {
      reportTitle: 'درخواست خارج از چارچوب مجاز',
      executiveSummary: reason,
      observedFacts: buildSection('واقعیت‌های مشاهده‌شده', [], 'درخواست کاربر به حوزه خارج از چارچوب دفاعی/قانونی وارد شد.', createConfidenceRecord(0.9, 'Policy refusal.')),
      analyticalInference: buildSection('استنباط تحلیلی', [], 'سیستم بر اساس guardrailهای قانونی/دفاعی از پاسخ‌گویی عملیاتی خودداری کرد.', createConfidenceRecord(0.9, 'Policy refusal.')),
      scenarios: [],
      uncertainties: buildSection('عدم‌قطعیت‌ها', [], 'اگر هدف دفاعی باشد، بازنویسی دقیق‌تر درخواست می‌تواند پاسخ مجاز تولید کند.', createConfidenceRecord(0.72, 'Depends on revised query.')),
      recommendations: buildSection('توصیه‌های دفاعی', [redirect], redirect, createConfidenceRecord(0.88, 'Policy-safe redirect.')),
      resilienceNarrative: buildSection('روایت تاب‌آوری', ['سامانه در چارچوب مجاز باقی ماند.'], 'حفظ محدودیت‌های قانونی بخشی از تاب‌آوری حاکمیتی سامانه است.', createConfidenceRecord(0.82, 'Policy-safe redirect.')),
      followUpSuggestions: ['درخواست را به hardening یا monitoring بازنویسی کن', 'سؤال را روی resilience یا warning متمرکز کن'],
    },
    evidenceCards: [],
    provider: 'policy',
    model: 'policy-guardrail',
    traceId: trace.traceId,
    confidenceBand: 'very-high',
  };

  return {
    conversationId: request.conversationId,
    message,
    status: 'refused',
    provider: 'policy',
    model: 'policy-guardrail',
    cached: false,
    followUpSuggestions: ['درخواست را به دفاع/monitoring بازنویسی کن'],
    evidenceCards: [],
    refusal: { reason, redirect },
    trace: toAssistantTraceMetadata(trace, {
      completedAt: now,
      cached: false,
      timeContext: now,
      warnings: ['Policy refusal triggered.'],
    }),
  };
}

export async function runIntelligenceAssistant(request: AssistantRunRequest): Promise<AssistantRunResponse> {
  const query = sanitizeText(request.query, MAX_QUERY_LEN);
  if (!query) {
    throw new Error('Assistant query is required.');
  }

  const sanitizedRequest: AssistantRunRequest = {
    ...request,
    query,
    promptText: request.promptText ? sanitizeText(request.promptText, MAX_PROMPT_LEN) : '',
    localContextPackets: sanitizeContextPackets(request.localContextPackets ?? []),
    memoryNotes: (request.memoryNotes ?? []).slice(0, MAX_MEMORY_NOTES).map((note) => ({
      ...note,
      title: sanitizeText(note.title, 120),
      content: sanitizeText(note.content, 500),
      tags: [...note.tags].slice(0, 8),
    })),
    messages: (request.messages ?? []).slice(-MAX_MESSAGE_HISTORY).map((message) => ({
      role: message.role,
      content: sanitizeText(message.content, 500),
      createdAt: message.createdAt,
    })),
    pinnedEvidence: (request.pinnedEvidence ?? []).slice(0, 6),
    sessionContext: request.sessionContext,
  };

  const safety = evaluateAssistantSafety(query);
  if (!safety.allowed) {
    return buildRefusalResponse(sanitizedRequest, safety.reason || 'درخواست خارج از چارچوب مجاز بود.', safety.redirect || 'سؤال را به مسیر دفاعی بازنویسی کن.');
  }

  const timeContext = buildTimeContext(sanitizedRequest);
  const serverPackets = await collectServerContextPackets(sanitizedRequest);
  const packets = dedupePackets([
    ...sanitizedRequest.localContextPackets,
    ...serverPackets,
  ]).slice(0, MAX_CONTEXT_PACKETS);

  const evidenceCards = packets.map((packet) => packetToEvidenceCard(
    packet,
    sanitizedRequest.pinnedEvidence.some((pinned) => pinned.id === packet.id),
  ));

  const cacheSeed = JSON.stringify({
    q: sanitizedRequest.query,
    mode: sanitizedRequest.domainMode,
    task: sanitizedRequest.taskClass,
    prompt: sanitizedRequest.promptText,
    map: resolveStableMapCacheKey(sanitizedRequest),
    packetIds: packets.map((packet) => packet.id),
    memory: sanitizedRequest.memoryNotes.map((note) => note.id),
    session: {
      id: sanitizedRequest.sessionContext?.sessionId,
      updatedAt: sanitizedRequest.sessionContext?.lastUpdatedAt,
      intents: sanitizedRequest.sessionContext?.intentHistory?.slice(-3).map((item) => item.query),
      maps: sanitizedRequest.sessionContext?.mapInteractions?.slice(-2).map((item) => item.mapContextId || item.label),
    },
  });
  const cacheKey = `assistant:v1:${(await sha256Hex(cacheSeed)).slice(0, 24)}`;

  const cached = await cachedFetchJsonWithMeta<AssistantRunResponse>(
    cacheKey,
    ASSISTANT_CACHE_TTL_SECONDS,
    async () => {
      const policy = getPolicyForTask(sanitizedRequest.taskClass);
      const orchestrated = await runAssistantOrchestrator({
        request: sanitizedRequest,
        evidenceCards,
        timeContext,
        parse: parseAssistantResponseJson,
        buildFallbackOutput: buildDeterministicOutput,
      });
      const finalPackets = dedupePackets([
        ...packets,
        ...sanitizeContextPackets(orchestrated.additionalContextPackets),
      ]).slice(0, MAX_CONTEXT_PACKETS + 6);
      const finalEvidenceCards = finalPackets.map((packet) => packetToEvidenceCard(
        packet,
        sanitizedRequest.pinnedEvidence.some((pinned) => pinned.id === packet.id),
      ));
      const trace = createAiExecutionTrace(
        policy,
        orchestrated.provider as typeof policy.preferredProviders[number] | undefined,
        orchestrated.model,
      );
      const now = new Date().toISOString();
      const message: AssistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        createdAt: now,
        content: orchestrated.output.executiveSummary,
        domainMode: sanitizedRequest.domainMode,
        taskClass: sanitizedRequest.taskClass,
        structured: orchestrated.output,
        evidenceCards: finalEvidenceCards,
        provider: orchestrated.provider || 'fallback',
        model: orchestrated.model || 'retrieval-fallback',
        traceId: trace.traceId,
        confidenceBand: orchestrated.output.analyticalInference.confidence.band,
      };

      return {
        conversationId: sanitizedRequest.conversationId,
        message,
        status: 'completed',
        provider: orchestrated.provider || 'fallback',
        model: orchestrated.model || 'retrieval-fallback',
        cached: false,
        followUpSuggestions: [...orchestrated.output.followUpSuggestions],
        evidenceCards: finalEvidenceCards,
        trace: {
          ...toAssistantTraceMetadata({
            ...trace,
            selectedProvider: orchestrated.provider as typeof policy.preferredProviders[number] | undefined,
            selectedModel: orchestrated.model,
          }, {
            completedAt: now,
            cached: false,
            timeContext,
            warnings: orchestrated.warnings,
          }),
          orchestratorRoute: orchestrated.routeClass as 'fast-local' | 'reasoning-local' | 'cloud-escalation' | 'structured-json',
          orchestratorNodes: [...orchestrated.nodeTimeline],
          toolPlan: [...orchestrated.toolPlan],
          sessionReuseCount: orchestrated.sessionReuseCount,
        },
      };
    },
  );

  const response = cached.data;
  if (!response) {
    const fallbackOutput = buildDeterministicOutput(sanitizedRequest, evidenceCards);
    const policy = getPolicyForTask(sanitizedRequest.taskClass);
    const trace = createAiExecutionTrace(policy);
    const now = new Date().toISOString();
    return {
      conversationId: sanitizedRequest.conversationId,
      message: {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        createdAt: now,
        content: fallbackOutput.executiveSummary,
        domainMode: sanitizedRequest.domainMode,
        taskClass: sanitizedRequest.taskClass,
        structured: fallbackOutput,
        evidenceCards,
        provider: 'fallback',
        model: 'retrieval-fallback',
        traceId: trace.traceId,
        confidenceBand: fallbackOutput.analyticalInference.confidence.band,
      },
      status: 'completed',
      provider: 'fallback',
      model: 'retrieval-fallback',
      cached: false,
      followUpSuggestions: [...fallbackOutput.followUpSuggestions],
      evidenceCards,
      trace: toAssistantTraceMetadata(trace, {
        completedAt: now,
        cached: false,
        timeContext,
        warnings: ['پاسخ cache برای دستیار تهی بود و خروجی fallback ساخته شد.'],
      }),
    };
  }

  return {
    ...response,
    cached: cached.source === 'cache',
      trace: {
        ...response.trace,
        cached: cached.source === 'cache',
        orchestratorRoute: response.trace.orchestratorRoute,
        orchestratorNodes: response.trace.orchestratorNodes,
        toolPlan: response.trace.toolPlan,
        sessionReuseCount: response.trace.sessionReuseCount,
      },
    };
  }
