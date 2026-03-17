import type { ScenarioEngineState, ScenarioSignalRecord } from '@/ai/scenario-engine';
import { buildNarrativeAnalysis, type EventNarrativeAnalysis } from '@/services/intel';
import {
  MEDIA_PIPELINES,
  getPipelineState,
  type MediaLean,
  type PipelineDef,
} from '@/services/media-pipelines';
import type { ClusteredEvent, NewsItem } from '@/types';

export type CognitiveSeverity = 'low' | 'medium' | 'high' | 'critical';
export type CognitiveAlertKind =
  | 'narrative-cluster'
  | 'coordination-campaign'
  | 'sentiment-anomaly'
  | 'structural-gap';
export type CognitiveInfluenceGroup =
  | 'government'
  | 'independent'
  | 'opposition'
  | 'regional'
  | 'narrative'
  | 'signal';

export interface CognitiveMetricCard {
  id: string;
  label: string;
  value: string;
  note: string;
  severity: CognitiveSeverity;
}

export interface CognitiveNarrativeCluster {
  id: string;
  title: string;
  summary: string;
  severity: CognitiveSeverity;
  severityScore: number;
  framingShift: number;
  propagandaIntensity: number;
  polarityPercent: number;
  sourceCount: number;
  confidence: number;
  alignedNarrative: string;
  evidence: string[];
}

export interface CognitiveInfluenceNode {
  id: string;
  label: string;
  detail: string;
  weight: number;
  group: CognitiveInfluenceGroup;
  severity: CognitiveSeverity;
}

export interface CognitiveInfluenceEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  weight: number;
  relation: 'amplifies' | 'routes' | 'contests';
  severity: CognitiveSeverity;
}

export interface CognitiveSentimentAnomaly {
  id: string;
  title: string;
  summary: string;
  severity: CognitiveSeverity;
  score: number;
  whyItMatters: string;
  signals: string[];
}

export interface CognitiveAlert {
  id: string;
  kind: CognitiveAlertKind;
  title: string;
  summary: string;
  severity: CognitiveSeverity;
  watchSignals: string[];
}

export interface CognitiveHeatmapCell {
  id: string;
  label: string;
  value: number;
  severity: CognitiveSeverity;
}

export interface CognitiveHeatmapRow {
  id: string;
  label: string;
  cells: CognitiveHeatmapCell[];
}

export interface CognitiveDefensePlan {
  id: string;
  title: string;
  summary: string;
  focusArea: string;
  severity: CognitiveSeverity;
  counterNarratives: string[];
  responsePlan: string[];
}

export interface CognitiveEvidenceItem {
  id: string;
  title: string;
  source: string;
  detail: string;
  severity: CognitiveSeverity;
}

export interface CognitiveWarfareModel {
  generatedAt: string;
  summary: string;
  boardSummary: string;
  metrics: CognitiveMetricCard[];
  alerts: CognitiveAlert[];
  narrativeClusters: CognitiveNarrativeCluster[];
  influenceGraph: {
    nodes: CognitiveInfluenceNode[];
    edges: CognitiveInfluenceEdge[];
  };
  sentimentAnomalies: CognitiveSentimentAnomaly[];
  heatmap: CognitiveHeatmapRow[];
  defensePlans: CognitiveDefensePlan[];
  evidenceStack: CognitiveEvidenceItem[];
  watchIndicators: string[];
}

export interface CognitiveWarfareInput {
  news: NewsItem[];
  clusters: ClusteredEvent[];
  scenarioState?: ScenarioEngineState | null;
}

const COGNITIVE_SIGNAL_KEYWORDS = [
  'روایت',
  'رسانه',
  'شناختی',
  'sentiment',
  'social',
  'narrative',
  'campaign',
  'misinformation',
  'disinformation',
  'polarization',
  'اعتراض',
  'نارضایتی',
  'هشتگ',
];

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function severityFromScore(score: number): CognitiveSeverity {
  if (score >= 0.78) return 'critical';
  if (score >= 0.58) return 'high';
  if (score >= 0.34) return 'medium';
  return 'low';
}

function percent(score: number): string {
  return `${Math.round(clamp(score) * 100)}%`;
}

function uniqueStrings(values: Array<string | undefined>, maxItems = 8): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
  ).slice(0, maxItems);
}

function leanLabel(lean: MediaLean): string {
  switch (lean) {
    case 'government':
      return 'رسانه رسمی';
    case 'opposition':
      return 'رسانه برون‌مرزی';
    default:
      return 'رسانه مستقل';
  }
}

function pipelineGroup(lean: MediaLean): CognitiveInfluenceGroup {
  switch (lean) {
    case 'government':
      return 'government';
    case 'opposition':
      return 'opposition';
    default:
      return 'independent';
  }
}

function lower(value: string): string {
  return value.toLocaleLowerCase('fa-IR');
}

function keywordHits(text: string, keywords: string[]): number {
  const haystack = lower(text);
  return keywords.reduce((count, keyword) => count + (haystack.includes(lower(keyword)) ? 1 : 0), 0);
}

function signalMatchScore(signal: ScenarioSignalRecord): number {
  const keywordScore = keywordHits(`${signal.label} ${signal.summary}`, COGNITIVE_SIGNAL_KEYWORDS) * 0.14;
  const polarityBoost = signal.polarity === 'escalatory' ? 0.24 : signal.polarity === 'neutral' ? 0.1 : 0.02;
  const sentimentBoost = clamp(signal.domainWeights.public_sentiment ?? 0) * 0.34;
  return clamp(signal.strength * 0.42 + polarityBoost + sentimentBoost + keywordScore);
}

function relevantSignals(state: ScenarioEngineState | null | undefined): ScenarioSignalRecord[] {
  if (!state) return [];
  return state.signals
    .filter((signal) => signalMatchScore(signal) >= 0.28)
    .sort((left, right) => signalMatchScore(right) - signalMatchScore(left))
    .slice(0, 6);
}

function narrativeSeverityScore(analysis: EventNarrativeAnalysis): number {
  const framing = clamp(analysis.metrics.framingShift / 100);
  const propaganda = clamp(analysis.metrics.propagandaIntensity / 100);
  const polarity = clamp(Math.abs(analysis.metrics.narrativePolarity));
  return clamp(
    framing * 0.36
    + propaganda * 0.34
    + polarity * 0.14
    + clamp(analysis.confidence) * 0.16,
  );
}

function sourceCountForAnalysis(analysis: EventNarrativeAnalysis): number {
  return analysis.blocs.reduce((sum, bloc) => sum + bloc.sourceCount, 0);
}

function buildNarrativeClusters(
  analyses: EventNarrativeAnalysis[],
): CognitiveNarrativeCluster[] {
  return analyses.slice(0, 4).map((analysis, index) => {
    const severityScore = narrativeSeverityScore(analysis);
    return {
      id: `narrative:${analysis.eventId || index}`,
      title: analysis.title,
      summary: analysis.alignedNarrative
        ? `روایت همسو: ${analysis.alignedNarrative}`
        : 'این خوشه روایتی هنوز narrative alignment پایدار ندارد.',
      severity: severityFromScore(severityScore),
      severityScore,
      framingShift: analysis.metrics.framingShift,
      propagandaIntensity: analysis.metrics.propagandaIntensity,
      polarityPercent: Math.round((analysis.metrics.narrativePolarity + 1) * 50),
      sourceCount: sourceCountForAnalysis(analysis),
      confidence: clamp(analysis.confidence),
      alignedNarrative: analysis.alignedNarrative || '—',
      evidence: analysis.evidence.slice(0, 3).map((item) => `${item.source}: ${item.claim}`),
    };
  });
}

function sourceNodeId(pipeline: PipelineDef): string {
  return `source:${pipeline.id}`;
}

function narrativeNodeId(cluster: CognitiveNarrativeCluster): string {
  return `narrative-node:${cluster.id}`;
}

function signalNodeId(signal: ScenarioSignalRecord): string {
  return `signal:${signal.id}`;
}

function evidenceMatchesPipeline(analysis: EventNarrativeAnalysis, pipeline: PipelineDef): boolean {
  const sources = pipeline.sources.map((source) => lower(source.name));
  return analysis.evidence.some((item) => sources.some((source) => lower(item.source).includes(source)));
}

function buildSourceNodes(): CognitiveInfluenceNode[] {
  return MEDIA_PIPELINES.map((pipeline) => {
    const dominantLean = pipeline.sources[0]?.lean ?? 'independent';
    const state = getPipelineState(pipeline.id);
    const healthWeight = state.status === 'running'
      ? 0.78
      : state.status === 'scheduled'
        ? 0.58
        : state.status === 'failed'
          ? 0.42
          : 0.34;

    return {
      id: sourceNodeId(pipeline),
      label: pipeline.title,
      detail: `${leanLabel(dominantLean)} | ${pipeline.platforms.join(' / ')} | ${state.status}`,
      weight: clamp((pipeline.sources.length / 6) * 0.46 + healthWeight * 0.54),
      group: pipelineGroup(dominantLean),
      severity: severityFromScore(healthWeight),
    };
  });
}

function buildInfluenceGraph(
  narrativeClusters: CognitiveNarrativeCluster[],
  analyses: EventNarrativeAnalysis[],
  state: ScenarioEngineState | null | undefined,
): CognitiveWarfareModel['influenceGraph'] {
  const sourceNodes = buildSourceNodes();
  const signals = relevantSignals(state);
  const narrativeNodes: CognitiveInfluenceNode[] = narrativeClusters.map((cluster) => ({
    id: narrativeNodeId(cluster),
    label: cluster.title,
    detail: `${cluster.sourceCount} منبع | framing ${cluster.framingShift} | propaganda ${cluster.propagandaIntensity}`,
    weight: cluster.severityScore,
    group: 'narrative',
    severity: cluster.severity,
  }));
  const signalNodes: CognitiveInfluenceNode[] = signals.map((signal) => ({
    id: signalNodeId(signal),
    label: signal.label,
    detail: signal.summary,
    weight: signalMatchScore(signal),
    group: 'signal',
    severity: severityFromScore(signalMatchScore(signal)),
  }));

  const edges: CognitiveInfluenceEdge[] = [];
  narrativeClusters.forEach((cluster, index) => {
    const analysis = analyses[index];
    if (!analysis) return;
    const linkedSourceNodes = sourceNodes.filter((node) => {
      const pipeline = MEDIA_PIPELINES.find((item) => sourceNodeId(item) === node.id);
      return pipeline ? evidenceMatchesPipeline(analysis, pipeline) : false;
    });
    const sourceLinks = linkedSourceNodes.length > 0 ? linkedSourceNodes : sourceNodes.slice(0, 2);
    sourceLinks.forEach((node) => {
      edges.push({
        id: `${node.id}->${narrativeNodeId(cluster)}`,
        from: node.id,
        to: narrativeNodeId(cluster),
        label: 'تغذیه روایت',
        weight: clamp(cluster.severityScore * 0.58 + node.weight * 0.42),
        relation: 'routes',
        severity: severityFromScore(cluster.severityScore),
      });
    });
  });

  signals.slice(0, 3).forEach((signal, index) => {
    const targetCluster = narrativeClusters[index % Math.max(1, narrativeClusters.length)];
    if (!targetCluster) return;
    const score = signalMatchScore(signal);
    edges.push({
      id: `${signalNodeId(signal)}->${narrativeNodeId(targetCluster)}`,
      from: signalNodeId(signal),
      to: narrativeNodeId(targetCluster),
      label: signal.polarity === 'escalatory' ? 'تقویت/تشدید' : 'تقابل روایی',
      weight: score,
      relation: signal.polarity === 'escalatory' ? 'amplifies' : 'contests',
      severity: severityFromScore(score),
    });
  });

  return {
    nodes: [...sourceNodes, ...narrativeNodes, ...signalNodes],
    edges: edges.slice(0, 10),
  };
}

function buildSentimentAnomalies(
  clusters: ClusteredEvent[],
  state: ScenarioEngineState | null | undefined,
): CognitiveSentimentAnomaly[] {
  const anomaliesFromClusters = clusters
    .filter((cluster) => cluster.velocity?.sentiment === 'negative' || cluster.velocity?.level === 'spike')
    .slice(0, 3)
    .map((cluster) => {
      const velocity = cluster.velocity;
      const score = clamp(
        (velocity?.level === 'spike' ? 0.54 : velocity?.level === 'elevated' ? 0.38 : 0.22)
        + (velocity?.trend === 'rising' ? 0.18 : 0.08)
        + (velocity?.sentiment === 'negative' ? 0.2 : 0.05)
        + Math.min(0.18, cluster.sourceCount * 0.02),
      );
      return {
        id: `cluster-anomaly:${cluster.id}`,
        title: cluster.primaryTitle,
        summary: `خوشه با sentiment=${velocity?.sentiment || 'neutral'} و trend=${velocity?.trend || 'stable'} در حال جابه‌جایی افکار عمومی است.`,
        severity: severityFromScore(score),
        score,
        whyItMatters: 'اگر این drift پایدار بماند، narrative baseline و watchpointهای اجتماعی باید بازتنظیم شوند.',
        signals: uniqueStrings([
          cluster.primarySource,
          ...cluster.topSources.slice(0, 2).map((item) => item.name),
        ], 4),
      };
    });

  const publicSentimentScore = clamp(state?.domainScores.public_sentiment ?? 0);
  const anomalyScore = clamp(state?.signalFusion.anomalyScore ?? 0);
  const signalAnomaly = (publicSentimentScore > 0.38 || anomalyScore > 0.4)
    ? [{
      id: 'scenario-sentiment-shift',
      title: 'drift اجتماعی-روایتی',
      summary: `امتیاز public sentiment برابر ${percent(publicSentimentScore)} و anomaly fusion برابر ${percent(anomalyScore)} است.`,
      severity: severityFromScore(clamp(publicSentimentScore * 0.56 + anomalyScore * 0.44)),
      score: clamp(publicSentimentScore * 0.56 + anomalyScore * 0.44),
      whyItMatters: 'ترکیب drift احساسی و signal anomaly می‌تواند پیش‌درآمد ناآرامی، قطبی‌سازی یا بازآرایی سناریوی غالب باشد.',
      signals: relevantSignals(state).slice(0, 3).map((signal) => signal.label),
    }]
    : [];

  return [...anomaliesFromClusters, ...signalAnomaly].slice(0, 4);
}

function buildAlerts(
  narrativeClusters: CognitiveNarrativeCluster[],
  anomalies: CognitiveSentimentAnomaly[],
  state: ScenarioEngineState | null | undefined,
): CognitiveAlert[] {
  const alerts: CognitiveAlert[] = [];
  const strongestNarrative = narrativeClusters[0];
  if (strongestNarrative && strongestNarrative.severityScore >= 0.54) {
    alerts.push({
      id: 'alert:narrative-cluster',
      kind: 'narrative-cluster',
      title: 'خوشه روایتی پرتنش',
      summary: `خوشه «${strongestNarrative.title}» با framing ${strongestNarrative.framingShift} و propaganda ${strongestNarrative.propagandaIntensity} به سطح هشدار رسیده است.`,
      severity: strongestNarrative.severity,
      watchSignals: strongestNarrative.evidence.slice(0, 3),
    });
  }

  const anomaly = anomalies[0];
  if (anomaly) {
    alerts.push({
      id: 'alert:sentiment-anomaly',
      kind: 'sentiment-anomaly',
      title: 'ناهنجاری sentiment',
      summary: anomaly.summary,
      severity: anomaly.severity,
      watchSignals: anomaly.signals,
    });
  }

  const coordinationScore = clamp(
    (MEDIA_PIPELINES.filter((pipeline) => ['running', 'scheduled'].includes(getPipelineState(pipeline.id).status)).length * 0.14)
    + ((state?.signalFusion.sourceDiversity ?? 0) / 6) * 0.32
    + (state?.domainScores.public_sentiment ?? 0) * 0.22
    + (narrativeClusters[0]?.severityScore ?? 0) * 0.24,
  );
  if (coordinationScore >= 0.4) {
    alerts.push({
      id: 'alert:coordination-campaign',
      kind: 'coordination-campaign',
      title: 'الگوی کمپین هماهنگ',
      summary: 'چند ردیف رسانه‌ای/پلتفرمی هم‌زمان روی یک محور روایتی همگرا شده‌اند و احتمال amplification سازمان‌یافته را بالا برده‌اند.',
      severity: severityFromScore(coordinationScore),
      watchSignals: uniqueStrings([
        ...MEDIA_PIPELINES.slice(0, 3).map((pipeline) => `${pipeline.title}: ${getPipelineState(pipeline.id).status}`),
        ...relevantSignals(state).slice(0, 2).map((signal) => signal.label),
      ], 4),
    });
  }

  if ((state?.domainScores.infrastructure ?? 0) >= 0.45 && (state?.domainScores.public_sentiment ?? 0) >= 0.38) {
    const infrastructureScore = state?.domainScores.infrastructure ?? 0;
    const sentimentScore = state?.domainScores.public_sentiment ?? 0;
    const topIndicators = state?.scenarios[0]?.indicators_to_watch ?? [];
    alerts.push({
      id: 'alert:structural-gap',
      kind: 'structural-gap',
      title: 'شکاف ساختاری روایت/زیرساخت',
      summary: 'ترکیب فشار اجتماعی و fragility زیرساختی می‌تواند بحران شناختی را از سطح narrative به سطح اختلال عملیاتی منتقل کند.',
      severity: severityFromScore(clamp((infrastructureScore * 0.56) + (sentimentScore * 0.44))),
      watchSignals: uniqueStrings([
        ...relevantSignals(state).slice(0, 2).map((signal) => signal.label),
        ...topIndicators.slice(0, 2),
      ], 4),
    });
  }

  return alerts.slice(0, 4);
}

function buildHeatmap(
  narrativeClusters: CognitiveNarrativeCluster[],
  anomalies: CognitiveSentimentAnomaly[],
  state: ScenarioEngineState | null | undefined,
): CognitiveHeatmapRow[] {
  const narrativePressure = clamp(narrativeClusters[0]?.severityScore ?? 0);
  const sentimentInstability = clamp(anomalies[0]?.score ?? state?.domainScores.public_sentiment ?? 0);
  const coordinationRisk = clamp(
    ((state?.signalFusion.sourceDiversity ?? 0) / 6) * 0.42
    + (state?.signalFusion.agreement ?? 0) * 0.18
    + (narrativePressure * 0.4),
  );
  const defenseReadiness = clamp(
    0.64
    - (state?.signalFusion.anomalyScore ?? 0) * 0.22
    - narrativePressure * 0.18
    + Math.min(0.16, (state?.scenarios[0]?.mitigation_options.length ?? 0) * 0.04),
  );
  const drift = clamp((state?.drift.length ?? 0) * 0.11);

  const buildCells = (id: string, current: number): CognitiveHeatmapCell[] => {
    const in72h = clamp(current + drift * 0.45);
    const in7d = clamp(current + drift * 0.62);
    return [
      { id: `${id}:current`, label: 'اکنون', value: current, severity: severityFromScore(current) },
      { id: `${id}:72h`, label: '72 ساعت', value: in72h, severity: severityFromScore(in72h) },
      { id: `${id}:7d`, label: '7 روز', value: in7d, severity: severityFromScore(in7d) },
    ];
  };

  return [
    { id: 'row:narrative', label: 'فشار روایت', cells: buildCells('narrative', narrativePressure) },
    { id: 'row:coordination', label: 'شبکه اثر', cells: buildCells('coordination', coordinationRisk) },
    { id: 'row:sentiment', label: 'drift احساسی', cells: buildCells('sentiment', sentimentInstability) },
    { id: 'row:defense', label: 'آمادگی دفاعی', cells: buildCells('defense', defenseReadiness) },
  ];
}

function buildDefensePlans(
  narrativeClusters: CognitiveNarrativeCluster[],
  anomalies: CognitiveSentimentAnomaly[],
  alerts: CognitiveAlert[],
  state: ScenarioEngineState | null | undefined,
): CognitiveDefensePlan[] {
  const topNarrative = narrativeClusters[0];
  const topScenario = state?.scenarios[0];
  const topAnomaly = anomalies[0];
  const topAlert = alerts[0];

  const plans: CognitiveDefensePlan[] = [
    {
      id: 'plan:counter-narrative',
      title: 'خط روایی جایگزین و fact-based',
      summary: 'برای جلوگیری از capture روایی، باید یک narrative کوتاه، قابل‌استناد و مبتنی بر timeline تاییدشده منتشر شود.',
      focusArea: 'counter-narrative',
      severity: topNarrative?.severity ?? 'medium',
      counterNarratives: uniqueStrings([
        topNarrative ? `این رخداد را از محور «${topNarrative.alignedNarrative}» به محور «اطلاعات تاییدشده و روند واقعی» برگردانید.` : 'روایت جایگزین را بر داده تاییدشده و تفکیک شایعه از واقعیت بنا کنید.',
        topAlert ? `بجای amplification ${topAlert.title}، بر مشاهده‌پذیری و دامنه واقعی رخداد تاکید کنید.` : undefined,
        topScenario ? `پیام اصلی: سناریوی غالب فعلا «${topScenario.title}» است و نشانه‌های ابطال/تشدید مشخص دارد.` : undefined,
      ], 3),
      responsePlan: [
        'یک timeline کوتاه و قابل ممیزی از facts، unknowns و watchpointها منتشر شود.',
        'منابع اولیه و ثانویه از هم جدا شوند تا بازنشرهای ثانویه به‌جای شواهد اولیه ننشینند.',
        'در صورت تشدید، یک FAQ کوتاه برای پاسخ سریع به شایعات غالب آماده شود.',
      ],
    },
    {
      id: 'plan:platform-response',
      title: 'پاسخ پلتفرمی و کنترل amplification',
      summary: 'اگر کمپین هماهنگ یا drift احساسی تشدید شود، response plan باید روی cadence پایش، اولویت‌بندی کانال‌ها و راستی‌آزمایی سریع متمرکز بماند.',
      focusArea: 'platform-response',
      severity: severityFromScore(clamp((topAnomaly?.score ?? 0.34) * 0.6 + (alerts.length * 0.08))),
      counterNarratives: [
        'محور پاسخ باید «کاهش ابهام» باشد، نه جدل روایی فرسایشی.',
        'به‌جای تکذیب کلی، بر gapهای مشخص، منبع اولیه و زمان‌بندی انتشار تمرکز شود.',
      ],
      responsePlan: uniqueStrings([
        ...MEDIA_PIPELINES.slice(0, 3).map((pipeline) => `وضعیت ${pipeline.title} هر چرخه بازبینی و ثبت شود.`),
        'برای کانال‌های پرریسک، آستانه escalation و مسیر ارجاع تحلیلی از قبل تعریف شود.',
        topAnomaly ? `سیگنال‌های «${topAnomaly.title}» هر 4-6 ساعت بازپایش شوند.` : undefined,
      ], 4),
    },
    {
      id: 'plan:cross-domain-defense',
      title: 'طرح پاسخ میان‌دامنه‌ای',
      summary: 'وقتی narrative pressure با fragility عملیاتی جمع می‌شود، دفاع شناختی باید با حفاظت زیرساخت، visibility و پایش اجتماعی هم‌قفل شود.',
      focusArea: 'cross-domain-defense',
      severity: severityFromScore(clamp((state?.domainScores.infrastructure ?? 0) * 0.44 + (state?.domainScores.public_sentiment ?? 0) * 0.4 + 0.1)),
      counterNarratives: [
        'پیام دفاعی باید بگوید که هر اختلال روایتا مهم، لزوما به معنای فروپاشی عملیاتی نیست.',
        'به‌جای روایت کلی بحران، روی dependencyهای واقعی، اقدامات مهار و شاخص‌های بازگشت تاکید شود.',
      ],
      responsePlan: uniqueStrings([
        ...(topScenario?.mitigation_options ?? []).slice(0, 3),
        ...(topScenario?.indicators_to_watch ?? []).slice(0, 2).map((indicator) => `watchpoint اجرایی: ${indicator}`),
        'در صورت رشد سیگنال‌های متناقض، panelهای سناریو و War Room دوباره اجرا شوند.',
      ], 5),
    },
  ];

  return plans;
}

function buildEvidenceStack(
  narrativeClusters: CognitiveNarrativeCluster[],
  anomalies: CognitiveSentimentAnomaly[],
  state: ScenarioEngineState | null | undefined,
): CognitiveEvidenceItem[] {
  const clusterEvidence = narrativeClusters.flatMap((cluster) =>
    cluster.evidence.slice(0, 2).map((item, index) => ({
      id: `${cluster.id}:evidence:${index}`,
      title: cluster.title,
      source: item.split(':')[0] || 'Narrative',
      detail: item,
      severity: cluster.severity,
    })));
  const anomalyEvidence = anomalies.map((anomaly) => ({
    id: `${anomaly.id}:evidence`,
    title: anomaly.title,
    source: 'Sentiment',
    detail: anomaly.summary,
    severity: anomaly.severity,
  }));
  const signalEvidence = relevantSignals(state).slice(0, 3).map((signal) => ({
    id: `${signal.id}:evidence`,
    title: signal.label,
    source: signal.source,
    detail: signal.summary,
    severity: severityFromScore(signalMatchScore(signal)),
  }));

  return [...clusterEvidence, ...anomalyEvidence, ...signalEvidence].slice(0, 8);
}

function buildMetrics(
  narrativeClusters: CognitiveNarrativeCluster[],
  anomalies: CognitiveSentimentAnomaly[],
  alerts: CognitiveAlert[],
  state: ScenarioEngineState | null | undefined,
): CognitiveMetricCard[] {
  const narrativePressure = clamp(narrativeClusters[0]?.severityScore ?? 0);
  const coordinationRisk = clamp(
    ((state?.signalFusion.sourceDiversity ?? 0) / 6) * 0.36
    + (state?.signalFusion.anomalyScore ?? 0) * 0.24
    + narrativePressure * 0.4,
  );
  const sentimentInstability = clamp(anomalies[0]?.score ?? state?.domainScores.public_sentiment ?? 0);
  const defenseReadiness = clamp(
    0.62
    - coordinationRisk * 0.18
    - sentimentInstability * 0.16
    + Math.min(0.18, (state?.scenarios[0]?.mitigation_options.length ?? 0) * 0.04)
    + Math.min(0.12, alerts.length * 0.03),
  );

  return [
    {
      id: 'metric:narrative-pressure',
      label: 'فشار روایت',
      value: percent(narrativePressure),
      note: 'شدت framing shift و propaganda در خوشه غالب',
      severity: severityFromScore(narrativePressure),
    },
    {
      id: 'metric:coordination-risk',
      label: 'ریسک هماهنگی',
      value: percent(coordinationRisk),
      note: 'همگرایی چندمنبعی و احتمال amplification',
      severity: severityFromScore(coordinationRisk),
    },
    {
      id: 'metric:sentiment-instability',
      label: 'بی‌ثباتی sentiment',
      value: percent(sentimentInstability),
      note: 'drift احساسی و پتانسیل ناپایداری',
      severity: severityFromScore(sentimentInstability),
    },
    {
      id: 'metric:defense-readiness',
      label: 'آمادگی دفاعی',
      value: percent(defenseReadiness),
      note: 'آمادگی response plan و watchpointهای مهار',
      severity: severityFromScore(defenseReadiness),
    },
  ];
}

function buildSummary(
  narrativeClusters: CognitiveNarrativeCluster[],
  alerts: CognitiveAlert[],
  anomalies: CognitiveSentimentAnomaly[],
  state: ScenarioEngineState | null | undefined,
): { summary: string; boardSummary: string; watchIndicators: string[] } {
  const anchor = state?.anchorLabel || 'این محدوده';
  const topNarrative = narrativeClusters[0];
  const topScenario = state?.scenarios[0];
  const watchIndicators = uniqueStrings([
    ...(topScenario?.indicators_to_watch ?? []).slice(0, 3),
    ...alerts.flatMap((alert) => alert.watchSignals).slice(0, 4),
    ...anomalies.flatMap((anomaly) => anomaly.signals).slice(0, 3),
  ], 7);

  const summary = topNarrative
    ? `در ${anchor}، خوشه «${topNarrative.title}» به‌عنوان محور اصلی نبرد روایت ظاهر شده و باید همراه با drift احساسی، وضعیت pipelineها و triggerهای سناریوی غالب بازپایش شود.`
    : `در ${anchor} هنوز خوشه روایتی مسلط شکل نگرفته، اما signalهای شناختی و watchpointهای اجتماعی باید به‌صورت پیوسته جمع شوند.`;

  const boardSummary = [
    `${narrativeClusters.length} خوشه روایی`,
    `${alerts.length} هشدار`,
    `${anomalies.length} ناهنجاری sentiment`,
    topScenario ? `سناریوی مرجع: ${topScenario.title}` : undefined,
  ].filter(Boolean).join(' | ');

  return { summary, boardSummary, watchIndicators };
}

export function buildCognitiveWarfareModel(input: CognitiveWarfareInput): CognitiveWarfareModel {
  const analyses = buildNarrativeAnalysis(input.news, input.clusters);
  const narrativeClusters = buildNarrativeClusters(analyses);
  const sentimentAnomalies = buildSentimentAnomalies(input.clusters, input.scenarioState);
  const alerts = buildAlerts(narrativeClusters, sentimentAnomalies, input.scenarioState);
  const influenceGraph = buildInfluenceGraph(narrativeClusters, analyses, input.scenarioState);
  const defensePlans = buildDefensePlans(narrativeClusters, sentimentAnomalies, alerts, input.scenarioState);
  const heatmap = buildHeatmap(narrativeClusters, sentimentAnomalies, input.scenarioState);
  const evidenceStack = buildEvidenceStack(narrativeClusters, sentimentAnomalies, input.scenarioState);
  const metrics = buildMetrics(narrativeClusters, sentimentAnomalies, alerts, input.scenarioState);
  const { summary, boardSummary, watchIndicators } = buildSummary(
    narrativeClusters,
    alerts,
    sentimentAnomalies,
    input.scenarioState,
  );

  return {
    generatedAt: new Date().toISOString(),
    summary,
    boardSummary,
    metrics,
    alerts,
    narrativeClusters,
    influenceGraph,
    sentimentAnomalies,
    heatmap,
    defensePlans,
    evidenceStack,
    watchIndicators,
  };
}
