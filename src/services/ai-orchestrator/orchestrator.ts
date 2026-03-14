import { ModelPolicyEngine } from './policy-engine';
import { createDefaultToolPlugins, ToolPluginRegistry } from './plugins';
import type {
  Citation,
  CitationRendering,
  OrchestratorIntent,
  OrchestratorOutput,
  OrchestratorQuery,
  SourceRecord,
  ToolPluginId,
  ToolResult,
} from './types';

const ORCHESTRATION_STAGES = [
  'intent-detection',
  'source-routing',
  'model-routing',
  'synthesis',
  'citation-rendering',
] as const;

const SOURCE_ROUTING_TABLE: Record<OrchestratorIntent, ToolPluginId[]> = {
  'trend-analysis': ['google-trends', 'web-search', 'gdelt'],
  'conflict-monitoring': ['gdelt', 'netblocks', 'media-pipelines', 'internal-panels'],
  'media-monitoring': ['media-pipelines', 'web-search', 'internal-panels'],
  'resilience-monitoring': ['internal-panels', 'gdelt', 'google-trends'],
  'general-intel': ['web-search', 'gdelt', 'internal-panels'],
};

function detectIntent(query: string): OrchestratorIntent {
  const q = query.toLowerCase();
  if (q.includes('trend') || q.includes('روند')) return 'trend-analysis';
  if (q.includes('conflict') || q.includes('war') || q.includes('درگیری')) return 'conflict-monitoring';
  if (q.includes('media') || q.includes('narrative') || q.includes('رسانه')) return 'media-monitoring';
  if (q.includes('resilience') || q.includes('تاب‌آوری') || q.includes('تاب اوری')) return 'resilience-monitoring';
  return 'general-intel';
}

function flattenSources(results: ToolResult[]): SourceRecord[] {
  const unique = new Map<string, SourceRecord>();
  for (const result of results) {
    for (const source of result.sources) {
      unique.set(source.id, source);
    }
  }
  return [...unique.values()];
}

function synthesize(results: ToolResult[], modelDecisionText: string): string {
  const evidence = results.map((result) => `- ${result.summary}`).join('\n');
  return `${modelDecisionText}\n\nSynthesized intelligence:\n${evidence}`;
}

function renderCitations(answer: string, sources: SourceRecord[]): CitationRendering {
  const topSources = sources.slice(0, 8);
  const citations: Citation[] = topSources.map((source, index) => ({
    index: index + 1,
    sourceId: source.id,
    title: source.title,
    url: source.url,
    provider: source.provider,
  }));

  const citationText = citations.map((item) => `[${item.index}] ${item.title}`).join(' | ');

  return {
    answerWithCitations: citationText ? `${answer}\n\nCitations: ${citationText}` : answer,
    citations,
  };
}

function aggregateConfidence(results: ToolResult[]): number {
  if (results.length === 0) return 0;
  const total = results.reduce((sum, result) => sum + result.confidence, 0);
  return Number((total / results.length).toFixed(2));
}

function aggregateRiskFlags(results: ToolResult[]): string[] {
  return [...new Set(results.flatMap((result) => result.riskFlags))];
}

function proposeNextActions(intent: OrchestratorIntent, riskFlags: string[]): string[] {
  const base: string[] = [
    'اعتبارسنجی ادعاها با حداقل دو منبع مستقل',
    'به‌روزرسانی وضعیت در داشبورد تصمیم‌یار (DSS/ESS)',
  ];

  if (intent === 'conflict-monitoring') {
    base.push('فعال‌سازی رصد نیمه‌بلادرنگ برای سیگنال‌های تشدید');
  }
  if (riskFlags.includes('connectivity-instability')) {
    base.push('هماهنگی با تیم تاب‌آوری زیرساخت ارتباطی');
  }

  return base;
}

export class AIOrchestrator {
  private readonly policyEngine: ModelPolicyEngine;
  private readonly pluginRegistry: ToolPluginRegistry;

  constructor() {
    this.policyEngine = new ModelPolicyEngine();
    this.pluginRegistry = new ToolPluginRegistry(createDefaultToolPlugins());
  }

  async execute(input: OrchestratorQuery): Promise<OrchestratorOutput> {
    const locale = input.locale ?? 'fa-IR';

    const intent = detectIntent(input.query);
    const sourcePlan = SOURCE_ROUTING_TABLE[intent];

    const modelDecision = this.policyEngine.selectModel({
      constraints: input.constraints,
      preferredProviders: input.preferredProviders,
    });

    const toolResults = await Promise.all(
      sourcePlan.map((pluginId) => this.pluginRegistry.get(pluginId).execute({
        query: input.query,
        intent,
        locale,
      })),
    );

    const mergedSources = flattenSources(toolResults);
    const synthesized = synthesize(toolResults, modelDecision.reason);
    const citationRendering = renderCitations(synthesized, mergedSources);
    const riskFlags = aggregateRiskFlags(toolResults);

    return {
      answer: citationRendering.answerWithCitations,
      sources: mergedSources,
      confidence: aggregateConfidence(toolResults),
      riskFlags,
      nextActions: proposeNextActions(intent, riskFlags),
      meta: {
        intent,
        sourcePlan,
        modelDecision,
        stages: ORCHESTRATION_STAGES,
      },
    };
  }
}
