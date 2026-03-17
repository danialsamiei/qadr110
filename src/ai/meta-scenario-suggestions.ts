import type { AssistantDomainMode } from '@/platform/ai/assistant-contracts';
import type { AiTaskClass } from '@/platform/ai/contracts';
import type { AssistantSessionContext } from '@/platform/ai/orchestrator-contracts';
import type { MapContextEnvelope } from '@/platform/operations/map-context';

import type { MetaScenarioEngineOutput } from './meta-scenario-engine';
import { runMetaScenarioEngine } from './meta-scenario-engine';
import type { ScenarioGraphOutput } from './scenario-graph';
import { buildScenarioGraph } from './scenario-graph';
import type {
  ScenarioEngineDriftRecord,
  ScenarioEngineScenario,
  ScenarioEngineState,
} from './scenario-engine';

export type MetaScenarioSuggestionCategory =
  | 'fusion'
  | 'conflict'
  | 'black-swan'
  | 'strategy'
  | 'uncertainty';

export interface MetaScenarioSuggestionScoreBreakdown {
  base: number;
  scenario: number;
  conflict: number;
  blackSwan: number;
  map: number;
  session: number;
  drift: number;
  total: number;
}

export interface MetaScenarioSuggestionItem {
  id: string;
  category: MetaScenarioSuggestionCategory;
  label: string;
  promptText: string;
  whyItMatters: string;
  expectedAnalyticValue: string;
  score: number;
  scoreBreakdown: MetaScenarioSuggestionScoreBreakdown;
  taskClass: AiTaskClass;
  domainMode: AssistantDomainMode;
}

export interface MetaScenarioSuggestionContextSnapshot {
  anchorLabel: string;
  mapContext: MapContextEnvelope | null;
  sessionContext: AssistantSessionContext | null;
  activeLayers: string[];
  selectedEntities: string[];
  focusQuery?: string;
  activeScenarios: ScenarioEngineScenario[];
  driftRecords: ScenarioEngineDriftRecord[];
  metaOutput: MetaScenarioEngineOutput;
  graph: ScenarioGraphOutput;
  dominantScenarioTitle?: string;
  fragileScenarioTitle?: string;
  dominantMetaTitle?: string;
  dominantConflictSummary?: string;
  topBlackSwanTitle?: string;
  maxBlackSwanSeverity: number;
}

interface CandidateTemplate {
  id: string;
  category: MetaScenarioSuggestionCategory;
  label: string;
  taskClass: AiTaskClass;
  domainMode: AssistantDomainMode;
  baseScore: number;
  keywords: string[];
  layerHints: string[];
  prefersFusion?: boolean;
  prefersConflict?: boolean;
  prefersBlackSwan?: boolean;
  prefersFragility?: boolean;
  prefersReplacement?: boolean;
  driftBias: Array<ScenarioEngineDriftRecord['direction']>;
  promptText: (context: MetaScenarioSuggestionContextSnapshot) => string;
  expectedAnalyticValue: (context: MetaScenarioSuggestionContextSnapshot) => string;
}

const MIN_RESULTS = 5;
const MAX_RESULTS = 10;

const CATEGORY_LABELS: Record<MetaScenarioSuggestionCategory, string> = {
  fusion: 'همجوشی',
  conflict: 'تعارض',
  'black-swan': 'قوی سیاه',
  strategy: 'راهبرد',
  uncertainty: 'عدم‌قطعیت',
};

const META_SCENARIO_SUGGESTION_TEMPLATES: CandidateTemplate[] = [
  {
    id: 'fusion-reinforcement',
    category: 'fusion',
    label: 'سناریوهای تقویت‌کننده',
    taskClass: 'scenario-analysis',
    domainMode: 'scenario-planning',
    baseScore: 42,
    keywords: ['fusion', 'reinforce', 'amplify', 'هم‌افزایی', 'تقویت'],
    layerHints: ['gdelt', 'polymarket', 'military', 'ais'],
    prefersFusion: true,
    driftBias: ['increase', 'emerged'],
    promptText: (context) => `کدام دو سناریوی فعلی در ${context.anchorLabel} بیشترین هم‌افزایی را دارند و از چه driverها یا شاخص‌های مشترکی نیرو می‌گیرند؟`,
    expectedAnalyticValue: (context) => `این پرسش bundleهای آینده را به‌جای سناریوهای منفرد آشکار می‌کند و برای ${context.anchorLabel} watchpointهای مشترک را بیرون می‌کشد.`,
  },
  {
    id: 'fusion-hidden-dependency',
    category: 'fusion',
    label: 'وابستگی پنهان',
    taskClass: 'scenario-analysis',
    domainMode: 'scenario-planning',
    baseScore: 38,
    keywords: ['dependency', 'hidden', 'link', 'وابستگی', 'پنهان', 'رابطه'],
    layerHints: ['roadTraffic', 'outages', 'waterways', 'economic'],
    prefersFusion: true,
    driftBias: ['increase', 'emerged', 'stabilized'],
    promptText: (context) => `چه dependency پنهانی بین دو ریسک یا دو سناریوی اصلی ${context.anchorLabel} وجود دارد و اگر این dependency بشکند چه چیزی تغییر می‌کند؟`,
    expectedAnalyticValue: (context) => `این تحلیل نقاط coupling میان ریسک‌ها را برای ${context.anchorLabel} روشن می‌کند و blind spotهای structural را نمایان می‌سازد.`,
  },
  {
    id: 'conflict-dominance',
    category: 'conflict',
    label: 'برنده جنگ سناریو',
    taskClass: 'scenario-analysis',
    domainMode: 'scenario-planning',
    baseScore: 44,
    keywords: ['conflict', 'dominance', 'winner', 'تعارض', 'غلبه', 'برنده'],
    layerHints: ['gdelt', 'polymarket', 'osint'],
    prefersConflict: true,
    driftBias: ['increase', 'decrease', 'emerged'],
    promptText: (context) => `در جنگ سناریویی فعلی ${context.anchorLabel}، کدام سناریو برای explanatory dominance جلوتر است و کدام شاخص winner را تعیین می‌کند؟`,
    expectedAnalyticValue: () => 'این پرسش توزیع احتمال بین futures رقیب را شفاف می‌کند و به analyst می‌گوید کدام signalها باید برای winner/loser بودن پایش شوند.',
  },
  {
    id: 'conflict-fragility-oil-spike',
    category: 'conflict',
    label: 'شکنندگی در شوک نفت',
    taskClass: 'forecasting',
    domainMode: 'predictive-analysis',
    baseScore: 40,
    keywords: ['fragile', 'oil', 'price', 'شکننده', 'نفت', 'قیمت'],
    layerHints: ['polymarket', 'economic', 'ais', 'waterways'],
    prefersConflict: true,
    prefersFragility: true,
    driftBias: ['increase', 'emerged'],
    promptText: (context) => `اگر قیمت نفت جهش کند، کدام سناریوی ${context.anchorLabel} شکننده‌ترین است و این ضعف چگونه به نفع سناریوی رقیب عمل می‌کند؟`,
    expectedAnalyticValue: (context) => `این تحلیل حساسیت سناریوها به shockهای بیرونی را نشان می‌دهد و replacement pathهای محتمل را برای ${context.anchorLabel} آشکار می‌کند.`,
  },
  {
    id: 'black-swan-invalidator',
    category: 'black-swan',
    label: 'قوی سیاه نامعتبرکننده',
    taskClass: 'scenario-analysis',
    domainMode: 'scenario-planning',
    baseScore: 46,
    keywords: ['black swan', 'invalidate', 'dominant', 'قوی سیاه', 'نامعتبر', 'غالب'],
    layerHints: ['gdelt', 'cyberThreats', 'outages', 'polymarket'],
    prefersBlackSwan: true,
    driftBias: ['increase', 'emerged'],
    promptText: (context) => `چه قوی سیاهی می‌تواند پیش‌بینی غالب ${context.anchorLabel} را نامعتبر کند و اولین نشانه‌های قابل پایش آن چیست؟`,
    expectedAnalyticValue: () => 'این پرسش failure modeهای forecast غالب را آشکار می‌کند و واچ‌لیست قوی‌سیاه را از سطح generic به شاخص‌های عملیاتی تبدیل می‌کند.',
  },
  {
    id: 'black-swan-assumption-reversal',
    category: 'black-swan',
    label: 'وارونگی فرض پنهان',
    taskClass: 'scenario-analysis',
    domainMode: 'scenario-planning',
    baseScore: 42,
    keywords: ['assumption', 'reverse', 'hidden', 'فرض', 'وارونگی', 'پنهان'],
    layerHints: ['gdelt', 'osint', 'cyberThreats'],
    prefersBlackSwan: true,
    prefersReplacement: true,
    driftBias: ['emerged', 'increase'],
    promptText: (context) => `اگر فرض پنهان اصلی پشت سناریوی غالب ${context.anchorLabel} معکوس شود، کدام future جایگزین فعال می‌شود و چه چیزی آن را تغذیه می‌کند؟`,
    expectedAnalyticValue: () => 'این تحلیل adversarial futureها را روی میز می‌آورد و نشان می‌دهد کدام assumptionها بیشترین leverage را بر ranking فعلی دارند.',
  },
  {
    id: 'strategy-leverage-point',
    category: 'strategy',
    label: 'نقطه اهرمی مشترک',
    taskClass: 'report-generation',
    domainMode: 'scenario-planning',
    baseScore: 39,
    keywords: ['leverage', 'strategy', 'mitigation', 'اهرم', 'راهبرد', 'مهار'],
    layerHints: ['roadTraffic', 'outages', 'economic', 'military'],
    prefersFusion: true,
    prefersConflict: true,
    driftBias: ['increase', 'stabilized'],
    promptText: (context) => `کدام leverage point یا اقدام دفاعی می‌تواند چند سناریوی فعال ${context.anchorLabel} را هم‌زمان تضعیف یا مهار کند؟`,
    expectedAnalyticValue: () => 'این پرسش analyst را از ranking سناریوها به actionability می‌برد و نقاطی را پیدا می‌کند که روی چند future هم‌زمان اثر می‌گذارند.',
  },
  {
    id: 'uncertainty-replacement',
    category: 'uncertainty',
    label: 'جانشین سناریوی اصلی',
    taskClass: 'scenario-analysis',
    domainMode: 'predictive-analysis',
    baseScore: 43,
    keywords: ['replace', 'fallback', 'uncertainty', 'جایگزین', 'جانشین', 'عدم‌قطعیت'],
    layerHints: ['gdelt', 'polymarket', 'osint'],
    prefersReplacement: true,
    prefersConflict: true,
    driftBias: ['decrease', 'emerged', 'increase'],
    promptText: (context) => `اگر سناریوی اصلی ${context.anchorLabel} شکست بخورد، چه چیزی جای آن را می‌گیرد و evidence replacement از کجا می‌آید؟`,
    expectedAnalyticValue: () => 'این تحلیل replacement pathها را زودتر از failure کامل baseline بیرون می‌کشد و برای تغییر ranking آماده‌سازی می‌کند.',
  },
  {
    id: 'uncertainty-ranking-gap',
    category: 'uncertainty',
    label: 'شکاف تعیین‌کننده ranking',
    taskClass: 'deduction',
    domainMode: 'scenario-planning',
    baseScore: 37,
    keywords: ['gap', 'ranking', 'uncertainty', 'blind spot', 'شکاف', 'رتبه‌بندی', 'نقطه کور'],
    layerHints: ['osint', 'gdelt', 'polymarket', 'outages'],
    prefersBlackSwan: true,
    driftBias: ['emerged', 'stabilized', 'increase'],
    promptText: (context) => `کدام uncertainty یا gap داده اکنون بیشترین ظرفیت را برای جابه‌جایی ranking آینده‌های ${context.anchorLabel} دارد؟`,
    expectedAnalyticValue: () => 'این پرسش به analyst نشان می‌دهد کدام شکاف داده‌ای اگر پر شود، بیشترین تغییر را در confidence و اولویت‌بندی سناریوها ایجاد می‌کند.',
  },
];

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function uniqueStrings(values: Array<string | undefined>, maxItems = 8): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, maxItems);
}

function overlapCount(needles: string[], haystack: string[]): number {
  const normalizedHaystack = haystack.map((item) => item.toLowerCase());
  return needles.filter((needle) => normalizedHaystack.some((candidate) => candidate.includes(needle.toLowerCase()))).length;
}

function sessionTokens(sessionContext: AssistantSessionContext | null): string[] {
  if (!sessionContext) return [];
  return [
    ...sessionContext.intentHistory.slice(-4).flatMap((item) => [item.query, item.inferredIntent]),
    ...sessionContext.reusableInsights.slice(-4).map((item) => item.summary),
    ...(sessionContext.activeIntentSummary ? [sessionContext.activeIntentSummary] : []),
  ].filter(Boolean);
}

function groupPreferenceScore(
  template: CandidateTemplate,
  context: MetaScenarioSuggestionContextSnapshot,
): number {
  let score = Math.min(16, context.activeScenarios.length * 3);
  if (template.prefersFusion) {
    score += Math.min(12, context.metaOutput.meta_scenarios.length * 5);
  }
  if (template.prefersConflict) {
    score += Math.min(12, context.metaOutput.scenario_conflicts.length * 6);
  }
  if (template.prefersBlackSwan) {
    score += Math.min(14, context.metaOutput.black_swan_candidates.length * 5 + context.maxBlackSwanSeverity * 8);
  }
  if (template.prefersFragility && context.fragileScenarioTitle) {
    score += 6;
  }
  if (template.prefersReplacement && context.metaOutput.scenario_conflicts.length > 0) {
    score += 6;
  }
  return Math.min(28, score);
}

function conflictScore(
  template: CandidateTemplate,
  context: MetaScenarioSuggestionContextSnapshot,
): number {
  const conflictCount = context.metaOutput.scenario_conflicts.length;
  const unstableCount = context.graph.unstableRegions.length;
  if (!template.prefersConflict) {
    return Math.min(6, conflictCount + unstableCount);
  }
  return Math.min(20, (conflictCount * 6) + (unstableCount * 4));
}

function blackSwanScore(
  template: CandidateTemplate,
  context: MetaScenarioSuggestionContextSnapshot,
): number {
  const swanCount = context.metaOutput.black_swan_candidates.length;
  const severityBoost = context.maxBlackSwanSeverity * 10;
  if (!template.prefersBlackSwan) {
    return Math.min(5, swanCount * 2);
  }
  return Math.min(18, (swanCount * 5) + severityBoost);
}

function mapScore(
  template: CandidateTemplate,
  context: MetaScenarioSuggestionContextSnapshot,
): number {
  const layerMatches = overlapCount(template.layerHints, context.activeLayers);
  const entityBoost = context.selectedEntities.length > 0 ? Math.min(4, context.selectedEntities.length) : 0;
  const mapBoost = context.mapContext ? 5 : 0;
  return Math.min(14, (layerMatches * 3) + entityBoost + mapBoost);
}

function sessionScore(
  template: CandidateTemplate,
  context: MetaScenarioSuggestionContextSnapshot,
): number {
  const tokens = [
    context.focusQuery || '',
    ...sessionTokens(context.sessionContext),
    ...context.activeScenarios.slice(0, 4).map((scenario) => scenario.title),
    ...context.metaOutput.higher_order_insights,
  ];
  const hits = overlapCount(template.keywords, tokens);
  return Math.min(12, hits * 3);
}

function driftScore(
  template: CandidateTemplate,
  context: MetaScenarioSuggestionContextSnapshot,
): number {
  const biasMatches = context.driftRecords.filter((record) => template.driftBias.includes(record.direction)).length;
  const anomalyBoost = context.activeScenarios.some((scenario) => scenario.trend_direction === 'up' || scenario.trend_direction === 'down') ? 2 : 0;
  return Math.min(10, (biasMatches * 3) + anomalyBoost);
}

function composeWhy(
  template: CandidateTemplate,
  context: MetaScenarioSuggestionContextSnapshot,
  breakdown: MetaScenarioSuggestionScoreBreakdown,
): string {
  const reasons = [
    template.prefersFusion && context.dominantMetaTitle ? `meta-scenario غالب «${context.dominantMetaTitle}» شکل گرفته است` : '',
    template.prefersConflict && context.dominantConflictSummary ? 'تعارض سناریویی فعال و قابل‌ردیابی وجود دارد' : '',
    template.prefersBlackSwan && context.topBlackSwanTitle ? `candidate قوی‌سیاه «${context.topBlackSwanTitle}» فعال است` : '',
    template.prefersFragility && context.fragileScenarioTitle ? `سناریوی شکننده «${context.fragileScenarioTitle}» قابل ردیابی است` : '',
    breakdown.map >= 8 ? 'context نقشه و لایه‌های فعال با این پرسش هم‌راستا هستند' : '',
    breakdown.session >= 6 ? 'با intent یا حافظه تحلیلی اخیر هم‌پوشانی دارد' : '',
    breakdown.drift >= 5 ? 'drift یا signal shift تازه ثبت شده است' : '',
  ].filter(Boolean);
  const explanation = uniqueStrings(reasons, 4);
  if (!explanation.length) {
    return `چون این پرسش برای بازبینی رابطه سناریوها، جابه‌جایی ranking و کاهش blind spotهای ${context.anchorLabel} ارزش مستقیم دارد.`;
  }
  return `چون ${explanation.join('، ')}.`;
}

function selectDiverseSuggestions(items: MetaScenarioSuggestionItem[]): MetaScenarioSuggestionItem[] {
  const grouped = new Map<MetaScenarioSuggestionCategory, MetaScenarioSuggestionItem[]>();
  items.forEach((item) => {
    const bucket = grouped.get(item.category) ?? [];
    bucket.push(item);
    grouped.set(item.category, bucket);
  });
  grouped.forEach((bucket) => bucket.sort((left, right) => right.score - left.score));

  const selected: MetaScenarioSuggestionItem[] = [];
  grouped.forEach((bucket) => {
    if (bucket[0]) selected.push(bucket[0]);
  });

  const chosenIds = new Set(selected.map((item) => item.id));
  const rest = items
    .filter((item) => !chosenIds.has(item.id))
    .sort((left, right) => right.score - left.score);

  for (const item of rest) {
    if (selected.length >= MAX_RESULTS) break;
    selected.push(item);
  }

  return selected
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(MIN_RESULTS, Math.min(MAX_RESULTS, selected.length)));
}

export function scoreMetaScenarioSuggestionCandidate(
  template: CandidateTemplate,
  context: MetaScenarioSuggestionContextSnapshot,
): { total: number; breakdown: MetaScenarioSuggestionScoreBreakdown; why: string } {
  const scenario = groupPreferenceScore(template, context);
  const conflict = conflictScore(template, context);
  const blackSwan = blackSwanScore(template, context);
  const map = mapScore(template, context);
  const session = sessionScore(template, context);
  const drift = driftScore(template, context);
  const total = clamp(template.baseScore + scenario + conflict + blackSwan + map + session + drift);
  const breakdown: MetaScenarioSuggestionScoreBreakdown = {
    base: template.baseScore,
    scenario,
    conflict,
    blackSwan,
    map,
    session,
    drift,
    total,
  };
  return {
    total,
    breakdown,
    why: composeWhy(template, context, breakdown),
  };
}

export function buildMetaScenarioSuggestionContext(input: {
  state: ScenarioEngineState | null;
  metaOutput?: MetaScenarioEngineOutput | null;
  graph?: ScenarioGraphOutput | null;
  focusQuery?: string;
}): MetaScenarioSuggestionContextSnapshot | null {
  const state = input.state;
  if (!state) return null;

  const graph = input.graph ?? buildScenarioGraph(state);
  const metaOutput = input.metaOutput ?? runMetaScenarioEngine({
    trigger: state.trigger,
    query: input.focusQuery || state.inputSnapshot.query || state.trigger,
    mapContext: state.inputSnapshot.mapContext ?? null,
    localContextPackets: [
      ...(state.inputSnapshot.localContextPackets ?? []),
      ...state.contextPackets,
    ],
    sessionContext: state.inputSnapshot.sessionContext ?? null,
    timeContext: state.updatedAt,
    baseScenarioOutput: state,
  });

  return {
    anchorLabel: state.anchorLabel,
    mapContext: state.inputSnapshot.mapContext ?? null,
    sessionContext: state.inputSnapshot.sessionContext ?? null,
    activeLayers: state.inputSnapshot.mapContext?.activeLayers ?? [],
    selectedEntities: state.inputSnapshot.mapContext?.selectedEntities ?? [],
    focusQuery: input.focusQuery || state.inputSnapshot.query || state.trigger,
    activeScenarios: state.scenarios.slice(0, 5),
    driftRecords: state.drift.slice(0, 6),
    metaOutput,
    graph,
    dominantScenarioTitle: graph.battlefieldState[0]?.title ?? state.scenarios[0]?.title,
    fragileScenarioTitle: graph.nodes.slice().sort((left, right) => right.fragility - left.fragility)[0]?.title,
    dominantMetaTitle: metaOutput.meta_scenarios[0]?.title,
    dominantConflictSummary: metaOutput.scenario_conflicts[0]?.summary,
    topBlackSwanTitle: metaOutput.black_swan_candidates[0]?.title,
    maxBlackSwanSeverity: Math.max(0, ...metaOutput.black_swan_candidates.map((candidate) => candidate.severity_score ?? 0.5)),
  };
}

export function generateMetaScenarioSuggestions(context: MetaScenarioSuggestionContextSnapshot): MetaScenarioSuggestionItem[] {
  const items = META_SCENARIO_SUGGESTION_TEMPLATES.map((template) => {
    const scored = scoreMetaScenarioSuggestionCandidate(template, context);
    return {
      id: template.id,
      category: template.category,
      label: template.label,
      promptText: template.promptText(context),
      whyItMatters: scored.why,
      expectedAnalyticValue: template.expectedAnalyticValue(context),
      score: scored.total,
      scoreBreakdown: scored.breakdown,
      taskClass: template.taskClass,
      domainMode: template.domainMode,
    } satisfies MetaScenarioSuggestionItem;
  }).sort((left, right) => right.score - left.score);

  return selectDiverseSuggestions(items);
}

export function groupMetaScenarioSuggestions(items: MetaScenarioSuggestionItem[]): Array<{
  category: MetaScenarioSuggestionCategory;
  label: string;
  items: MetaScenarioSuggestionItem[];
}> {
  const groups = new Map<MetaScenarioSuggestionCategory, MetaScenarioSuggestionItem[]>();
  items.forEach((item) => {
    const bucket = groups.get(item.category) ?? [];
    bucket.push(item);
    groups.set(item.category, bucket);
  });
  return Array.from(groups.entries()).map(([category, groupedItems]) => ({
    category,
    label: CATEGORY_LABELS[category],
    items: groupedItems.sort((left, right) => right.score - left.score),
  }));
}

export { META_SCENARIO_SUGGESTION_TEMPLATES };
