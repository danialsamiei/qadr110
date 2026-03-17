import {
  createConfidenceRecord,
  type AssistantBlackSwanCandidate,
  type AssistantContextPacket,
  type AssistantMetaScenarioOutput,
  type AssistantStructuredOutput,
} from '@/platform/ai/assistant-contracts';

import {
  runScenarioEngine,
  type ScenarioEngineInput,
  type ScenarioEngineOutput,
  type ScenarioEngineScenario,
} from './scenario-engine';

export interface BlackSwanAssumptionStressTest {
  scenario_id: string;
  scenario_title: string;
  hidden_assumptions: string[];
  adversarial_future: string;
  opposite_case: string;
}

export interface BlackSwanWatchIndicator {
  id: string;
  label: string;
  kind: 'weak-signal' | 'contradiction' | 'structural-break' | 'assumption-break';
  linked_candidate_ids: string[];
  strength: number;
  trend: 'up' | 'down' | 'flat';
  status: 'watch' | 'rising' | 'critical';
  updatedAt: string;
}

export interface BlackSwanTimelinePoint {
  timestamp: string;
  severity_score: number;
  confidence_score: number;
  reason: string;
}

export interface BlackSwanEngineInput extends ScenarioEngineInput {
  baseScenarioOutput?: ScenarioEngineOutput | null;
  maxCandidates?: number;
}

export interface BlackSwanEngineOutput {
  trigger: string;
  anchorLabel: string;
  candidates: AssistantBlackSwanCandidate[];
  watchlist: BlackSwanWatchIndicator[];
  assumptionStressTests: BlackSwanAssumptionStressTest[];
  structuredOutput: AssistantStructuredOutput;
  contextPackets: AssistantContextPacket[];
  scoring: {
    weakSignalPressure: number;
    contradictionPressure: number;
    structuralBreakPressure: number;
    blindSpotPressure: number;
    baselineCoverage: number;
  };
}

export interface BlackSwanEngineState extends BlackSwanEngineOutput {
  updatedAt: string;
  contextKey: string;
  inputSnapshot: BlackSwanEngineInput;
  baseScenarioOutput: ScenarioEngineOutput;
  temporalEvolution: Record<string, BlackSwanTimelinePoint[]>;
}

export interface BlackSwanEngineUpdateInput {
  previousState: BlackSwanEngineState;
  input?: Partial<BlackSwanEngineInput>;
  reason?: string;
}

const WEAK_SIGNAL_HINTS = ['weak-signal', 'rumor', 'anomaly', 'unconfirmed', 'شایعه', 'ضعیف', 'ابهام', 'نشت'];
const STRUCTURAL_BREAK_HINTS = ['closure', 'shutdown', 'outage', 'collapse', 'coup', 'surge', 'انسداد', 'خاموشی', 'فروپاشی', 'کودتا', 'جهش'];
const STABILIZING_HINTS = ['calm', 'stable', 'backchannel', 'contain', 'آرام', 'ثبات', 'مهار', 'کاهش'];
const ESCALATORY_HINTS = ['escalat', 'conflict', 'block', 'riot', 'attack', 'sanction', 'تشدید', 'درگیری', 'انسداد', 'اعتراض', 'حمله', 'تحریم'];

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function uniqueStrings(values: Array<string | undefined>, maxItems = 8): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, maxItems);
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);
}

function probabilityScore(scenario: ScenarioEngineScenario): number {
  if (typeof scenario.probability_score === 'number') return clamp(scenario.probability_score);
  if (scenario.probability === 'high') return 0.76;
  if (scenario.probability === 'low') return 0.24;
  return 0.52;
}

function impactScore(scenario: ScenarioEngineScenario): number {
  if (typeof scenario.impact_score === 'number') return clamp(scenario.impact_score);
  if (scenario.impact_level === 'critical') return 0.92;
  if (scenario.impact_level === 'high') return 0.72;
  if (scenario.impact_level === 'low') return 0.24;
  return 0.5;
}

function uncertaintyScore(scenario: ScenarioEngineScenario): number {
  if (scenario.uncertainty_level === 'high') return 0.76;
  if (scenario.uncertainty_level === 'low') return 0.24;
  return 0.5;
}

function scenarioDomains(scenario: ScenarioEngineScenario): string[] {
  const domains = new Set<string>();
  Object.entries(scenario.cross_domain_impacts ?? {}).forEach(([domain, items]) => {
    if (Array.isArray(items) && items.length > 0) domains.add(domain);
  });
  scenario.causal_chain.forEach((step) => step.affected_domains.forEach((domain) => domains.add(domain)));
  return Array.from(domains);
}

function domainLabel(domain: string): string {
  if (domain === 'geopolitics') return 'ژئوپلیتیک';
  if (domain === 'economics') return 'اقتصاد';
  if (domain === 'infrastructure') return 'زیرساخت';
  if (domain === 'public_sentiment') return 'افکار عمومی';
  if (domain === 'cyber') return 'سایبری';
  return domain;
}

function contextKey(input: BlackSwanEngineInput, baseOutput: ScenarioEngineOutput): string {
  return slugify([
    baseOutput.normalizedTrigger,
    input.mapContext?.cacheKey ?? input.mapContext?.id ?? '',
    ...(input.mapContext?.activeLayers ?? []),
    ...(input.sessionContext?.reusableInsights ?? []).slice(-2).map((item) => item.id),
  ].join('|'));
}

function weakSignalPackets(input: BlackSwanEngineInput): AssistantContextPacket[] {
  return (input.localContextPackets ?? []).filter((packet) => {
    const corpus = `${packet.title} ${packet.summary} ${packet.content} ${packet.tags.join(' ')}`.toLowerCase();
    return packet.score <= 0.58 || WEAK_SIGNAL_HINTS.some((hint) => corpus.includes(hint));
  });
}

function contradictoryEvidence(input: BlackSwanEngineInput): string[] {
  const packets = input.localContextPackets ?? [];
  const escalating = packets.filter((packet) => ESCALATORY_HINTS.some((hint) => `${packet.title} ${packet.summary} ${packet.content}`.toLowerCase().includes(hint)));
  const stabilizing = packets.filter((packet) => STABILIZING_HINTS.some((hint) => `${packet.title} ${packet.summary} ${packet.content}`.toLowerCase().includes(hint)));
  if (escalating.length === 0 || stabilizing.length === 0) return [];
  return uniqueStrings([
    escalating[0]?.title ? `سیگنال تشدید: ${escalating[0].title}` : undefined,
    stabilizing[0]?.title ? `سیگنال مهار: ${stabilizing[0].title}` : undefined,
  ], 4);
}

function structuralBreakIndicators(input: BlackSwanEngineInput): string[] {
  const packetIndicators = (input.localContextPackets ?? [])
    .filter((packet) => STRUCTURAL_BREAK_HINTS.some((hint) => `${packet.title} ${packet.summary} ${packet.content}`.toLowerCase().includes(hint)))
    .map((packet) => packet.title);
  const nearbyIndicators = (input.mapContext?.nearbySignals ?? [])
    .filter((signal) => STRUCTURAL_BREAK_HINTS.some((hint) => signal.label.toLowerCase().includes(hint)) || signal.severity === 'high')
    .map((signal) => signal.label);
  return uniqueStrings([...packetIndicators, ...nearbyIndicators], 6);
}

function buildAssumptionStressTests(baseOutput: ScenarioEngineOutput): BlackSwanAssumptionStressTest[] {
  return baseOutput.scenarios.slice(0, 4).map((scenario) => ({
    scenario_id: scenario.id,
    scenario_title: scenario.title,
    hidden_assumptions: uniqueStrings([
      scenario.drivers[0] ? `فرض پایداری ${scenario.drivers[0]}` : undefined,
      scenario.indicators_to_watch[0] ? `فرض اینکه شاخص «${scenario.indicators_to_watch[0]}» برخلاف baseline حرکت نکند` : undefined,
      'فرض تداوم الگوهای کنونی و نبود regime shift ناگهانی',
    ], 4),
    adversarial_future: `اگر فرض‌های مهارکننده «${scenario.title}» فروبریزند، یک آینده غیرخطی و خارج از tree غالب می‌تواند فعال شود.`,
    opposite_case: `اگر مسیر opposite برای «${scenario.title}» رخ دهد، وزن explanatory سناریوی فعلی به‌سرعت افت می‌کند و نیاز به بازتوزیع احتمال به سناریوهای رقیب به‌وجود می‌آید.`,
  }));
}

function buildCandidate(
  scenario: ScenarioEngineScenario,
  baseOutput: ScenarioEngineOutput,
  weakSignals: string[],
  contradictions: string[],
  structuralBreaks: string[],
  stressTest: BlackSwanAssumptionStressTest | undefined,
  blindSpotPressure: number,
): AssistantBlackSwanCandidate {
  const pScore = probabilityScore(scenario);
  const iScore = impactScore(scenario);
  const uScore = uncertaintyScore(scenario);
  const severity = clamp((1 - pScore) * 0.24 + iScore * 0.34 + uScore * 0.16 + Math.min(weakSignals.length, 4) * 0.06 + Math.min(structuralBreaks.length, 3) * 0.08 + blindSpotPressure * 0.12);
  const domains = uniqueStrings(scenarioDomains(scenario).map(domainLabel), 6);

  return {
    id: `black-swan-${scenario.id}`,
    title: `قوی سیاه پیرامون «${scenario.title}»`,
    summary: `این candidate با وجود احتمال فعلی پایین، می‌تواند landscape تحلیلی ${baseOutput.anchorLabel} را به‌صورت ناگهانی از baselineهای موجود جدا کند.`,
    probability: 'low',
    impact_level: scenario.impact_level,
    uncertainty_level: severity >= 0.66 ? 'high' : 'medium',
    why_it_matters: `اگر driverهای پنهان و weak signalهای موجود هم‌راستا شوند، «${scenario.title}» می‌تواند cascadeهایی فراتر از سناریوهای غالب فعلی ایجاد کند.`,
    low_probability_reason: `سیگنال‌های پشتیبان هنوز sparse و تا حدی متناقض‌اند و با baselineهای فعلی هم‌جهت نیستند.`,
    high_impact_reason: `دامنه‌های متاثر شامل ${domains.slice(0, 3).join('، ')} است و chain سناریو ظرفیت اثرات درجه‌دو و spillover منطقه‌ای دارد.`,
    broken_assumptions: uniqueStrings([
      ...(stressTest?.hidden_assumptions ?? []),
      'فرض کافی‌بودن tree فعلی برای پوشش همه futureهای plausible',
    ], 5),
    affected_domains: domains,
    weak_signals: uniqueStrings([...weakSignals, ...scenario.indicators_to_watch.slice(0, 2)], 6),
    contradictory_evidence: contradictions,
    regime_shift_indicators: uniqueStrings([...structuralBreaks, ...scenario.second_order_effects.slice(0, 2)], 6),
    leading_indicators: uniqueStrings([...scenario.indicators_to_watch, ...structuralBreaks], 6),
    watchpoints: uniqueStrings([...scenario.indicators_to_watch, ...structuralBreaks, ...weakSignals], 6),
    recommended_actions: uniqueStrings([
      ...scenario.mitigation_options.slice(0, 3),
      'فرض‌های baseline را با cadence کوتاه‌تر بازبینی کن.',
      'برای شاخص‌های کم‌پوشش، watchlist مستقل و evidence trail فعال نگه دار.',
    ], 6),
    confidence_note: `اعتماد این candidate محدود و محافظه‌کارانه است، چون توافق سیگنال‌ها هنوز ناقص است اما الگوی cross-domain آن معنادار شده است.`,
    uncertainty_note: contradictions.length > 0
      ? 'وجود evidenceهای متعارض نشان می‌دهد جهت نهایی این آینده هنوز قطعی نیست و باید با داده‌های تازه دوباره سنجیده شود.'
      : 'پوشش داده و signal agreement هنوز برای برآورد دقیق کمّی کافی نیست.',
    severity_score: Number(severity.toFixed(2)),
    monitoring_status: severity >= 0.74 ? 'critical' : severity >= 0.56 ? 'rising' : 'watch',
  };
}

function buildFallbackCandidate(
  baseOutput: ScenarioEngineOutput,
  weakSignals: string[],
  contradictions: string[],
  structuralBreaks: string[],
  blindSpotPressure: number,
): AssistantBlackSwanCandidate | null {
  if (weakSignals.length === 0 && contradictions.length === 0 && structuralBreaks.length === 0) return null;
  const severity = clamp(0.46 + blindSpotPressure * 0.24 + Math.min(structuralBreaks.length, 3) * 0.1 + Math.min(contradictions.length, 2) * 0.08);
  return {
    id: `black-swan-${slugify(`${baseOutput.anchorLabel}-${baseOutput.trigger}`)}`,
    title: `شکست فرض‌های پایه در ${baseOutput.anchorLabel}`,
    summary: `ترکیب weak signalهای sparse و نشانه‌های structural break نشان می‌دهد یک future بیرون از tree فعلی ممکن است در ${baseOutput.anchorLabel} شکل بگیرد.`,
    probability: 'low',
    impact_level: severity >= 0.7 ? 'critical' : 'high',
    uncertainty_level: 'high',
    why_it_matters: 'این candidate نشان می‌دهد current baseline ممکن است برخی causal explanationهای مهم را از قلم انداخته باشد.',
    low_probability_reason: 'سیگنال‌ها پراکنده، کم‌تعداد و هنوز فاقد تایید قوی چندمنبعه هستند.',
    high_impact_reason: 'در صورت فعال‌شدن، این future می‌تواند کل ranking سناریوها و تصمیم‌های پایش را جابه‌جا کند.',
    broken_assumptions: ['فرض یکنواخت‌بودن روند فعلی', 'فرض کافی‌بودن داده‌های موجود برای توضیح کامل وضعیت'],
    affected_domains: ['ژئوپلیتیک', 'اقتصاد', 'زیرساخت'],
    weak_signals: weakSignals,
    contradictory_evidence: contradictions,
    regime_shift_indicators: structuralBreaks,
    leading_indicators: uniqueStrings([...structuralBreaks, ...weakSignals], 6),
    watchpoints: uniqueStrings([...structuralBreaks, ...weakSignals], 6),
    recommended_actions: ['watchlist مستقل برای فرض‌های شکسته بساز.', 'سیگنال‌های کم‌پوشش و evidenceهای متناقض را با cadence سریع‌تر راستی‌آزمایی کن.'],
    confidence_note: 'این candidate بیشتر نقش هشدار تحلیلی دارد تا پیش‌بینی تثبیت‌شده.',
    uncertainty_note: 'جهت و دامنه این future به‌دلیل sparse بودن شواهد بسیار نامطمئن است.',
    severity_score: Number(severity.toFixed(2)),
    monitoring_status: severity >= 0.68 ? 'rising' : 'watch',
  };
}

function buildWatchlist(candidates: AssistantBlackSwanCandidate[], updatedAt: string): BlackSwanWatchIndicator[] {
  return uniqueStrings(candidates.flatMap((candidate) => candidate.leading_indicators)).map((label, index) => {
    const linked = candidates.filter((candidate) => candidate.leading_indicators.includes(label));
    const strength = linked.reduce((max, candidate) => Math.max(max, candidate.severity_score ?? 0.5), 0);
    const kind: BlackSwanWatchIndicator['kind'] = label.includes('فرض')
      ? 'assumption-break'
      : linked.some((candidate) => candidate.regime_shift_indicators.includes(label))
        ? 'structural-break'
        : linked.some((candidate) => candidate.contradictory_evidence.includes(label))
          ? 'contradiction'
          : 'weak-signal';
    const trend: BlackSwanWatchIndicator['trend'] = strength >= 0.7 ? 'up' : 'flat';
    const status: BlackSwanWatchIndicator['status'] = strength >= 0.76 ? 'critical' : strength >= 0.56 ? 'rising' : 'watch';
    return {
      id: `black-swan-watch:${slugify(label)}:${index}`,
      label,
      kind,
      linked_candidate_ids: linked.map((candidate) => candidate.id),
      strength: Number(strength.toFixed(2)),
      trend,
      status,
      updatedAt,
    };
  }).slice(0, 8);
}

function buildStructuredOutput(
  baseOutput: ScenarioEngineOutput,
  candidates: AssistantBlackSwanCandidate[],
  watchlist: BlackSwanWatchIndicator[],
  stressTests: BlackSwanAssumptionStressTest[],
): AssistantStructuredOutput {
  const metaOutput: AssistantMetaScenarioOutput = {
    executive_summary: candidates[0]
      ? `موتور قوی سیاه نشان می‌دهد در ${baseOutput.anchorLabel} «${candidates[0].title}» مهم‌ترین future غیرخطی برای پایش نزدیک است.`
      : `در ${baseOutput.anchorLabel} فعلا Black Swan candidate صریحی ثبت نشد، اما watchpointهای ضعیف هنوز باید حفظ شوند.`,
    higher_order_insights: uniqueStrings([
      candidates[0] ? `مهم‌ترین blind spot فعلی حول «${candidates[0].title}» شکل گرفته است.` : undefined,
      stressTests[0] ? `فرض‌های پنهان سناریوی «${stressTests[0].scenario_title}» باید adversarially بازآزموده شوند.` : undefined,
      watchlist[0] ? `شاخص «${watchlist[0].label}» اکنون مهم‌ترین watchpoint برای regime shift است.` : undefined,
    ], 5),
    meta_scenarios: [],
    scenario_conflicts: [],
    black_swan_candidates: candidates,
  };

  return {
    ...baseOutput.structuredOutput,
    reportTitle: `موتور قوی سیاه: ${baseOutput.trigger}`,
    executiveSummary: metaOutput.executive_summary,
    analyticalInference: {
      title: 'تحلیل قوی سیاه',
      bullets: metaOutput.higher_order_insights,
      narrative: 'این لایه weak signalها، evidenceهای متعارض، structural breakها و فرض‌های پنهان baseline را برای یافتن futureهای کم‌احتمال اما پراثر کنار هم می‌گذارد.',
      confidence: createConfidenceRecord(candidates[0]?.severity_score ?? 0.46, 'این جمع‌بندی از scoring صریح فرض‌های شکسته و سیگنال‌های sparse ساخته شده است.'),
    },
    metaScenario: metaOutput,
    uncertainties: {
      title: 'عدم‌قطعیت‌های قوی سیاه',
      bullets: uniqueStrings([
        candidates[0]?.uncertainty_note,
        watchlist[0] ? `شاخص‌های watchlist هنوز sparse هستند و به تایید چندمنبعه نیاز دارند.` : undefined,
      ], 5),
      narrative: 'ماهیت قوی سیاه این است که evidenceهای آن کم‌تراکم، متناقض یا خارج از baseline باشند؛ بنابراین این بخش عمدا محافظه‌کارانه باقی می‌ماند.',
      confidence: createConfidenceRecord(0.38, 'عدم‌قطعیت این بخش ذاتا بالاست چون futureهای خارج از baseline را پوشش می‌دهد.'),
    },
    followUpSuggestions: uniqueStrings([
      ...baseOutput.structuredOutput.followUpSuggestions,
      candidates[0] ? `watchpointهای «${candidates[0].title}» را دوباره ارزیابی کن.` : undefined,
      stressTests[0] ? `failure modes سناریوی «${stressTests[0].scenario_title}» را red-team کن.` : undefined,
    ], 6),
  };
}

function buildContextPackets(
  baseOutput: ScenarioEngineOutput,
  candidates: AssistantBlackSwanCandidate[],
  watchlist: BlackSwanWatchIndicator[],
): AssistantContextPacket[] {
  const baseId = `black-swan:${slugify(`${baseOutput.trigger}:${baseOutput.anchorLabel}`)}`;
  const packets: AssistantContextPacket[] = candidates.slice(0, 3).map((candidate, index) => ({
    id: `${baseId}:${index + 1}`,
    title: candidate.title,
    summary: `${candidate.summary} | شدت ${Math.round((candidate.severity_score ?? 0.5) * 100)}%`,
    content: [
      candidate.summary,
      `Low probability: ${candidate.low_probability_reason}`,
      `High impact: ${candidate.high_impact_reason}`,
      `Watchpoints: ${candidate.watchpoints.join(' | ')}`,
    ].join('\n'),
    sourceLabel: 'QADR110 Black Swan Engine',
    sourceType: 'model',
    updatedAt: new Date().toISOString(),
    score: candidate.severity_score ?? 0.5,
    tags: ['black-swan', candidate.monitoring_status ?? 'watch'],
    provenance: {
      sourceIds: [`${baseId}:source`],
      evidenceIds: [candidate.id],
      derivedFromIds: baseOutput.contextPackets.map((packet) => packet.id),
    },
  }));

  if (watchlist[0]) {
    packets.push({
      id: `${baseId}:watchlist`,
      title: `واچ‌لیست قوی سیاه برای ${baseOutput.anchorLabel}`,
      summary: watchlist.map((item) => item.label).slice(0, 3).join(' | '),
      content: watchlist.map((item) => `${item.label} | ${item.status} | قدرت ${Math.round(item.strength * 100)}%`).join('\n'),
      sourceLabel: 'QADR110 Black Swan Engine',
      sourceType: 'model',
      updatedAt: new Date().toISOString(),
      score: 0.6,
      tags: ['black-swan', 'watchlist'],
      provenance: {
        sourceIds: [`${baseId}:source`],
        evidenceIds: [`${baseId}:watchlist`],
        derivedFromIds: baseOutput.contextPackets.map((packet) => packet.id),
      },
    });
  }

  return packets.slice(0, 5);
}

export function runBlackSwanEngine(input: BlackSwanEngineInput): BlackSwanEngineOutput {
  const baseScenarioOutput = input.baseScenarioOutput ?? runScenarioEngine(input);
  const stressTests = buildAssumptionStressTests(baseScenarioOutput);
  const weakSignals = weakSignalPackets(input).map((packet) => packet.title);
  const contradictions = contradictoryEvidence(input);
  const structuralBreaks = structuralBreakIndicators(input);
  const blindSpotPressure = clamp(
    (1 - baseScenarioOutput.dataRichness) * 0.55
    + Math.min(weakSignals.length, 4) * 0.08
    + Math.min(contradictions.length, 2) * 0.09,
  );

  const candidates = baseScenarioOutput.scenarios
    .slice(0, Math.max(4, input.maxCandidates ?? 5))
    .map((scenario) => buildCandidate(
      scenario,
      baseScenarioOutput,
      weakSignals,
      contradictions,
      structuralBreaks,
      stressTests.find((item) => item.scenario_id === scenario.id),
      blindSpotPressure,
    ))
    .filter((candidate) => (candidate.severity_score ?? 0) >= 0.52 || candidate.regime_shift_indicators.length > 0)
    .sort((left, right) => (right.severity_score ?? 0.5) - (left.severity_score ?? 0.5))
    .slice(0, input.maxCandidates ?? 5);

  const fallback = candidates.length === 0
    ? buildFallbackCandidate(baseScenarioOutput, weakSignals, contradictions, structuralBreaks, blindSpotPressure)
    : null;
  const resolvedCandidates = fallback ? [fallback] : candidates;
  const updatedAt = input.timeContext || new Date().toISOString();
  const watchlist = buildWatchlist(resolvedCandidates, updatedAt);

  return {
    trigger: baseScenarioOutput.trigger,
    anchorLabel: baseScenarioOutput.anchorLabel,
    candidates: resolvedCandidates,
    watchlist,
    assumptionStressTests: stressTests,
    structuredOutput: buildStructuredOutput(baseScenarioOutput, resolvedCandidates, watchlist, stressTests),
    contextPackets: buildContextPackets(baseScenarioOutput, resolvedCandidates, watchlist),
    scoring: {
      weakSignalPressure: Number(clamp(weakSignals.length * 0.18).toFixed(2)),
      contradictionPressure: Number(clamp(contradictions.length * 0.28).toFixed(2)),
      structuralBreakPressure: Number(clamp(structuralBreaks.length * 0.24).toFixed(2)),
      blindSpotPressure: Number(blindSpotPressure.toFixed(2)),
      baselineCoverage: Number(baseScenarioOutput.dataRichness.toFixed(2)),
    },
  };
}

export function getBlackSwans(input: BlackSwanEngineInput): BlackSwanEngineState {
  const baseScenarioOutput = input.baseScenarioOutput ?? runScenarioEngine(input);
  const output = runBlackSwanEngine({
    ...input,
    baseScenarioOutput,
  });
  const timestamp = input.timeContext || new Date().toISOString();

  return {
    ...output,
    updatedAt: timestamp,
    contextKey: contextKey(input, baseScenarioOutput),
    inputSnapshot: {
      ...input,
      baseScenarioOutput,
      timeContext: timestamp,
    },
    baseScenarioOutput,
    temporalEvolution: Object.fromEntries(output.candidates.map((candidate) => [candidate.id, [{
      timestamp,
      severity_score: candidate.severity_score ?? 0.5,
      confidence_score: clamp(1 - (candidate.uncertainty_level === 'high' ? 0.5 : candidate.uncertainty_level === 'medium' ? 0.32 : 0.18)),
      reason: 'baseline',
    } satisfies BlackSwanTimelinePoint]])),
  };
}

export function updateBlackSwans(input: BlackSwanEngineUpdateInput): BlackSwanEngineState {
  const nextInput: BlackSwanEngineInput = {
    ...input.previousState.inputSnapshot,
    ...(input.input ?? {}),
    timeContext: input.input?.timeContext || new Date().toISOString(),
    baseScenarioOutput: input.input?.baseScenarioOutput ?? input.previousState.baseScenarioOutput,
  };
  const nextState = getBlackSwans(nextInput);
  const temporalEvolution = { ...input.previousState.temporalEvolution };

  nextState.candidates.forEach((candidate) => {
    const existing = temporalEvolution[candidate.id] ?? [];
    temporalEvolution[candidate.id] = [...existing, {
      timestamp: nextState.updatedAt,
      severity_score: candidate.severity_score ?? 0.5,
      confidence_score: clamp(1 - (candidate.uncertainty_level === 'high' ? 0.5 : candidate.uncertainty_level === 'medium' ? 0.32 : 0.18)),
      reason: input.reason || 'update',
    }].slice(-16);
  });

  nextState.watchlist = nextState.watchlist.map((indicator) => {
    const previous = input.previousState.watchlist.find((item) => item.label === indicator.label);
    const delta = previous ? indicator.strength - previous.strength : 0;
    return {
      ...indicator,
      trend: delta > 0.04 ? 'up' : delta < -0.04 ? 'down' : 'flat',
      status: indicator.strength >= 0.8 ? 'critical' : indicator.strength >= 0.58 ? 'rising' : 'watch',
    };
  });
  nextState.temporalEvolution = temporalEvolution;
  return nextState;
}
