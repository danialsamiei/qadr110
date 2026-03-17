import {
  createConfidenceRecord,
  type AssistantContextPacket,
  type AssistantMetaScenario,
  type AssistantMetaScenarioOutput,
  type AssistantProbabilityBand,
  type AssistantStructuredOutput,
  type AssistantBlackSwanCandidate,
  type AssistantScenarioConflict,
  type AssistantImpactLevel,
  type AssistantUncertaintyLevel,
} from '@/platform/ai/assistant-contracts';

import {
  runScenarioEngine,
  type ScenarioDomain,
  type ScenarioEngineInput,
  type ScenarioEngineOutput,
  type ScenarioEngineScenario,
} from './scenario-engine';
import { runBlackSwanEngine } from './black-swan-engine';

export interface MetaScenarioEngineInput extends ScenarioEngineInput {
  baseScenarioOutput?: ScenarioEngineOutput | null;
  maxMetaScenarios?: number;
}

export interface MetaScenarioEngineOutput {
  trigger: string;
  anchorLabel: string;
  meta_scenarios: AssistantMetaScenario[];
  scenario_conflicts: AssistantScenarioConflict[];
  black_swan_candidates: AssistantBlackSwanCandidate[];
  higher_order_insights: string[];
  structuredOutput: AssistantStructuredOutput;
  contextPackets: AssistantContextPacket[];
  scoring: {
    evaluatedPairs: number;
    contradictionSignals: number;
    weakSignalCount: number;
    evidenceDiversity: number;
  };
}

type ScenarioDirection = 'escalatory' | 'stabilizing' | 'neutral';

const ESCALATORY_HINTS = [
  'escalat', 'conflict', 'disrupt', 'block', 'shock', 'collapse', 'outage', 'riot', 'attack', 'sanction',
  'تشدید', 'درگیری', 'اختلال', 'انسداد', 'شوک', 'فروپاشی', 'قطعی', 'اعتراض', 'حمله', 'تحریم',
];

const STABILIZING_HINTS = [
  'stabil', 'de-escalat', 'managed', 'contain', 'recovery', 'calm', 'backchannel',
  'ثبات', 'کاهش تنش', 'مدیریت', 'مهار', 'بازیابی', 'آرام', 'کاهش',
];

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Number(clamp(value).toFixed(2));
}

function uniqueStrings(values: Array<string | undefined>, maxItems = 8): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, maxItems);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function probabilityScore(value: ScenarioEngineScenario): number {
  if (typeof value.probability_score === 'number') return clamp(value.probability_score);
  if (value.probability === 'high') return 0.76;
  if (value.probability === 'low') return 0.24;
  return 0.52;
}

function impactScore(value: ScenarioEngineScenario): number {
  if (typeof value.impact_score === 'number') return clamp(value.impact_score);
  if (value.impact_level === 'critical') return 0.92;
  if (value.impact_level === 'high') return 0.72;
  if (value.impact_level === 'low') return 0.22;
  return 0.48;
}

function uncertaintyScore(value: ScenarioEngineScenario): number {
  if (value.uncertainty_level === 'high') return 0.76;
  if (value.uncertainty_level === 'low') return 0.24;
  return 0.5;
}

function toProbabilityBand(score: number): AssistantProbabilityBand {
  if (score >= 0.7) return 'high';
  if (score >= 0.36) return 'medium';
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

function tokenize(value: string): Set<string> {
  const matches = value.toLowerCase().match(/[a-z0-9\u0600-\u06ff]{3,}/g) ?? [];
  return new Set(matches);
}

function overlapRatio(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union > 0 ? intersection / union : 0;
}

function scenarioCorpus(scenario: ScenarioEngineScenario): string {
  return [
    scenario.id,
    scenario.title,
    scenario.description,
    ...scenario.drivers,
    ...scenario.indicators_to_watch,
    ...scenario.second_order_effects,
    ...Object.values(scenario.cross_domain_impacts ?? {}).flat(),
  ].join(' ');
}

function scenarioDomains(scenario: ScenarioEngineScenario): ScenarioDomain[] {
  const domains = new Set<ScenarioDomain>();
  Object.entries(scenario.cross_domain_impacts ?? {}).forEach(([domain, values]) => {
    if (Array.isArray(values) && values.length > 0) {
      domains.add(domain as ScenarioDomain);
    }
  });
  scenario.causal_chain.forEach((step) => step.affected_domains.forEach((domain) => domains.add(domain)));
  return Array.from(domains);
}

function domainLabel(domain: ScenarioDomain): string {
  if (domain === 'geopolitics') return 'ژئوپلیتیک';
  if (domain === 'economics') return 'اقتصاد';
  if (domain === 'infrastructure') return 'زیرساخت';
  if (domain === 'public_sentiment') return 'افکار عمومی';
  return 'سایبری';
}

function scenarioDirection(scenario: ScenarioEngineScenario): ScenarioDirection {
  const corpus = scenarioCorpus(scenario);
  const lower = corpus.toLowerCase();
  const escalatoryHits = ESCALATORY_HINTS.filter((hint) => lower.includes(hint)).length;
  const stabilizingHits = STABILIZING_HINTS.filter((hint) => lower.includes(hint)).length;
  if (scenario.id.includes('de-escalation') || stabilizingHits > escalatoryHits) return 'stabilizing';
  if (escalatoryHits > stabilizingHits) return 'escalatory';
  return 'neutral';
}

function evidenceCorpus(input: MetaScenarioEngineInput, baseOutput: ScenarioEngineOutput): string {
  return [
    input.query ?? '',
    input.trigger,
    ...baseOutput.sourceSummary,
    ...(input.localContextPackets ?? []).map((packet) => `${packet.title} ${packet.summary} ${packet.content}`),
    ...(input.mapContext?.nearbySignals ?? []).map((signal) => `${signal.label} ${signal.kind}`),
    ...(input.mapContext?.selectedEntities ?? []),
    ...(input.mapContext?.geopoliticalContext ?? []),
    ...(input.sessionContext?.reusableInsights ?? []).slice(-4).map((insight) => insight.summary),
  ].join(' ');
}

function supportScore(scenario: ScenarioEngineScenario, evidenceTokens: Set<string>): number {
  const scenarioTokens = tokenize(scenarioCorpus(scenario));
  return overlapRatio(scenarioTokens, evidenceTokens);
}

function sharedItems(left: string[], right: string[], maxItems = 4): string[] {
  const rightSet = new Set(right.map((item) => item.trim()).filter(Boolean));
  return left.filter((item) => rightSet.has(item.trim())).slice(0, maxItems);
}

function relationshipForPair(
  left: ScenarioEngineScenario,
  right: ScenarioEngineScenario,
  evidenceTokens: Set<string>,
): {
  relationship: AssistantMetaScenario['relationship_type'] | null;
  strength: number;
  contradiction: number;
  overlap: number;
  direction: string;
} {
  const tokenOverlap = overlapRatio(tokenize(scenarioCorpus(left)), tokenize(scenarioCorpus(right)));
  const domainOverlap = overlapRatio(new Set(scenarioDomains(left)), new Set(scenarioDomains(right)));
  const indicatorOverlap = overlapRatio(new Set(left.indicators_to_watch), new Set(right.indicators_to_watch));
  const supportDelta = Math.abs(supportScore(left, evidenceTokens) - supportScore(right, evidenceTokens));
  const leftDirection = scenarioDirection(left);
  const rightDirection = scenarioDirection(right);
  const contradiction = leftDirection !== rightDirection && leftDirection !== 'neutral' && rightDirection !== 'neutral'
    ? clamp((tokenOverlap * 0.45) + (domainOverlap * 0.35) + 0.2)
    : clamp(supportDelta * 0.2);
  const strength = clamp((tokenOverlap * 0.34) + (domainOverlap * 0.28) + (indicatorOverlap * 0.2) + ((1 - supportDelta) * 0.18));

  if (contradiction >= 0.44) {
    return {
      relationship: leftDirection === 'stabilizing' || rightDirection === 'stabilizing' ? 'suppressing' : 'competing',
      strength,
      contradiction,
      overlap: tokenOverlap,
      direction: supportScore(left, evidenceTokens) >= supportScore(right, evidenceTokens) ? `toward:${left.id}` : `toward:${right.id}`,
    };
  }
  if (strength >= 0.46 && tokenOverlap >= 0.22) {
    return {
      relationship: leftDirection === rightDirection && leftDirection !== 'neutral' ? 'amplifying' : 'converging',
      strength,
      contradiction,
      overlap: tokenOverlap,
      direction: 'balanced',
    };
  }
  if (strength >= 0.26) {
    return {
      relationship: 'converging',
      strength,
      contradiction,
      overlap: tokenOverlap,
      direction: 'balanced',
    };
  }
  return {
    relationship: null,
    strength,
    contradiction,
    overlap: tokenOverlap,
    direction: 'balanced',
  };
}

function buildProbabilityRedistribution(
  left: ScenarioEngineScenario,
  right: ScenarioEngineScenario,
  interaction: ReturnType<typeof relationshipForPair>,
  evidenceTokens: Set<string>,
): Record<string, number> {
  const leftBase = probabilityScore(left) + (supportScore(left, evidenceTokens) * 0.16);
  const rightBase = probabilityScore(right) + (supportScore(right, evidenceTokens) * 0.16);
  const leftAdjusted = clamp(
    leftBase + (interaction.direction === `toward:${left.id}` ? 0.08 : 0) - (interaction.relationship === 'suppressing' && interaction.direction === `toward:${right.id}` ? 0.1 : 0),
  );
  const rightAdjusted = clamp(
    rightBase + (interaction.direction === `toward:${right.id}` ? 0.08 : 0) - (interaction.relationship === 'suppressing' && interaction.direction === `toward:${left.id}` ? 0.1 : 0),
  );
  const sum = Math.max(0.001, leftAdjusted + rightAdjusted);
  return {
    [left.id]: round(leftAdjusted / sum),
    [right.id]: round(rightAdjusted / sum),
  };
}

function buildMetaScenario(
  left: ScenarioEngineScenario,
  right: ScenarioEngineScenario,
  relationship: NonNullable<ReturnType<typeof relationshipForPair>['relationship']>,
  strength: number,
  anchorLabel: string,
): AssistantMetaScenario {
  const sharedDrivers = sharedItems(left.drivers, right.drivers, 3);
  const sharedIndicators = sharedItems(left.indicators_to_watch, right.indicators_to_watch, 3);
  const dependencies = uniqueStrings([
    ...sharedDrivers,
    ...sharedIndicators,
    ...scenarioDomains(left).filter((domain) => scenarioDomains(right).includes(domain)).map(domainLabel),
  ], 5);
  const combinedProbabilityScore = clamp(
    ((probabilityScore(left) + probabilityScore(right)) / 2)
    + (relationship === 'amplifying' ? strength * 0.18 : relationship === 'converging' ? strength * 0.08 : relationship === 'suppressing' ? -strength * 0.08 : -strength * 0.04),
  );
  const combinedImpactScore = clamp(
    Math.max(impactScore(left), impactScore(right))
    + (relationship === 'amplifying' ? strength * 0.12 : relationship === 'competing' ? strength * 0.06 : 0),
  );
  const uncertainty = clamp(((uncertaintyScore(left) + uncertaintyScore(right)) / 2) + (relationship === 'competing' || relationship === 'suppressing' ? 0.12 : 0.04));
  const watchpoints = uniqueStrings([
    ...left.indicators_to_watch.slice(0, 2),
    ...right.indicators_to_watch.slice(0, 2),
    ...dependencies.map((item) => `وابستگی: ${item}`),
  ], 6);
  const implications = uniqueStrings([
    relationship === 'amplifying'
      ? `اگر هر دو مسیر هم‌زمان فعال بمانند، ${anchorLabel} با cascade چنددامنه‌ای شدیدتری روبه‌رو می‌شود.`
      : relationship === 'suppressing'
        ? `رقابت بین دو مسیر می‌تواند picture تحلیلی ${anchorLabel} را دوپاره و نیاز به راستی‌آزمایی سریع‌تر ایجاد کند.`
        : relationship === 'competing'
          ? `در ${anchorLabel} آینده‌ها برای plausibility رقابت می‌کنند و هر تغییر کوچک در شاخص‌ها می‌تواند winner را عوض کند.`
          : `در ${anchorLabel} این دو مسیر به‌جای حذف یکدیگر، یک meta-pattern همگرا می‌سازند.`,
    ...Object.values(left.cross_domain_impacts ?? {}).flat().slice(0, 1),
    ...Object.values(right.cross_domain_impacts ?? {}).flat().slice(0, 1),
  ], 4);
  const recommendedActions = uniqueStrings([
    ...left.mitigation_options.slice(0, 2),
    ...right.mitigation_options.slice(0, 2),
    relationship === 'competing' || relationship === 'suppressing'
      ? 'شاخص‌های تعیین‌کننده winner/loser را با cadence کوتاه‌تر پایش کن.'
      : 'وابستگی‌های مشترک این دو مسیر را در playbookهای دفاعی تثبیت کن.',
  ], 5);

  return {
    id: `meta-${left.id}-${right.id}`,
    title: relationship === 'amplifying'
      ? `هم‌افزایی «${left.title}» و «${right.title}»`
      : relationship === 'suppressing'
        ? `فشار متقابل «${left.title}» و «${right.title}»`
        : relationship === 'competing'
          ? `جنگ سناریویی بین «${left.title}» و «${right.title}»`
          : `همگرایی «${left.title}» و «${right.title}»`,
    source_scenarios: [left.id, right.id],
    relationship_type: relationship,
    summary: relationship === 'amplifying'
      ? `این دو سناریو از مسیر driverها و شاخص‌های مشترک یکدیگر را تقویت می‌کنند و احتمال شکل‌گیری meta-scenario در ${anchorLabel} را بالا می‌برند.`
      : relationship === 'suppressing'
        ? `یکی از این سناریوها با بالا رفتن شاخص‌های خاص می‌تواند دیگری را تضعیف کند و distribution احتمال را در ${anchorLabel} جابه‌جا کند.`
        : relationship === 'competing'
          ? `این دو سناریو برای plausibility رقابت می‌کنند و evidenceهای جدید می‌توانند winner را سریع عوض کنند.`
          : `این دو سناریو با وجود تفاوت‌های تاکتیکی، در سطح راهبردی به یک meta-pattern مشترک همگرا می‌شوند.`,
    combined_probability: toProbabilityBand(combinedProbabilityScore),
    combined_probability_score: round(combinedProbabilityScore),
    impact_level: toImpactLevel(combinedImpactScore),
    uncertainty_level: toUncertaintyLevel(uncertainty),
    critical_dependencies: dependencies,
    trigger_indicators: sharedIndicators.length > 0 ? sharedIndicators : uniqueStrings([...left.indicators_to_watch, ...right.indicators_to_watch], 4),
    watchpoints,
    strategic_implications: implications,
    recommended_actions: recommendedActions,
  };
}

function buildScenarioConflict(
  left: ScenarioEngineScenario,
  right: ScenarioEngineScenario,
  interaction: ReturnType<typeof relationshipForPair>,
  anchorLabel: string,
  evidenceTokens: Set<string>,
): AssistantScenarioConflict {
  const redistribution = buildProbabilityRedistribution(left, right, interaction, evidenceTokens);
  return {
    id: `conflict-${left.id}-${right.id}`,
    left_scenario_id: left.id,
    right_scenario_id: right.id,
    relationship_type: interaction.relationship === 'suppressing' ? 'suppressing' : 'competing',
    interaction_strength: round(interaction.strength),
    direction: interaction.direction,
    summary: interaction.relationship === 'suppressing'
      ? `در ${anchorLabel} شاخص‌های تازه می‌توانند یکی از دو مسیر «${left.title}» یا «${right.title}» را suppress کنند و دومی را جلو بیندازند.`
      : `در ${anchorLabel} دو آینده «${left.title}» و «${right.title}» برای plausibility رقابت می‌کنند و redistribution احتمال پویا است.`,
    probability_redistribution: redistribution,
    decisive_indicators: uniqueStrings([
      ...left.indicators_to_watch.slice(0, 2),
      ...right.indicators_to_watch.slice(0, 2),
    ], 4),
  };
}

function weakSignalPackets(input: MetaScenarioEngineInput): AssistantContextPacket[] {
  return (input.localContextPackets ?? []).filter((packet) => packet.score <= 0.58).slice(0, 5);
}

function buildBlackSwans(
  input: MetaScenarioEngineInput,
  baseOutput: ScenarioEngineOutput,
  conflicts: AssistantScenarioConflict[],
): AssistantBlackSwanCandidate[] {
  const engine = runBlackSwanEngine({
    ...input,
    baseScenarioOutput: baseOutput,
    maxCandidates: Math.min(input.maxMetaScenarios ?? 5, Math.max(2, conflicts.length + 2)),
  });
  return engine.candidates;
}

function buildHigherOrderInsights(
  baseOutput: ScenarioEngineOutput,
  metaScenarios: AssistantMetaScenario[],
  conflicts: AssistantScenarioConflict[],
  blackSwans: AssistantBlackSwanCandidate[],
): string[] {
  return uniqueStrings([
    metaScenarios[0]
      ? `مهم‌ترین meta-scenario فعلی «${metaScenarios[0].title}» است که نشان می‌دهد باید چند سناریوی پایه به‌صورت bundle تحلیل شوند.`
      : undefined,
    conflicts[0]
      ? `اصلی‌ترین scenario war فعلی بین «${conflicts[0].left_scenario_id}» و «${conflicts[0].right_scenario_id}» است و redistribution احتمال آن باید جداگانه پایش شود.`
      : undefined,
    blackSwans[0]
      ? `قوی سیاه «${blackSwans[0].title}» از tree فعلی بیرون می‌زند و فرض‌های پایه را زیر سوال می‌برد.`
      : undefined,
    `در ${baseOutput.anchorLabel}، تصویر راهبردی فقط با ranking سناریوهای منفرد فهم نمی‌شود و interactionها بخش مهمی از تحلیل هستند.`,
  ], 5);
}

function buildMetaStructuredOutput(
  input: MetaScenarioEngineInput,
  baseOutput: ScenarioEngineOutput,
  metaScenarios: AssistantMetaScenario[],
  conflicts: AssistantScenarioConflict[],
  blackSwans: AssistantBlackSwanCandidate[],
  higherOrderInsights: string[],
): AssistantStructuredOutput {
  const aggregatedActions = uniqueStrings([
    ...metaScenarios.flatMap((item) => item.recommended_actions),
    ...blackSwans.flatMap((item) => item.recommended_actions),
  ], 6);
  const metaOutput: AssistantMetaScenarioOutput = {
    executive_summary: metaScenarios[0]
      ? `لایه متا-سناریو نشان می‌دهد در ${baseOutput.anchorLabel} «${metaScenarios[0].title}» مهم‌ترین interaction مرتبه‌دوم است و باید هم‌زمان با scenario warها و Black Swan candidateها پایش شود.`
      : `در ${baseOutput.anchorLabel} interaction مرتبه‌دوم قوی کشف نشد، اما weak signalها و uncertaintyها همچنان باید زیر نظر باشند.`,
    higher_order_insights: higherOrderInsights,
    meta_scenarios: metaScenarios,
    scenario_conflicts: conflicts,
    black_swan_candidates: blackSwans,
  };

  return {
    ...baseOutput.structuredOutput,
    reportTitle: `موتور متا-سناریو: ${baseOutput.trigger}`,
    executiveSummary: metaOutput.executive_summary,
    observedFacts: {
      title: 'ورودی‌های متا-سناریو',
      bullets: uniqueStrings([
        `سناریوهای ورودی: ${baseOutput.scenarios.length}`,
        `interactionهای معتبر: ${metaScenarios.length}`,
        conflicts.length > 0 ? `scenario warهای فعال: ${conflicts.length}` : undefined,
        blackSwans.length > 0 ? `Black Swan candidateها: ${blackSwans.length}` : undefined,
        input.mapContext ? `anchor جغرافیایی: ${baseOutput.anchorLabel}` : undefined,
      ], 6),
      narrative: `این لایه با تکیه بر سناریوهای پایه، کانتکست نقشه، سیگنال‌های OSINT و حافظه جلسه interactionهای مرتبه‌دوم را در ${baseOutput.anchorLabel} استخراج می‌کند.`,
      confidence: createConfidenceRecord(clamp(0.48 + (metaScenarios.length * 0.05) + (conflicts.length * 0.03)), 'این بخش از سناریوهای پایه و scoring صریح interaction ساخته شده است.'),
    },
    analyticalInference: {
      title: 'بینش مرتبه‌دوم',
      bullets: higherOrderInsights,
      narrative: 'متا-سناریوها برای فهمیدن این‌که کدام futures به‌هم نیرو می‌دهند، کدام futures همدیگر را سرکوب می‌کنند و کجا tree فعلی ممکن است blind spot داشته باشد، طراحی شده‌اند.',
      confidence: createConfidenceRecord(clamp(0.46 + (metaScenarios.length * 0.04)), 'اعتماد این بخش از strength interactionها، تنوع شواهد و وجود conflictهای روشن برآورد شده است.'),
    },
    metaScenario: metaOutput,
    uncertainties: {
      title: 'عدم‌قطعیت‌های متا-سناریویی',
      bullets: uniqueStrings([
        conflicts[0] ? 'redistribution احتمال در scenario warها می‌تواند سریع عوض شود.' : undefined,
        blackSwans[0] ? 'Black Swan candidateها ذاتاً uncertainty بالا و weak signal دارند.' : undefined,
        'interactionهای ضعیف‌تر ممکن است با ورود داده تازه ناگهان تقویت یا حذف شوند.',
      ], 5),
      narrative: 'سطح متا نسبت به ranking سناریوهای منفرد ناپایدارتر است، چون به کیفیت interactionها و evidenceهای متعارض حساس است.',
      confidence: createConfidenceRecord(0.42, 'این بخش عمداً محافظه‌کارانه است چون تعامل‌های مرتبه‌دوم ماهیتاً uncertainty بیشتری دارند.'),
    },
    recommendations: {
      title: 'اقدام‌های پیشنهادی متا-سناریویی',
      bullets: aggregatedActions,
      narrative: 'پیشنهادها بر تثبیت watchpointهای تعیین‌کننده، مهار cascadeهای مشترک و رصد futureهای رقابتی متمرکز هستند.',
      confidence: createConfidenceRecord(clamp(0.5 + (aggregatedActions.length * 0.02)), 'اقدام‌ها از recommended actionهای interactionها و Black Swan candidateها تجمیع شده‌اند.'),
    },
    resilienceNarrative: {
      title: 'تاب‌آوری در سطح interaction',
      bullets: uniqueStrings([
        metaScenarios[0]?.strategic_implications[0],
        conflicts[0] ? 'تاب‌آوری به توانایی تمایز سریع بین futureهای رقیب وابسته است.' : undefined,
        blackSwans[0] ? 'تاب‌آوری شناختی و سازمانی برای شناسایی futureهای خارج از tree موجود حیاتی است.' : undefined,
      ], 4),
      narrative: `در ${baseOutput.anchorLabel} تاب‌آوری فقط به مهار یک سناریوی منفرد وابسته نیست؛ بلکه به توانایی سامانه برای دیدن interactionها، conflictها و futureهای غیرخطی هم وابسته است.`,
      confidence: createConfidenceRecord(0.5, 'روایت تاب‌آوری از interactionهای برتر و candidateهای غیرخطی جمع‌بندی شده است.'),
    },
    followUpSuggestions: uniqueStrings([
      ...baseOutput.structuredOutput.followUpSuggestions,
      metaScenarios[0] ? `watchpointهای «${metaScenarios[0].title}» را پایش کن.` : undefined,
      conflicts[0] ? 'redistribution احتمال در scenario warها را دوباره محاسبه کن.' : undefined,
      blackSwans[0] ? `فرض‌های شکسته‌ی «${blackSwans[0].title}» را راستی‌آزمایی کن.` : undefined,
    ], 6),
  };
}

function buildMetaContextPackets(
  baseOutput: ScenarioEngineOutput,
  metaScenarios: AssistantMetaScenario[],
  blackSwans: AssistantBlackSwanCandidate[],
): AssistantContextPacket[] {
  const baseId = `meta-scenario:${slugify(`${baseOutput.trigger}:${baseOutput.anchorLabel}`)}`;
  const packets: AssistantContextPacket[] = [{
    id: `${baseId}:summary`,
    title: `خلاصه متا-سناریو برای ${baseOutput.anchorLabel}`,
    summary: metaScenarios[0]?.summary ?? `هیچ interaction مرتبه‌دوم غالبی برای ${baseOutput.anchorLabel} ثبت نشد.`,
    content: [
      ...metaScenarios.slice(0, 3).map((item) => `${item.title}: ${item.summary}`),
      ...blackSwans.slice(0, 2).map((item) => `${item.title}: ${item.summary}`),
    ].join('\n\n'),
    sourceLabel: 'QADR110 Meta Scenario Engine',
    sourceType: 'model',
    updatedAt: new Date().toISOString(),
    score: 0.74,
    tags: ['meta-scenario', 'second-order', 'defensive'],
    provenance: {
      sourceIds: [`${baseId}:source`],
      evidenceIds: [`${baseId}:summary`],
      derivedFromIds: baseOutput.contextPackets.map((packet) => packet.id),
    },
  }];

  metaScenarios.slice(0, 3).forEach((item) => {
    packets.push({
      id: `${baseId}:${item.id}`,
      title: item.title,
      summary: `${item.summary} | احتمال ${item.combined_probability} | اثر ${item.impact_level}`,
      content: [
        item.summary,
        `Dependencies: ${item.critical_dependencies.join(' | ')}`,
        `Watchpoints: ${item.watchpoints.join(' | ')}`,
      ].join('\n'),
      sourceLabel: 'QADR110 Meta Scenario Engine',
      sourceType: 'model',
      updatedAt: new Date().toISOString(),
      score: clamp((item.combined_probability_score ?? 0.5) * 0.7 + 0.2),
      tags: ['meta-scenario', item.relationship_type],
      provenance: {
        sourceIds: [`${baseId}:source`],
        evidenceIds: [item.id],
        derivedFromIds: baseOutput.contextPackets.map((packet) => packet.id),
      },
    });
  });

  return packets.slice(0, 5);
}

export function runMetaScenarioEngine(input: MetaScenarioEngineInput): MetaScenarioEngineOutput {
  const baseOutput = input.baseScenarioOutput ?? runScenarioEngine(input);
  const rankedScenarios = [...baseOutput.scenarios]
    .sort((left, right) => {
      const leftRank = ((left.strategic_relevance ?? 0.5) * 0.4) + (probabilityScore(left) * 0.35) + (impactScore(left) * 0.25);
      const rightRank = ((right.strategic_relevance ?? 0.5) * 0.4) + (probabilityScore(right) * 0.35) + (impactScore(right) * 0.25);
      return rightRank - leftRank;
    })
    .slice(0, Math.max(3, Math.min(5, input.maxMetaScenarios ?? 5)));
  const evidenceTokens = tokenize(evidenceCorpus(input, baseOutput));

  const metaScenarios: AssistantMetaScenario[] = [];
  const conflicts: AssistantScenarioConflict[] = [];
  let evaluatedPairs = 0;
  let contradictionSignals = 0;

  for (let i = 0; i < rankedScenarios.length; i += 1) {
    for (let j = i + 1; j < rankedScenarios.length; j += 1) {
      const left = rankedScenarios[i]!;
      const right = rankedScenarios[j]!;
      const interaction = relationshipForPair(left, right, evidenceTokens);
      evaluatedPairs += 1;
      if (!interaction.relationship) continue;
      if (interaction.contradiction >= 0.44) contradictionSignals += 1;
      metaScenarios.push(buildMetaScenario(left, right, interaction.relationship, interaction.strength, baseOutput.anchorLabel));
      if (interaction.relationship === 'competing' || interaction.relationship === 'suppressing') {
        conflicts.push(buildScenarioConflict(left, right, interaction, baseOutput.anchorLabel, evidenceTokens));
      }
    }
  }

  const orderedMetaScenarios = metaScenarios
    .sort((left, right) => (right.combined_probability_score ?? 0.5) - (left.combined_probability_score ?? 0.5))
    .slice(0, input.maxMetaScenarios ?? 6);
  const blackSwans = buildBlackSwans(input, baseOutput, conflicts);
  const higherOrderInsights = buildHigherOrderInsights(baseOutput, orderedMetaScenarios, conflicts, blackSwans);
  const structuredOutput = buildMetaStructuredOutput(input, baseOutput, orderedMetaScenarios, conflicts, blackSwans, higherOrderInsights);

  return {
    trigger: baseOutput.trigger,
    anchorLabel: baseOutput.anchorLabel,
    meta_scenarios: orderedMetaScenarios,
    scenario_conflicts: conflicts.slice(0, 6),
    black_swan_candidates: blackSwans,
    higher_order_insights: higherOrderInsights,
    structuredOutput,
    contextPackets: buildMetaContextPackets(baseOutput, orderedMetaScenarios, blackSwans),
    scoring: {
      evaluatedPairs,
      contradictionSignals,
      weakSignalCount: weakSignalPackets(input).length,
      evidenceDiversity: uniqueStrings((input.localContextPackets ?? []).map((packet) => packet.sourceLabel), 12).length,
    },
  };
}
