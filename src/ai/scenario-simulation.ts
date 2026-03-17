import {
  createConfidenceRecord,
  type AssistantContextPacket,
  type AssistantImpactLevel,
  type AssistantProbabilityBand,
  type AssistantSimulation,
  type AssistantSimulationBranch,
  type AssistantSimulationMode,
  type AssistantSimulationStep,
  type AssistantStructuredOutput,
  type AssistantUncertaintyLevel,
} from '@/platform/ai/assistant-contracts';
import type { OrchestratorToolName } from '@/platform/ai/orchestrator-contracts';

import {
  compareScenarios,
  getScenarios,
  updateScenarios,
  type ScenarioDomain,
  type ScenarioEngineInput,
  type ScenarioEngineScenario,
  type ScenarioEngineState,
  type ScenarioSignalPolarity,
  type ScenarioSignalRecord,
} from './scenario-engine';

export interface ScenarioSimulationControls {
  probabilityBias: number;
  intensity: number;
  actorBehavior: {
    coordination: boolean;
    escalationBias: boolean;
    marketSensitivity: boolean;
    informationDisorder: boolean;
  };
  constraints: {
    logisticsFragility: boolean;
    sanctionsPressure: boolean;
    diplomaticBackchannel: boolean;
    cyberPressure: boolean;
  };
}

export interface ScenarioSimulationInput extends ScenarioEngineInput {
  hypotheticalEvent: string;
  mode: AssistantSimulationMode;
  controls?: Partial<ScenarioSimulationControls>;
  branchCount?: number;
  stepCount?: number;
  availableTools?: OrchestratorToolName[];
  toolContextSummary?: string[];
}

export interface ScenarioSimulationDecisionNode {
  id: string;
  label: string;
  kind: 'root' | 'branch' | 'step';
  branchId?: string;
  emphasis?: number;
}

export interface ScenarioSimulationDecisionEdge {
  from: string;
  to: string;
  label: string;
  weight?: number;
}

export interface ScenarioSimulationOutput {
  title: string;
  event: string;
  mode: AssistantSimulationMode;
  anchorLabel: string;
  baseState: ScenarioEngineState;
  branches: AssistantSimulationBranch[];
  compareSummary: string;
  controlsSummary: string[];
  graph: {
    nodes: ScenarioSimulationDecisionNode[];
    edges: ScenarioSimulationDecisionEdge[];
  };
  structuredOutput: AssistantStructuredOutput;
}

const DEFAULT_CONTROLS: ScenarioSimulationControls = {
  probabilityBias: 0,
  intensity: 0.55,
  actorBehavior: {
    coordination: true,
    escalationBias: false,
    marketSensitivity: true,
    informationDisorder: false,
  },
  constraints: {
    logisticsFragility: true,
    sanctionsPressure: false,
    diplomaticBackchannel: true,
    cyberPressure: false,
  },
};

const DOMAIN_HINTS: Array<{ match: string; domains: ScenarioDomain[] }> = [
  { match: 'economic', domains: ['economics'] },
  { match: 'energy', domains: ['economics', 'infrastructure'] },
  { match: 'shipping', domains: ['economics', 'infrastructure', 'geopolitics'] },
  { match: 'security', domains: ['geopolitics', 'infrastructure'] },
  { match: 'social', domains: ['public_sentiment'] },
  { match: 'cyber', domains: ['cyber', 'infrastructure'] },
  { match: 'زیرساخت', domains: ['infrastructure'] },
  { match: 'اقتصاد', domains: ['economics'] },
  { match: 'امنیت', domains: ['geopolitics'] },
  { match: 'اجتماع', domains: ['public_sentiment'] },
  { match: 'سایبر', domains: ['cyber'] },
];

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Number(clamp(value).toFixed(2));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function toProbabilityBand(score: number): AssistantProbabilityBand {
  if (score >= 0.7) return 'high';
  if (score >= 0.38) return 'medium';
  return 'low';
}

function toImpactLevel(score: number): AssistantImpactLevel {
  if (score >= 0.84) return 'critical';
  if (score >= 0.62) return 'high';
  if (score >= 0.34) return 'medium';
  return 'low';
}

function toUncertaintyLevel(score: number): AssistantUncertaintyLevel {
  if (score >= 0.68) return 'high';
  if (score >= 0.38) return 'medium';
  return 'low';
}

function uniqueStrings(values: string[], maxItems = 8): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, maxItems);
}

function normalizeControls(overrides?: Partial<ScenarioSimulationControls>): ScenarioSimulationControls {
  return {
    probabilityBias: clamp(overrides?.probabilityBias ?? DEFAULT_CONTROLS.probabilityBias, -1, 1),
    intensity: clamp(overrides?.intensity ?? DEFAULT_CONTROLS.intensity),
    actorBehavior: {
      coordination: overrides?.actorBehavior?.coordination ?? DEFAULT_CONTROLS.actorBehavior.coordination,
      escalationBias: overrides?.actorBehavior?.escalationBias ?? DEFAULT_CONTROLS.actorBehavior.escalationBias,
      marketSensitivity: overrides?.actorBehavior?.marketSensitivity ?? DEFAULT_CONTROLS.actorBehavior.marketSensitivity,
      informationDisorder: overrides?.actorBehavior?.informationDisorder ?? DEFAULT_CONTROLS.actorBehavior.informationDisorder,
    },
    constraints: {
      logisticsFragility: overrides?.constraints?.logisticsFragility ?? DEFAULT_CONTROLS.constraints.logisticsFragility,
      sanctionsPressure: overrides?.constraints?.sanctionsPressure ?? DEFAULT_CONTROLS.constraints.sanctionsPressure,
      diplomaticBackchannel: overrides?.constraints?.diplomaticBackchannel ?? DEFAULT_CONTROLS.constraints.diplomaticBackchannel,
      cyberPressure: overrides?.constraints?.cyberPressure ?? DEFAULT_CONTROLS.constraints.cyberPressure,
    },
  };
}

function scenarioDomains(scenario: ScenarioEngineScenario): ScenarioDomain[] {
  const domains = new Set<ScenarioDomain>();
  Object.entries(scenario.cross_domain_impacts ?? {}).forEach(([domain, values]) => {
    if (Array.isArray(values) && values.length > 0) {
      domains.add(domain as ScenarioDomain);
    }
  });
  scenario.causal_chain.forEach((step) => step.affected_domains.forEach((domain) => domains.add(domain)));
  const haystack = `${scenario.id} ${scenario.title} ${scenario.description}`.toLowerCase();
  DOMAIN_HINTS.forEach((hint) => {
    if (haystack.includes(hint.match.toLowerCase())) {
      hint.domains.forEach((domain) => domains.add(domain));
    }
  });
  return Array.from(domains);
}

function scenarioDomainScore(scenario: ScenarioEngineScenario, domain: ScenarioDomain): number {
  const impacts = scenario.cross_domain_impacts?.[domain]?.length ?? 0;
  const causalHits = scenario.causal_chain.filter((step) => step.affected_domains.includes(domain)).length;
  const titleHits = `${scenario.id} ${scenario.title} ${scenario.description}`.toLowerCase().includes(domain.replace('_', ' ')) ? 1 : 0;
  return impacts + causalHits + titleHits;
}

function buildSimulationSignals(
  scenario: ScenarioEngineScenario,
  controls: ScenarioSimulationControls,
  mode: AssistantSimulationMode,
  branchIndex: number,
  stepCount: number,
): ScenarioSignalRecord[] {
  const domains = scenarioDomains(scenario);
  const escalationBoost = controls.actorBehavior.escalationBias ? 0.12 : -0.04;
  const coordinationOffset = controls.actorBehavior.coordination ? -0.05 : 0.06;
  const cyberBoost = controls.constraints.cyberPressure && domains.includes('cyber') ? 0.12 : 0;
  const logisticsBoost = controls.constraints.logisticsFragility && domains.includes('infrastructure') ? 0.1 : 0;
  const marketBoost = controls.actorBehavior.marketSensitivity && domains.includes('economics') ? 0.1 : 0;
  const infoBoost = controls.actorBehavior.informationDisorder && domains.includes('public_sentiment') ? 0.1 : 0;
  const sanctionsBoost = controls.constraints.sanctionsPressure && domains.includes('geopolitics') ? 0.08 : 0;
  const diplomacyPenalty = controls.constraints.diplomaticBackchannel ? -0.08 : 0.05;
  const baseStrength = clamp(
    (scenario.probability_score ?? 0.5)
    + (controls.intensity * 0.22)
    + escalationBoost
    + coordinationOffset
    + cyberBoost
    + logisticsBoost
    + marketBoost
    + infoBoost
    + sanctionsBoost
    + diplomacyPenalty
    + (branchIndex * 0.03),
  );
  const polarity: ScenarioSignalPolarity = baseStrength >= 0.58 ? 'escalatory' : 'neutral';

  return Array.from({ length: stepCount }).map((_, index) => {
    const step = scenario.causal_chain[index] ?? scenario.causal_chain[scenario.causal_chain.length - 1];
    const strength = clamp(baseStrength + (index * 0.04) - (mode === 'fast' ? 0.02 : 0));
    return {
      id: `sim-signal:${scenario.id}:${index + 1}`,
      source: index === 0 ? 'user-query' : index % 2 === 0 ? 'map' : 'session-memory',
      label: `${scenario.title} | ${step?.summary || `گام ${index + 1}`}`,
      summary: `${step?.summary || 'checkpoint'} | شدت ${Math.round(strength * 100)}%`,
      strength: round(strength),
      polarity,
      domainWeights: Object.fromEntries(domains.map((domain) => [domain, round(0.42 + (scenarioDomainScore(scenario, domain) * 0.08) + (controls.intensity * 0.18))])),
      occurredAt: new Date(Date.now() + (index * 60 * 60 * 1000)).toISOString(),
      evidenceIds: uniqueStrings([scenario.id, ...scenario.indicators_to_watch.slice(0, 2)]),
    };
  });
}

function branchToolsForDomains(
  domains: ScenarioDomain[],
  availableTools: OrchestratorToolName[],
  mode: AssistantSimulationMode,
): OrchestratorToolName[] {
  const tools: OrchestratorToolName[] = [];
  if (availableTools.includes('map_context')) {
    tools.push('map_context');
  }
  if (
    domains.some((domain) => domain === 'geopolitics' || domain === 'public_sentiment' || domain === 'economics')
    && availableTools.includes('osint_fetch')
  ) {
    tools.push('osint_fetch');
  }
  if (
    domains.some((domain) => domain === 'geopolitics' || domain === 'public_sentiment')
    && availableTools.includes('web_search')
  ) {
    tools.push('web_search');
  }
  if (availableTools.includes('scenario_engine')) {
    tools.push('scenario_engine');
  }
  if (availableTools.includes('summarize_context')) {
    tools.push('summarize_context');
  }
  if (mode === 'deep' && availableTools.includes('prompt_optimizer')) {
    tools.push('prompt_optimizer');
  }
  if (mode === 'deep' && availableTools.includes('openrouter_call')) {
    tools.push('openrouter_call');
  }
  return uniqueStrings(tools).map((tool) => tool as OrchestratorToolName);
}

function controlsSummary(controls: ScenarioSimulationControls, mode: AssistantSimulationMode): string[] {
  return uniqueStrings([
    `مد اجرا: ${mode === 'deep' ? 'عمیق چندمرحله‌ای' : 'سریع heuristic'}`,
    `بایاس احتمال: ${Math.round(controls.probabilityBias * 100)}%`,
    `شدت سناریو: ${Math.round(controls.intensity * 100)}%`,
    controls.actorBehavior.coordination ? 'هماهنگی بازیگران فعال است.' : 'هماهنگی بازیگران ضعیف فرض شده است.',
    controls.actorBehavior.escalationBias ? 'رفتار بازیگران به سمت تشدید bias دارد.' : 'رفتار بازیگران محافظه‌کارانه‌تر فرض شده است.',
    controls.constraints.logisticsFragility ? 'گلوگاه‌های لجستیکی شکننده فرض شده‌اند.' : 'ظرفیت buffer لجستیکی فرض شده است.',
    controls.constraints.diplomaticBackchannel ? 'کانال‌های دیپلماتیک محدودکننده در دسترس فرض شده‌اند.' : 'کانال دیپلماتیک موثری فرض نشده است.',
    controls.constraints.cyberPressure ? 'فشار سایبری به‌عنوان محدودیت تشدیدکننده فعال است.' : '',
  ], 8);
}

function buildLocalRiskSet(scenario: ScenarioEngineScenario, anchorLabel: string): string[] {
  return uniqueStrings([
    ...Object.values(scenario.cross_domain_impacts ?? {}).flatMap((items) => items ?? []),
    ...scenario.second_order_effects,
    `${anchorLabel}: ${scenario.description}`,
  ], 5);
}

function buildRegionalSpillovers(scenario: ScenarioEngineScenario, anchorLabel: string): string[] {
  return uniqueStrings([
    `${anchorLabel}: سرریز به همسایگان و کریدورهای مرتبط`,
    ...scenario.drivers.map((driver) => `اثر منطقه‌ای از مسیر ${driver}`),
    ...scenario.indicators_to_watch.slice(0, 3).map((indicator) => `شاخص spillover: ${indicator}`),
  ], 5);
}

function buildGlobalRipples(scenario: ScenarioEngineScenario): string[] {
  return uniqueStrings([
    ...scenario.second_order_effects.map((effect) => `اثر جهانی/فرامنطقه‌ای: ${effect}`),
    ...scenario.drivers.slice(0, 2).map((driver) => `بازتاب در بازارها و روایت جهانی از مسیر ${driver}`),
  ], 5);
}

function buildSimulationSteps(
  scenario: ScenarioEngineScenario,
  simulatedScenario: ScenarioEngineScenario,
  stepCount: number,
  toolPlan: OrchestratorToolName[],
  controls: ScenarioSimulationControls,
): AssistantSimulationStep[] {
  const checkpointsNeeded = Math.max(0, stepCount - scenario.causal_chain.length);
  const steps: AssistantSimulationStep[] = scenario.causal_chain.slice(0, stepCount).map((step, index) => {
    const probabilityScore = clamp((simulatedScenario.probability_score ?? scenario.probability_score ?? 0.5) + ((index - 1) * 0.04) + (controls.probabilityBias * 0.08));
    const impactScore = clamp((simulatedScenario.impact_score ?? scenario.impact_score ?? 0.5) + (controls.intensity * 0.08) + (index * 0.03));
    return {
      id: `${scenario.id}:step:${index + 1}`,
      title: `گام ${index + 1}`,
      stage: step.stage,
      summary: step.summary,
      probability_score: round(probabilityScore),
      impact_score: round(impactScore),
      uncertainty_level: toUncertaintyLevel(Math.abs(impactScore - probabilityScore)),
      indicators_to_watch: uniqueStrings([
        scenario.indicators_to_watch[index] || '',
        ...scenario.indicators_to_watch.slice(Math.max(0, index - 1), index + 1),
      ], 4),
      tool_calls: toolPlan.slice(0, Math.min(toolPlan.length, 3)),
    };
  });

  Array.from({ length: checkpointsNeeded }).forEach((_, index) => {
    const checkpointIndex = steps.length + 1;
    const probabilityScore = clamp((simulatedScenario.probability_score ?? 0.5) + (controls.probabilityBias * 0.06) - 0.02 + (index * 0.02));
    const impactScore = clamp((simulatedScenario.impact_score ?? 0.5) + (controls.intensity * 0.08) + 0.04 + (index * 0.02));
    steps.push({
      id: `${scenario.id}:checkpoint:${index + 1}`,
      title: `Checkpoint ${checkpointIndex}`,
      stage: 'checkpoint',
      summary: `در این checkpoint، مسیر «${scenario.title}» با توجه به محدودیت‌ها و رفتار بازیگران برای موج بعدی پیامدها بازارزیابی می‌شود.`,
      probability_score: round(probabilityScore),
      impact_score: round(impactScore),
      uncertainty_level: toUncertaintyLevel(0.48 + (controls.intensity * 0.2)),
      indicators_to_watch: uniqueStrings([
        ...scenario.indicators_to_watch.slice(0, 2),
        ...scenario.drivers.slice(0, 2),
      ], 4),
      tool_calls: toolPlan.slice(0, Math.min(toolPlan.length, 4)),
    });
  });

  return steps.slice(0, stepCount);
}

function buildGraph(
  event: string,
  branches: AssistantSimulationBranch[],
): { nodes: ScenarioSimulationDecisionNode[]; edges: ScenarioSimulationDecisionEdge[] } {
  const nodes: ScenarioSimulationDecisionNode[] = [
    {
      id: 'simulation-root',
      label: event,
      kind: 'root',
      emphasis: 1,
    },
  ];
  const edges: ScenarioSimulationDecisionEdge[] = [];

  branches.forEach((branch) => {
    nodes.push({
      id: branch.id,
      label: branch.title,
      kind: 'branch',
      branchId: branch.id,
      emphasis: branch.probability_score,
    });
    edges.push({
      from: 'simulation-root',
      to: branch.id,
      label: `احتمال ${Math.round(branch.probability_score * 100)}%`,
      weight: branch.impact_score,
    });

    branch.steps.forEach((step, index) => {
      nodes.push({
        id: step.id,
        label: step.summary,
        kind: 'step',
        branchId: branch.id,
        emphasis: step.probability_score,
      });
      edges.push({
        from: index === 0 ? branch.id : branch.steps[index - 1]!.id,
        to: step.id,
        label: step.stage === 'checkpoint' ? 'بازبینی' : step.stage,
        weight: step.impact_score,
      });
    });
  });

  return { nodes, edges };
}

function buildSimulationStructuredOutput(
  input: ScenarioSimulationInput,
  output: ScenarioSimulationOutput,
): AssistantStructuredOutput {
  const topBranch = output.branches[0];
  const topScenarioDrivers = topBranch?.steps.flatMap((step) => step.indicators_to_watch).slice(0, 4) ?? [];
  const simulation: AssistantSimulation = {
    title: output.title,
    event: output.event,
    mode: output.mode,
    compare_summary: output.compareSummary,
    controls_summary: output.controlsSummary,
    branches: output.branches,
    graph: output.graph,
  };

  return {
    reportTitle: output.title,
    executiveSummary: topBranch
      ? `برای «${input.hypotheticalEvent}» در ${output.anchorLabel}، ${output.branches.length} شاخه شبیه‌سازی تولید شد. محتمل‌ترین شاخه «${topBranch.title}» است، اما branchهای دیگر از نظر اثر و relevance راهبردی باید هم‌زمان پایش شوند.`
      : `برای «${input.hypotheticalEvent}» در ${output.anchorLabel} شاخه معتبری ساخته نشد.`,
    observedFacts: {
      title: 'واقعیت‌های پایه شبیه‌سازی',
      bullets: uniqueStrings([
        `کانون جغرافیایی: ${output.anchorLabel}`,
        `مد اجرا: ${output.mode === 'deep' ? 'عمیق' : 'سریع'}`,
        `شمار شاخه‌ها: ${output.branches.length}`,
        ...output.controlsSummary.slice(0, 3),
      ], 6),
      narrative: `شبیه‌سازی از trigger «${input.hypotheticalEvent}» آغاز شد و با تکیه بر context نقشه، سیگنال‌های OSINT و حافظه جلسه branchهای محتمل را ساخت.`,
      confidence: createConfidenceRecord(topBranch?.probability_score ?? 0.5, 'سطح اطمینان از همگرایی شاخه‌های برتر و غنای سیگنال‌ها برآورد شده است.'),
    },
    analyticalInference: {
      title: 'برداشت تحلیلی',
      bullets: uniqueStrings([
        output.compareSummary,
        ...topScenarioDrivers.map((item) => `شاخص کلیدی: ${item}`),
        ...output.branches.slice(0, 2).map((branch) => `${branch.title} | اثر ${branch.impact_level}`),
      ], 6),
      narrative: 'شبیه‌ساز تعاملی، branchهای آینده را از ترکیب causal chain موتور سناریو، biasهای کنترلی analyst و ابزارهای قابل‌فراخوانی می‌سازد؛ بنابراین rankingها تخمینی و evidence-aware هستند، نه deterministic.',
      confidence: createConfidenceRecord(topBranch?.probability_score ?? 0.52, 'برداشت تحلیلی از روی branch ranking و compare summary ساخته شده است.'),
    },
    scenarios: output.branches.map((branch) => ({
      id: branch.id,
      title: branch.title,
      probability: branch.probability,
      probability_score: branch.probability_score,
      timeframe: branch.time_horizon,
      time_horizon: branch.time_horizon,
      description: branch.description,
      indicators: branch.steps.flatMap((step) => step.indicators_to_watch).slice(0, 5),
      indicators_to_watch: branch.steps.flatMap((step) => step.indicators_to_watch).slice(0, 5),
      drivers: branch.controls_summary,
      causal_chain: branch.steps
        .filter((step) => step.stage !== 'checkpoint')
        .map((step) => ({
          stage: step.stage === 'checkpoint' ? 'outcome' : step.stage,
          summary: step.summary,
          affected_domains: [],
        })),
      mitigation_options: uniqueStrings([
        ...branch.tool_plan.map((tool) => `اجرای ابزار: ${tool}`),
        ...branch.local_risks.slice(0, 2).map((risk) => `پایش: ${risk}`),
      ], 6),
      impact_level: branch.impact_level,
      impact_score: branch.impact_score,
      uncertainty_level: branch.uncertainty_level,
      second_order_effects: branch.global_ripple_effects,
      cross_domain_impacts: {
        local: branch.local_risks,
        regional: branch.regional_spillovers,
        global: branch.global_ripple_effects,
      },
      strategic_relevance: round((branch.probability_score * 0.45) + (branch.impact_score * 0.55)),
      likelihood_score: branch.probability_score,
      confidence: createConfidenceRecord(1 - (branch.steps.filter((step) => step.uncertainty_level === 'high').length / Math.max(1, branch.steps.length)), 'اعتماد branch با تکیه بر step uncertainty و تعداد شاخص‌های پایش برآورد شد.'),
    })),
    simulation,
    decisionSupport: output.baseState.decisionSupport,
    uncertainties: {
      title: 'عدم‌قطعیت‌ها',
      bullets: uniqueStrings([
        'شاخه‌ها heuristic هستند و قطعیت علّی مطلق ندارند.',
        'در نبود سیگنال جدید، branch ranking می‌تواند سریع تغییر کند.',
        output.mode === 'fast' ? 'مد سریع از تقریب‌های سبکتر استفاده می‌کند.' : 'مد عمیق هنوز به ابزارهای دردسترس و coverage داده محدود است.',
      ], 5),
      narrative: 'عدم‌قطعیت اصلی از تفاوت کیفیت داده در لایه‌های فعال، شکاف بین سیگنال‌های خبری و بازار، و مفروضات analyst درباره رفتار بازیگران و محدودیت‌ها ناشی می‌شود.',
      confidence: createConfidenceRecord(0.42, 'این بخش به‌صورت محافظه‌کارانه با لحاظ شکاف‌های داده و sensitivity controls ساخته شده است.'),
    },
    recommendations: {
      title: 'اقدامات پیشنهادی',
      bullets: uniqueStrings([
        ...output.branches[0]?.tool_plan.map((tool) => `در اولویت اجرا: ${tool}`) ?? [],
        ...output.branches[0]?.steps.flatMap((step) => step.indicators_to_watch).slice(0, 3).map((indicator) => `پایش فوری: ${indicator}`) ?? [],
      ], 6),
      narrative: 'پیشنهادها بر validation سریع branch غالب، مقایسه آن با branchهای high-impact، و نگه‌داشتن مسیرهای fallback برای داده و تحلیل متمرکز هستند.',
      confidence: createConfidenceRecord(0.56, 'پیشنهادها از branch غالب و ابزارهای دردسترس مشتق شده‌اند.'),
    },
    resilienceNarrative: {
      title: 'روایت تاب‌آوری',
      bullets: uniqueStrings([
        ...output.branches.slice(0, 2).flatMap((branch) => branch.local_risks.slice(0, 2)),
        ...output.branches.slice(0, 2).flatMap((branch) => branch.regional_spillovers.slice(0, 1)),
      ], 6),
      narrative: 'شبیه‌سازی نشان می‌دهد تاب‌آوری این کانون جغرافیایی به ظرفیت لجستیک، کیفیت deconfliction، مدیریت روایت و هم‌زمانی فشارهای اقتصادی/سایبری حساس است.',
      confidence: createConfidenceRecord(0.54, 'روایت تاب‌آوری بر اساس ریسک‌های محلی و spilloverهای branchهای برتر ساخته شده است.'),
    },
    followUpSuggestions: uniqueStrings([
      `شاخه «${output.branches[0]?.title || 'برتر'}» را با داده تازه دوباره ارزیابی کن`,
      `اثر اقتصادی branchهای ${output.anchorLabel} را مقایسه کن`,
      `برای ${output.anchorLabel} شاخص‌های پایش ۷۲ ساعت آینده را به‌روز کن`,
      ...output.branches.slice(0, 2).map((branch) => `ابزارهای ${branch.title} را اجرا کن`),
    ], 6),
  };
}

export function createDefaultScenarioSimulationControls(): ScenarioSimulationControls {
  return normalizeControls();
}

export function runScenarioSimulation(input: ScenarioSimulationInput): ScenarioSimulationOutput {
  const controls = normalizeControls(input.controls);
  const availableTools = uniqueStrings(input.availableTools ?? [
    'map_context',
    'osint_fetch',
    'web_search',
    'scenario_engine',
    'summarize_context',
    'prompt_optimizer',
    'openrouter_call',
  ]) as OrchestratorToolName[];
  const branchCount = Math.min(5, Math.max(3, input.branchCount ?? (input.mode === 'deep' ? 5 : 4)));
  const stepCount = Math.min(5, Math.max(3, input.stepCount ?? (input.mode === 'deep' ? 5 : 4)));
  const baseState = getScenarios({
    ...input,
    trigger: input.hypotheticalEvent,
    query: input.query || input.hypotheticalEvent,
    maxScenarios: Math.max(branchCount, input.maxScenarios ?? branchCount),
  });
  const branches = baseState.scenarios.slice(0, branchCount).map((scenario, branchIndex) => {
    const signals = buildSimulationSignals(scenario, controls, input.mode, branchIndex, stepCount);
    const updatedState = updateScenarios({
      previousState: baseState,
      newSignals: signals,
      reason: `simulation:${scenario.id}`,
      query: input.query || input.hypotheticalEvent,
      mapContext: input.mapContext ?? baseState.inputSnapshot.mapContext ?? null,
      sessionContext: input.sessionContext ?? baseState.inputSnapshot.sessionContext ?? null,
      timeContext: input.timeContext,
      maxScenarios: Math.max(branchCount, input.maxScenarios ?? branchCount),
    });
    const simulatedScenario = updatedState.scenarios.find((candidate) => candidate.id === scenario.id)
      ?? updatedState.scenarios.find((candidate) => candidate.title === scenario.title)
      ?? scenario;
    const domains = scenarioDomains(simulatedScenario);
    const toolPlan = branchToolsForDomains(domains, availableTools, input.mode);
    const baseProbability = simulatedScenario.probability_score ?? scenario.probability_score ?? 0.5;
    const probabilityScore = clamp(baseProbability + (controls.probabilityBias * 0.16) + ((branchIndex === 0 ? 0.04 : 0) * controls.intensity));
    const impactScore = clamp((simulatedScenario.impact_score ?? scenario.impact_score ?? 0.5) + (controls.intensity * 0.12) + (controls.constraints.logisticsFragility ? 0.04 : 0));
    const uncertaintySeed = Math.abs((simulatedScenario.confidence_score ?? 0.5) - probabilityScore) + (input.mode === 'fast' ? 0.08 : 0.02);
    return {
      id: `sim-branch:${slugify(scenario.id)}`,
      title: scenario.title,
      description: simulatedScenario.description,
      probability: toProbabilityBand(probabilityScore),
      probability_score: round(probabilityScore),
      impact_level: toImpactLevel(impactScore),
      impact_score: round(impactScore),
      uncertainty_level: toUncertaintyLevel(uncertaintySeed),
      time_horizon: simulatedScenario.time_horizon,
      local_risks: buildLocalRiskSet(simulatedScenario, baseState.anchorLabel),
      regional_spillovers: buildRegionalSpillovers(simulatedScenario, baseState.anchorLabel),
      global_ripple_effects: buildGlobalRipples(simulatedScenario),
      controls_summary: controlsSummary(controls, input.mode),
      tool_plan: toolPlan,
      steps: buildSimulationSteps(scenario, simulatedScenario, stepCount, toolPlan, controls),
    } satisfies AssistantSimulationBranch;
  }).sort((left, right) => ((right.probability_score * 0.55) + (right.impact_score * 0.45)) - ((left.probability_score * 0.55) + (left.impact_score * 0.45)));

  const compareSummary = branches.length >= 2
    ? compareScenarios(baseState.scenarios[0]!, baseState.scenarios[1]!).summary
    : 'برای مقایسه branchها به داده بیشتری نیاز است.';
  const graph = buildGraph(input.hypotheticalEvent, branches);
  const output: ScenarioSimulationOutput = {
    title: `شبیه‌ساز تعاملی: ${input.hypotheticalEvent}`,
    event: input.hypotheticalEvent,
    mode: input.mode,
    anchorLabel: baseState.anchorLabel,
    baseState,
    branches,
    compareSummary,
    controlsSummary: controlsSummary(controls, input.mode),
    graph,
    structuredOutput: {} as AssistantStructuredOutput,
  };
  output.structuredOutput = buildSimulationStructuredOutput(input, output);
  return output;
}

export function buildScenarioSimulationContextPackets(output: ScenarioSimulationOutput): AssistantContextPacket[] {
  return output.branches.slice(0, 3).map((branch, index) => ({
    id: `simulation-packet:${branch.id}`,
    title: branch.title,
    summary: `${branch.description} | احتمال ${Math.round(branch.probability_score * 100)}% | اثر ${branch.impact_level}`,
    content: [
      branch.description,
      `گام‌ها: ${branch.steps.map((step) => step.summary).join(' | ')}`,
      `ابزارها: ${branch.tool_plan.join(', ')}`,
    ].join('\n'),
    sourceLabel: 'QADR110 Scenario Simulation',
    sourceType: 'model',
    updatedAt: output.baseState.updatedAt,
    score: round((branch.probability_score * 0.6) + (branch.impact_score * 0.4)),
    tags: ['scenario-simulation', output.mode, index === 0 ? 'top-branch' : 'branch'],
    provenance: {
      sourceIds: [`simulation:${output.event}`],
      evidenceIds: [branch.id],
      derivedFromIds: output.baseState.contextPackets.map((packet) => packet.id),
    },
  }));
}
