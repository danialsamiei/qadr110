import {
  createConfidenceRecord,
  type AssistantBlackSwanCandidate,
  type AssistantContextPacket,
  type AssistantScenario,
  type AssistantStructuredOutput,
} from '@/platform/ai/assistant-contracts';

import {
  runBlackSwanEngine,
  type BlackSwanEngineInput,
  type BlackSwanEngineOutput,
} from './black-swan-engine';
import {
  runMetaScenarioEngine,
  type MetaScenarioEngineInput,
  type MetaScenarioEngineOutput,
} from './meta-scenario-engine';
import {
  runScenarioEngine,
  type ScenarioEngineInput,
  type ScenarioEngineOutput,
  type ScenarioEngineScenario,
} from './scenario-engine';
import {
  runWarRoom,
  type WarRoomInput,
  type WarRoomOutput,
} from './war-room';

export interface StrategicForesightInput extends ScenarioEngineInput {
  question: string;
  includeWarRoom?: boolean;
  warRoomMode?: 'fast' | 'deep';
  baseScenarioOutput?: ScenarioEngineOutput | null;
  metaScenarioOutput?: MetaScenarioEngineOutput | null;
  blackSwanOutput?: BlackSwanEngineOutput | null;
  warRoomOutput?: WarRoomOutput | null;
}

export interface StrategicForesightFuture {
  id: string;
  title: string;
  type: 'dominant-scenario' | 'meta-scenario' | 'scenario-conflict' | 'black-swan';
  summary: string;
  whyItMatters: string;
  watchpoints: string[];
}

export interface StrategicForesightOutput {
  question: string;
  anchorLabel: string;
  includeWarRoom: boolean;
  executiveSummary: string;
  boardSummary: string[];
  dominantScenarios: ScenarioEngineScenario[];
  competingFutures: StrategicForesightFuture[];
  blackSwanCandidates: AssistantBlackSwanCandidate[];
  debateHighlights: string[];
  watchIndicators: string[];
  recommendedNextPrompts: string[];
  structuredOutput: AssistantStructuredOutput;
  contextPackets: AssistantContextPacket[];
  sourceSummary: string[];
  baseScenarioOutput: ScenarioEngineOutput;
  metaScenarioOutput: MetaScenarioEngineOutput;
  blackSwanOutput: BlackSwanEngineOutput;
  warRoomOutput: WarRoomOutput | null;
}

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function rankScenario(scenario: ScenarioEngineScenario): number {
  return clamp(
    ((scenario.strategic_relevance ?? 0.5) * 0.34)
    + ((scenario.probability_score ?? 0.5) * 0.32)
    + ((scenario.impact_score ?? 0.5) * 0.21)
    + ((scenario.confidence_score ?? 0.5) * 0.13),
  );
}

function uniqueStrings(values: Array<string | undefined>, maxItems = 8): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, maxItems);
}

function shouldLaunchWarRoom(
  input: StrategicForesightInput,
  baseScenarioOutput: ScenarioEngineOutput,
  metaScenarioOutput: MetaScenarioEngineOutput,
): boolean {
  if (typeof input.includeWarRoom === 'boolean') return input.includeWarRoom;
  const query = `${input.question} ${input.query ?? ''}`.toLowerCase();
  if (
    query.includes('war room')
    || query.includes('debate')
    || query.includes('red team')
    || query.includes('چندعاملی')
    || query.includes('مناظره')
    || query.includes('ردتیم')
    || query.includes('اتاق')
  ) {
    return true;
  }
  const dataPressure = baseScenarioOutput.dataRichness >= 0.34;
  const conflictPressure = metaScenarioOutput.scenario_conflicts.length > 0 || metaScenarioOutput.black_swan_candidates.length > 0;
  const mapPressure = (input.mapContext?.nearbySignals?.length ?? 0) >= 2;
  const sessionPressure = (input.sessionContext?.reusableInsights?.length ?? 0) >= 2;
  return dataPressure && (conflictPressure || mapPressure || sessionPressure);
}

function mapScenarioToAssistant(scenario: ScenarioEngineScenario): AssistantScenario {
  return {
    id: scenario.id,
    title: scenario.title,
    probability: scenario.probability,
    probability_score: scenario.probability_score,
    timeframe: scenario.time_horizon,
    time_horizon: scenario.time_horizon,
    description: scenario.description,
    indicators: [...scenario.indicators_to_watch],
    indicators_to_watch: [...scenario.indicators_to_watch],
    drivers: [...scenario.drivers],
    causal_chain: scenario.causal_chain.map((step) => ({
      stage: step.stage,
      summary: step.summary,
      affected_domains: [...step.affected_domains],
    })),
    mitigation_options: [...scenario.mitigation_options],
    impact_level: scenario.impact_level,
    impact_score: scenario.impact_score,
    uncertainty_level: scenario.uncertainty_level,
    second_order_effects: [...scenario.second_order_effects],
    cross_domain_impacts: Object.fromEntries(
      Object.entries(scenario.cross_domain_impacts ?? {}).map(([domain, values]) => [domain, [...values]]),
    ),
    strategic_relevance: scenario.strategic_relevance,
    likelihood_score: scenario.likelihood_score,
    confidence: createConfidenceRecord(
      scenario.confidence_score ?? 0.56,
      'این سناریو در حالت پیش‌نگری راهبردی از موتور سناریو و شواهد زمینه‌ای مشتق شده است.',
    ),
  };
}

function buildCompetingFutures(
  dominantScenarios: ScenarioEngineScenario[],
  metaScenarioOutput: MetaScenarioEngineOutput,
  blackSwanOutput: BlackSwanEngineOutput,
): StrategicForesightFuture[] {
  const scenarioFutures = dominantScenarios.slice(0, 2).map((scenario) => ({
    id: `dominant:${scenario.id}`,
    title: scenario.title,
    type: 'dominant-scenario' as const,
    summary: scenario.description,
    whyItMatters: `این سناریو با امتیاز راهبردی ${Math.round((rankScenario(scenario) || 0.5) * 100)}% فعلا در battlefield آینده‌ها وزن بالاتری دارد.`,
    watchpoints: uniqueStrings([...scenario.indicators_to_watch, ...scenario.drivers], 4),
  }));
  const metaFutures = metaScenarioOutput.meta_scenarios.slice(0, 2).map((item) => ({
    id: item.id,
    title: item.title,
    type: 'meta-scenario' as const,
    summary: item.summary,
    whyItMatters: `رابطه ${item.relationship_type} میان سناریوهای ${item.source_scenarios.slice(0, 2).join(' و ')} می‌تواند future غالب را جابه‌جا کند.`,
    watchpoints: [...item.watchpoints.slice(0, 4)],
  }));
  const conflictFutures = metaScenarioOutput.scenario_conflicts.slice(0, 1).map((item) => ({
    id: item.id,
    title: item.summary,
    type: 'scenario-conflict' as const,
    summary: `تعارض ${item.left_scenario_id} / ${item.right_scenario_id} با شدت ${Math.round(item.interaction_strength * 100)}%.`,
    whyItMatters: 'این conflict می‌تواند redistribution احتمال در سناریوهای پایه ایجاد کند.',
    watchpoints: [...item.decisive_indicators.slice(0, 4)],
  }));
  const blackSwans = blackSwanOutput.candidates.slice(0, 1).map((item) => ({
    id: item.id,
    title: item.title,
    type: 'black-swan' as const,
    summary: item.summary,
    whyItMatters: item.why_it_matters,
    watchpoints: [...item.watchpoints.slice(0, 4)],
  }));
  return [...scenarioFutures, ...metaFutures, ...conflictFutures, ...blackSwans].slice(0, 6);
}

function buildDebateHighlights(warRoomOutput: WarRoomOutput | null): string[] {
  if (!warRoomOutput) return [];
  return uniqueStrings([
    warRoomOutput.executiveSummary,
    warRoomOutput.scenarioFocus.scenario_shift_summary,
    warRoomOutput.disagreements[0]?.summary,
    warRoomOutput.convergences[0]?.summary,
    warRoomOutput.executiveRecommendations[0],
  ], 5);
}

function buildWatchIndicators(
  dominantScenarios: ScenarioEngineScenario[],
  metaScenarioOutput: MetaScenarioEngineOutput,
  blackSwanOutput: BlackSwanEngineOutput,
  warRoomOutput: WarRoomOutput | null,
): string[] {
  return uniqueStrings([
    ...dominantScenarios.flatMap((scenario) => scenario.indicators_to_watch),
    ...metaScenarioOutput.meta_scenarios.flatMap((item) => item.watchpoints),
    ...metaScenarioOutput.scenario_conflicts.flatMap((item) => item.decisive_indicators),
    ...blackSwanOutput.watchlist.map((item) => item.label),
    ...blackSwanOutput.candidates.flatMap((item) => item.leading_indicators),
    ...(warRoomOutput?.updatedWatchpoints ?? warRoomOutput?.recommendedWatchpoints ?? []),
  ], 12);
}

function buildRecommendedNextPrompts(
  anchorLabel: string,
  dominantScenarios: ScenarioEngineScenario[],
  metaScenarioOutput: MetaScenarioEngineOutput,
  blackSwanOutput: BlackSwanEngineOutput,
  warRoomOutput: WarRoomOutput | null,
): string[] {
  const dominant = dominantScenarios[0];
  const underappreciated = warRoomOutput?.scenarioFocus.underappreciated_scenario_title;
  const topBlackSwan = blackSwanOutput.candidates[0];
  const keyConflict = metaScenarioOutput.scenario_conflicts[0];
  return uniqueStrings([
    dominant ? `اگر «${dominant.title}» ظرف ۷۲ ساعت تقویت شود، کدام شاخص‌ها زودتر signal می‌دهند؟` : undefined,
    dominant ? `چه چیزی می‌تواند سناریوی غالب «${dominant.title}» را در ${anchorLabel} تضعیف کند؟` : undefined,
    underappreciated ? `چرا سناریوی «${underappreciated}» کمتر از حد لازم دیده شده و چه زمانی باید promote شود؟` : undefined,
    topBlackSwan ? `اگر «${topBlackSwan.title}» از حالت weak signal خارج شود، کدام فرض پایه می‌شکند؟` : undefined,
    keyConflict ? `تعارض سناریویی «${keyConflict.summary}» چگونه ranking آینده‌ها را بازتوزیع می‌کند؟` : undefined,
    `برای ${anchorLabel} watchpointهای بحرانی را به cadence 24h / 72h تقسیم کن.`,
    `برای ${anchorLabel} یک جمع‌بندی board-ready از futures رقیب و اقدام‌های دفاعی بده.`,
  ], 7);
}

function buildObservedFactBullets(
  baseScenarioOutput: ScenarioEngineOutput,
  metaScenarioOutput: MetaScenarioEngineOutput,
  blackSwanOutput: BlackSwanEngineOutput,
): string[] {
  return uniqueStrings([
    ...baseScenarioOutput.sourceSummary.slice(0, 3),
    baseScenarioOutput.scenarios[0] ? `سناریوی غالب فعلی: ${baseScenarioOutput.scenarios[0].title}` : undefined,
    metaScenarioOutput.scenario_conflicts[0] ? `تعارض کلیدی: ${metaScenarioOutput.scenario_conflicts[0].summary}` : undefined,
    blackSwanOutput.candidates[0] ? `قوی‌سیاه اصلی: ${blackSwanOutput.candidates[0].title}` : undefined,
  ], 6);
}

function buildBoardSummary(
  anchorLabel: string,
  dominantScenarios: ScenarioEngineScenario[],
  competingFutures: StrategicForesightFuture[],
  blackSwanOutput: BlackSwanEngineOutput,
  warRoomOutput: WarRoomOutput | null,
  watchIndicators: string[],
): string[] {
  return uniqueStrings([
    dominantScenarios[0] ? `سناریوی غالب در ${anchorLabel}: ${dominantScenarios[0].title}` : undefined,
    competingFutures[0] ? `نزدیک‌ترین future رقیب: ${competingFutures[0].title}` : undefined,
    blackSwanOutput.candidates[0] ? `تهدید low-probability/high-impact: ${blackSwanOutput.candidates[0].title}` : undefined,
    warRoomOutput?.scenarioFocus.scenario_shift_summary,
    watchIndicators[0] ? `شاخص پایش اول: ${watchIndicators[0]}` : undefined,
  ], 5);
}

function buildRecommendations(
  metaScenarioOutput: MetaScenarioEngineOutput,
  blackSwanOutput: BlackSwanEngineOutput,
  warRoomOutput: WarRoomOutput | null,
): string[] {
  return uniqueStrings([
    ...(warRoomOutput?.executiveRecommendations ?? []),
    ...metaScenarioOutput.meta_scenarios.flatMap((item) => item.recommended_actions),
    ...blackSwanOutput.candidates.flatMap((item) => item.recommended_actions),
  ], 8);
}

function buildAnalyticalInferenceBullets(
  competingFutures: StrategicForesightFuture[],
  warRoomOutput: WarRoomOutput | null,
): string[] {
  return uniqueStrings([
    competingFutures[0]?.whyItMatters,
    competingFutures[1]?.whyItMatters,
    warRoomOutput?.finalSynthesis,
    warRoomOutput?.scenarioFocus.scenario_shift_summary,
  ], 6);
}

function buildUncertaintyBullets(
  baseScenarioOutput: ScenarioEngineOutput,
  blackSwanOutput: BlackSwanEngineOutput,
  warRoomOutput: WarRoomOutput | null,
): string[] {
  return uniqueStrings([
    baseScenarioOutput.dataRichness < 0.4 ? 'غنای داده برای بعضی سناریوها هنوز محدود است و ranking باید محافظه‌کارانه تفسیر شود.' : undefined,
    blackSwanOutput.candidates[0]?.uncertainty_note,
    warRoomOutput?.unresolvedUncertainties[0],
    warRoomOutput?.qualityControls.shallow_agreement ? 'بخشی از اجماع عامل‌ها ممکن است هنوز سطحی باشد.' : undefined,
  ], 6);
}

function buildResilienceBullets(baseScenarioOutput: ScenarioEngineOutput): string[] {
  return uniqueStrings([
    baseScenarioOutput.decisionSupport?.strategic_insights[0],
    baseScenarioOutput.decisionSupport?.leverage_points[0]?.title,
    baseScenarioOutput.decisionSupport?.critical_uncertainties[0]?.title,
    baseScenarioOutput.scenarios[0]?.second_order_effects[0],
  ], 5);
}

function buildStrategicForesightStructuredOutput(
  input: StrategicForesightInput,
  dominantScenarios: ScenarioEngineScenario[],
  competingFutures: StrategicForesightFuture[],
  blackSwanOutput: BlackSwanEngineOutput,
  watchIndicators: string[],
  recommendedNextPrompts: string[],
  boardSummary: string[],
  baseScenarioOutput: ScenarioEngineOutput,
  metaScenarioOutput: MetaScenarioEngineOutput,
  warRoomOutput: WarRoomOutput | null,
): AssistantStructuredOutput {
  const recommendations = buildRecommendations(metaScenarioOutput, blackSwanOutput, warRoomOutput);
  const analyticalInference = buildAnalyticalInferenceBullets(competingFutures, warRoomOutput);
  const uncertainties = buildUncertaintyBullets(baseScenarioOutput, blackSwanOutput, warRoomOutput);
  const resilienceBullets = buildResilienceBullets(baseScenarioOutput);

  return {
    reportTitle: `پیش‌نگری راهبردی: ${baseScenarioOutput.anchorLabel}`,
    executiveSummary: boardSummary.join(' | '),
    observedFacts: {
      title: 'واقعیت‌های مشاهده‌شده',
      bullets: buildObservedFactBullets(baseScenarioOutput, metaScenarioOutput, blackSwanOutput),
      narrative: `برای ${baseScenarioOutput.anchorLabel}، داده‌های سناریویی، متا‌سناریویی و قوی‌سیاه در یک لایه یکپارچه جمع شد.`,
      confidence: createConfidenceRecord(
        clamp(0.48 + (baseScenarioOutput.dataRichness * 0.28)),
        'این بخش از شواهد گردآوری‌شده، signal fusion و context نقشه ساخته شده است.',
      ),
    },
    analyticalInference: {
      title: 'تحلیل مرتبه‌دوم',
      bullets: analyticalInference,
      narrative: `پرسش «${input.question}» در حالت پیش‌نگری راهبردی با ترکیب futures غالب، futures رقیب و تهدیدهای قوی‌سیاه بازخوانی شد.`,
      confidence: createConfidenceRecord(
        clamp(0.44 + ((warRoomOutput ? 0.14 : 0) + (metaScenarioOutput.meta_scenarios.length > 0 ? 0.1 : 0))),
        'این inference از ترکیب سناریو، متا‌سناریو و مناظره عامل‌ها ساخته شده و باید با داده تازه دوباره بازبینی شود.',
      ),
    },
    scenarios: dominantScenarios.map(mapScenarioToAssistant),
    decisionSupport: baseScenarioOutput.decisionSupport,
    metaScenario: metaScenarioOutput.structuredOutput.metaScenario,
    warRoom: warRoomOutput?.structuredOutput.warRoom,
    uncertainties: {
      title: 'عدم‌قطعیت‌ها',
      bullets: uncertainties,
      narrative: 'بخش uncertainty عمدا candidateهای کم‌احتمال اما پراثر و نقاط کور tree غالب را برجسته می‌کند.',
      confidence: createConfidenceRecord(0.58, 'در این بخش uncertaintyها به‌صورت محافظه‌کارانه گزارش می‌شوند.'),
    },
    recommendations: {
      title: 'اقدام‌های پیشنهادی',
      bullets: recommendations.length > 0 ? recommendations : ['watchpointهای اصلی را با cadence کوتاه‌تر پایش کن.'],
      narrative: 'اقدام‌ها صرفا تصمیم‌یار دفاعی هستند و بر پایش، کاهش ریسک و آماده‌سازی تمرکز دارند.',
      confidence: createConfidenceRecord(0.6, 'این توصیه‌ها از ranking سناریوها، watchpointها و synthesis عامل‌ها مشتق شده‌اند.'),
    },
    resilienceNarrative: {
      title: 'روایت تاب‌آوری و spillover',
      bullets: resilienceBullets.length > 0 ? resilienceBullets : watchIndicators.slice(0, 4),
      narrative: `در ${baseScenarioOutput.anchorLabel} اثرات سناریویی باید در ابعاد تاب‌آوری، زیرساخت، اقتصاد و افکار عمومی به‌صورت هم‌زمان پایش شوند.`,
      confidence: createConfidenceRecord(0.54, 'این روایت از decision-support سناریو و indicatorهای cross-domain ساخته شده است.'),
    },
    followUpSuggestions: recommendedNextPrompts,
  };
}

export function runStrategicForesight(input: StrategicForesightInput): StrategicForesightOutput {
  const scenarioInput: ScenarioEngineInput = {
    trigger: input.trigger || input.question,
    query: input.query ?? input.question,
    mapContext: input.mapContext ?? null,
    localContextPackets: [...(input.localContextPackets ?? [])],
    sessionContext: input.sessionContext ?? null,
    timeContext: input.timeContext,
    maxScenarios: input.maxScenarios ?? 5,
  };
  const baseScenarioOutput = input.baseScenarioOutput ?? runScenarioEngine(scenarioInput);
  const metaInput: MetaScenarioEngineInput = {
    ...scenarioInput,
    trigger: input.question,
    query: input.question,
    baseScenarioOutput,
  };
  const metaScenarioOutput = input.metaScenarioOutput ?? runMetaScenarioEngine(metaInput);
  const blackSwanInput: BlackSwanEngineInput = {
    ...scenarioInput,
    trigger: input.question,
    query: input.question,
    baseScenarioOutput,
  };
  const blackSwanOutput = input.blackSwanOutput ?? runBlackSwanEngine(blackSwanInput);
  const includeWarRoom = shouldLaunchWarRoom(input, baseScenarioOutput, metaScenarioOutput);
  const warRoomInput: WarRoomInput = {
    ...scenarioInput,
    question: input.question,
    trigger: input.question,
    query: input.question,
    baseScenarioOutput,
    metaScenarioOutput,
    mode: input.warRoomMode ?? 'deep',
  };
  const warRoomOutput = includeWarRoom
    ? (input.warRoomOutput ?? runWarRoom(warRoomInput))
    : null;

  const dominantScenarios = [...baseScenarioOutput.scenarios]
    .sort((left, right) => rankScenario(right) - rankScenario(left))
    .slice(0, 3);
  const competingFutures = buildCompetingFutures(dominantScenarios, metaScenarioOutput, blackSwanOutput);
  const debateHighlights = buildDebateHighlights(warRoomOutput);
  const watchIndicators = buildWatchIndicators(dominantScenarios, metaScenarioOutput, blackSwanOutput, warRoomOutput);
  const recommendedNextPrompts = buildRecommendedNextPrompts(
    baseScenarioOutput.anchorLabel,
    dominantScenarios,
    metaScenarioOutput,
    blackSwanOutput,
    warRoomOutput,
  );
  const boardSummary = buildBoardSummary(
    baseScenarioOutput.anchorLabel,
    dominantScenarios,
    competingFutures,
    blackSwanOutput,
    warRoomOutput,
    watchIndicators,
  );
  const executiveSummary = [
    boardSummary[0],
    boardSummary[1],
    boardSummary[2],
  ].filter(Boolean).join(' | ');
  const structuredOutput = buildStrategicForesightStructuredOutput(
    input,
    dominantScenarios,
    competingFutures,
    blackSwanOutput,
    watchIndicators,
    recommendedNextPrompts,
    boardSummary,
    baseScenarioOutput,
    metaScenarioOutput,
    warRoomOutput,
  );

  return {
    question: input.question,
    anchorLabel: baseScenarioOutput.anchorLabel,
    includeWarRoom,
    executiveSummary,
    boardSummary,
    dominantScenarios,
    competingFutures,
    blackSwanCandidates: blackSwanOutput.candidates.slice(0, 4),
    debateHighlights,
    watchIndicators,
    recommendedNextPrompts,
    structuredOutput,
    contextPackets: uniqueContextPackets([
      ...baseScenarioOutput.contextPackets,
      ...metaScenarioOutput.contextPackets,
      ...blackSwanOutput.contextPackets,
      ...(warRoomOutput?.contextPackets ?? []),
    ]),
    sourceSummary: uniqueStrings([
      ...baseScenarioOutput.sourceSummary,
      ...metaScenarioOutput.higher_order_insights,
      ...debateHighlights,
    ], 10),
    baseScenarioOutput,
    metaScenarioOutput,
    blackSwanOutput,
    warRoomOutput,
  };
}

function uniqueContextPackets(packets: AssistantContextPacket[]): AssistantContextPacket[] {
  const seen = new Set<string>();
  return packets.filter((packet) => {
    const key = `${packet.id}|${packet.sourceUrl || ''}|${packet.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
