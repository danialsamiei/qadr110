import type {
  ScenarioDomain,
  ScenarioEngineScenario,
  ScenarioEngineState,
  ScenarioSignalPolarity,
  ScenarioSignalRecord,
} from './scenario-engine';

export type ScenarioGraphEdgeType =
  | 'amplification'
  | 'suppression'
  | 'dependency'
  | 'contradiction'
  | 'convergence';

export type ScenarioBattlefieldStatus =
  | 'dominant'
  | 'fragile'
  | 'contested'
  | 'emergent'
  | 'stable';

export interface ScenarioGraphNode {
  id: string;
  scenarioId: string;
  title: string;
  summary: string;
  domains: ScenarioDomain[];
  probabilityScore: number;
  impactScore: number;
  confidenceScore: number;
  strategicScore: number;
  supportScore: number;
  centrality: number;
  fragility: number;
  dominance: number;
  contestedness: number;
  blackSwanScore: number;
  clusterId: string | null;
  trendDirection: 'up' | 'down' | 'flat';
  status: ScenarioBattlefieldStatus;
  drivers: string[];
  indicators: string[];
}

export interface ScenarioGraphEdge {
  id: string;
  from: string;
  to: string;
  type: ScenarioGraphEdgeType;
  weight: number;
  direction: 'forward' | 'backward' | 'bidirectional';
  explanation: string;
  sharedDrivers: string[];
  decisiveIndicators: string[];
}

export interface ScenarioGraphCluster {
  id: string;
  label: string;
  nodeIds: string[];
  cohesion: number;
  dominance: number;
  instability: number;
}

export interface ScenarioGraphConflictZone {
  id: string;
  label: string;
  nodeIds: string[];
  intensity: number;
  summary: string;
  dominantEdgeTypes: ScenarioGraphEdgeType[];
  decisiveIndicators: string[];
  blackSwanPressure: number;
}

export interface ScenarioGraphBlackSwanOutlier {
  scenarioId: string;
  title: string;
  score: number;
  why: string;
  watchpoints: string[];
}

export interface ScenarioBattlefieldEntry {
  scenarioId: string;
  title: string;
  rank: number;
  dominance: number;
  fragility: number;
  contestedness: number;
  battlefieldWeight: number;
  updatedProbabilityScore: number;
  status: ScenarioBattlefieldStatus;
  summary: string;
}

export interface ScenarioGraphOutput {
  trigger: string;
  anchorLabel: string;
  nodes: ScenarioGraphNode[];
  edges: ScenarioGraphEdge[];
  centralScenarioIds: string[];
  fragileScenarioIds: string[];
  dominantClusters: ScenarioGraphCluster[];
  unstableRegions: ScenarioGraphConflictZone[];
  blackSwanOutliers: ScenarioGraphBlackSwanOutlier[];
  battlefieldState: ScenarioBattlefieldEntry[];
  narrativeExplanation: string;
}

export interface ScenarioWarShift {
  scenarioId: string;
  title: string;
  delta: number;
  reason: string;
}

export interface ScenarioWarTransfer {
  winnerScenarioId: string;
  loserScenarioId: string;
  effect: 'weakened' | 'absorbed';
  weightShift: number;
  reason: string;
}

export interface ScenarioWarResult {
  battlefieldState: ScenarioBattlefieldEntry[];
  updatedProbabilityRedistribution: Record<string, number>;
  shifts: ScenarioWarShift[];
  transfers: ScenarioWarTransfer[];
  narrative: string;
}

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
  return Array.from(new Set(
    values
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  )).slice(0, maxItems);
}

function tokenize(value: string): Set<string> {
  const matches = value.toLowerCase().match(/[a-z0-9\u0600-\u06ff]{3,}/g) ?? [];
  return new Set(matches);
}

function overlapRatio<T>(left: Set<T>, right: Set<T>): number {
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union > 0 ? intersection / union : 0;
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

function confidenceScore(scenario: ScenarioEngineScenario): number {
  if (typeof scenario.confidence_score === 'number') return clamp(scenario.confidence_score);
  if (scenario.confidence_level === 'high') return 0.78;
  if (scenario.confidence_level === 'low') return 0.28;
  return 0.54;
}

function strategicScore(scenario: ScenarioEngineScenario): number {
  return clamp(
    (scenario.strategic_relevance ?? 0.48) * 0.58
    + (scenario.likelihood_score ?? probabilityScore(scenario)) * 0.22
    + (impactScore(scenario) * 0.2),
  );
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

function scenarioDirection(scenario: ScenarioEngineScenario): 'escalatory' | 'stabilizing' | 'neutral' {
  const lower = scenarioCorpus(scenario).toLowerCase();
  const escalatoryHits = ESCALATORY_HINTS.filter((hint) => lower.includes(hint)).length;
  const stabilizingHits = STABILIZING_HINTS.filter((hint) => lower.includes(hint)).length;
  if (stabilizingHits > escalatoryHits) return 'stabilizing';
  if (escalatoryHits > stabilizingHits) return 'escalatory';
  if (scenario.trend_direction === 'down') return 'stabilizing';
  if (scenario.trend_direction === 'up') return 'escalatory';
  return 'neutral';
}

function scenarioHorizonRank(value: string): number {
  const lower = value.toLowerCase();
  if (lower.includes('hour') || lower.includes('ساعت')) return 1;
  if (lower.includes('day') || lower.includes('روز')) return 2;
  if (lower.includes('week') || lower.includes('هفته')) return 3;
  return 2.5;
}

function sharedItems(left: string[], right: string[], maxItems = 4): string[] {
  const rightSet = new Set(right.map((item) => item.trim()).filter(Boolean));
  return left.filter((item) => rightSet.has(item.trim())).slice(0, maxItems);
}

function scenarioSignalAlignment(
  scenario: ScenarioEngineScenario,
  signal: ScenarioSignalRecord,
): number {
  const scenarioTokens = tokenize(scenarioCorpus(scenario));
  const signalTokens = tokenize(`${signal.label} ${signal.summary}`);
  const tokenScore = overlapRatio(scenarioTokens, signalTokens);
  const domainScore = overlapRatio(
    new Set(scenarioDomains(scenario)),
    new Set(Object.keys(signal.domainWeights) as ScenarioDomain[]),
  );
  return clamp((tokenScore * 0.56) + (domainScore * 0.44));
}

function supportScore(
  scenario: ScenarioEngineScenario,
  signals: ScenarioSignalRecord[],
): number {
  if (signals.length === 0) return 0.34;
  const direction = scenarioDirection(scenario);
  const total = signals.reduce((sum, signal) => {
    const alignment = scenarioSignalAlignment(scenario, signal);
    let polarityFactor = 0.12;
    if (signal.polarity === 'neutral') {
      polarityFactor = 0.18;
    } else if (direction === 'neutral') {
      polarityFactor = 0.22;
    } else if (
      (signal.polarity === 'escalatory' && direction === 'escalatory')
      || (signal.polarity === 'stabilizing' && direction === 'stabilizing')
    ) {
      polarityFactor = 1;
    } else {
      polarityFactor = -0.42;
    }
    return sum + (alignment * signal.strength * polarityFactor);
  }, 0);
  return clamp(0.46 + (total / Math.max(1, signals.length)));
}

function relationshipTypeForPair(
  left: ScenarioEngineScenario,
  right: ScenarioEngineScenario,
  signals: ScenarioSignalRecord[],
): {
  type: ScenarioGraphEdgeType | null;
  weight: number;
  direction: ScenarioGraphEdge['direction'];
  explanation: string;
  sharedDrivers: string[];
  decisiveIndicators: string[];
} {
  const tokenOverlap = overlapRatio(tokenize(scenarioCorpus(left)), tokenize(scenarioCorpus(right)));
  const domainOverlap = overlapRatio(new Set(scenarioDomains(left)), new Set(scenarioDomains(right)));
  const driverOverlap = overlapRatio(new Set(left.drivers), new Set(right.drivers));
  const indicatorOverlap = overlapRatio(new Set(left.indicators_to_watch), new Set(right.indicators_to_watch));
  const supportLeft = supportScore(left, signals);
  const supportRight = supportScore(right, signals);
  const supportDelta = Math.abs(supportLeft - supportRight);
  const sameDirection = scenarioDirection(left) === scenarioDirection(right) && scenarioDirection(left) !== 'neutral';
  const opposition = scenarioDirection(left) !== scenarioDirection(right)
    && scenarioDirection(left) !== 'neutral'
    && scenarioDirection(right) !== 'neutral';
  const sharedDrivers = sharedItems(left.drivers, right.drivers, 3);
  const decisiveIndicators = uniqueStrings([
    ...sharedItems(left.indicators_to_watch, right.indicators_to_watch, 3),
    ...(supportLeft >= supportRight ? left.indicators_to_watch : right.indicators_to_watch).slice(0, 2),
  ], 4);

  const positiveAffinity = clamp(
    (tokenOverlap * 0.28)
    + (domainOverlap * 0.3)
    + (driverOverlap * 0.22)
    + (indicatorOverlap * 0.2)
    + ((1 - supportDelta) * 0.14)
    + (sharedDrivers.length > 0 ? 0.08 : 0),
  );
  const dependencyScore = clamp(
    (sharedDrivers.length > 0 ? 0.24 : 0)
    + (Math.abs(scenarioHorizonRank(left.time_horizon) - scenarioHorizonRank(right.time_horizon)) >= 1 ? 0.22 : 0)
    + (domainOverlap * 0.26)
    + (supportDelta * 0.12),
  );
  const contradictionScore = clamp(
    (opposition ? 0.38 : 0)
    + (tokenOverlap * 0.24)
    + (domainOverlap * 0.18)
    + (supportDelta * 0.2),
  );

  if (contradictionScore >= 0.58) {
    const dominantSide = supportLeft >= supportRight ? left.id : right.id;
    const suppressedSide = dominantSide === left.id ? right.id : left.id;
    const type: ScenarioGraphEdgeType = supportDelta >= 0.14 ? 'suppression' : 'contradiction';
    return {
      type,
      weight: round(contradictionScore),
      direction: type === 'suppression'
        ? dominantSide === left.id ? 'forward' : 'backward'
        : 'bidirectional',
      explanation: type === 'suppression'
        ? `سناریوی «${dominantSide === left.id ? left.title : right.title}» با پشتیبانی سیگنال قوی‌تر، plausibility «${suppressedSide === left.id ? left.title : right.title}» را عقب می‌زند.`
        : `این دو سناریو برای توضیح آینده‌ی یک کانون مشترک رقابت مستقیم دارند و evidence جدید می‌تواند winner را جابه‌جا کند.`,
      sharedDrivers,
      decisiveIndicators,
    };
  }

  if (dependencyScore >= 0.56 && positiveAffinity >= 0.18) {
    const forward = scenarioHorizonRank(left.time_horizon) <= scenarioHorizonRank(right.time_horizon);
    return {
      type: 'dependency',
      weight: round(Math.max(dependencyScore, positiveAffinity)),
      direction: forward ? 'forward' : 'backward',
      explanation: `بین «${left.title}» و «${right.title}» یک وابستگی مرحله‌ای وجود دارد؛ یکی می‌تواند محرک یا شرط لازم دیگری شود.`,
      sharedDrivers: sharedDrivers.length > 0 ? sharedDrivers : uniqueStrings([...left.drivers, ...right.drivers], 3),
      decisiveIndicators,
    };
  }

  if (positiveAffinity >= 0.62 && sameDirection) {
    return {
      type: 'amplification',
      weight: round(positiveAffinity),
      direction: 'bidirectional',
      explanation: `این دو سناریو از مسیر driverها و شاخص‌های مشترک یکدیگر را تقویت می‌کنند.`,
      sharedDrivers,
      decisiveIndicators,
    };
  }

  if (positiveAffinity >= 0.3) {
    return {
      type: 'convergence',
      weight: round(positiveAffinity),
      direction: 'bidirectional',
      explanation: `این دو سناریو با وجود تفاوت‌های تاکتیکی، به یک الگوی راهبردی همگرا می‌شوند.`,
      sharedDrivers,
      decisiveIndicators,
    };
  }

  return {
    type: null,
    weight: 0,
    direction: 'bidirectional',
    explanation: '',
    sharedDrivers,
    decisiveIndicators,
  };
}

function connectedComponents(nodeIds: string[], edges: ScenarioGraphEdge[]): string[][] {
  const adjacency = new Map<string, Set<string>>();
  nodeIds.forEach((id) => adjacency.set(id, new Set()));
  edges.forEach((edge) => {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  });

  const seen = new Set<string>();
  const components: string[][] = [];
  nodeIds.forEach((id) => {
    if (seen.has(id)) return;
    const queue = [id];
    const component: string[] = [];
    seen.add(id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      adjacency.get(current)?.forEach((next) => {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      });
    }
    components.push(component);
  });
  return components;
}

function statusForNode(node: Pick<ScenarioGraphNode, 'dominance' | 'fragility' | 'contestedness' | 'trendDirection'>): ScenarioBattlefieldStatus {
  if (node.dominance >= 0.7 && node.contestedness < 0.45) return 'dominant';
  if (node.fragility >= 0.66) return 'fragile';
  if (node.contestedness >= 0.52) return 'contested';
  if (node.trendDirection === 'up' && node.dominance >= 0.42) return 'emergent';
  return 'stable';
}

export function buildScenarioGraph(state: ScenarioEngineState): ScenarioGraphOutput {
  const scenarioMap = new Map(state.scenarios.map((scenario) => [scenario.id, scenario]));
  const nodeDrafts = state.scenarios.map((scenario) => ({
    scenario,
    probabilityScore: probabilityScore(scenario),
    impactScore: impactScore(scenario),
    confidenceScore: confidenceScore(scenario),
    strategicScore: strategicScore(scenario),
    supportScore: supportScore(scenario, state.signals),
  }));

  const edges: ScenarioGraphEdge[] = [];
  for (let index = 0; index < nodeDrafts.length; index += 1) {
    for (let inner = index + 1; inner < nodeDrafts.length; inner += 1) {
      const left = nodeDrafts[index]!;
      const right = nodeDrafts[inner]!;
      const relationship = relationshipTypeForPair(left.scenario, right.scenario, state.signals);
      if (!relationship.type) continue;
      edges.push({
        id: `graph-edge:${left.scenario.id}:${right.scenario.id}`,
        from: left.scenario.id,
        to: right.scenario.id,
        type: relationship.type,
        weight: relationship.weight,
        direction: relationship.direction,
        explanation: relationship.explanation,
        sharedDrivers: relationship.sharedDrivers,
        decisiveIndicators: relationship.decisiveIndicators,
      });
    }
  }

  const maxIncidentWeight = Math.max(0.01, ...nodeDrafts.map(({ scenario }) => edges
    .filter((edge) => edge.from === scenario.id || edge.to === scenario.id)
    .reduce((sum, edge) => sum + edge.weight, 0)));
  const anomalyPressure = clamp(state.signalFusion.anomalyScore);
  const disagreementPressure = clamp(1 - state.signalFusion.agreement);

  const nodes: ScenarioGraphNode[] = nodeDrafts.map(({ scenario, probabilityScore: p, impactScore: i, confidenceScore: c, strategicScore: s, supportScore: support }) => {
    const incidentEdges = edges.filter((edge) => edge.from === scenario.id || edge.to === scenario.id);
    const incidentWeight = incidentEdges.reduce((sum, edge) => sum + edge.weight, 0);
    const centrality = clamp(incidentWeight / maxIncidentWeight);
    const negativePressure = incidentEdges
      .filter((edge) => edge.type === 'suppression' || edge.type === 'contradiction')
      .reduce((sum, edge) => sum + edge.weight, 0);
    const dependencyIncoming = incidentEdges
      .filter((edge) => edge.type === 'dependency' && (
        (edge.direction === 'forward' && edge.to === scenario.id)
        || (edge.direction === 'backward' && edge.from === scenario.id)
      ))
      .reduce((sum, edge) => sum + edge.weight, 0);
    const contestedness = clamp(negativePressure / Math.max(0.2, incidentWeight || 0.2));
    const fragility = clamp(
      ((1 - c) * 0.3)
      + (contestedness * 0.34)
      + (dependencyIncoming * 0.18)
      + (disagreementPressure * 0.18),
    );
    const blackSwanScore = clamp(
      ((1 - p) * 0.28)
      + (i * 0.28)
      + ((1 - c) * 0.18)
      + (anomalyPressure * 0.16)
      + (disagreementPressure * 0.1),
    );
    const dominance = clamp(
      (p * 0.28)
      + (i * 0.22)
      + (s * 0.14)
      + (support * 0.12)
      + (centrality * 0.16)
      - (contestedness * 0.08)
      - (fragility * 0.06),
    );
    const node: ScenarioGraphNode = {
      id: scenario.id,
      scenarioId: scenario.id,
      title: scenario.title,
      summary: scenario.description,
      domains: scenarioDomains(scenario),
      probabilityScore: round(p),
      impactScore: round(i),
      confidenceScore: round(c),
      strategicScore: round(s),
      supportScore: round(support),
      centrality: round(centrality),
      fragility: round(fragility),
      dominance: round(dominance),
      contestedness: round(contestedness),
      blackSwanScore: round(blackSwanScore),
      clusterId: null,
      trendDirection: scenario.trend_direction ?? 'flat',
      status: 'stable',
      drivers: scenario.drivers.slice(0, 5),
      indicators: scenario.indicators_to_watch.slice(0, 5),
    };
    node.status = statusForNode(node);
    return node;
  });

  const positiveEdges = edges.filter((edge) => edge.type === 'amplification' || edge.type === 'dependency' || edge.type === 'convergence');
  const components = connectedComponents(nodes.map((node) => node.id), positiveEdges.filter((edge) => edge.weight >= 0.34));
  const dominantClusters: ScenarioGraphCluster[] = components.map((nodeIds, index) => {
    const clusterNodes = nodes.filter((node) => nodeIds.includes(node.id));
    const clusterEdges = positiveEdges.filter((edge) => nodeIds.includes(edge.from) && nodeIds.includes(edge.to));
    const cohesion = clusterEdges.length > 0
      ? clusterEdges.reduce((sum, edge) => sum + edge.weight, 0) / clusterEdges.length
      : clusterNodes.length === 1 ? 0.28 : 0.2;
    const dominance = clusterNodes.reduce((sum, node) => sum + node.dominance, 0) / Math.max(1, clusterNodes.length);
    const instability = clamp(clusterNodes.reduce((sum, node) => sum + Math.max(node.contestedness, node.blackSwanScore), 0) / Math.max(1, clusterNodes.length));
    const labelSeed = clusterNodes[0]?.domains[0] ?? 'geopolitics';
    const label = clusterNodes.length === 1
      ? `گره منفرد: ${clusterNodes[0]?.title || `سناریو ${index + 1}`}`
      : `خوشه ${index + 1} | ${labelSeed}`;
    clusterNodes.forEach((node) => {
      const mutable = nodes.find((item) => item.id === node.id);
      if (mutable) mutable.clusterId = `scenario-cluster:${index + 1}`;
    });
    return {
      id: `scenario-cluster:${index + 1}`,
      label,
      nodeIds,
      cohesion: round(cohesion),
      dominance: round(dominance),
      instability: round(instability),
    };
  }).sort((left, right) => right.dominance - left.dominance);

  const negativeEdges = edges.filter((edge) => edge.type === 'suppression' || edge.type === 'contradiction');
  const unstableRegions = connectedComponents(nodes.map((node) => node.id), negativeEdges.filter((edge) => edge.weight >= 0.4))
    .filter((nodeIds) => nodeIds.length > 1)
    .map((nodeIds, index) => {
      const regionEdges = negativeEdges.filter((edge) => nodeIds.includes(edge.from) && nodeIds.includes(edge.to));
      const regionNodes = nodes.filter((node) => nodeIds.includes(node.id));
      const intensity = clamp(regionEdges.reduce((sum, edge) => sum + edge.weight, 0) / Math.max(1, regionEdges.length));
      const blackSwanPressure = clamp(regionNodes.reduce((sum, node) => sum + node.blackSwanScore, 0) / Math.max(1, regionNodes.length));
      return {
        id: `scenario-conflict-zone:${index + 1}`,
        label: `منطقه ناپایدار ${index + 1}`,
        nodeIds,
        intensity: round(intensity),
        summary: `این ناحیه از graph محل برخورد futures است؛ ${regionEdges.length} edge تعارض/سرکوب بین ${regionNodes.length} سناریو دیده می‌شود.`,
        dominantEdgeTypes: Array.from(new Set(regionEdges.map((edge) => edge.type))).slice(0, 3),
        decisiveIndicators: uniqueStrings(regionEdges.flatMap((edge) => edge.decisiveIndicators), 5),
        blackSwanPressure: round(blackSwanPressure),
      } satisfies ScenarioGraphConflictZone;
    })
    .sort((left, right) => right.intensity - left.intensity);

  const blackSwanOutliers = nodes
    .filter((node) => node.blackSwanScore >= 0.56 || (node.impactScore >= 0.75 && node.probabilityScore <= 0.42))
    .map((node) => {
      const scenario = scenarioMap.get(node.id)!;
      return {
        scenarioId: node.id,
        title: node.title,
        score: node.blackSwanScore,
        why: `این سناریو با وجود probability پایین‌تر، impact و uncertainty بالایی دارد و فشار anomaly=${Math.round(anomalyPressure * 100)}% روی آن دیده می‌شود.`,
        watchpoints: uniqueStrings([
          ...scenario.indicators_to_watch.slice(0, 3),
          ...scenario.second_order_effects.slice(0, 2),
        ], 4),
      } satisfies ScenarioGraphBlackSwanOutlier;
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);

  const battlefieldState = nodes
    .map((node) => ({
      scenarioId: node.id,
      title: node.title,
      rank: 0,
      dominance: node.dominance,
      fragility: node.fragility,
      contestedness: node.contestedness,
      battlefieldWeight: round(
        (node.dominance * 0.48)
        + (node.centrality * 0.18)
        + (node.supportScore * 0.14)
        + ((1 - node.fragility) * 0.08)
        + ((1 - node.contestedness) * 0.12),
      ),
      updatedProbabilityScore: node.probabilityScore,
      status: node.status,
      summary: node.status === 'dominant'
        ? 'در مرکز شبکه قرار دارد و فعلا explanatory dominance بالاتری دارد.'
        : node.status === 'fragile'
          ? 'به داده‌های جدید و dependencyهای بیرونی حساس است.'
          : node.status === 'contested'
            ? 'با futures رقیب در یک میدان تنش قرار دارد.'
            : node.status === 'emergent'
              ? 'در حال بالا آمدن است و هنوز تثبیت نشده.'
              : 'در وضعیت متعادل‌تری قرار دارد.',
    }))
    .sort((left, right) => right.battlefieldWeight - left.battlefieldWeight)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  const centralScenarioIds = nodes
    .slice()
    .sort((left, right) => right.centrality - left.centrality)
    .slice(0, 3)
    .map((node) => node.id);
  const fragileScenarioIds = nodes
    .slice()
    .sort((left, right) => right.fragility - left.fragility)
    .slice(0, 3)
    .map((node) => node.id);

  const topCluster = dominantClusters[0];
  const topConflict = unstableRegions[0];
  const leadBattle = battlefieldState[0];
  const narrativeExplanation = uniqueStrings([
    leadBattle ? `سناریوی «${leadBattle.title}» فعلا با وزن ${Math.round(leadBattle.battlefieldWeight * 100)}% در battlefield جلوتر است.` : '',
    topCluster ? `${topCluster.label} با cohesion=${Math.round(topCluster.cohesion * 100)}% dominant cluster فعلی است.` : '',
    topConflict ? `${topConflict.label} با شدت ${Math.round(topConflict.intensity * 100)}% ناپایدارترین ناحیه گراف است.` : '',
    blackSwanOutliers[0] ? `کاندید black swan برجسته: «${blackSwanOutliers[0].title}».` : 'فعلا black swan برجسته‌ای فراتر از سناریوهای موجود دیده نشد.',
  ], 4).join(' ');

  return {
    trigger: state.trigger,
    anchorLabel: state.anchorLabel,
    nodes,
    edges,
    centralScenarioIds,
    fragileScenarioIds,
    dominantClusters,
    unstableRegions,
    blackSwanOutliers,
    battlefieldState,
    narrativeExplanation,
  };
}

function polarityFactor(
  signalPolarity: ScenarioSignalPolarity,
  direction: 'escalatory' | 'stabilizing' | 'neutral',
): number {
  if (signalPolarity === 'neutral') return 0.12;
  if (direction === 'neutral') return 0.28;
  if (
    (signalPolarity === 'escalatory' && direction === 'escalatory')
    || (signalPolarity === 'stabilizing' && direction === 'stabilizing')
  ) {
    return 1;
  }
  return -0.72;
}

export function simulateScenarioWar(
  graph: ScenarioGraphOutput,
  signals: ScenarioSignalRecord[],
): ScenarioWarResult {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const draft = new Map(graph.nodes.map((node) => [node.id, { delta: 0 }]));
  const shifts: ScenarioWarShift[] = [];

  graph.nodes.forEach((node) => {
    const scenarioDirectionValue = scenarioDirection({
      id: node.scenarioId,
      title: node.title,
      description: node.summary,
      probability: 'medium',
      impact_level: 'medium',
      time_horizon: 'روزها',
      drivers: node.drivers,
      causal_chain: [],
      indicators_to_watch: node.indicators,
      mitigation_options: [],
      uncertainty_level: 'medium',
      second_order_effects: [],
      cross_domain_impacts: {},
    } as ScenarioEngineScenario);
    const shift = signals.reduce((sum, signal) => {
      const tokenScore = overlapRatio(tokenize(`${node.title} ${node.summary} ${node.drivers.join(' ')} ${node.indicators.join(' ')}`), tokenize(`${signal.label} ${signal.summary}`));
      const domainScore = overlapRatio(new Set(node.domains), new Set(Object.keys(signal.domainWeights) as ScenarioDomain[]));
      const alignment = clamp((tokenScore * 0.52) + (domainScore * 0.48));
      return sum + (alignment * signal.strength * polarityFactor(signal.polarity, scenarioDirectionValue) * 0.12);
    }, 0);
    const draftEntry = draft.get(node.id)!;
    draftEntry.delta += shift;
  });

  const transfers: ScenarioWarTransfer[] = [];
  graph.edges.forEach((edge) => {
    const from = draft.get(edge.from);
    const to = draft.get(edge.to);
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (!from || !to || !fromNode || !toNode) return;

    if (edge.type === 'amplification' || edge.type === 'convergence') {
      const syncBoost = edge.weight * 0.03;
      from.delta += syncBoost;
      to.delta += syncBoost;
      return;
    }

    if (edge.type === 'dependency') {
      const forwardFrom = edge.direction !== 'backward';
      const source = forwardFrom ? from : to;
      const dependent = forwardFrom ? to : from;
      dependent.delta += source.delta * edge.weight * 0.18;
      return;
    }

    const leader = from.delta + fromNode.dominance >= to.delta + toNode.dominance ? from : to;
    const trailer = leader === from ? to : from;
    const leaderId = leader === from ? edge.from : edge.to;
    const trailerId = leader === from ? edge.to : edge.from;
    const leaderNode = nodeMap.get(leaderId)!;
    const transfer = edge.weight * Math.max(0.02, Math.abs((leader.delta + leaderNode.dominance) - (trailer.delta + nodeMap.get(trailerId)!.dominance))) * 0.16;

    leader.delta += transfer;
    trailer.delta -= transfer;

    const effect: ScenarioWarTransfer['effect'] = transfer >= 0.08 && edge.type === 'suppression' ? 'absorbed' : 'weakened';
    transfers.push({
      winnerScenarioId: leaderId,
      loserScenarioId: trailerId,
      effect,
      weightShift: round(transfer),
      reason: edge.explanation,
    });
  });

  const rawEntries = graph.nodes.map((node) => {
    const delta = draft.get(node.id)?.delta ?? 0;
    const updatedProbability = clamp(node.probabilityScore + delta - (node.fragility * 0.04));
    const battlefieldWeight = clamp(
      (updatedProbability * 0.36)
      + (node.dominance * 0.24)
      + (node.centrality * 0.16)
      + ((1 - node.fragility) * 0.08)
      + ((1 - node.contestedness) * 0.08)
      + (node.supportScore * 0.08),
    );
    const summary = delta > 0
      ? 'سیگنال‌های تازه این سناریو را جلو رانده‌اند.'
      : delta < -0.02
        ? 'سیگنال‌های متناقض یا فشار گرافی این سناریو را عقب رانده‌اند.'
        : 'تعادل این سناریو نسبتا حفظ شده است.';
    shifts.push({
      scenarioId: node.id,
      title: node.title,
      delta: round(delta),
      reason: summary,
    });
    return {
      scenarioId: node.id,
      title: node.title,
      rank: 0,
      dominance: node.dominance,
      fragility: node.fragility,
      contestedness: node.contestedness,
      battlefieldWeight: round(battlefieldWeight),
      updatedProbabilityScore: round(updatedProbability),
      status: statusForNode({
        dominance: battlefieldWeight,
        fragility: node.fragility,
        contestedness: node.contestedness + (delta < -0.04 ? 0.08 : 0),
        trendDirection: delta > 0.04 ? 'up' : delta < -0.04 ? 'down' : node.trendDirection,
      }),
      summary,
    } satisfies ScenarioBattlefieldEntry;
  });

  const totalProbability = Math.max(0.001, rawEntries.reduce((sum, entry) => sum + entry.updatedProbabilityScore, 0));
  const battlefieldState = rawEntries
    .map((entry) => ({
      ...entry,
      updatedProbabilityScore: round(entry.updatedProbabilityScore / totalProbability),
    }))
    .sort((left, right) => right.battlefieldWeight - left.battlefieldWeight)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  const updatedProbabilityRedistribution = Object.fromEntries(
    battlefieldState.map((entry) => [entry.scenarioId, entry.updatedProbabilityScore]),
  );
  const lead = battlefieldState[0];
  const topTransfer = transfers[0];
  const topTransferWinner = topTransfer ? nodeMap.get(topTransfer.winnerScenarioId)?.title ?? topTransfer.winnerScenarioId : '';
  const topTransferLoser = topTransfer ? nodeMap.get(topTransfer.loserScenarioId)?.title ?? topTransfer.loserScenarioId : '';
  const narrative = uniqueStrings([
    lead ? `پس از fusion سیگنال‌های جدید، «${lead.title}» با probability توزیع‌شده ${Math.round(lead.updatedProbabilityScore * 100)}% در صدر battlefield قرار گرفت.` : '',
    topTransfer ? `در میدان سناریویی، «${topTransferWinner}» سناریوی «${topTransferLoser}» را ${topTransfer.effect === 'absorbed' ? 'تقریبا جذب' : 'تضعیف'} کرده است.` : '',
    shifts.some((item) => item.delta >= 0.08) ? 'چند سناریو جهش معنادار گرفته‌اند و region در فاز بازتوزیع plausibility است.' : 'بازتوزیع محدود بوده و dominance کلی هنوز پایدارتر است.',
  ], 4).join(' ');

  return {
    battlefieldState,
    updatedProbabilityRedistribution,
    shifts: shifts
      .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
      .slice(0, 6),
    transfers: transfers
      .sort((left, right) => right.weightShift - left.weightShift)
      .slice(0, 5),
    narrative,
  };
}
