import { XMLParser } from 'fast-xml-parser';

import { runBlackSwanEngine } from '../../../../src/ai/black-swan-engine';
import { runMetaScenarioEngine } from '../../../../src/ai/meta-scenario-engine';
import { runScenarioEngine } from '../../../../src/ai/scenario-engine';
import { runStrategicForesight } from '../../../../src/ai/strategic-foresight';
import { runWarRoom } from '../../../../src/ai/war-room';
import {
  buildScenarioSimulationContextPackets,
  runScenarioSimulation,
} from '../../../../src/ai/scenario-simulation';
import { describeMapContextForPrompt } from '../../../../src/platform/operations/map-context';
import {
  createConfidenceRecord,
  type AssistantContextPacket,
} from '../../../../src/platform/ai/assistant-contracts';
import type { SourceRecord } from '../../../../src/platform/domain/model';
import { OrchestratorToolRegistry, type OrchestratorTool } from '../../../../src/services/ai-orchestrator/plugins';
import type {
  OrchestratorToolContext,
  OrchestratorToolResult,
} from '../../../../src/services/ai-orchestrator/types';
import { CHROME_UA } from '../../../_shared/constants';
import { callLlm } from '../../../_shared/llm';
import { searchGdeltDocuments } from './search-gdelt-documents';
import { listFeedDigest } from '../../news/v1/list-feed-digest';

const XML = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
});

function createSource(
  id: string,
  title: string,
  type: SourceRecord['type'],
  options: {
    url?: string;
    publisher?: string;
    retrievedAt?: string;
    score?: number;
    legalBasis?: string;
  } = {},
): SourceRecord {
  return {
    id,
    type,
    title,
    url: options.url,
    publisher: options.publisher,
    retrievedAt: options.retrievedAt || new Date().toISOString(),
    reliability: createConfidenceRecord(options.score ?? 0.58, `این منبع از ابزار orchestrator با نوع ${type} جمع‌آوری شد.`),
    legalBasis: options.legalBasis || 'OSINT / tool-grounded enrichment',
  };
}

function createPacket(
  id: string,
  title: string,
  summary: string,
  content: string,
  source: SourceRecord,
  score: number,
  updatedAt?: string,
  tags: string[] = [],
): AssistantContextPacket {
  return {
    id,
    title,
    summary,
    content,
    sourceLabel: source.publisher || source.title,
    sourceUrl: source.url,
    sourceType: source.type,
    updatedAt: updatedAt || source.retrievedAt,
    score,
    tags,
    provenance: {
      sourceIds: [source.id],
      evidenceIds: [id],
    },
  };
}

function dedupePackets(packets: AssistantContextPacket[]): AssistantContextPacket[] {
  const seen = new Set<string>();
  return packets.filter((packet) => {
    const key = `${packet.sourceUrl || ''}|${packet.title}|${packet.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deriveGeo(request: OrchestratorToolContext['request']): string {
  const selection = request.mapContext?.selection;
  if (!selection) return 'IR';
  if (selection.kind === 'country') return selection.countryCode || 'IR';
  if (selection.kind === 'point') return selection.countryCode || 'IR';
  return 'IR';
}

async function fetchGoogleNewsRss(query: string, maxItems = 6): Promise<AssistantContextPacket[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const response = await fetch(url, {
    headers: { 'User-Agent': CHROME_UA },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return [];
  const xml = await response.text();
  const parsed = XML.parse(xml) as {
    rss?: { channel?: { item?: Array<Record<string, unknown>> | Record<string, unknown> } };
  };
  const items = Array.isArray(parsed.rss?.channel?.item)
    ? parsed.rss?.channel?.item
    : parsed.rss?.channel?.item ? [parsed.rss.channel.item] : [];

  return items.slice(0, maxItems).map((item, index) => {
    const link = String(item.link || '').trim();
    const sourceLabel = typeof item.source === 'string'
      ? item.source
      : typeof (item.source as Record<string, unknown> | undefined)?.['#text'] === 'string'
        ? String((item.source as Record<string, unknown>)['#text'])
        : 'Google News';
    const title = String(item.title || '').trim();
    const retrievedAt = String(item.pubDate || new Date().toUTCString());
    const source = createSource(`google-news:${index + 1}:${title}`, title, 'rss', {
      url: link,
      publisher: sourceLabel,
      retrievedAt: new Date(retrievedAt).toISOString(),
      score: 0.6,
    });
    return createPacket(
      `google-news-packet:${index + 1}:${title}`,
      title,
      `${sourceLabel} | ${retrievedAt}`,
      `${title}\n${link}`,
      source,
      0.6,
      source.retrievedAt,
      ['web-search', 'google-news'],
    );
  });
}

async function fetchGoogleTrendsPackets(geo: string, maxItems = 5): Promise<AssistantContextPacket[]> {
  const response = await fetch(`https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`, {
    headers: { 'User-Agent': CHROME_UA },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return [];
  const xml = await response.text();
  const parsed = XML.parse(xml) as {
    rss?: { channel?: { item?: Array<Record<string, unknown>> | Record<string, unknown> } };
  };
  const items = Array.isArray(parsed.rss?.channel?.item)
    ? parsed.rss?.channel?.item
    : parsed.rss?.channel?.item ? [parsed.rss.channel.item] : [];

  return items.slice(0, maxItems).map((item, index) => {
    const title = String(item.title || '').trim();
    const publishedAt = new Date(String(item.pubDate || new Date().toUTCString())).toISOString();
    const source = createSource(`google-trends:${geo}:${index + 1}`, `Google Trends ${geo}`, 'rss', {
      publisher: 'Google Trends',
      retrievedAt: publishedAt,
      score: 0.56,
    });
    return createPacket(
      `google-trends-packet:${geo}:${index + 1}`,
      title,
      `ترند جست‌وجو در ${geo}`,
      title,
      source,
      0.56,
      publishedAt,
      ['osint', 'trends'],
    );
  });
}

async function fetchFeedDigestPackets(query: string, maxItems = 5): Promise<AssistantContextPacket[]> {
  const digest = await listFeedDigest({} as never, { variant: 'full', lang: 'en' } as never);
  const tokens = query.toLowerCase().split(/\s+/).filter((token) => token.length >= 3).slice(0, 6);
  const items = Object.values(digest.categories || {})
    .flatMap((bucket) => bucket.items || [])
    .filter((item) => {
      const haystack = `${item.title || ''} ${item.source || ''}`.toLowerCase();
      return tokens.length === 0 || tokens.some((token) => haystack.includes(token));
    })
    .slice(0, maxItems);

  return items.map((item, index) => {
    const publishedAt = item.publishedAt ? new Date(item.publishedAt).toISOString() : new Date().toISOString();
    const source = createSource(`feed-digest:${index + 1}:${item.link}`, item.title || item.source || 'Feed digest', 'feed', {
      url: item.link,
      publisher: item.source,
      retrievedAt: publishedAt,
      score: 0.62,
    });
    return createPacket(
      `feed-digest-packet:${index + 1}`,
      item.title || source.title,
      `${item.source || 'Feed'} | ${publishedAt}`,
      `${item.title || source.title}\n${item.link || ''}`,
      source,
      0.62,
      publishedAt,
      ['osint', 'feed-digest'],
    );
  });
}

async function fetchGdeltPackets(query: string, maxItems = 6): Promise<AssistantContextPacket[]> {
  const result = await searchGdeltDocuments({} as never, {
    query,
    maxRecords: maxItems,
    timespan: '72h',
    sort: 'date',
  } as never);
  return (result.articles || []).slice(0, maxItems).map((article, index) => {
    const publishedAt = article.date ? new Date(article.date).toISOString() : new Date().toISOString();
    const source = createSource(`gdelt:${index + 1}:${article.url}`, article.title || 'GDELT article', 'api', {
      url: article.url,
      publisher: article.source || 'GDELT',
      retrievedAt: publishedAt,
      score: 0.68,
    });
    return createPacket(
      `gdelt-packet:${index + 1}`,
      article.title || source.title,
      `${article.source || 'GDELT'} | ${publishedAt}`,
      `${article.title || source.title}\n${article.url || ''}`,
      source,
      0.68,
      publishedAt,
      ['osint', 'gdelt'],
    );
  });
}

class MapContextTool implements OrchestratorTool {
  readonly name = 'map_context' as const;

  async execute(context: OrchestratorToolContext): Promise<OrchestratorToolResult> {
    const startedAt = Date.now();
    if (!context.request.mapContext) {
      return {
        tool: this.name,
        ok: true,
        summary: 'کانتکست نقشه‌ای برای این اجرا ثبت نشده بود.',
        warnings: [],
        sources: [],
        contextPackets: [],
        durationMs: Date.now() - startedAt,
      };
    }

    const summary = describeMapContextForPrompt(context.request.mapContext);
    const source = createSource(`map-context:${context.request.mapContext.id}`, 'Map context snapshot', 'manual', {
      publisher: 'QADR110 map workspace',
      retrievedAt: context.request.mapContext.createdAt,
      score: 0.72,
    });
    const packet = createPacket(
      `map-context-packet:${context.request.mapContext.id}`,
      'کانتکست نقشه',
      summary.slice(0, 280),
      summary,
      source,
      0.72,
      context.request.mapContext.createdAt,
      ['map', 'geo-context'],
    );

    return {
      tool: this.name,
      ok: true,
      summary,
      warnings: [],
      sources: [source],
      contextPackets: [packet],
      durationMs: Date.now() - startedAt,
      data: {
        mapContextSummary: summary,
      },
    };
  }
}

class WebSearchTool implements OrchestratorTool {
  readonly name = 'web_search' as const;

  async execute(context: OrchestratorToolContext): Promise<OrchestratorToolResult> {
    const startedAt = Date.now();
    const packets = dedupePackets(await fetchGoogleNewsRss(context.request.query, 6));
    return {
      tool: this.name,
      ok: packets.length > 0,
      summary: packets.length > 0
        ? packets.slice(0, 4).map((packet) => `${packet.title} | ${packet.sourceLabel}`).join('\n')
        : 'نتیجه معتبری از Google News RSS برای این query پیدا نشد.',
      warnings: packets.length > 0 ? [] : ['Google News RSS برای query فعلی داده کافی برنگرداند.'],
      sources: packets.map((packet) => createSource(
        `source:${packet.id}`,
        packet.title,
        packet.sourceType,
        {
          url: packet.sourceUrl,
          publisher: packet.sourceLabel,
          retrievedAt: packet.updatedAt,
          score: packet.score,
        },
      )),
      contextPackets: packets,
      durationMs: Date.now() - startedAt,
    };
  }
}

class OsintFetchTool implements OrchestratorTool {
  readonly name = 'osint_fetch' as const;

  async execute(context: OrchestratorToolContext): Promise<OrchestratorToolResult> {
    const startedAt = Date.now();
    const geo = deriveGeo(context.request);
    const [gdeltPackets, feedPackets, trendsPackets] = await Promise.all([
      fetchGdeltPackets(context.request.query, 5).catch(() => []),
      fetchFeedDigestPackets(context.request.query, 4).catch(() => []),
      fetchGoogleTrendsPackets(geo, 4).catch(() => []),
    ]);
    const packets = dedupePackets([...gdeltPackets, ...feedPackets, ...trendsPackets]).slice(0, 10);

    return {
      tool: this.name,
      ok: packets.length > 0,
      summary: packets.length > 0
        ? packets.slice(0, 5).map((packet) => `${packet.title} | ${packet.sourceLabel}`).join('\n')
        : 'هیچ سیگنال OSINT قابل اتکایی از GDELT/feed/trends جمع‌آوری نشد.',
      warnings: packets.length > 0 ? [] : ['داده OSINT از ابزارهای configured فعلی محدود یا ناموجود بود.'],
      sources: packets.map((packet) => createSource(
        `source:${packet.id}`,
        packet.title,
        packet.sourceType,
        {
          url: packet.sourceUrl,
          publisher: packet.sourceLabel,
          retrievedAt: packet.updatedAt,
          score: packet.score,
        },
      )),
      contextPackets: packets,
      durationMs: Date.now() - startedAt,
      data: {
        geo,
        sourceFamilies: ['gdelt', 'feed-digest', 'google-trends'],
      },
    };
  }
}

class SummarizeContextTool implements OrchestratorTool {
  readonly name = 'summarize_context' as const;

  async execute(context: OrchestratorToolContext): Promise<OrchestratorToolResult> {
    const startedAt = Date.now();
    const priorResults = context.toolResults.filter((result) => result.ok);
    const summary = priorResults.length > 0
      ? priorResults.map((result) => `[${result.tool}] ${result.summary}`).join('\n\n')
      : 'ابزار پیشینی برای خلاصه‌سازی context داده‌ای برنگرداند.';

    return {
      tool: this.name,
      ok: true,
      summary,
      warnings: [],
      sources: [],
      contextPackets: [],
      durationMs: Date.now() - startedAt,
      data: {
        contextSummary: summary,
      },
    };
  }
}

class PromptOptimizerTool implements OrchestratorTool {
  readonly name = 'prompt_optimizer' as const;

  async execute(context: OrchestratorToolContext): Promise<OrchestratorToolResult> {
    const startedAt = Date.now();
    const sessionLines = context.sessionContext.reusableInsights
      .slice(-3)
      .map((item) => `- ${item.summary}`);
    const toolSummary = context.toolResults
      .filter((result) => result.ok)
      .map((result) => `[${result.tool}] ${result.summary}`)
      .join('\n');

    const optimizedPrompt = [
      context.request.query,
      context.request.mapContext ? `کانتکست ژئویی:\n${describeMapContextForPrompt(context.request.mapContext)}` : '',
      sessionLines.length > 0 ? `یافته‌های قابل reuse:\n${sessionLines.join('\n')}` : '',
      toolSummary ? `grounding ابزارها:\n${toolSummary}` : '',
      'پاسخ را فقط به فارسی و با تفکیک واقعیت، استنباط، سناریو، عدم‌قطعیت و توصیه دفاعی تولید کن.',
    ].filter(Boolean).join('\n\n');

    return {
      tool: this.name,
      ok: true,
      summary: 'prompt با session memory، map context و tool grounding بازنویسی شد.',
      warnings: [],
      sources: [],
      contextPackets: [],
      durationMs: Date.now() - startedAt,
      data: {
        optimizedPrompt,
      },
    };
  }
}

class ScenarioEngineTool implements OrchestratorTool {
  readonly name = 'scenario_engine' as const;

  async execute(context: OrchestratorToolContext): Promise<OrchestratorToolResult> {
    const startedAt = Date.now();
    const engine = runScenarioEngine({
      trigger: context.request.query,
      query: context.request.query,
      mapContext: context.request.mapContext ?? null,
      localContextPackets: [
        ...context.request.localContextPackets,
        ...context.toolResults.flatMap((result) => result.contextPackets ?? []),
      ],
      sessionContext: context.sessionContext,
      timeContext: context.timeContext,
    });

    const source = createSource(`scenario-engine:${engine.normalizedTrigger}`, `Scenario engine | ${engine.anchorLabel}`, 'model', {
      publisher: 'QADR110 Scenario Engine',
      retrievedAt: new Date().toISOString(),
      score: 0.66,
      legalBasis: 'Deterministic scenario modeling / defensive decision-support',
    });

    return {
      tool: this.name,
      ok: engine.scenarios.length > 0,
      summary: engine.scenarios
        .slice(0, 4)
        .map((scenario) => `${scenario.title} | احتمال ${scenario.probability} | اثر ${scenario.impact_level}`)
        .join('\n'),
      warnings: engine.dataRichness < 0.35
        ? ['موتور سناریو با داده محدود اجرا شد؛ rankingها باید محافظه‌کارانه تفسیر شوند.']
        : [],
      sources: [source],
      contextPackets: engine.contextPackets,
      durationMs: Date.now() - startedAt,
      data: {
        structuredOutput: engine.structuredOutput,
        engineOutput: engine,
        scenarios: engine.scenarios,
        sourceSummary: engine.sourceSummary,
      },
    };
  }
}

class MetaScenarioEngineTool implements OrchestratorTool {
  readonly name = 'meta_scenario_engine' as const;

  async execute(context: OrchestratorToolContext): Promise<OrchestratorToolResult> {
    const startedAt = Date.now();
    const groundedPackets = [
      ...context.request.localContextPackets,
      ...context.toolResults.flatMap((result) => result.contextPackets ?? []),
    ];
    const priorEngine = context.toolResults.find((result) => result.tool === 'scenario_engine' && result.ok)?.data?.engineOutput;
    const meta = runMetaScenarioEngine({
      trigger: context.request.query,
      query: context.request.query,
      mapContext: context.request.mapContext ?? null,
      localContextPackets: groundedPackets,
      sessionContext: context.sessionContext,
      timeContext: context.timeContext,
      baseScenarioOutput: priorEngine && typeof priorEngine === 'object' ? priorEngine as ReturnType<typeof runScenarioEngine> : null,
    });
    const source = createSource(`meta-scenario:${meta.anchorLabel}:${Date.now()}`, `Meta scenario | ${meta.anchorLabel}`, 'model', {
      publisher: 'QADR110 Meta Scenario Engine',
      retrievedAt: new Date().toISOString(),
      score: 0.7,
      legalBasis: 'Second-order scenario reasoning / defensive decision-support',
    });

    return {
      tool: this.name,
      ok: meta.meta_scenarios.length > 0 || meta.black_swan_candidates.length > 0,
      summary: meta.meta_scenarios.length > 0
        ? meta.meta_scenarios.slice(0, 3).map((item) => `${item.title} | ${item.relationship_type} | احتمال ${item.combined_probability}`).join('\n')
        : meta.black_swan_candidates.length > 0
          ? meta.black_swan_candidates.slice(0, 2).map((item) => `${item.title} | اثر ${item.impact_level}`).join('\n')
          : 'interaction متا-سناریویی قوی برای این مجموعه سناریو پیدا نشد.',
      warnings: meta.black_swan_candidates.length > 0
        ? ['Black Swan candidate شناسایی شد؛ فرض‌های پایه tree فعلی باید دوباره بازبینی شوند.']
        : [],
      sources: [source],
      contextPackets: meta.contextPackets,
      durationMs: Date.now() - startedAt,
      data: {
        structuredOutput: meta.structuredOutput,
        metaOutput: meta,
        metaScenarios: meta.meta_scenarios,
        scenarioConflicts: meta.scenario_conflicts,
        blackSwans: meta.black_swan_candidates,
        scoring: meta.scoring,
      },
    };
  }
}

class DetectBlackSwansTool implements OrchestratorTool {
  readonly name = 'detect_black_swans' as const;

  async execute(context: OrchestratorToolContext): Promise<OrchestratorToolResult> {
    const startedAt = Date.now();
    const groundedPackets = [
      ...context.request.localContextPackets,
      ...context.toolResults.flatMap((result) => result.contextPackets ?? []),
    ];
    const priorEngine = context.toolResults.find((result) => result.tool === 'scenario_engine' && result.ok)?.data?.engineOutput;
    const output = runBlackSwanEngine({
      trigger: context.request.query,
      query: context.request.query,
      mapContext: context.request.mapContext ?? null,
      localContextPackets: groundedPackets,
      sessionContext: context.sessionContext,
      timeContext: context.timeContext,
      baseScenarioOutput: priorEngine && typeof priorEngine === 'object' ? priorEngine as ReturnType<typeof runScenarioEngine> : null,
    });
    const source = createSource(`black-swan:${output.anchorLabel}:${Date.now()}`, `Black Swan | ${output.anchorLabel}`, 'model', {
      publisher: 'QADR110 Black Swan Engine',
      retrievedAt: new Date().toISOString(),
      score: 0.68,
      legalBasis: 'Weak-signal / assumption-stress reasoning / defensive decision-support',
    });

    return {
      tool: this.name,
      ok: output.candidates.length > 0,
      summary: output.candidates.length > 0
        ? output.candidates.slice(0, 3).map((item) => `${item.title} | شدت ${Math.round((item.severity_score ?? 0.5) * 100)}% | اثر ${item.impact_level}`).join('\n')
        : 'Black Swan candidate معناداری برای این context شناسایی نشد.',
      warnings: output.candidates.some((item) => (item.monitoring_status ?? 'watch') !== 'watch')
        ? ['شاخص‌های قوی سیاه در وضعیت rising/critical دیده شدند؛ watchlist باید با cadence کوتاه‌تر پایش شود.']
        : [],
      sources: [source],
      contextPackets: output.contextPackets,
      durationMs: Date.now() - startedAt,
      data: {
        structuredOutput: output.structuredOutput,
        blackSwanOutput: output,
        blackSwans: output.candidates,
        watchlist: output.watchlist,
        scoring: output.scoring,
      },
    };
  }
}

class ScenarioSimulationTool implements OrchestratorTool {
  readonly name = 'scenario_simulation' as const;

  async execute(context: OrchestratorToolContext): Promise<OrchestratorToolResult> {
    const startedAt = Date.now();
    const query = context.request.query.toLowerCase();
    const mode = query.includes('deep')
      || query.includes('multi-step')
      || query.includes('چندمرحله')
      || query.includes('عمیق')
      ? 'deep'
      : 'fast';
    const groundedPackets = [
      ...context.request.localContextPackets,
      ...context.toolResults.flatMap((result) => result.contextPackets ?? []),
    ];
    const availableTools = context.plan.toolPlan.map((item) => item.name);
    const simulation = runScenarioSimulation({
      hypotheticalEvent: context.request.query,
      trigger: context.request.query,
      query: context.request.query,
      mapContext: context.request.mapContext ?? null,
      localContextPackets: groundedPackets,
      sessionContext: context.sessionContext,
      timeContext: context.timeContext,
      mode,
      availableTools,
      toolContextSummary: context.toolResults.map((result) => `[${result.tool}] ${result.summary}`),
    });
    const packets = buildScenarioSimulationContextPackets(simulation);
    const source = createSource(`scenario-simulation:${simulation.baseState.normalizedTrigger}`, `Scenario simulation | ${simulation.anchorLabel}`, 'model', {
      publisher: 'QADR110 Scenario Simulation',
      retrievedAt: new Date().toISOString(),
      score: 0.68,
      legalBasis: 'Interactive what-if simulation / defensive decision-support',
    });

    return {
      tool: this.name,
      ok: simulation.branches.length > 0,
      summary: simulation.branches
        .slice(0, 4)
        .map((branch) => `${branch.title} | احتمال ${Math.round(branch.probability_score * 100)}% | اثر ${branch.impact_level}`)
        .join('\n'),
      warnings: simulation.baseState.dataRichness < 0.35
        ? ['شبیه‌ساز با داده محدود اجرا شد؛ درخت تصمیم باید به‌صورت محافظه‌کارانه تفسیر شود.']
        : [],
      sources: [source],
      contextPackets: packets,
      durationMs: Date.now() - startedAt,
      data: {
        structuredOutput: simulation.structuredOutput,
        branches: simulation.branches,
        graph: simulation.graph,
      },
    };
  }
}

class StrategicForesightTool implements OrchestratorTool {
  readonly name = 'strategic_foresight' as const;

  async execute(context: OrchestratorToolContext): Promise<OrchestratorToolResult> {
    const startedAt = Date.now();
    const groundedPackets = [
      ...context.request.localContextPackets,
      ...context.toolResults.flatMap((result) => result.contextPackets ?? []),
    ];
    const priorScenario = context.toolResults.find((result) => result.tool === 'scenario_engine' && result.ok)?.data?.engineOutput;
    const priorMeta = context.toolResults.find((result) => result.tool === 'meta_scenario_engine' && result.ok)?.data?.metaOutput;
    const priorBlackSwan = context.toolResults.find((result) => result.tool === 'detect_black_swans' && result.ok)?.data?.blackSwanOutput;
    const priorWarRoom = context.toolResults.find((result) => (result.tool === 'run_war_room' || result.tool === 'war_room_on_scenarios') && result.ok)?.data?.warRoomOutput;
    const output = runStrategicForesight({
      question: context.request.query,
      trigger: context.request.query,
      query: context.request.query,
      mapContext: context.request.mapContext ?? null,
      localContextPackets: groundedPackets,
      sessionContext: context.sessionContext,
      timeContext: context.timeContext,
      baseScenarioOutput: priorScenario && typeof priorScenario === 'object' ? priorScenario as ReturnType<typeof runScenarioEngine> : null,
      metaScenarioOutput: priorMeta && typeof priorMeta === 'object' ? priorMeta as ReturnType<typeof runMetaScenarioEngine> : null,
      blackSwanOutput: priorBlackSwan && typeof priorBlackSwan === 'object' ? priorBlackSwan as ReturnType<typeof runBlackSwanEngine> : null,
      warRoomOutput: priorWarRoom && typeof priorWarRoom === 'object' ? priorWarRoom as ReturnType<typeof runWarRoom> : null,
    });
    const source = createSource(`strategic-foresight:${output.anchorLabel}:${Date.now()}`, `Strategic foresight | ${output.anchorLabel}`, 'model', {
      publisher: 'QADR110 Strategic Foresight Mode',
      retrievedAt: new Date().toISOString(),
      score: 0.73,
      legalBasis: 'Integrated strategic foresight / defensive decision-support',
    });

    return {
      tool: this.name,
      ok: output.dominantScenarios.length > 0,
      summary: [
        output.executiveSummary,
        output.dominantScenarios[0] ? `سناریوی غالب: ${output.dominantScenarios[0].title}` : '',
        output.competingFutures[0] ? `future رقیب: ${output.competingFutures[0].title}` : '',
        output.blackSwanCandidates[0] ? `قوی‌سیاه: ${output.blackSwanCandidates[0].title}` : '',
      ].filter(Boolean).join('\n'),
      warnings: output.blackSwanCandidates.length > 0
        ? ['Strategic Foresight Mode candidateهای کم‌احتمال/پراثر را برجسته کرد؛ watchpointهای جدید را در cadence کوتاه‌تر پایش کن.']
        : [],
      sources: [source],
      contextPackets: output.contextPackets,
      durationMs: Date.now() - startedAt,
      data: {
        structuredOutput: output.structuredOutput,
        foresightOutput: output,
        boardSummary: output.boardSummary,
        watchIndicators: output.watchIndicators,
        executiveSummary: output.executiveSummary,
      },
    };
  }
}

class WarRoomTool implements OrchestratorTool {
  constructor(
    readonly name: 'run_war_room' | 'war_room_on_scenarios' = 'run_war_room',
  ) {}

  async execute(context: OrchestratorToolContext): Promise<OrchestratorToolResult> {
    const startedAt = Date.now();
    const groundedPackets = [
      ...context.request.localContextPackets,
      ...context.toolResults.flatMap((result) => result.contextPackets ?? []),
    ];
    const priorScenario = context.toolResults.find((result) => result.tool === 'scenario_engine' && result.ok)?.data?.engineOutput;
    const priorMeta = context.toolResults.find((result) => result.tool === 'meta_scenario_engine' && result.ok)?.data?.metaOutput;
    const warRoom = runWarRoom({
      question: context.request.query,
      trigger: context.request.query,
      query: context.request.query,
      mapContext: context.request.mapContext ?? null,
      localContextPackets: groundedPackets,
      sessionContext: context.sessionContext,
      timeContext: context.timeContext,
      baseScenarioOutput: priorScenario && typeof priorScenario === 'object' ? priorScenario as ReturnType<typeof runScenarioEngine> : null,
      metaScenarioOutput: priorMeta && typeof priorMeta === 'object' ? priorMeta as ReturnType<typeof runMetaScenarioEngine> : null,
    });
    const source = createSource(`war-room:${warRoom.anchorLabel}:${Date.now()}`, `War Room | ${warRoom.anchorLabel}`, 'model', {
      publisher: 'QADR110 Multi-Agent War Room',
      retrievedAt: new Date().toISOString(),
      score: 0.71,
      legalBasis: 'Multi-agent strategic debate / defensive decision-support',
    });

    return {
      tool: this.name,
      ok: warRoom.agents.length > 0,
      summary: this.name === 'war_room_on_scenarios'
        ? [
          warRoom.scenarioFocus.scenario_shift_summary,
          warRoom.scenarioRanking[0] ? `سناریوی غالب: ${warRoom.scenarioRanking[0].title}` : '',
          warRoom.scenarioAdjustments[0] ? `اصلاح کلیدی: ${warRoom.scenarioAdjustments[0].title} / ${warRoom.scenarioAdjustments[0].adjustment_type}` : '',
          warRoom.executiveRecommendations[0] ? `توصیه اجرایی: ${warRoom.executiveRecommendations[0]}` : '',
        ].filter(Boolean).join('\n')
        : [
          warRoom.executiveSummary,
          warRoom.disagreements[0] ? `اختلاف اصلی: ${warRoom.disagreements[0].title}` : '',
          warRoom.recommendedWatchpoints[0] ? `watchpoint اصلی: ${warRoom.recommendedWatchpoints[0]}` : '',
        ].filter(Boolean).join('\n'),
      warnings: warRoom.disagreements.length >= 4
        ? ['War Room اختلاف‌های حل‌نشده‌ی متعددی ثبت کرد؛ synthesis باید با داده تازه دوباره اجرا شود.']
        : [],
      sources: [source],
      contextPackets: warRoom.contextPackets,
      durationMs: Date.now() - startedAt,
      data: {
        structuredOutput: warRoom.structuredOutput,
        warRoomOutput: warRoom,
        moderatorSummary: warRoom.moderatorSummary,
        executiveSummary: warRoom.executiveSummary,
      },
    };
  }
}

class OpenRouterCallTool implements OrchestratorTool {
  readonly name = 'openrouter_call' as const;

  async execute(context: OrchestratorToolContext): Promise<OrchestratorToolResult> {
    const startedAt = Date.now();
    const result = await callLlm({
      provider: 'openrouter',
      routingHint: 'escalation',
      messages: [
        { role: 'system', content: context.systemPrompt || 'Return valid JSON.' },
        { role: 'user', content: context.userPrompt || context.request.query },
      ],
      maxTokens: 1_800,
      timeoutMs: 90_000,
      retries: 2,
      retryDelayMs: 600,
      validate: undefined,
    });

    return {
      tool: this.name,
      ok: Boolean(result?.content),
      summary: result?.content ? 'OpenRouter escalation اجرا شد.' : 'OpenRouter escalation پاسخ معتبری نداد.',
      warnings: result?.content ? [] : ['OpenRouter escalation نتوانست خروجی معتبری تولید کند.'],
      sources: [],
      contextPackets: [],
      durationMs: Date.now() - startedAt,
      data: {
        content: result?.content || '',
        model: result?.model || '',
      },
    };
  }
}

export function createServerOrchestratorToolRegistry(): OrchestratorToolRegistry {
  return new OrchestratorToolRegistry([
    new MapContextTool(),
    new WebSearchTool(),
    new OsintFetchTool(),
    new ScenarioEngineTool(),
    new DetectBlackSwansTool(),
    new MetaScenarioEngineTool(),
    new ScenarioSimulationTool(),
    new StrategicForesightTool(),
    new WarRoomTool(),
    new WarRoomTool('war_room_on_scenarios'),
    new SummarizeContextTool(),
    new PromptOptimizerTool(),
    new OpenRouterCallTool(),
  ]);
}
