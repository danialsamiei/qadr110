import {
  createConfidenceRecord,
  type AssistantContextPacket,
  type AssistantProbabilityBand,
  type AssistantStructuredOutput,
  type AssistantWarRoomAgent,
  type AssistantWarRoomConvergence,
  type AssistantWarRoomDisagreement,
  type AssistantWarRoomDisagreementMatrixRow,
  type AssistantWarRoomOutput,
  type AssistantWarRoomQualityControls,
  type AssistantWarRoomRound,
  type AssistantWarRoomRoundEntry,
  type AssistantWarRoomStateTransition,
  type AssistantWarRoomTranscriptEntry,
} from '@/platform/ai/assistant-contracts';
import type { MapContextEnvelope } from '@/platform/operations/map-context';

import type { MetaScenarioEngineOutput } from '../meta-scenario-engine';
import { runMetaScenarioEngine } from '../meta-scenario-engine';
import type {
  ScenarioDomain,
  ScenarioEngineInput,
  ScenarioEngineOutput,
  ScenarioEngineScenario,
} from '../scenario-engine';
import { runScenarioEngine } from '../scenario-engine';
import {
  getWarRoomAgent,
  type WarRoomAgentDefinition,
  type WarRoomAgentId,
} from './agents';
import {
  buildWarRoomDisagreementMatrix,
  createWarRoomDebateState,
  evaluateWarRoomQuality,
  recordWarRoomRound,
  resolveWarRoomControls,
  selectWarRoomAgents,
  transitionWarRoomState,
} from './debate-state';
import {
  buildWarRoomAssessmentPrompt,
  buildWarRoomCritiquePrompt,
  buildWarRoomModerationPrompt,
  buildWarRoomRevisionPrompt,
  buildWarRoomSynthesisPrompt,
  type WarRoomPromptContext,
} from './prompt-registry';
import {
  buildWarRoomScenarioIntegration,
  type WarRoomScenarioSelection,
} from './scenario-integration';

export interface WarRoomInput extends ScenarioEngineInput {
  question: string;
  baseScenarioOutput?: ScenarioEngineOutput | null;
  metaScenarioOutput?: MetaScenarioEngineOutput | null;
  mode?: 'fast' | 'deep';
  challengeIterations?: number;
  includedAgentIds?: WarRoomAgentId[];
  excludedAgentIds?: WarRoomAgentId[];
}

export interface WarRoomOutput {
  question: string;
  anchorLabel: string;
  mode: 'fast' | 'deep';
  activeAgentIds: string[];
  excludedAgentIds: string[];
  roundCount: number;
  agents: AssistantWarRoomAgent[];
  rounds: AssistantWarRoomRound[];
  debateTranscript: AssistantWarRoomTranscriptEntry[];
  replayTrace: AssistantWarRoomStateTransition[];
  disagreementMatrix: AssistantWarRoomDisagreementMatrixRow[];
  qualityControls: AssistantWarRoomQualityControls;
  disagreements: AssistantWarRoomDisagreement[];
  convergences: AssistantWarRoomConvergence[];
  unresolvedUncertainties: string[];
  moderatorSummary: string;
  executiveSummary: string;
  finalSynthesis: string;
  scenarioRanking: AssistantWarRoomOutput['scenario_ranking'];
  scenarioAdjustments: AssistantWarRoomOutput['scenario_adjustments'];
  scenarioFocus: AssistantWarRoomOutput['scenario_focus'];
  executiveRecommendations: string[];
  updatedWatchpoints: string[];
  recommendedWatchpoints: string[];
  structuredOutput: AssistantStructuredOutput;
  contextPackets: AssistantContextPacket[];
  baseScenarioOutput: ScenarioEngineOutput;
  metaScenarioOutput: MetaScenarioEngineOutput;
  scoring: {
    agreementDensity: number;
    disagreementDensity: number;
    signalCoverage: number;
    evidenceBackedDisagreementRatio: number;
    challengeIterations: number;
  };
}

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
    .slice(0, 72);
}

function uniqueStrings(values: Array<string | undefined>, maxItems = 8): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, maxItems);
}

function selectionLabel(mapContext: MapContextEnvelope | null | undefined): string | null {
  const selection = mapContext?.selection;
  if (!selection) return null;
  switch (selection.kind) {
    case 'point':
    case 'polygon':
    case 'incident':
      return selection.label || null;
    case 'country':
      return selection.countryName || selection.countryCode;
    case 'layer':
      return selection.layerLabel || selection.layerId;
    default:
      return null;
  }
}

function scenarioDomains(scenario: ScenarioEngineScenario): ScenarioDomain[] {
  const domains = new Set<ScenarioDomain>();
  Object.entries(scenario.cross_domain_impacts ?? {}).forEach(([domain, values]) => {
    if (Array.isArray(values) && values.length > 0) {
      domains.add(domain as ScenarioDomain);
    }
  });
  scenario.causal_chain.forEach((step) => step.affected_domains.forEach((domain) => domains.add(domain as ScenarioDomain)));
  const haystack = `${scenario.title} ${scenario.description} ${scenario.drivers.join(' ')} ${scenario.indicators_to_watch.join(' ')}`.toLowerCase();
  if (haystack.includes('اقتصاد') || haystack.includes('market') || haystack.includes('energy') || haystack.includes('trade')) domains.add('economics');
  if (haystack.includes('cyber') || haystack.includes('سایبر')) domains.add('cyber');
  if (haystack.includes('social') || haystack.includes('اعتراض') || haystack.includes('روایت')) domains.add('public_sentiment');
  if (haystack.includes('زیرساخت') || haystack.includes('logistics') || haystack.includes('outage')) domains.add('infrastructure');
  if (haystack.includes('security') || haystack.includes('border') || haystack.includes('geopolit')) domains.add('geopolitics');
  return Array.from(domains);
}

function scenarioRank(scenario: ScenarioEngineScenario): number {
  return (
    ((scenario.probability_score ?? 0.5) * 0.34)
    + ((scenario.impact_score ?? 0.5) * 0.28)
    + ((scenario.confidence_score ?? 0.5) * 0.16)
    + ((scenario.strategic_relevance ?? 0.5) * 0.22)
  );
}

function focusScoreForAgent(agent: WarRoomAgentDefinition, scenario: ScenarioEngineScenario): number {
  const domains = scenarioDomains(scenario);
  const domainHits = agent.focusDomains.filter((domain) => domains.includes(domain)).length;
  const indicatorWeight = Math.min(0.12, scenario.indicators_to_watch.length * 0.02);
  return scenarioRank(scenario) + (domainHits * 0.18) + indicatorWeight;
}

function pickScenarioForAgent(agent: WarRoomAgentDefinition, scenarios: ScenarioEngineScenario[], metaOutput: MetaScenarioEngineOutput): ScenarioEngineScenario {
  if (agent.id === 'skeptic-red-team' && metaOutput.black_swan_candidates[0]) {
    const fragile = scenarios
      .slice()
      .sort((left, right) => ((right.uncertainty_level === 'high' ? 1 : 0) + (1 - (right.confidence_score ?? 0.5)))
        - ((left.uncertainty_level === 'high' ? 1 : 0) + (1 - (left.confidence_score ?? 0.5))))[0];
    if (fragile) return fragile;
  }
  return scenarios
    .slice()
    .sort((left, right) => focusScoreForAgent(agent, right) - focusScoreForAgent(agent, left))[0]
    ?? scenarios[0]!;
}

function signalHighlights(input: WarRoomInput, maxItems = 4): string[] {
  return uniqueStrings([
    ...(input.mapContext?.nearbySignals ?? []).map((signal) => signal.label),
    ...(input.localContextPackets ?? []).map((packet) => packet.title),
  ], maxItems);
}

function confidenceForAgent(
  agent: WarRoomAgentDefinition,
  scenario: ScenarioEngineScenario,
  metaOutput: MetaScenarioEngineOutput,
  input: WarRoomInput,
): number {
  let score = scenario.confidence_score ?? 0.55;
  if (agent.id === 'skeptic-red-team') score -= 0.08;
  if (agent.id === 'osint-analyst') score = (score * 0.72) + (Math.min(1, signalHighlights(input, 4).length / 4) * 0.28);
  if (metaOutput.black_swan_candidates.length > 0 && agent.id !== 'executive-synthesizer') score -= 0.03;
  if (agent.id === 'executive-synthesizer') score += 0.04;
  return round(score);
}

function buildSupportingPoints(
  agent: WarRoomAgentDefinition,
  scenario: ScenarioEngineScenario,
  input: WarRoomInput,
  metaOutput: MetaScenarioEngineOutput,
): string[] {
  return uniqueStrings([
    ...scenario.drivers.slice(0, 2),
    ...scenario.indicators_to_watch.slice(0, 2),
    agent.id === 'skeptic-red-team' ? metaOutput.black_swan_candidates[0]?.title : undefined,
    agent.id === 'economic-analyst' ? scenario.cross_domain_impacts?.economics?.[0] : undefined,
    agent.id === 'cyber-infrastructure-analyst' ? scenario.cross_domain_impacts?.infrastructure?.[0] : undefined,
    agent.id === 'social-sentiment-analyst' ? scenario.cross_domain_impacts?.public_sentiment?.[0] : undefined,
    agent.id === 'osint-analyst' ? signalHighlights(input, 3)[0] : undefined,
  ], 5);
}

function buildAssumptions(
  agent: WarRoomAgentDefinition,
  scenario: ScenarioEngineScenario,
  metaOutput: MetaScenarioEngineOutput,
): string[] {
  return uniqueStrings([
    `فرض می‌شود مسیر «${scenario.title}» در ${scenario.time_horizon} هنوز explanatory dominance دارد.`,
    scenario.drivers[0] ? `driver «${scenario.drivers[0]}» هنوز active باقی می‌ماند.` : undefined,
    metaOutput.black_swan_candidates[0] ? `candidate «${metaOutput.black_swan_candidates[0].title}» هنوز به فاز regime shift نرسیده است.` : undefined,
    agent.id === 'economic-analyst' ? 'بازارها shock را بدون گسست کامل absorb می‌کنند.' : undefined,
    agent.id === 'social-sentiment-analyst' ? 'واکنش اجتماعی از کنترل نهادی خارج نمی‌شود.' : undefined,
    agent.id === 'cyber-infrastructure-analyst' ? 'dependencyهای زیرساختی هنوز به failure آبشاری کامل نرسیده‌اند.' : undefined,
  ], 4);
}

function buildWatchpoints(
  agent: WarRoomAgentDefinition,
  scenario: ScenarioEngineScenario,
  input: WarRoomInput,
  metaOutput: MetaScenarioEngineOutput,
): string[] {
  return uniqueStrings([
    ...scenario.indicators_to_watch.slice(0, 3),
    ...(input.mapContext?.nearbySignals ?? []).slice(0, 2).map((signal) => signal.label),
    ...metaOutput.scenario_conflicts[0]?.decisive_indicators?.slice(0, 2) ?? [],
    ...metaOutput.black_swan_candidates[0]?.leading_indicators?.slice(0, 2) ?? [],
    agent.id === 'economic-analyst' ? 'قیمت انرژی / بیمه / throughput' : undefined,
    agent.id === 'social-sentiment-analyst' ? 'نوسان روایت و strain خدمات عمومی' : undefined,
  ], 6);
}

function buildPositionText(
  agent: WarRoomAgentDefinition,
  scenario: ScenarioEngineScenario,
  input: WarRoomInput,
  metaOutput: MetaScenarioEngineOutput,
): string {
  const blackSwan = metaOutput.black_swan_candidates[0];
  const dominantMeta = metaOutput.meta_scenarios[0];
  const anchorLabel = selectionLabel(input.mapContext) || scenario.title;
  switch (agent.id) {
    case 'strategic-analyst':
      return `در ${anchorLabel}، سناریوی «${scenario.title}» فعلا بهترین چارچوب توضیحی برای سوال «${input.question}» است؛ زیرا ${scenario.drivers.slice(0, 2).join(' و ')} هم‌زمان با ${scenario.indicators_to_watch.slice(0, 2).join(' / ')} مسیر تشدید یا مهار را تعیین می‌کنند.`;
    case 'skeptic-red-team':
      return `جمع‌بندی غالب را نباید قطعی فرض کرد؛ چون ${blackSwan ? `candidate قوی‌سیاه «${blackSwan.title}»` : 'فرض‌های پنهان baseline'} می‌تواند سناریوی «${scenario.title}» را invalidate کند و آینده جایگزین را فعال سازد.`;
    case 'economic-analyst':
      return `از منظر اقتصادی، «${scenario.title}» مهم است چون ${scenario.cross_domain_impacts?.economics?.[0] || scenario.description} و هر تغییر در throughput، قیمت و هزینه تامین مالی را به سرعت به بازارها منتقل می‌کند.`;
    case 'osint-analyst':
      return `قدرت این برآورد به evidence بستگی دارد: سیگنال‌های ${signalHighlights(input, 2).join(' / ') || 'OSINT'} از «${scenario.title}» پشتیبانی می‌کنند، اما coverage gap و منبع‌های متعارض هنوز باید صریح بمانند.`;
    case 'cyber-infrastructure-analyst':
      return `از منظر سایبر و زیرساخت، «${scenario.title}» زمانی تعیین‌کننده می‌شود که dependencyهای ${scenario.cross_domain_impacts?.infrastructure?.[0] || 'شبکه‌ای'} به failure آبشاری نزدیک شوند و restoration window کوتاه شود.`;
    case 'social-sentiment-analyst':
      return `بُعد اجتماعی این سوال در این است که «${scenario.title}» فقط یک رخداد فنی نیست؛ بلکه می‌تواند فشار روایی، strain خدمات عمومی و تغییر رفتار جمعی را هم‌زمان فعال کند.`;
    case 'scenario-moderator':
      return `در این debate، «${scenario.title}» نقطه شروع مفید است، اما باید با ${dominantMeta ? `interaction «${dominantMeta.title}»` : 'لایه متا-سناریو'} و فرض‌های شکننده‌ی baseline سنجیده شود تا disagreementهای واقعی دیده شوند.`;
    case 'executive-synthesizer':
      return `برای تصمیم‌گیر، ارزش «${scenario.title}» در این است که watchpointهای محدود اما decisive می‌دهد؛ یعنی چه چیزی باید همین الان پایش شود تا اگر سناریو شکست خورد، جایگزین آن زودتر دیده شود.`;
    default:
      return scenario.description;
  }
}

function buildCritiqueSummary(
  agent: WarRoomAgentDefinition,
  target: AssistantWarRoomAgent,
  scenario: ScenarioEngineScenario,
  metaOutput: MetaScenarioEngineOutput,
): string {
  const blackSwan = metaOutput.black_swan_candidates[0];
  switch (agent.id) {
    case 'skeptic-red-team':
      return `تحلیل ${target.label} بیش از حد به فرض «${target.assumptions[0] || `پایداری ${scenario.title}` }» تکیه دارد؛ اگر ${blackSwan ? `«${blackSwan.title}»` : 'یک failure mode غیرخطی'} فعال شود، این framing پایدار نمی‌ماند.`;
    case 'economic-analyst':
      return `${target.label} shockهای قیمت، بیمه و trade throughput را دست‌کم گرفته است؛ بدون این domain، ranking سناریوها ناقص می‌ماند.`;
    case 'osint-analyst':
      return `${target.label} باید بین evidence تأییدشده و inference تفکیک روشن‌تری بگذارد؛ coverage gap فعلی برای این نتیجه‌گیری کافی نیست.`;
    case 'cyber-infrastructure-analyst':
      return `${target.label} dependencyها و cascadeهای زیرساختی را به اندازه کافی وارد برآورد نکرده است؛ همین blind spot می‌تواند timing سناریو را عوض کند.`;
    case 'social-sentiment-analyst':
      return `${target.label} واکنش اجتماعی و narrative swing را به‌عنوان multiplier بحران کم‌برآورد کرده است.`;
    case 'strategic-analyst':
      return `${target.label} روی یک domain متمرکز مانده و interaction میان بازیگران و futures رقیب را به اندازه کافی به تصویر نکشیده است.`;
    case 'scenario-moderator':
      return `${target.label} هنوز ambiguity را از disagreement تفکیک نکرده و سوال تصمیم‌پذیر کافی برای دور بعدی نساخته است.`;
    case 'executive-synthesizer':
      return `خروجی ${target.label} هنوز برای cadence تصمیم‌گیری اجرایی زیادی باز است و watchpointهای decisive کافی ندارد.`;
    default:
      return `تحلیل ${target.label} به challenge بیشتر نیاز دارد.`;
  }
}

function buildRevisedPosition(
  agent: WarRoomAgentDefinition,
  position: string,
  critiques: AssistantWarRoomAgent['critiques'],
  watchpoints: string[],
): string {
  const challenge = critiques[0];
  if (!challenge) return position;
  switch (agent.id) {
    case 'skeptic-red-team':
      return `${position} پس از دور challenge، تمرکز من از فرض‌های کلی به watchpointهای ${watchpoints.slice(0, 2).join(' / ')} منتقل می‌شود تا invalidation زودتر دیده شود.`;
    case 'executive-synthesizer':
      return `${position} پس از شنیدن challengeها، جمع‌بندی اجرایی باید به‌جای قطعیت، روی triggerهای decisive و مسیرهای جایگزین متمرکز بماند.`;
    default:
      return `${position} پس از challenge «${challenge.summary}»، موضع بازبینی‌شده این است که watchpointهای ${watchpoints.slice(0, 2).join(' / ')} برای تایید یا رد این مسیر تعیین‌کننده‌اند.`;
  }
}

function createPromptContext(
  input: WarRoomInput,
  scenarios: ScenarioEngineScenario[],
  anchorLabel: string,
  challengeIteration: number,
): WarRoomPromptContext {
  return {
    question: input.question,
    anchorLabel,
    mapContext: input.mapContext ?? null,
    activeScenarios: scenarios.slice(0, 4),
    sessionContext: input.sessionContext ?? null,
    recentSignals: input.mapContext?.nearbySignals ?? [],
    localContextPackets: input.localContextPackets ?? [],
    challengeIteration,
  };
}

function buildAgentScenarioSelections(
  definitions: WarRoomAgentDefinition[],
  scenarios: ScenarioEngineScenario[],
  metaOutput: MetaScenarioEngineOutput,
): WarRoomScenarioSelection[] {
  return definitions.map((definition) => {
    const scenario = pickScenarioForAgent(definition, scenarios, metaOutput);
    return {
      agent_id: definition.id,
      scenario_id: scenario.id,
      scenario_title: scenario.title,
    };
  });
}

function buildAgentCards(
  input: WarRoomInput,
  metaOutput: MetaScenarioEngineOutput,
  definitions: WarRoomAgentDefinition[],
  selections: WarRoomScenarioSelection[],
  scenarios: ScenarioEngineScenario[],
  challengeIteration: number,
): AssistantWarRoomAgent[] {
  const promptContext = createPromptContext(input, scenarios, selectionLabel(input.mapContext) || metaOutput.anchorLabel, challengeIteration);

  return definitions.map((definition) => {
    const selection = selections.find((item) => item.agent_id === definition.id);
    const scenario = scenarios.find((item) => item.id === selection?.scenario_id) ?? pickScenarioForAgent(definition, scenarios, metaOutput);
    const confidenceScore = confidenceForAgent(definition, scenario, metaOutput, input);
    const rolePrompt = definition.id === 'scenario-moderator'
      ? buildWarRoomModerationPrompt(definition, promptContext)
      : definition.id === 'executive-synthesizer'
        ? buildWarRoomSynthesisPrompt(definition, promptContext)
        : buildWarRoomAssessmentPrompt(definition, promptContext);
    return {
      id: definition.id,
      role: definition.role,
      label: definition.label,
      role_prompt: rolePrompt,
      position: buildPositionText(definition, scenario, input, metaOutput),
      confidence_score: confidenceScore,
      confidence_note: `${definition.role} این موضع را با اتکا به سناریوی «${scenario.title}» و coverage فعلی داده‌ها ثبت کرده است.`,
      supporting_points: buildSupportingPoints(definition, scenario, input, metaOutput),
      watchpoints: buildWatchpoints(definition, scenario, input, metaOutput),
      assumptions: buildAssumptions(definition, scenario, metaOutput),
      critiques: [],
    };
  });
}

function attachCritiques(
  agents: AssistantWarRoomAgent[],
  selections: WarRoomScenarioSelection[],
  scenarios: ScenarioEngineScenario[],
  metaOutput: MetaScenarioEngineOutput,
): AssistantWarRoomAgent[] {
  return agents.map((agent) => {
    const definition = getWarRoomAgent(agent.id as WarRoomAgentId);
    const selection = selections.find((item) => item.agent_id === agent.id);
    const scenario = scenarios.find((item) => item.id === selection?.scenario_id) ?? pickScenarioForAgent(definition, scenarios, metaOutput);
    const critiques = definition.challengeTargets.slice(0, 2).map((targetId, index) => {
      const targetAgent = agents.find((candidate) => candidate.id === targetId) ?? agents[(index + 1) % agents.length]!;
      return {
        target_agent_id: targetAgent.id,
        summary: buildCritiqueSummary(definition, targetAgent, scenario, metaOutput),
        marker: 'challenge' as const,
      };
    });
    return {
      ...agent,
      critiques,
      revised_position: buildRevisedPosition(definition, agent.position, critiques, agent.watchpoints),
    };
  });
}

function buildRoundPromptMaps(
  agents: AssistantWarRoomAgent[],
  scenarios: ScenarioEngineScenario[],
  input: WarRoomInput,
  challengeIterations: number,
): {
  assessment: Partial<Record<string, string>>;
  critique: Partial<Record<string, string>>;
  revision: Partial<Record<string, string>>;
  synthesis: Partial<Record<string, string>>;
} {
  const promptContext = createPromptContext(input, scenarios, selectionLabel(input.mapContext) || input.question, challengeIterations);
  const assessment: Partial<Record<string, string>> = {};
  const critique: Partial<Record<string, string>> = {};
  const revision: Partial<Record<string, string>> = {};
  const synthesis: Partial<Record<string, string>> = {};

  agents.forEach((agent) => {
    const definition = getWarRoomAgent(agent.id as WarRoomAgentId);
    assessment[agent.id] = agent.role_prompt;

    const targetAgentId = agent.critiques[0]?.target_agent_id;
    const targetAgent = targetAgentId ? getWarRoomAgent(targetAgentId as WarRoomAgentId) : null;
    critique[agent.id] = buildWarRoomCritiquePrompt(definition, {
      ...promptContext,
      targetAgent: targetAgent
        ? { id: targetAgent.id, role: targetAgent.role, label: targetAgent.label }
        : null,
    });
    revision[agent.id] = buildWarRoomRevisionPrompt(definition, promptContext);
    synthesis[agent.id] = agent.id === 'scenario-moderator'
      ? buildWarRoomModerationPrompt(definition, promptContext)
      : agent.id === 'executive-synthesizer'
        ? buildWarRoomSynthesisPrompt(definition, promptContext)
        : buildWarRoomRevisionPrompt(definition, promptContext);
  });

  return { assessment, critique, revision, synthesis };
}

function buildEvidenceMap(agents: AssistantWarRoomAgent[]): Partial<Record<string, string[]>> {
  return Object.fromEntries(agents.map((agent) => [
    agent.id,
    uniqueStrings([
      ...agent.supporting_points.slice(0, 3),
      ...agent.watchpoints.slice(0, 2),
      agent.assumptions[0] ? `assumption=${agent.assumptions[0]}` : undefined,
    ], 6),
  ]));
}

function buildConvergences(agents: AssistantWarRoomAgent[]): AssistantWarRoomConvergence[] {
  const watchpointMap = new Map<string, string[]>();
  agents.forEach((agent) => {
    agent.watchpoints.forEach((watchpoint) => {
      const bucket = watchpointMap.get(watchpoint) ?? [];
      bucket.push(agent.id);
      watchpointMap.set(watchpoint, bucket);
    });
  });
  return Array.from(watchpointMap.entries())
    .filter(([, agentIds]) => agentIds.length >= 3)
    .slice(0, 5)
    .map(([watchpoint, agentIds], index) => ({
      id: `convergence-${index + 1}`,
      title: `همگرایی بر سر ${watchpoint}`,
      summary: `${agentIds.length} عامل این watchpoint را برای پایش یا تصمیم‌گیری تعیین‌کننده دانسته‌اند.`,
      agent_ids: agentIds,
    }));
}

function buildDisagreements(agents: AssistantWarRoomAgent[]): AssistantWarRoomDisagreement[] {
  return agents
    .flatMap((agent, agentIndex) => agent.critiques.slice(0, 1).map((critique, critiqueIndex) => {
      const severity: AssistantProbabilityBand = critique.summary.includes('بیش از حد') || critique.summary.includes('کم‌برآورد')
        ? 'high'
        : 'medium';
      return {
        id: `disagreement-${agentIndex + 1}-${critiqueIndex + 1}`,
        title: `اختلاف ${agent.label} با ${agents.find((candidate) => candidate.id === critique.target_agent_id)?.label || critique.target_agent_id}`,
        summary: critique.summary,
        agent_ids: [agent.id, critique.target_agent_id],
        severity,
      };
    }))
    .slice(0, 6);
}

function buildUnresolvedUncertainties(
  agents: AssistantWarRoomAgent[],
  metaOutput: MetaScenarioEngineOutput,
): string[] {
  return uniqueStrings([
    ...agents.flatMap((agent) => agent.assumptions.slice(0, 1).map((item) => `اعتبار فرض «${item}» هنوز نهایی نیست.`)),
    ...metaOutput.black_swan_candidates.slice(0, 2).map((candidate) => candidate.uncertainty_note),
    ...metaOutput.scenario_conflicts.slice(0, 2).map((conflict) => `direction conflict «${conflict.id}» هنوز می‌تواند با ${conflict.decisive_indicators[0] || 'شاخص تازه'} جابه‌جا شود.`),
  ], 6);
}

function buildRound(id: string, title: string, stage: AssistantWarRoomRound['stage'], summary: string, entries: AssistantWarRoomRoundEntry[]): AssistantWarRoomRound {
  return { id, title, stage, summary, entries };
}

function buildRounds(
  input: WarRoomInput,
  agents: AssistantWarRoomAgent[],
  challengeIterations: number,
  convergences: AssistantWarRoomConvergence[],
  disagreements: AssistantWarRoomDisagreement[],
): AssistantWarRoomRound[] {
  const rounds: AssistantWarRoomRound[] = [
    buildRound(
      'round-1-assessment',
      'دور ۱: ارزیابی مستقل',
      'assessment',
      'هر عامل بدون اتکا به جمع‌بندی بقیه، assessment اولیه و watchpointهای خودش را ارائه می‌کند.',
      agents.map((agent) => ({
        agent_id: agent.id,
        label: agent.label,
        content: agent.position,
        target_agent_ids: [],
        markers: ['support'],
      })),
    ),
  ];

  for (let iteration = 0; iteration < challengeIterations; iteration += 1) {
    rounds.push(buildRound(
      `round-${(iteration * 2) + 2}-critique`,
      `دور ${(iteration * 2) + 2}: نقد و challenge`,
      'critique',
      'عامل‌ها assumptions، blind spotها و شکاف داده در مواضع دیگران را challenge می‌کنند.',
      agents.map((agent) => {
        const critique = agent.critiques[iteration] ?? agent.critiques[0];
        return {
          agent_id: agent.id,
          label: agent.label,
          content: critique?.summary || 'برای این دور challenge تازه‌ای ثبت نشده است.',
          target_agent_ids: critique ? [critique.target_agent_id] : [],
          markers: critique ? [critique.marker] : ['uncertainty'],
        };
      }),
    ));

    rounds.push(buildRound(
      `round-${(iteration * 2) + 3}-revision`,
      `دور ${(iteration * 2) + 3}: مواضع بازبینی‌شده`,
      'revision',
      'عامل‌ها بعد از challenge، موضع خود را revise می‌کنند و watchpointهای decisive را مشخص‌تر می‌سازند.',
      agents.map((agent) => ({
        agent_id: agent.id,
        label: agent.label,
        content: agent.revised_position || agent.position,
        target_agent_ids: agent.critiques[iteration] ? [agent.critiques[iteration]!.target_agent_id] : [],
        markers: ['revision'],
      })),
    ));
  }

  const moderator = agents.find((agent) => agent.id === 'scenario-moderator');
  const executive = agents.find((agent) => agent.id === 'executive-synthesizer');
  rounds.push(buildRound(
    `round-${(challengeIterations * 2) + 2}-synthesis`,
    'دور نهایی: synthesis',
    'synthesis',
    'Moderator و Executive Synthesizer convergences، disagreements و watchpointهای نهایی را صورت‌بندی می‌کنند.',
    [
      {
        agent_id: moderator?.id || 'scenario-moderator',
        label: moderator?.label || 'Scenario Moderator',
        content: `همگرایی‌های اصلی: ${convergences.slice(0, 2).map((item) => item.title).join(' | ') || 'همگرایی قوی ثبت نشد.'}\nاختلاف‌های اصلی: ${disagreements.slice(0, 2).map((item) => item.title).join(' | ') || 'اختلاف بحرانی ثبت نشد.'}`,
        target_agent_ids: [],
        markers: ['support', 'uncertainty'],
      },
      {
        agent_id: executive?.id || 'executive-synthesizer',
        label: executive?.label || 'Executive Synthesizer',
        content: executive?.revised_position || executive?.position || `سوال «${input.question}» اکنون باید با watchpointهای decisive و سناریوهای جایگزین پایش شود.`,
        target_agent_ids: [],
        markers: ['revision', 'support'],
      },
    ],
  ));

  return rounds;
}

function buildModeratorSummary(
  anchorLabel: string,
  convergences: AssistantWarRoomConvergence[],
  disagreements: AssistantWarRoomDisagreement[],
  unresolved: string[],
): string {
  return [
    `در ${anchorLabel}، اتاق چندعاملی نشان می‌دهد ${convergences[0]?.title || 'همگرایی محدود'} مهم‌ترین نقطه اشتراک است.`,
    disagreements[0] ? `${disagreements[0].title} مهم‌ترین شکاف تحلیلی باقی‌مانده است.` : 'شکاف تحلیلی غالبی دیده نشد.',
    unresolved[0] ? `ابهام اصلی: ${unresolved[0]}` : '',
  ].filter(Boolean).join(' ');
}

function buildExecutiveSummary(
  question: string,
  anchorLabel: string,
  agents: AssistantWarRoomAgent[],
  convergences: AssistantWarRoomConvergence[],
  disagreements: AssistantWarRoomDisagreement[],
): string {
  const topAgent = agents.find((agent) => agent.id === 'executive-synthesizer') ?? agents[0];
  return [
    `برای سوال «${question}» در ${anchorLabel}، جمع‌بندی اجرایی این است که ${topAgent?.position || 'چند future رقیب هم‌زمان فعال‌اند'}.`,
    convergences[0] ? `مهم‌ترین نقطه اجماع «${convergences[0].title}» است.` : '',
    disagreements[0] ? `باید اختلاف «${disagreements[0].title}» با cadence نزدیک پایش شود.` : '',
  ].filter(Boolean).join(' ');
}

function buildFinalSynthesis(
  anchorLabel: string,
  executiveSummary: string,
  moderatorSummary: string,
  watchpoints: string[],
): string {
  return [
    executiveSummary,
    moderatorSummary,
    watchpoints[0] ? `اولویت پایش بعدی در ${anchorLabel}: ${watchpoints.slice(0, 3).join(' / ')}.` : '',
  ].filter(Boolean).join(' ');
}

function buildContextPackets(
  anchorLabel: string,
  question: string,
  agents: AssistantWarRoomAgent[],
  convergences: AssistantWarRoomConvergence[],
  disagreements: AssistantWarRoomDisagreement[],
  finalSynthesis: string,
  qualityControls: AssistantWarRoomQualityControls,
): AssistantContextPacket[] {
  const baseId = `war-room:${slugify(`${anchorLabel}:${question}`)}`;
  return [
    {
      id: `${baseId}:summary`,
      title: `جمع‌بندی War Room برای ${anchorLabel}`,
      summary: finalSynthesis,
      content: [finalSynthesis, ...agents.slice(0, 3).map((agent) => `${agent.label}: ${agent.revised_position || agent.position}`)].join('\n\n'),
      sourceLabel: 'QADR110 War Room',
      sourceType: 'model',
      updatedAt: new Date().toISOString(),
      score: 0.71,
      tags: ['war-room', 'multi-agent'],
      provenance: {
        sourceIds: [`${baseId}:source`],
        evidenceIds: [`${baseId}:summary`],
      },
    },
    {
      id: `${baseId}:conflicts`,
      title: `اختلاف‌ها و همگرایی‌ها در ${anchorLabel}`,
      summary: `${convergences.length} همگرایی | ${disagreements.length} اختلاف`,
      content: [
        ...convergences.map((item) => `Convergence - ${item.title}: ${item.summary}`),
        ...disagreements.map((item) => `Disagreement - ${item.title}: ${item.summary}`),
        ...qualityControls.alerts.map((item) => `Quality - ${item}`),
      ].join('\n'),
      sourceLabel: 'QADR110 War Room',
      sourceType: 'model',
      updatedAt: new Date().toISOString(),
      score: 0.67,
      tags: ['war-room', 'debate'],
      provenance: {
        sourceIds: [`${baseId}:source`],
        evidenceIds: [`${baseId}:conflicts`],
      },
    },
  ];
}

function buildStructuredOutput(
  input: WarRoomInput,
  baseScenarioOutput: ScenarioEngineOutput,
  metaScenarioOutput: MetaScenarioEngineOutput,
  warRoom: AssistantWarRoomOutput,
  executiveSummary: string,
  finalSynthesis: string,
  unresolvedUncertainties: string[],
  recommendedWatchpoints: string[],
  executiveRecommendations: string[],
): AssistantStructuredOutput {
  return {
    ...baseScenarioOutput.structuredOutput,
    reportTitle: `اتاق چندعاملی: ${input.question}`,
    executiveSummary,
    observedFacts: {
      title: 'ورودی‌های اتاق چندعاملی',
      bullets: uniqueStrings([
        `عامل‌ها: ${warRoom.agents.length}`,
        `دورهای مناظره: ${warRoom.round_count}`,
        `سناریوهای پایه: ${baseScenarioOutput.scenarios.length}`,
        input.mapContext ? `anchor جغرافیایی: ${warRoom.anchor_label}` : undefined,
      ], 6),
      narrative: `War Room همه عامل‌ها را روی سوال مشترک «${input.question}» و کانون ${warRoom.anchor_label} هم‌راستا می‌کند تا disagreementها، blind spotها و watchpointهای decisive آشکار شوند.`,
      confidence: createConfidenceRecord(clamp(0.5 + (warRoom.convergences.length * 0.05)), 'این بخش از state machine مناظره و خروجی صریح عامل‌ها ساخته شده است.'),
    },
    analyticalInference: {
      title: 'مناظره چندعاملی',
      bullets: uniqueStrings([
        ...warRoom.convergences.slice(0, 3).map((item) => item.title),
        ...warRoom.disagreements.slice(0, 2).map((item) => item.title),
      ], 6),
      narrative: warRoom.moderator_summary,
      confidence: createConfidenceRecord(clamp(0.46 + (warRoom.disagreements.length * 0.03)), 'اعتماد این بخش از تقاطع عامل‌ها، signal coverage و میزان challenge متقابل برآورد شده است.'),
    },
    metaScenario: metaScenarioOutput.structuredOutput.metaScenario ?? baseScenarioOutput.structuredOutput.metaScenario,
    decisionSupport: baseScenarioOutput.structuredOutput.decisionSupport,
    warRoom,
    uncertainties: {
      title: 'عدم‌قطعیت‌های حل‌نشده',
      bullets: unresolvedUncertainties,
      narrative: 'حتی پس از debate چندعاملی، بخشی از ambiguity به کیفیت داده، رفتار بازیگران و weak signalها وابسته می‌ماند.',
      confidence: createConfidenceRecord(0.41, 'این بخش عمدا محافظه‌کارانه نگه داشته می‌شود، چون disagreementها باید traceable باقی بمانند.'),
    },
    recommendations: {
      title: 'اولویت‌های پایش و اقدام',
      bullets: uniqueStrings([
        ...executiveRecommendations,
        ...recommendedWatchpoints,
      ], 8),
      narrative: finalSynthesis,
      confidence: createConfidenceRecord(clamp(0.52 + (recommendedWatchpoints.length * 0.03)), 'پیشنهادها از watchpointهای مشترک و عامل‌های اجرایی استخراج شده‌اند.'),
    },
    resilienceNarrative: baseScenarioOutput.structuredOutput.resilienceNarrative,
    followUpSuggestions: uniqueStrings([
      ...baseScenarioOutput.structuredOutput.followUpSuggestions,
      `ردتیم نتیجه «${baseScenarioOutput.scenarios[0]?.title || 'سناریوی غالب'}» را دوباره اجرا کن.`,
      `watchpointهای ${warRoom.anchor_label} را با cadence کوتاه‌تر بازبینی کن.`,
      `اختلاف «${warRoom.disagreements[0]?.title || 'اصلی'}» را با داده تازه resolve کن.`,
    ], 6),
    scenarios: baseScenarioOutput.structuredOutput.scenarios,
    simulation: baseScenarioOutput.structuredOutput.simulation,
  };
}

export function runWarRoom(input: WarRoomInput): WarRoomOutput {
  const controls = resolveWarRoomControls({
    mode: input.mode,
    challengeIterations: input.challengeIterations,
    includedAgentIds: input.includedAgentIds,
    excludedAgentIds: input.excludedAgentIds,
  });
  const challengeIterations = controls.challengeIterations;
  const baseScenarioOutput = input.baseScenarioOutput ?? runScenarioEngine(input);
  const metaScenarioOutput = input.metaScenarioOutput ?? runMetaScenarioEngine({
    ...input,
    query: input.question,
    trigger: input.question,
    baseScenarioOutput,
  });
  const anchorLabel = selectionLabel(input.mapContext) || baseScenarioOutput.anchorLabel;
  const selectedDefinitions = selectWarRoomAgents(controls);
  const scenarioSelections = buildAgentScenarioSelections(selectedDefinitions, baseScenarioOutput.scenarios.slice(0, 5), metaScenarioOutput);
  const seededAgents = buildAgentCards(
    input,
    metaScenarioOutput,
    selectedDefinitions,
    scenarioSelections,
    baseScenarioOutput.scenarios.slice(0, 5),
    challengeIterations,
  );
  const agents = attachCritiques(seededAgents, scenarioSelections, baseScenarioOutput.scenarios.slice(0, 5), metaScenarioOutput);
  const convergences = buildConvergences(agents);
  const disagreements = buildDisagreements(agents);
  const unresolvedUncertainties = buildUnresolvedUncertainties(agents, metaScenarioOutput);
  const rounds = buildRounds(input, agents, challengeIterations, convergences, disagreements);
  const scenarioIntegration = buildWarRoomScenarioIntegration({
    scenarios: baseScenarioOutput.scenarios.slice(0, 5),
    agents,
    selections: scenarioSelections,
    disagreements,
    conflicts: metaScenarioOutput.scenario_conflicts,
    blackSwans: metaScenarioOutput.black_swan_candidates,
  });
  const recommendedWatchpoints = uniqueStrings([
    ...scenarioIntegration.updatedWatchpoints,
    ...agents.flatMap((agent) => agent.watchpoints),
    ...metaScenarioOutput.meta_scenarios.flatMap((item) => item.watchpoints),
    ...metaScenarioOutput.scenario_conflicts.flatMap((item) => item.decisive_indicators),
    ...metaScenarioOutput.black_swan_candidates.flatMap((item) => item.leading_indicators),
  ], 10);
  const moderatorSummary = buildModeratorSummary(anchorLabel, convergences, disagreements, unresolvedUncertainties);
  const executiveSummary = buildExecutiveSummary(input.question, anchorLabel, agents, convergences, disagreements);
  const finalSynthesis = buildFinalSynthesis(anchorLabel, executiveSummary, moderatorSummary, recommendedWatchpoints);
  const promptMaps = buildRoundPromptMaps(agents, baseScenarioOutput.scenarios.slice(0, 5), input, challengeIterations);
  const evidenceMap = buildEvidenceMap(agents);

  let debateState = createWarRoomDebateState({
    question: input.question,
    anchorLabel,
    controls,
    agents,
    startedAt: input.timeContext || new Date().toISOString(),
  });
  rounds.forEach((round, index) => {
    debateState = recordWarRoomRound(debateState, round, {
      roundIndex: index + 1,
      promptByAgentId: round.stage === 'assessment'
        ? promptMaps.assessment
        : round.stage === 'critique'
          ? promptMaps.critique
          : round.stage === 'revision'
            ? promptMaps.revision
            : promptMaps.synthesis,
      evidenceByAgentId: evidenceMap,
    });
  });
  debateState = transitionWarRoomState(debateState, {
    toStage: 'completed',
    roundIndex: rounds.length + 1,
    summary: 'Debate transcript تکمیل شد و synthesis نهایی ثبت شد.',
  });
  const disagreementMatrix = buildWarRoomDisagreementMatrix(agents, debateState.transcript);
  const qualityControls = evaluateWarRoomQuality({
    agents,
    transcript: debateState.transcript,
    disagreementsCount: disagreements.length,
    convergencesCount: convergences.length,
  });

  const warRoomOutput: AssistantWarRoomOutput = {
    question: input.question,
    anchor_label: anchorLabel,
    mode: controls.mode,
    active_agent_ids: agents.map((agent) => agent.id),
    excluded_agent_ids: controls.excludedAgentIds,
    round_count: rounds.length,
    agents,
    rounds,
    debate_transcript: debateState.transcript,
    replay_trace: debateState.replayTrace,
    disagreement_matrix: disagreementMatrix,
    quality_controls: qualityControls,
    disagreements,
    convergences,
    unresolved_uncertainties: unresolvedUncertainties,
    moderator_summary: moderatorSummary,
    executive_summary: executiveSummary,
    final_synthesis: finalSynthesis,
    scenario_ranking: scenarioIntegration.scenarioRanking,
    scenario_adjustments: scenarioIntegration.scenarioAdjustments,
    scenario_focus: scenarioIntegration.scenarioFocus,
    executive_recommendations: scenarioIntegration.executiveRecommendations,
    updated_watchpoints: scenarioIntegration.updatedWatchpoints,
    recommended_watchpoints: recommendedWatchpoints,
  };

  const structuredOutput = buildStructuredOutput(
    input,
    baseScenarioOutput,
    metaScenarioOutput,
    warRoomOutput,
    executiveSummary,
    finalSynthesis,
    unresolvedUncertainties,
    recommendedWatchpoints,
    scenarioIntegration.executiveRecommendations,
  );

  const agreementDensity = round(convergences.length / Math.max(1, agents.length));
  const disagreementDensity = round(disagreements.length / Math.max(1, agents.length));
  const signalCoverage = round((
    (input.localContextPackets?.length ?? 0)
    + (input.mapContext?.nearbySignals?.length ?? 0)
    + metaScenarioOutput.black_swan_candidates.length
  ) / 12);

  return {
    question: input.question,
    anchorLabel,
    mode: controls.mode,
    activeAgentIds: agents.map((agent) => agent.id),
    excludedAgentIds: controls.excludedAgentIds,
    roundCount: rounds.length,
    agents,
    rounds,
    debateTranscript: debateState.transcript,
    replayTrace: debateState.replayTrace,
    disagreementMatrix,
    qualityControls,
    disagreements,
    convergences,
    unresolvedUncertainties,
    moderatorSummary,
    executiveSummary,
    finalSynthesis,
    scenarioRanking: scenarioIntegration.scenarioRanking,
    scenarioAdjustments: scenarioIntegration.scenarioAdjustments,
    scenarioFocus: scenarioIntegration.scenarioFocus,
    executiveRecommendations: scenarioIntegration.executiveRecommendations,
    updatedWatchpoints: scenarioIntegration.updatedWatchpoints,
    recommendedWatchpoints,
    structuredOutput,
    contextPackets: buildContextPackets(anchorLabel, input.question, agents, convergences, disagreements, finalSynthesis, qualityControls),
    baseScenarioOutput,
    metaScenarioOutput,
    scoring: {
      agreementDensity,
      disagreementDensity,
      signalCoverage,
      evidenceBackedDisagreementRatio: qualityControls.evidence_backed_disagreement_ratio,
      challengeIterations,
    },
  };
}
