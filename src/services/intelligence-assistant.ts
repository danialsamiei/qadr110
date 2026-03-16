import { getRpcBaseUrl } from '@/services/rpc-client';
import { getPolicyForTask } from '@/platform/ai/policy';
import {
  createAiExecutionTrace,
  summarizeProviderRoute,
  toAssistantTraceMetadata,
} from '@/platform/ai/router';
import { isDemoModeEnabled } from '@/platform/operations/demo-mode';
import { recordAiTrace } from '@/platform/operations/observability';
import {
  createConfidenceRecord,
  type AssistantContextPacket,
  type AssistantConversationThread,
  type AssistantEvidenceCard,
  type AssistantMemoryNote,
  type AssistantMessage,
  type AssistantRunRequest,
  type AssistantRunResponse,
  type AssistantStructuredOutput,
} from '@/platform/ai/assistant-contracts';
import { BrowserVectorKnowledgeAdapter } from '@/platform/retrieval/browser-vector';
import {
  getBuiltinKnowledgeDocuments,
  type KnowledgeDocument,
  type KnowledgeRetrievalHit,
} from '@/platform/retrieval';

const ASSISTANT_ENDPOINT = '/api/intelligence/v1/assistant';

function stableHash(input: string): string {
  // Non-cryptographic, stable hash for demo IDs and log grouping.
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function createUserDocumentFromMemory(note: AssistantMemoryNote): KnowledgeDocument {
  return {
    id: `memory:${note.id}`,
    kind: 'analytic-note',
    title: note.title,
    summary: note.content.slice(0, 140),
    content: note.content,
    language: /[\u0600-\u06ff]/.test(note.content) ? 'fa' : 'mixed',
    sourceLabel: 'حافظه فضای کار',
    sourceType: 'manual',
    updatedAt: note.updatedAt,
    tags: [...note.tags],
    provenance: {
      sourceIds: [note.id],
      evidenceIds: [note.id],
    },
  };
}

function retrievalHitToContextPacket(hit: KnowledgeRetrievalHit): AssistantContextPacket {
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

async function prepareLocalContextPackets(
  query: string,
  knowledgeDocuments: KnowledgeDocument[],
): Promise<AssistantContextPacket[]> {
  const adapter = new BrowserVectorKnowledgeAdapter();
  await adapter.ingest(knowledgeDocuments);
  const hits = await adapter.search({ query, topK: 6, minScore: 0.18 });
  return hits.map(retrievalHitToContextPacket);
}

function fallbackSection(title: string, bullets: string[], narrative: string, score: number): AssistantStructuredOutput['observedFacts'] {
  return {
    title,
    bullets,
    narrative,
    confidence: createConfidenceRecord(score, 'این بخش از بازیابی محلی و بدون خروجی معتبر مدل مولد ساخته شده است.'),
  };
}

function buildFallbackOutput(query: string, packets: AssistantContextPacket[]): AssistantStructuredOutput {
  const top = packets.slice(0, 4);
  const observedBullets = top.map((packet) => `${packet.title}: ${packet.summary}`);
  const inferenceBullets = [
    'شواهد محلی بازیابی شد اما مسیر اصلی ابری/خودمیزبان در این لحظه در دسترس نبود.',
    'نتیجه زیر باید به‌عنوان جمع‌بندی بازیابی‌محور خوانده شود، نه تحلیل کامل مولد.',
  ];

  return {
    reportTitle: `جمع‌بندی بازیابی محلی: ${query.slice(0, 60)}`,
    executiveSummary: top.length > 0
      ? `بر پایه ${top.length} قطعه‌ی بازیابی‌شده، مهم‌ترین سیگنال‌ها گردآوری شد اما مدل ابری/خودمیزبان پاسخ قابل استفاده نداد.`
      : 'هیچ کانتکست محلی کافی برای ساخت پاسخ جایگزین یافت نشد.',
    observedFacts: fallbackSection('واقعیت‌های مشاهده‌شده', observedBullets, observedBullets.join('\n'), 0.58),
    analyticalInference: fallbackSection('استنباط تحلیلی', inferenceBullets, inferenceBullets.join('\n'), 0.42),
    scenarios: [
      {
        title: 'سناریوی پایه',
        probability: 'medium',
        timeframe: 'کوتاه‌مدت',
        description: 'برای تکمیل تحلیل به یک مسیر معتبر ابری یا خودمیزبان نیاز است.',
        indicators: top.map((packet) => packet.title).slice(0, 3),
        confidence: createConfidenceRecord(0.36, 'این سناریو فقط از بازیابی محلی استخراج شده و هنوز اعتبارسنجی مولد نشده است.'),
      },
    ],
    uncertainties: fallbackSection('عدم‌قطعیت‌ها', ['پوشش بازیابی محلی محدود است.', 'اعتبارسنجی چندمنبعی تکمیل نشده است.'], 'برای پاسخ نهایی باید مسیر اصلی AI دوباره اجرا شود.', 0.3),
    recommendations: fallbackSection('توصیه‌های دفاعی', ['مسیر اصلی AI را دوباره اجرا کن.', 'در صورت نیاز شواهد بیشتری پین یا بارگذاری کن.'], 'از پاسخ جایگزین فقط برای حفظ تداوم تحلیل استفاده کن.', 0.45),
    resilienceNarrative: fallbackSection('روایت تاب‌آوری', ['حافظه فضای کار و بازیابی محلی هنوز در دسترس است.'], 'در شرایط اختلال مسیر ابری نیز دستیار می‌تواند کانتکست محلی را نگه دارد.', 0.55),
    followUpSuggestions: ['شواهد بیشتری اضافه کن', 'دوباره با route اصلی اجرا کن'],
  };
}

function buildFallbackResponse(
  request: AssistantRunRequest,
  packets: AssistantContextPacket[],
): AssistantRunResponse {
  const policy = getPolicyForTask(request.taskClass);
  const trace = createAiExecutionTrace(policy, 'browser', 'retrieval-template');
  const output = buildFallbackOutput(request.query, packets);
  const message: AssistantMessage = {
    id: `assistant-${Date.now()}`,
    role: 'assistant',
    createdAt: new Date().toISOString(),
    content: output.executiveSummary,
    domainMode: request.domainMode,
    taskClass: request.taskClass,
    structured: output,
    evidenceCards: [],
    provider: 'browser',
    model: 'retrieval-template',
    traceId: trace.traceId,
    confidenceBand: output.analyticalInference.confidence.band,
  };

  return {
    conversationId: request.conversationId,
    message,
    status: 'completed',
    provider: 'browser',
    model: 'retrieval-template',
    cached: false,
    followUpSuggestions: [...output.followUpSuggestions],
    evidenceCards: [],
    trace: toAssistantTraceMetadata(trace, {
      completedAt: new Date().toISOString(),
      cached: false,
      timeContext: new Date().toISOString(),
      warnings: ['مسیر اصلی cloud/self-hosted در دسترس نبود و پاسخ بازیابی محلی بازگردانده شد.'],
    }),
  };
}

function buildDemoResponse(
  request: AssistantRunRequest,
  packets: AssistantContextPacket[],
): AssistantRunResponse {
  const policy = getPolicyForTask(request.taskClass);
  const trace = createAiExecutionTrace(policy, 'browser', 'demo-fixture');
  const now = new Date().toISOString();
  const top = packets.slice(0, 4);

  const mapHint = request.mapContext?.selection
    ? request.mapContext.selection.kind === 'country'
      ? `کشور انتخاب‌شده: ${request.mapContext.selection.countryName} (${request.mapContext.selection.countryCode})`
      : request.mapContext.selection.kind === 'point'
        ? `مختصات انتخاب‌شده: ${request.mapContext.selection.lat.toFixed(4)}, ${request.mapContext.selection.lon.toFixed(4)}`
        : `انتخاب نقشه: ${request.mapContext.selection.kind}`
    : '';

  const observedBullets = [
    'این خروجی در حالت دمو تولید شده و به داده واقعی بیرونی متصل نیست.',
    mapHint ? `کانتکست نقشه: ${mapHint}` : '',
    ...top.map((packet) => `نمونه شاهد: ${packet.title} | ${packet.sourceLabel} | ${packet.updatedAt.slice(0, 10)}`),
  ].filter(Boolean);

  const output: AssistantStructuredOutput = {
    reportTitle: `دمو QADR110: ${request.query.slice(0, 64)}`,
    executiveSummary: top.length > 0
      ? `در حالت دمو، ${top.length} قطعه شاهد نمونه برای grounding استفاده شد و خروجی ساخت‌یافته تولید گردید.`
      : 'در حالت دمو، شاهد محلی کافی یافت نشد؛ خروجی زیر صرفاً یک قالب تصمیم‌یار دفاعی است.',
    observedFacts: {
      title: 'واقعیت‌های مشاهده‌شده (دمو)',
      bullets: observedBullets,
      narrative: observedBullets.join('\n'),
      confidence: createConfidenceRecord(0.55, 'دمو: این بخش بر پایه بسته نمونه و کانتکست محلی ساخته شده است.'),
    },
    analyticalInference: {
      title: 'استنباط تحلیلی (دمو)',
      bullets: [
        'با توجه به محدودیت داده‌های زنده در دمو، هر inference باید مشروط و قابل ابطال باشد.',
        'اگر کانکتورها فعال شوند، این تحلیل باید با داده‌های رسمی/چندمنبعی دوباره اجرا شود.',
      ],
      narrative: 'این بخش برای نمایش ساختار تحلیل دفاعی در سامانه تولید شده است.',
      confidence: createConfidenceRecord(0.44, 'دمو: inference بدون داده زنده، اطمینان محدود دارد.'),
    },
    scenarios: [
      {
        title: 'سناریوی پایه',
        probability: 'medium',
        timeframe: '۷۲ ساعت تا ۱۴ روز',
        description: 'تداوم وضعیت فعلی با نوسان محدود و نیاز به پایش نشانه‌های تشدید.',
        indicators: ['تداوم سیگنال‌ها', 'افزایش هم‌گرایی منابع', 'تغییر در cadence رخدادها'],
        confidence: createConfidenceRecord(0.48, 'دمو: سناریوها نمونه هستند و باید با داده واقعی کالیبره شوند.'),
      },
      {
        title: 'سناریوی خوش‌بینانه',
        probability: 'low',
        timeframe: '۷۲ ساعت تا ۷ روز',
        description: 'کاهش شدت سیگنال‌ها و بازگشت به سطح عادی در صورت نبود triggerهای جدید.',
        indicators: ['کاهش رخدادهای نزدیک', 'کاهش روایت‌های متناقض', 'بهبود پوشش داده'],
        confidence: createConfidenceRecord(0.4, 'دمو: شواهد کافی برای اطمینان بالا وجود ندارد.'),
      },
      {
        title: 'سناریوی بدبینانه',
        probability: 'low',
        timeframe: '۷۲ ساعت تا ۱۴ روز',
        description: 'افزایش spilloverها و زنجیره اثر در صورت تشدید هم‌زمان چند سیگنال.',
        indicators: ['افزایش قطعی/اختلال', 'افزایش فشار لجستیکی', 'افزایش سیگنال‌های هم‌نوع'],
        confidence: createConfidenceRecord(0.36, 'دمو: نیازمند داده‌های زنده و راستی‌آزمایی چندمنبعی است.'),
      },
    ],
    uncertainties: {
      title: 'عدم‌قطعیت‌ها و نقاط کور (دمو)',
      bullets: [
        'کانکتورهای بیرونی ممکن است غیرفعال یا فاقد کلید باشند.',
        'پوشش مکانی/زمانی سیگنال‌ها در دمو محدود است.',
        'تعارض منابع در بسته نمونه ممکن است بازنمایی واقعی نداشته باشد.',
      ],
      narrative: 'در حالت دمو، سامانه عمداً از ارائه قطعیت کاذب خودداری می‌کند.',
      confidence: createConfidenceRecord(0.6, 'دمو: بیان عدم‌قطعیت‌ها محافظه‌کارانه است.'),
    },
    recommendations: {
      title: 'توصیه‌های دفاعی و پایش (دمو)',
      bullets: [
        'لایه‌های مرتبط را فعال و بازه زمانی را کوتاه‌تر/بلندتر کنید تا حساسیت تحلیل تغییر کند.',
        'برای هر claim کلیدی حداقل یک شاهد مستقل دوم اضافه کنید (retrieval یا گزارش دستی).',
        'اگر موضوع حساس است، خروجی را به playbook دفاعی مناسب وصل کنید و cadence پایش را مشخص کنید.',
      ],
      narrative: 'این توصیه‌ها تصمیم‌یار دفاعی هستند و راهنمای اقدام تهاجمی ارائه نمی‌کنند.',
      confidence: createConfidenceRecord(0.58, 'دمو: توصیه‌ها عمومی و قابل‌تطبیق‌اند.'),
    },
    resilienceNarrative: {
      title: 'روایت تاب‌آوری (دمو)',
      bullets: [
        'تاب‌آوری زیرساخت و لجستیک: وابسته به استمرار سرویس‌های حیاتی و گلوگاه‌های مسیر.',
        'تاب‌آوری اجتماعی/اطلاعاتی: حساس به موج روایت و شکاف راستی‌آزمایی.',
      ],
      narrative: 'برای روایت دقیق‌تر، داده‌های ابعادی تاب‌آوری و رخدادهای واقعی باید متصل شوند.',
      confidence: createConfidenceRecord(0.46, 'دمو: روایت تاب‌آوری بدون داده ابعادی، اطمینان محدود دارد.'),
    },
    followUpSuggestions: [
      'شواهد پین‌شده را مرور و برچسب‌گذاری کن',
      'شکاف‌های داده این محدوده را لیست کن',
      'سناریوهای ۷۲ساعته را با triggers دقیق‌تر بازنویسی کن',
      'اثر بر تاب‌آوری اقتصادی/لجستیک را بعدمحور کن',
      'نقشه بازیگران مرتبط و spilloverها را بساز',
    ],
  };

  const evidenceCards: AssistantEvidenceCard[] = top.map((packet, index) => {
    const sourceId = `demo-src-${stableHash(packet.sourceLabel)}`;
    const evidenceId = `demo-evidence-${stableHash(packet.id)}`;
    return {
      id: `demo-card-${stableHash(packet.id)}-${index + 1}`,
      title: packet.title,
      summary: packet.summary,
      timeContext: packet.updatedAt,
      score: Math.max(0.35, Math.min(0.85, packet.score)),
      freshnessWeight: 0.5,
      source: {
        id: sourceId,
        type: packet.sourceType,
        title: packet.sourceLabel,
        publisher: 'QADR110 Demo',
        collectionMethod: 'synthetic-demo-pack',
        retrievedAt: now,
        reliability: createConfidenceRecord(0.5, 'دمو: منبع نمونه است.'),
        legalBasis: 'demo-only',
      },
      evidence: {
        id: evidenceId,
        sourceId,
        summary: packet.summary,
        excerpt: packet.content.slice(0, 240),
        locator: packet.id,
        collectedAt: packet.updatedAt,
        mimeType: 'text/plain',
      },
      provenance: packet.provenance,
      confidence: createConfidenceRecord(0.52, 'دمو: کارت شاهد از بسته نمونه ساخته شده است.'),
      tags: Array.from(new Set(['demo', ...packet.tags])).slice(0, 8),
    };
  });

  const message: AssistantMessage = {
    id: `assistant-demo-${stableHash(`${request.conversationId}:${request.query}:${now}`)}`,
    role: 'assistant',
    createdAt: now,
    content: output.executiveSummary,
    domainMode: request.domainMode,
    taskClass: request.taskClass,
    structured: output,
    evidenceCards,
    provider: 'browser',
    model: 'demo-fixture',
    traceId: trace.traceId,
    confidenceBand: output.analyticalInference.confidence.band,
  };

  return {
    conversationId: request.conversationId,
    message,
    status: 'completed',
    provider: 'browser',
    model: 'demo-fixture',
    cached: true,
    followUpSuggestions: [...output.followUpSuggestions],
    evidenceCards,
    trace: toAssistantTraceMetadata(trace, {
      completedAt: now,
      cached: true,
      timeContext: now,
      warnings: [
        'حالت دمو فعال است: خروجی و شواهد نمونه (synthetic) هستند.',
        'برای استفاده عملی، کانکتورها/کلیدها را فعال و تحلیل را مجدداً اجرا کنید.',
      ],
    }),
  };
}

export async function runPersianAssistant(request: {
  conversationId: string;
  locale?: 'fa-IR';
  domainMode: AssistantRunRequest['domainMode'];
  taskClass: AssistantRunRequest['taskClass'];
  query: string;
  promptId?: string;
  promptText?: string;
  messages: AssistantRunRequest['messages'];
  pinnedEvidence: AssistantEvidenceCard[];
  memoryNotes: AssistantMemoryNote[];
  knowledgeDocuments?: KnowledgeDocument[];
  mapContext?: AssistantRunRequest['mapContext'];
  workflowId?: string;
  signal?: AbortSignal;
}): Promise<AssistantRunResponse> {
  const allKnowledgeDocs = [
    ...getBuiltinKnowledgeDocuments(),
    ...(request.knowledgeDocuments ?? []),
    ...request.memoryNotes.map(createUserDocumentFromMemory),
  ];
  const localContextPackets = await prepareLocalContextPackets(request.query, allKnowledgeDocs);

  const payload: AssistantRunRequest = {
    conversationId: request.conversationId,
    locale: request.locale ?? 'fa-IR',
    domainMode: request.domainMode,
    taskClass: request.taskClass,
    query: request.query,
    promptId: request.promptId,
    promptText: request.promptText,
    messages: request.messages,
    mapContext: request.mapContext ?? null,
    pinnedEvidence: request.pinnedEvidence,
    localContextPackets,
    memoryNotes: request.memoryNotes,
    workflowId: request.workflowId,
  };

  if (isDemoModeEnabled()) {
    const response = buildDemoResponse(payload, localContextPackets);
    recordAiTrace({
      status: response.status,
      provider: response.provider,
      model: response.model,
      traceId: response.trace?.traceId ?? response.message.traceId,
      taskClass: payload.taskClass,
      policyLabel: response.trace?.policyLabel,
      cached: response.cached,
      evidenceCount: response.evidenceCards?.length ?? 0,
      localContextCount: localContextPackets.length,
      warnings: response.trace?.warnings ?? [],
      queryHash: stableHash(payload.query),
      surface: payload.mapContext ? 'map' : 'assistant',
    });
    return response;
  }

  try {
    const response = await fetch(`${getRpcBaseUrl()}${ASSISTANT_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: request.signal,
    });

    if (!response.ok) {
      throw new Error(`Assistant request failed with ${response.status}`);
    }

    const result = await response.json() as AssistantRunResponse;
    recordAiTrace({
      status: result.status,
      provider: result.provider,
      model: result.model,
      traceId: result.trace?.traceId ?? result.message.traceId,
      taskClass: payload.taskClass,
      policyLabel: result.trace?.policyLabel,
      cached: result.cached,
      evidenceCount: result.evidenceCards?.length ?? 0,
      localContextCount: localContextPackets.length,
      warnings: result.trace?.warnings ?? [],
      queryHash: stableHash(payload.query),
      surface: payload.mapContext ? 'map' : 'assistant',
    });
    return result;
  } catch {
    const fallback = buildFallbackResponse(payload, localContextPackets);
    recordAiTrace({
      status: fallback.status,
      provider: fallback.provider,
      model: fallback.model,
      traceId: fallback.trace?.traceId ?? fallback.message.traceId,
      taskClass: payload.taskClass,
      policyLabel: fallback.trace?.policyLabel,
      cached: fallback.cached,
      evidenceCount: fallback.evidenceCards?.length ?? 0,
      localContextCount: localContextPackets.length,
      warnings: fallback.trace?.warnings ?? [],
      queryHash: stableHash(payload.query),
      surface: payload.mapContext ? 'map' : 'assistant',
    });
    return fallback;
  }
}

function renderSectionToMarkdown(section: AssistantStructuredOutput['observedFacts']): string {
  const bullets = section.bullets.map((item) => `- ${item}`).join('\n');
  const confidence = `سطح اطمینان: ${section.confidence.band} (${Math.round(section.confidence.score * 100)}%)`;
  return `## ${section.title}\n${section.narrative}\n\n${bullets}\n\n${confidence}`;
}

export function serializeAssistantMessageToMarkdown(message: AssistantMessage): string {
  const structured = message.structured;
  if (!structured) {
    return message.content;
  }

  const scenarios = structured.scenarios.map((scenario) =>
    `### ${scenario.title}\n- احتمال: ${scenario.probability}\n- بازه زمانی: ${scenario.timeframe}\n- توضیح: ${scenario.description}\n- علائم راهنما: ${scenario.indicators.join(' | ')}`).join('\n\n');
  const evidence = (message.evidenceCards ?? []).length > 0
    ? `## ضمیمه شواهد\n${(message.evidenceCards ?? []).map((card) =>
      `### ${card.title}\n- خلاصه: ${card.summary}\n- منبع: ${card.source.title}\n- زمان: ${card.timeContext}\n- امتیاز: ${Math.round(card.score * 100)}%`).join('\n\n')}`
    : '';

  return [
    `# ${structured.reportTitle}`,
    '',
    structured.executiveSummary,
    '',
    renderSectionToMarkdown(structured.observedFacts),
    '',
    renderSectionToMarkdown(structured.analyticalInference),
    '',
    '## سناریوها',
    scenarios,
    '',
    renderSectionToMarkdown(structured.uncertainties),
    '',
    renderSectionToMarkdown(structured.recommendations),
    '',
    renderSectionToMarkdown(structured.resilienceNarrative),
    '',
    `## پیگیری‌های پیشنهادی\n${structured.followUpSuggestions.map((item) => `- ${item}`).join('\n')}`,
    '',
    evidence,
  ].join('\n');
}

export function serializeAssistantMessageToHtml(thread: AssistantConversationThread, message: AssistantMessage): string {
  const structured = message.structured;
  const evidenceHtml = (message.evidenceCards ?? []).length > 0 ? `
      <section>
        <h2>ضمیمه شواهد</h2>
        ${(message.evidenceCards ?? []).map((card) => `
          <article>
            <h3>${card.title}</h3>
            <p>${card.summary}</p>
            <p><strong>منبع:</strong> ${card.source.title}</p>
            <p><strong>زمان:</strong> ${card.timeContext}</p>
            <p><strong>امتیاز:</strong> ${Math.round(card.score * 100)}%</p>
          </article>
        `).join('')}
      </section>
    ` : '';
  const body = structured
    ? `
      <h1>${structured.reportTitle}</h1>
      <p>${structured.executiveSummary}</p>
      ${[
        structured.observedFacts,
        structured.analyticalInference,
        structured.uncertainties,
        structured.recommendations,
        structured.resilienceNarrative,
      ].map((section) => `
        <section>
          <h2>${section.title}</h2>
          <p>${section.narrative}</p>
          <ul>${section.bullets.map((bullet) => `<li>${bullet}</li>`).join('')}</ul>
          <p><strong>سطح اطمینان:</strong> ${section.confidence.band} (${Math.round(section.confidence.score * 100)}%)</p>
        </section>
      `).join('')}
      <section>
        <h2>سناریوها</h2>
        ${structured.scenarios.map((scenario) => `
          <article>
            <h3>${scenario.title}</h3>
            <p>${scenario.description}</p>
            <p><strong>احتمال:</strong> ${scenario.probability}</p>
            <p><strong>بازه زمانی:</strong> ${scenario.timeframe}</p>
            <ul>${scenario.indicators.map((indicator) => `<li>${indicator}</li>`).join('')}</ul>
          </article>
        `).join('')}
      </section>
      ${evidenceHtml}
    `
    : `<p>${message.content}</p>`;

  return `<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>${thread.title}</title>
    <style>
      body { font-family: Tahoma, sans-serif; margin: 40px; line-height: 1.8; color: #111827; }
      h1, h2, h3 { color: #0f172a; }
      section, article { margin-bottom: 24px; }
      ul { padding-right: 20px; }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

export function exportAssistantThread(
  thread: AssistantConversationThread,
  message: AssistantMessage,
  format: 'json' | 'markdown' | 'html',
): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (format === 'json') {
    downloadTextFile(JSON.stringify({ thread, message }, null, 2), `qadr-assistant-${stamp}.json`, 'application/json');
    return;
  }
  if (format === 'markdown') {
    downloadTextFile(serializeAssistantMessageToMarkdown(message), `qadr-assistant-${stamp}.md`, 'text/markdown');
    return;
  }
  downloadTextFile(serializeAssistantMessageToHtml(thread, message), `qadr-assistant-${stamp}.html`, 'text/html');
}

export function describeAssistantRoute(taskClass: AssistantRunRequest['taskClass']): string {
  return summarizeProviderRoute(getPolicyForTask(taskClass));
}
