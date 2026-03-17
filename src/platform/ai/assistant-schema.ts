import type {
  AssistantBlackSwanCandidate,
  AssistantActorModel,
  AssistantDecisionAction,
  AssistantDecisionLeveragePoint,
  AssistantDecisionSupport,
  AssistantDecisionTradeoff,
  AssistantDecisionUncertainty,
  AssistantMetaScenario,
  AssistantMetaScenarioOutput,
  AssistantScenarioConflict,
  AssistantSimulation,
  AssistantSimulationBranch,
  AssistantSimulationGraphEdge,
  AssistantSimulationGraphNode,
  AssistantSimulationStep,
  AssistantScenario,
  AssistantScenarioCausalStep,
  AssistantSection,
  AssistantStructuredOutput,
  AssistantWarRoomAgent,
  AssistantWarRoomConvergence,
  AssistantWarRoomDisagreement,
  AssistantWarRoomDisagreementMatrixRow,
  AssistantWarRoomOutput,
  AssistantWarRoomQualityControls,
  AssistantWarRoomRound,
  AssistantWarRoomRoundEntry,
  AssistantWarRoomScenarioAdjustment,
  AssistantWarRoomScenarioFocus,
  AssistantWarRoomScenarioRankingItem,
  AssistantWarRoomStateTransition,
  AssistantWarRoomTranscriptEntry,
} from './assistant-contracts';
import { createConfidenceRecord } from './assistant-contracts';

function defaultSection(title: string): AssistantSection {
  return {
    title,
    bullets: [],
    narrative: '',
    confidence: createConfidenceRecord(0.45, 'مدل سطح اطمینان صریحی برای این بخش ارائه نکرده است.'),
  };
}

function toStringArray(value: unknown, maxItems = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, maxItems);
}

function toConfidence(section: Record<string, unknown>, fallback: string) {
  const score = typeof section.confidenceScore === 'number'
    ? section.confidenceScore
    : typeof section.score === 'number'
      ? section.score
      : 0.45;
  const rationale = typeof section.confidenceRationale === 'string'
    ? section.confidenceRationale
    : fallback;
  return createConfidenceRecord(score, rationale);
}

function normalizeSection(input: unknown, fallbackTitle: string): AssistantSection {
  if (!input || typeof input !== 'object') {
    return defaultSection(fallbackTitle);
  }

  const record = input as Record<string, unknown>;
  return {
    title: typeof record.title === 'string' ? record.title : fallbackTitle,
    bullets: toStringArray(record.bullets),
    narrative: typeof record.narrative === 'string' ? record.narrative.trim() : '',
    confidence: toConfidence(record, `این بخش با تکیه بر JSON ناقص مدل نرمال‌سازی شد: ${fallbackTitle}`),
  };
}

function normalizeScenarios(input: unknown): AssistantScenario[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 4).map((scenario, index) => {
    const record = scenario && typeof scenario === 'object'
      ? scenario as Record<string, unknown>
      : {};
    const probability = record.probability === 'high' || record.probability === 'low'
      ? record.probability
      : 'medium';

    const normalizeCausalChain = (value: unknown): AssistantScenarioCausalStep[] => {
      if (!Array.isArray(value)) return [];
      return value
        .map((step) => step && typeof step === 'object' ? step as Record<string, unknown> : {})
        .filter((step) => typeof step.summary === 'string' && step.summary.trim())
        .slice(0, 6)
        .map((step) => ({
          stage: step.stage === 'reaction' || step.stage === 'escalation' || step.stage === 'outcome'
            ? step.stage
            : 'event',
          summary: String(step.summary).trim(),
          affected_domains: toStringArray(step.affected_domains, 5),
        }));
    };

    const normalizeCrossDomainImpacts = (value: unknown): Record<string, string[]> | undefined => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const entries = Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, toStringArray(item, 4)] as const)
        .filter(([, items]) => items.length > 0);
      return entries.length > 0 ? Object.fromEntries(entries) : undefined;
    };

    const indicatorsToWatch = toStringArray(record.indicators_to_watch ?? record.indicatorsToWatch, 6);
    return {
      id: typeof record.id === 'string' ? record.id : undefined,
      title: typeof record.title === 'string' ? record.title : `سناریو ${index + 1}`,
      probability,
      probability_score: typeof record.probability_score === 'number'
        ? record.probability_score
        : typeof record.probabilityScore === 'number'
          ? record.probabilityScore
          : undefined,
      timeframe: typeof record.timeframe === 'string'
        ? record.timeframe
        : typeof record.time_horizon === 'string'
          ? record.time_horizon
          : typeof record.timeHorizon === 'string'
            ? record.timeHorizon
            : 'بازه نامشخص',
      time_horizon: typeof record.time_horizon === 'string'
        ? record.time_horizon
        : typeof record.timeHorizon === 'string'
          ? record.timeHorizon
          : typeof record.timeframe === 'string'
            ? record.timeframe
            : undefined,
      description: typeof record.description === 'string' ? record.description.trim() : '',
      indicators: toStringArray(record.indicators, 5).length > 0 ? toStringArray(record.indicators, 5) : indicatorsToWatch,
      indicators_to_watch: indicatorsToWatch,
      drivers: toStringArray(record.drivers, 6),
      causal_chain: normalizeCausalChain(record.causal_chain ?? record.causalChain),
      mitigation_options: toStringArray(record.mitigation_options ?? record.mitigationOptions, 6),
      impact_level: record.impact_level === 'critical' || record.impact_level === 'high' || record.impact_level === 'medium' || record.impact_level === 'low'
        ? record.impact_level
        : record.impactLevel === 'critical' || record.impactLevel === 'high' || record.impactLevel === 'medium' || record.impactLevel === 'low'
          ? record.impactLevel
          : undefined,
      impact_score: typeof record.impact_score === 'number'
        ? record.impact_score
        : typeof record.impactScore === 'number'
          ? record.impactScore
          : undefined,
      uncertainty_level: record.uncertainty_level === 'low' || record.uncertainty_level === 'medium' || record.uncertainty_level === 'high'
        ? record.uncertainty_level
        : record.uncertaintyLevel === 'low' || record.uncertaintyLevel === 'medium' || record.uncertaintyLevel === 'high'
          ? record.uncertaintyLevel
          : undefined,
      second_order_effects: toStringArray(record.second_order_effects ?? record.secondOrderEffects, 5),
      cross_domain_impacts: normalizeCrossDomainImpacts(record.cross_domain_impacts ?? record.crossDomainImpacts),
      strategic_relevance: typeof record.strategic_relevance === 'number'
        ? record.strategic_relevance
        : typeof record.strategicRelevance === 'number'
          ? record.strategicRelevance
          : undefined,
      likelihood_score: typeof record.likelihood_score === 'number'
        ? record.likelihood_score
        : typeof record.likelihoodScore === 'number'
          ? record.likelihoodScore
          : undefined,
      confidence: toConfidence(record, 'سطح اطمینان سناریو از روی خروجی ناقص مدل نرمال‌سازی شد.'),
    };
  });
}

function normalizeSimulationSteps(input: unknown): AssistantSimulationStep[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((step) => step && typeof step === 'object' ? step as Record<string, unknown> : {})
    .filter((step) => typeof step.summary === 'string' && step.summary.trim())
    .slice(0, 8)
    .map((step, index) => ({
      id: typeof step.id === 'string' ? step.id : `sim-step-${index + 1}`,
      title: typeof step.title === 'string' ? step.title : `گام ${index + 1}`,
      stage: step.stage === 'reaction' || step.stage === 'escalation' || step.stage === 'outcome' || step.stage === 'checkpoint'
        ? step.stage
        : 'event',
      summary: String(step.summary).trim(),
      probability_score: typeof step.probability_score === 'number'
        ? step.probability_score
        : typeof step.probabilityScore === 'number'
          ? step.probabilityScore
          : 0.5,
      impact_score: typeof step.impact_score === 'number'
        ? step.impact_score
        : typeof step.impactScore === 'number'
          ? step.impactScore
          : 0.5,
      uncertainty_level: step.uncertainty_level === 'low' || step.uncertainty_level === 'medium' || step.uncertainty_level === 'high'
        ? step.uncertainty_level
        : step.uncertaintyLevel === 'low' || step.uncertaintyLevel === 'medium' || step.uncertaintyLevel === 'high'
          ? step.uncertaintyLevel
          : 'medium',
      indicators_to_watch: toStringArray(step.indicators_to_watch ?? step.indicatorsToWatch, 5),
      tool_calls: toStringArray(step.tool_calls ?? step.toolCalls, 5),
    }));
}

function normalizeSimulationBranches(input: unknown): AssistantSimulationBranch[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((branch) => branch && typeof branch === 'object' ? branch as Record<string, unknown> : {})
    .filter((branch) => typeof branch.title === 'string' && branch.title.trim())
    .slice(0, 6)
    .map((branch, index) => ({
      id: typeof branch.id === 'string' ? branch.id : `sim-branch-${index + 1}`,
      title: String(branch.title).trim(),
      description: typeof branch.description === 'string' ? branch.description.trim() : '',
      probability: branch.probability === 'low' || branch.probability === 'high' ? branch.probability : 'medium',
      probability_score: typeof branch.probability_score === 'number'
        ? branch.probability_score
        : typeof branch.probabilityScore === 'number'
          ? branch.probabilityScore
          : 0.5,
      impact_level: branch.impact_level === 'critical' || branch.impact_level === 'high' || branch.impact_level === 'medium' || branch.impact_level === 'low'
        ? branch.impact_level
        : branch.impactLevel === 'critical' || branch.impactLevel === 'high' || branch.impactLevel === 'medium' || branch.impactLevel === 'low'
          ? branch.impactLevel
          : 'medium',
      impact_score: typeof branch.impact_score === 'number'
        ? branch.impact_score
        : typeof branch.impactScore === 'number'
          ? branch.impactScore
          : 0.5,
      uncertainty_level: branch.uncertainty_level === 'low' || branch.uncertainty_level === 'medium' || branch.uncertainty_level === 'high'
        ? branch.uncertainty_level
        : branch.uncertaintyLevel === 'low' || branch.uncertaintyLevel === 'medium' || branch.uncertaintyLevel === 'high'
          ? branch.uncertaintyLevel
          : 'medium',
      time_horizon: typeof branch.time_horizon === 'string'
        ? branch.time_horizon
        : typeof branch.timeHorizon === 'string'
          ? branch.timeHorizon
          : 'بازه نامشخص',
      local_risks: toStringArray(branch.local_risks ?? branch.localRisks, 6),
      regional_spillovers: toStringArray(branch.regional_spillovers ?? branch.regionalSpillovers, 6),
      global_ripple_effects: toStringArray(branch.global_ripple_effects ?? branch.globalRippleEffects, 6),
      controls_summary: toStringArray(branch.controls_summary ?? branch.controlsSummary, 6),
      tool_plan: toStringArray(branch.tool_plan ?? branch.toolPlan, 6),
      steps: normalizeSimulationSteps(branch.steps),
    }));
}

function normalizeSimulationNodes(input: unknown): AssistantSimulationGraphNode[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((node) => node && typeof node === 'object' ? node as Record<string, unknown> : {})
    .filter((node) => typeof node.id === 'string' && typeof node.label === 'string')
    .slice(0, 48)
    .map((node) => ({
      id: String(node.id),
      label: String(node.label),
      kind: node.kind === 'branch' || node.kind === 'step' ? node.kind : 'root',
      branch_id: typeof node.branch_id === 'string'
        ? node.branch_id
        : typeof node.branchId === 'string'
          ? node.branchId
          : undefined,
      emphasis: typeof node.emphasis === 'number' ? node.emphasis : undefined,
    }));
}

function normalizeSimulationEdges(input: unknown): AssistantSimulationGraphEdge[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((edge) => edge && typeof edge === 'object' ? edge as Record<string, unknown> : {})
    .filter((edge) => typeof edge.from === 'string' && typeof edge.to === 'string')
    .slice(0, 64)
    .map((edge) => ({
      from: String(edge.from),
      to: String(edge.to),
      label: typeof edge.label === 'string' ? edge.label : '',
      weight: typeof edge.weight === 'number' ? edge.weight : undefined,
    }));
}

function normalizeSimulation(input: unknown): AssistantSimulation | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  const branches = normalizeSimulationBranches(record.branches);
  if (branches.length === 0) return undefined;
  return {
    title: typeof record.title === 'string' ? record.title : 'شبیه‌سازی تعاملی',
    event: typeof record.event === 'string' ? record.event : '',
    mode: record.mode === 'deep' ? 'deep' : 'fast',
    compare_summary: typeof record.compare_summary === 'string'
      ? record.compare_summary
      : typeof record.compareSummary === 'string'
        ? record.compareSummary
        : '',
    controls_summary: toStringArray(record.controls_summary ?? record.controlsSummary, 8),
    branches,
    graph: {
      nodes: normalizeSimulationNodes((record.graph as Record<string, unknown> | undefined)?.nodes),
      edges: normalizeSimulationEdges((record.graph as Record<string, unknown> | undefined)?.edges),
    },
  };
}

function normalizeDecisionActions(input: unknown): AssistantDecisionAction[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((action) => action && typeof action === 'object' ? action as Record<string, unknown> : {})
    .filter((action) => typeof action.label === 'string' && action.label.trim())
    .slice(0, 6)
    .map((action) => ({
      label: String(action.label).trim(),
      rationale: typeof action.rationale === 'string' ? action.rationale.trim() : '',
      timeframe: action.timeframe === 'immediate' || action.timeframe === 'long-term' ? action.timeframe : 'near-term',
    }));
}

function normalizeDecisionTradeoffs(input: unknown): AssistantDecisionTradeoff[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((tradeoff) => tradeoff && typeof tradeoff === 'object' ? tradeoff as Record<string, unknown> : {})
    .filter((tradeoff) => typeof tradeoff.label === 'string' && tradeoff.label.trim())
    .slice(0, 6)
    .map((tradeoff) => ({
      label: String(tradeoff.label).trim(),
      cost: typeof tradeoff.cost === 'string' ? tradeoff.cost.trim() : '',
      benefit: typeof tradeoff.benefit === 'string' ? tradeoff.benefit.trim() : '',
      short_term: typeof tradeoff.short_term === 'string'
        ? tradeoff.short_term.trim()
        : typeof tradeoff.shortTerm === 'string'
          ? tradeoff.shortTerm.trim()
          : '',
      long_term: typeof tradeoff.long_term === 'string'
        ? tradeoff.long_term.trim()
        : typeof tradeoff.longTerm === 'string'
          ? tradeoff.longTerm.trim()
          : '',
    }));
}

function normalizeLeveragePoints(input: unknown): AssistantDecisionLeveragePoint[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((point) => point && typeof point === 'object' ? point as Record<string, unknown> : {})
    .filter((point) => typeof point.title === 'string' && point.title.trim())
    .slice(0, 6)
    .map((point) => ({
      title: String(point.title).trim(),
      why: typeof point.why === 'string' ? point.why.trim() : '',
    }));
}

function normalizeDecisionUncertainties(input: unknown): AssistantDecisionUncertainty[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : {})
    .filter((item) => typeof item.title === 'string' && item.title.trim())
    .slice(0, 6)
    .map((item) => ({
      title: String(item.title).trim(),
      why: typeof item.why === 'string' ? item.why.trim() : '',
      indicators: toStringArray(item.indicators, 5),
    }));
}

function normalizeActorModels(input: unknown): AssistantActorModel[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((actor) => actor && typeof actor === 'object' ? actor as Record<string, unknown> : {})
    .filter((actor) => typeof actor.actor === 'string' && actor.actor.trim())
    .slice(0, 6)
    .map((actor) => ({
      actor: String(actor.actor).trim(),
      role: typeof actor.role === 'string' ? actor.role.trim() : '',
      intent: typeof actor.intent === 'string' ? actor.intent.trim() : '',
      likely_behaviors: toStringArray(actor.likely_behaviors ?? actor.likelyBehaviors, 5),
      constraints: toStringArray(actor.constraints, 5),
    }));
}

function normalizeScenarioSupport(input: unknown): AssistantDecisionSupport['scenario_support'] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : {})
    .filter((item) => typeof item.scenario_title === 'string' || typeof item.scenarioTitle === 'string')
    .slice(0, 5)
    .map((item) => ({
      scenario_id: typeof item.scenario_id === 'string'
        ? item.scenario_id
        : typeof item.scenarioId === 'string'
          ? item.scenarioId
          : undefined,
      scenario_title: typeof item.scenario_title === 'string'
        ? item.scenario_title.trim()
        : typeof item.scenarioTitle === 'string'
          ? item.scenarioTitle.trim()
          : 'سناریوی بدون نام',
      probability: item.probability === 'low' || item.probability === 'high' ? item.probability : 'medium',
      impact_level: item.impact_level === 'critical' || item.impact_level === 'high' || item.impact_level === 'medium' || item.impact_level === 'low'
        ? item.impact_level
        : item.impactLevel === 'critical' || item.impactLevel === 'high' || item.impactLevel === 'medium' || item.impactLevel === 'low'
          ? item.impactLevel
          : undefined,
      recommended_actions: normalizeDecisionActions(item.recommended_actions ?? item.recommendedActions),
      mitigation_strategies: toStringArray(item.mitigation_strategies ?? item.mitigationStrategies, 6),
      tradeoffs: normalizeDecisionTradeoffs(item.tradeoffs),
    }));
}

function normalizeDecisionSupport(input: unknown): AssistantDecisionSupport | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  const scenarioSupport = normalizeScenarioSupport(record.scenario_support ?? record.scenarioSupport);
  if (
    scenarioSupport.length === 0
    && !Array.isArray(record.actionable_insights)
    && !Array.isArray(record.actionableInsights)
    && !Array.isArray(record.actor_models)
    && !Array.isArray(record.actorModels)
    && !Array.isArray(record.leverage_points)
    && !Array.isArray(record.leveragePoints)
  ) {
    return undefined;
  }

  return {
    executive_summary: typeof record.executive_summary === 'string'
      ? record.executive_summary.trim()
      : typeof record.executiveSummary === 'string'
        ? record.executiveSummary.trim()
        : '',
    actionable_insights: toStringArray(record.actionable_insights ?? record.actionableInsights, 8),
    strategic_insights: toStringArray(record.strategic_insights ?? record.strategicInsights, 8),
    leverage_points: normalizeLeveragePoints(record.leverage_points ?? record.leveragePoints),
    critical_uncertainties: normalizeDecisionUncertainties(record.critical_uncertainties ?? record.criticalUncertainties),
    actor_models: normalizeActorModels(record.actor_models ?? record.actorModels),
    scenario_support: scenarioSupport,
  };
}

function normalizeMetaScenarios(input: unknown): AssistantMetaScenario[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : {})
    .filter((item) => typeof item.id === 'string' && typeof item.title === 'string')
    .slice(0, 6)
    .map((item) => ({
      id: String(item.id),
      title: String(item.title).trim(),
      source_scenarios: toStringArray(item.source_scenarios ?? item.sourceScenarios, 6),
      relationship_type: item.relationship_type === 'amplifying' || item.relationship_type === 'suppressing' || item.relationship_type === 'competing'
        ? item.relationship_type
        : item.relationshipType === 'amplifying' || item.relationshipType === 'suppressing' || item.relationshipType === 'competing'
          ? item.relationshipType
          : 'converging',
      summary: typeof item.summary === 'string' ? item.summary.trim() : '',
      combined_probability: item.combined_probability === 'low' || item.combined_probability === 'high'
        ? item.combined_probability
        : item.combinedProbability === 'low' || item.combinedProbability === 'high'
          ? item.combinedProbability
          : 'medium',
      combined_probability_score: typeof item.combined_probability_score === 'number'
        ? item.combined_probability_score
        : typeof item.combinedProbabilityScore === 'number'
          ? item.combinedProbabilityScore
          : undefined,
      impact_level: item.impact_level === 'critical' || item.impact_level === 'high' || item.impact_level === 'medium' || item.impact_level === 'low'
        ? item.impact_level
        : item.impactLevel === 'critical' || item.impactLevel === 'high' || item.impactLevel === 'medium' || item.impactLevel === 'low'
          ? item.impactLevel
          : 'medium',
      uncertainty_level: item.uncertainty_level === 'low' || item.uncertainty_level === 'high'
        ? item.uncertainty_level
        : item.uncertaintyLevel === 'low' || item.uncertaintyLevel === 'high'
          ? item.uncertaintyLevel
          : 'medium',
      critical_dependencies: toStringArray(item.critical_dependencies ?? item.criticalDependencies, 6),
      trigger_indicators: toStringArray(item.trigger_indicators ?? item.triggerIndicators, 6),
      watchpoints: toStringArray(item.watchpoints, 6),
      strategic_implications: toStringArray(item.strategic_implications ?? item.strategicImplications, 6),
      recommended_actions: toStringArray(item.recommended_actions ?? item.recommendedActions, 6),
    }));
}

function normalizeScenarioConflicts(input: unknown): AssistantScenarioConflict[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : {})
    .filter((item) => typeof item.id === 'string' && (typeof item.left_scenario_id === 'string' || typeof item.leftScenarioId === 'string') && (typeof item.right_scenario_id === 'string' || typeof item.rightScenarioId === 'string'))
    .slice(0, 8)
    .map((item) => ({
      id: String(item.id),
      left_scenario_id: typeof item.left_scenario_id === 'string' ? item.left_scenario_id : String(item.leftScenarioId),
      right_scenario_id: typeof item.right_scenario_id === 'string' ? item.right_scenario_id : String(item.rightScenarioId),
      relationship_type: item.relationship_type === 'suppressing' ? 'suppressing' : 'competing',
      interaction_strength: typeof item.interaction_strength === 'number'
        ? item.interaction_strength
        : typeof item.interactionStrength === 'number'
          ? item.interactionStrength
          : 0.5,
      direction: typeof item.direction === 'string' ? item.direction.trim() : 'balanced',
      summary: typeof item.summary === 'string' ? item.summary.trim() : '',
      probability_redistribution: item.probability_redistribution && typeof item.probability_redistribution === 'object' && !Array.isArray(item.probability_redistribution)
        ? Object.fromEntries(
          Object.entries(item.probability_redistribution as Record<string, unknown>)
            .filter(([, value]) => typeof value === 'number')
            .map(([key, value]) => [key, value as number]),
        )
        : item.probabilityRedistribution && typeof item.probabilityRedistribution === 'object' && !Array.isArray(item.probabilityRedistribution)
          ? Object.fromEntries(
            Object.entries(item.probabilityRedistribution as Record<string, unknown>)
              .filter(([, value]) => typeof value === 'number')
              .map(([key, value]) => [key, value as number]),
          )
          : {},
      decisive_indicators: toStringArray(item.decisive_indicators ?? item.decisiveIndicators, 6),
    }));
}

function normalizeBlackSwans(input: unknown): AssistantBlackSwanCandidate[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : {})
    .filter((item) => typeof item.id === 'string' && typeof item.title === 'string')
    .slice(0, 5)
    .map((item) => ({
      id: String(item.id),
      title: String(item.title).trim(),
      summary: typeof item.summary === 'string' ? item.summary.trim() : '',
      probability: item.probability === 'low' || item.probability === 'high' ? item.probability : 'medium',
      impact_level: item.impact_level === 'critical' || item.impact_level === 'high' || item.impact_level === 'medium' || item.impact_level === 'low'
        ? item.impact_level
        : item.impactLevel === 'critical' || item.impactLevel === 'high' || item.impactLevel === 'medium' || item.impactLevel === 'low'
          ? item.impactLevel
          : 'high',
      uncertainty_level: item.uncertainty_level === 'low' || item.uncertainty_level === 'medium' || item.uncertainty_level === 'high'
        ? item.uncertainty_level
        : item.uncertaintyLevel === 'low' || item.uncertaintyLevel === 'medium' || item.uncertaintyLevel === 'high'
          ? item.uncertaintyLevel
          : 'high',
      why_it_matters: typeof item.why_it_matters === 'string'
        ? item.why_it_matters.trim()
        : typeof item.whyItMatters === 'string'
          ? item.whyItMatters.trim()
          : '',
      low_probability_reason: typeof item.low_probability_reason === 'string'
        ? item.low_probability_reason.trim()
        : typeof item.lowProbabilityReason === 'string'
          ? item.lowProbabilityReason.trim()
          : '',
      high_impact_reason: typeof item.high_impact_reason === 'string'
        ? item.high_impact_reason.trim()
        : typeof item.highImpactReason === 'string'
          ? item.highImpactReason.trim()
          : '',
      broken_assumptions: toStringArray(item.broken_assumptions ?? item.brokenAssumptions, 6),
      affected_domains: toStringArray(item.affected_domains ?? item.affectedDomains, 6),
      weak_signals: toStringArray(item.weak_signals ?? item.weakSignals, 6),
      contradictory_evidence: toStringArray(item.contradictory_evidence ?? item.contradictoryEvidence, 6),
      regime_shift_indicators: toStringArray(item.regime_shift_indicators ?? item.regimeShiftIndicators, 6),
      leading_indicators: toStringArray(item.leading_indicators ?? item.leadingIndicators, 6),
      watchpoints: toStringArray(item.watchpoints, 6),
      recommended_actions: toStringArray(item.recommended_actions ?? item.recommendedActions, 6),
      confidence_note: typeof item.confidence_note === 'string'
        ? item.confidence_note.trim()
        : typeof item.confidenceNote === 'string'
          ? item.confidenceNote.trim()
          : '',
      uncertainty_note: typeof item.uncertainty_note === 'string'
        ? item.uncertainty_note.trim()
        : typeof item.uncertaintyNote === 'string'
          ? item.uncertaintyNote.trim()
          : '',
      severity_score: typeof item.severity_score === 'number'
        ? item.severity_score
        : typeof item.severityScore === 'number'
          ? item.severityScore
          : undefined,
      monitoring_status: item.monitoring_status === 'watch' || item.monitoring_status === 'rising' || item.monitoring_status === 'critical' || item.monitoring_status === 'cooling'
        ? item.monitoring_status
        : item.monitoringStatus === 'watch' || item.monitoringStatus === 'rising' || item.monitoringStatus === 'critical' || item.monitoringStatus === 'cooling'
          ? item.monitoringStatus
          : undefined,
    }));
}

function normalizeMetaScenarioOutput(input: unknown): AssistantMetaScenarioOutput | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  const metaScenarios = normalizeMetaScenarios(record.meta_scenarios ?? record.metaScenarios);
  const conflicts = normalizeScenarioConflicts(record.scenario_conflicts ?? record.scenarioConflicts);
  const blackSwans = normalizeBlackSwans(record.black_swan_candidates ?? record.blackSwanCandidates);
  if (metaScenarios.length === 0 && conflicts.length === 0 && blackSwans.length === 0) {
    return undefined;
  }

  return {
    executive_summary: typeof record.executive_summary === 'string'
      ? record.executive_summary.trim()
      : typeof record.executiveSummary === 'string'
        ? record.executiveSummary.trim()
        : '',
    higher_order_insights: toStringArray(record.higher_order_insights ?? record.higherOrderInsights, 8),
    meta_scenarios: metaScenarios,
    scenario_conflicts: conflicts,
    black_swan_candidates: blackSwans,
  };
}

function normalizeWarRoomRoundEntries(input: unknown): AssistantWarRoomRoundEntry[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => entry && typeof entry === 'object' ? entry as Record<string, unknown> : {})
    .filter((entry) => typeof entry.agent_id === 'string' || typeof entry.agentId === 'string')
    .slice(0, 48)
    .map((entry) => ({
      agent_id: typeof entry.agent_id === 'string' ? entry.agent_id : String(entry.agentId),
      label: typeof entry.label === 'string' ? entry.label.trim() : '',
      content: typeof entry.content === 'string' ? entry.content.trim() : '',
      target_agent_ids: toStringArray(entry.target_agent_ids ?? entry.targetAgentIds, 6),
      markers: toStringArray(entry.markers, 4)
        .filter((marker): marker is AssistantWarRoomRoundEntry['markers'][number] => marker === 'support' || marker === 'challenge' || marker === 'revision' || marker === 'uncertainty'),
    }));
}

function normalizeWarRoomRounds(input: unknown): AssistantWarRoomRound[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((round) => round && typeof round === 'object' ? round as Record<string, unknown> : {})
    .filter((round) => typeof round.id === 'string')
    .slice(0, 10)
    .map((round, index) => ({
      id: String(round.id),
      title: typeof round.title === 'string' ? round.title.trim() : `دور ${index + 1}`,
      stage: round.stage === 'critique' || round.stage === 'revision' || round.stage === 'synthesis'
        ? round.stage
        : 'assessment',
      summary: typeof round.summary === 'string' ? round.summary.trim() : '',
      entries: normalizeWarRoomRoundEntries(round.entries),
    }));
}

function normalizeWarRoomAgents(input: unknown): AssistantWarRoomAgent[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((agent) => agent && typeof agent === 'object' ? agent as Record<string, unknown> : {})
    .filter((agent) => typeof agent.id === 'string' && typeof agent.role === 'string')
    .slice(0, 10)
    .map((agent) => ({
      id: String(agent.id),
      role: String(agent.role).trim(),
      label: typeof agent.label === 'string' ? agent.label.trim() : String(agent.role).trim(),
      role_prompt: typeof agent.role_prompt === 'string'
        ? agent.role_prompt.trim()
        : typeof agent.rolePrompt === 'string'
          ? agent.rolePrompt.trim()
          : '',
      position: typeof agent.position === 'string' ? agent.position.trim() : '',
      revised_position: typeof agent.revised_position === 'string'
        ? agent.revised_position.trim()
        : typeof agent.revisedPosition === 'string'
          ? agent.revisedPosition.trim()
          : undefined,
      confidence_score: typeof agent.confidence_score === 'number'
        ? agent.confidence_score
        : typeof agent.confidenceScore === 'number'
          ? agent.confidenceScore
          : 0.5,
      confidence_note: typeof agent.confidence_note === 'string'
        ? agent.confidence_note.trim()
        : typeof agent.confidenceNote === 'string'
          ? agent.confidenceNote.trim()
          : '',
      supporting_points: toStringArray(agent.supporting_points ?? agent.supportingPoints, 6),
      watchpoints: toStringArray(agent.watchpoints, 6),
      assumptions: toStringArray(agent.assumptions, 6),
      critiques: Array.isArray(agent.critiques)
        ? agent.critiques
          .map((critique) => critique && typeof critique === 'object' ? critique as Record<string, unknown> : {})
          .filter((critique) => typeof critique.target_agent_id === 'string' || typeof critique.targetAgentId === 'string')
          .slice(0, 6)
          .map((critique) => ({
            target_agent_id: typeof critique.target_agent_id === 'string' ? critique.target_agent_id : String(critique.targetAgentId),
            summary: typeof critique.summary === 'string' ? critique.summary.trim() : '',
            marker: critique.marker === 'support' || critique.marker === 'revision' || critique.marker === 'uncertainty'
              ? critique.marker
              : 'challenge',
          }))
        : [],
    }));
}

function normalizeWarRoomDisagreements(input: unknown): AssistantWarRoomDisagreement[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : {})
    .filter((item) => typeof item.id === 'string' && typeof item.title === 'string')
    .slice(0, 8)
    .map((item) => ({
      id: String(item.id),
      title: String(item.title).trim(),
      summary: typeof item.summary === 'string' ? item.summary.trim() : '',
      agent_ids: toStringArray(item.agent_ids ?? item.agentIds, 6),
      severity: item.severity === 'low' || item.severity === 'high' ? item.severity : 'medium',
    }));
}

function normalizeWarRoomConvergences(input: unknown): AssistantWarRoomConvergence[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : {})
    .filter((item) => typeof item.id === 'string' && typeof item.title === 'string')
    .slice(0, 8)
    .map((item) => ({
      id: String(item.id),
      title: String(item.title).trim(),
      summary: typeof item.summary === 'string' ? item.summary.trim() : '',
      agent_ids: toStringArray(item.agent_ids ?? item.agentIds, 6),
    }));
}

function normalizeWarRoomTranscript(input: unknown): AssistantWarRoomTranscriptEntry[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : {})
    .filter((item) => typeof item.id === 'string' && (typeof item.agent_id === 'string' || typeof item.agentId === 'string'))
    .slice(0, 128)
    .map((item, index) => ({
      id: String(item.id),
      round_id: typeof item.round_id === 'string'
        ? item.round_id
        : typeof item.roundId === 'string'
          ? item.roundId
          : `round-${index + 1}`,
      round_stage: item.round_stage === 'critique' || item.round_stage === 'revision' || item.round_stage === 'synthesis'
        ? item.round_stage
        : item.roundStage === 'critique' || item.roundStage === 'revision' || item.roundStage === 'synthesis'
          ? item.roundStage
          : 'assessment',
      round_index: typeof item.round_index === 'number'
        ? item.round_index
        : typeof item.roundIndex === 'number'
          ? item.roundIndex
          : index + 1,
      agent_id: typeof item.agent_id === 'string' ? item.agent_id : String(item.agentId),
      label: typeof item.label === 'string' ? item.label.trim() : '',
      prompt_excerpt: typeof item.prompt_excerpt === 'string'
        ? item.prompt_excerpt.trim()
        : typeof item.promptExcerpt === 'string'
          ? item.promptExcerpt.trim()
          : '',
      response: typeof item.response === 'string' ? item.response.trim() : '',
      target_agent_ids: toStringArray(item.target_agent_ids ?? item.targetAgentIds, 6),
      markers: toStringArray(item.markers, 4)
        .filter((marker): marker is AssistantWarRoomTranscriptEntry['markers'][number] => marker === 'support' || marker === 'challenge' || marker === 'revision' || marker === 'uncertainty'),
      evidence_basis: toStringArray(item.evidence_basis ?? item.evidenceBasis, 6),
      quality_flags: toStringArray(item.quality_flags ?? item.qualityFlags, 6),
    }));
}

function normalizeWarRoomReplayTrace(input: unknown): AssistantWarRoomStateTransition[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : {})
    .filter((item) => typeof item.id === 'string')
    .slice(0, 48)
    .map((item, index) => ({
      id: String(item.id),
      from_stage: item.from_stage === 'initialized' || item.from_stage === 'assessment' || item.from_stage === 'critique' || item.from_stage === 'revision' || item.from_stage === 'synthesis' || item.from_stage === 'completed'
        ? item.from_stage
        : item.fromStage === 'initialized' || item.fromStage === 'assessment' || item.fromStage === 'critique' || item.fromStage === 'revision' || item.fromStage === 'synthesis' || item.fromStage === 'completed'
          ? item.fromStage
          : 'initialized',
      to_stage: item.to_stage === 'assessment' || item.to_stage === 'critique' || item.to_stage === 'revision' || item.to_stage === 'synthesis' || item.to_stage === 'completed'
        ? item.to_stage
        : item.toStage === 'assessment' || item.toStage === 'critique' || item.toStage === 'revision' || item.toStage === 'synthesis' || item.toStage === 'completed'
          ? item.toStage
          : 'completed',
      round_id: typeof item.round_id === 'string'
        ? item.round_id
        : typeof item.roundId === 'string'
          ? item.roundId
          : undefined,
      round_index: typeof item.round_index === 'number'
        ? item.round_index
        : typeof item.roundIndex === 'number'
          ? item.roundIndex
          : index,
      summary: typeof item.summary === 'string' ? item.summary.trim() : '',
      timestamp: typeof item.timestamp === 'string' ? item.timestamp.trim() : '',
    }));
}

function normalizeWarRoomDisagreementMatrix(input: unknown): AssistantWarRoomDisagreementMatrixRow[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => row && typeof row === 'object' ? row as Record<string, unknown> : {})
    .filter((row) => typeof row.agent_id === 'string' || typeof row.agentId === 'string')
    .slice(0, 12)
    .map((row) => ({
      agent_id: typeof row.agent_id === 'string' ? row.agent_id : String(row.agentId),
      label: typeof row.label === 'string' ? row.label.trim() : '',
      cells: Array.isArray(row.cells)
        ? row.cells
          .map((cell) => cell && typeof cell === 'object' ? cell as Record<string, unknown> : {})
          .filter((cell) => typeof cell.target_agent_id === 'string' || typeof cell.targetAgentId === 'string')
          .slice(0, 12)
          .map((cell) => ({
            target_agent_id: typeof cell.target_agent_id === 'string' ? cell.target_agent_id : String(cell.targetAgentId),
            disagreement_score: typeof cell.disagreement_score === 'number'
              ? cell.disagreement_score
              : typeof cell.disagreementScore === 'number'
                ? cell.disagreementScore
                : 0,
            challenge_count: typeof cell.challenge_count === 'number'
              ? cell.challenge_count
              : typeof cell.challengeCount === 'number'
                ? cell.challengeCount
                : 0,
            evidence_backed: typeof cell.evidence_backed === 'boolean'
              ? cell.evidence_backed
              : typeof cell.evidenceBacked === 'boolean'
                ? cell.evidenceBacked
                : false,
            summary: typeof cell.summary === 'string' ? cell.summary.trim() : '',
          }))
        : [],
    }));
}

function normalizeWarRoomQualityControls(input: unknown): AssistantWarRoomQualityControls {
  if (!input || typeof input !== 'object') {
    return {
      repetitive_debate: false,
      shallow_agreement: false,
      voice_collapse_risk: 'medium',
      evidence_backed_disagreement_ratio: 0,
      alerts: [],
      enforcement_notes: [],
    };
  }
  const record = input as Record<string, unknown>;
  return {
    repetitive_debate: Boolean(record.repetitive_debate ?? record.repetitiveDebate),
    shallow_agreement: Boolean(record.shallow_agreement ?? record.shallowAgreement),
    voice_collapse_risk: record.voice_collapse_risk === 'low' || record.voice_collapse_risk === 'high'
      ? record.voice_collapse_risk
      : record.voiceCollapseRisk === 'low' || record.voiceCollapseRisk === 'high'
        ? record.voiceCollapseRisk
        : 'medium',
    evidence_backed_disagreement_ratio: typeof record.evidence_backed_disagreement_ratio === 'number'
      ? record.evidence_backed_disagreement_ratio
      : typeof record.evidenceBackedDisagreementRatio === 'number'
        ? record.evidenceBackedDisagreementRatio
        : 0,
    alerts: toStringArray(record.alerts, 8),
    enforcement_notes: toStringArray(record.enforcement_notes ?? record.enforcementNotes, 8),
  };
}

function normalizeWarRoomScenarioRanking(input: unknown): AssistantWarRoomScenarioRankingItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : {})
    .filter((item) => typeof item.scenario_id === 'string' || typeof item.scenarioId === 'string')
    .slice(0, 8)
    .map((item, index) => ({
      scenario_id: typeof item.scenario_id === 'string' ? item.scenario_id : String(item.scenarioId),
      title: typeof item.title === 'string' ? item.title.trim() : `سناریوی ${index + 1}`,
      baseline_rank: typeof item.baseline_rank === 'number'
        ? item.baseline_rank
        : typeof item.baselineRank === 'number'
          ? item.baselineRank
          : index + 1,
      revised_rank: typeof item.revised_rank === 'number'
        ? item.revised_rank
        : typeof item.revisedRank === 'number'
          ? item.revisedRank
          : index + 1,
      stance: item.stance === 'dominant' || item.stance === 'overrated' || item.stance === 'underappreciated' || item.stance === 'replacement'
        ? item.stance
        : 'contested',
      summary: typeof item.summary === 'string' ? item.summary.trim() : '',
      why: typeof item.why === 'string' ? item.why.trim() : '',
      consensus_shift: typeof item.consensus_shift === 'number'
        ? item.consensus_shift
        : typeof item.consensusShift === 'number'
          ? item.consensusShift
          : 0,
      linked_agent_ids: toStringArray(item.linked_agent_ids ?? item.linkedAgentIds, 10),
      linked_conflict_ids: toStringArray(item.linked_conflict_ids ?? item.linkedConflictIds, 8),
      linked_black_swan_ids: toStringArray(item.linked_black_swan_ids ?? item.linkedBlackSwanIds, 8),
      watchpoints: toStringArray(item.watchpoints, 8),
    }));
}

function normalizeWarRoomScenarioAdjustments(input: unknown): AssistantWarRoomScenarioAdjustment[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => item && typeof item === 'object' ? item as Record<string, unknown> : {})
    .filter((item) => typeof item.id === 'string' && (typeof item.scenario_id === 'string' || typeof item.scenarioId === 'string'))
    .slice(0, 8)
    .map((item) => ({
      id: String(item.id),
      scenario_id: typeof item.scenario_id === 'string' ? item.scenario_id : String(item.scenarioId),
      title: typeof item.title === 'string' ? item.title.trim() : '',
      adjustment_type: item.adjustment_type === 'promote' || item.adjustment_type === 'demote' || item.adjustment_type === 'replace'
        ? item.adjustment_type
        : item.adjustmentType === 'promote' || item.adjustmentType === 'demote' || item.adjustmentType === 'replace'
          ? item.adjustmentType
          : 'watch',
      summary: typeof item.summary === 'string' ? item.summary.trim() : '',
      rationale: typeof item.rationale === 'string' ? item.rationale.trim() : '',
      disagreement_driver: typeof item.disagreement_driver === 'string'
        ? item.disagreement_driver.trim()
        : typeof item.disagreementDriver === 'string'
          ? item.disagreementDriver.trim()
          : '',
      affected_agent_ids: toStringArray(item.affected_agent_ids ?? item.affectedAgentIds, 8),
      linked_conflict_id: typeof item.linked_conflict_id === 'string'
        ? item.linked_conflict_id
        : typeof item.linkedConflictId === 'string'
          ? item.linkedConflictId
          : undefined,
      linked_black_swan_id: typeof item.linked_black_swan_id === 'string'
        ? item.linked_black_swan_id
        : typeof item.linkedBlackSwanId === 'string'
          ? item.linkedBlackSwanId
          : undefined,
      updated_watchpoints: toStringArray(item.updated_watchpoints ?? item.updatedWatchpoints, 8),
      confidence: item.confidence === 'low' || item.confidence === 'high'
        ? item.confidence
        : 'medium',
    }));
}

function normalizeWarRoomScenarioFocus(input: unknown): AssistantWarRoomScenarioFocus {
  if (!input || typeof input !== 'object') {
    return { scenario_shift_summary: '' };
  }
  const record = input as Record<string, unknown>;
  return {
    dominant_scenario_id: typeof record.dominant_scenario_id === 'string'
      ? record.dominant_scenario_id
      : typeof record.dominantScenarioId === 'string'
        ? record.dominantScenarioId
        : undefined,
    dominant_scenario_title: typeof record.dominant_scenario_title === 'string'
      ? record.dominant_scenario_title.trim()
      : typeof record.dominantScenarioTitle === 'string'
        ? record.dominantScenarioTitle.trim()
        : undefined,
    overrated_scenario_id: typeof record.overrated_scenario_id === 'string'
      ? record.overrated_scenario_id
      : typeof record.overratedScenarioId === 'string'
        ? record.overratedScenarioId
        : undefined,
    overrated_scenario_title: typeof record.overrated_scenario_title === 'string'
      ? record.overrated_scenario_title.trim()
      : typeof record.overratedScenarioTitle === 'string'
        ? record.overratedScenarioTitle.trim()
        : undefined,
    underappreciated_scenario_id: typeof record.underappreciated_scenario_id === 'string'
      ? record.underappreciated_scenario_id
      : typeof record.underappreciatedScenarioId === 'string'
        ? record.underappreciatedScenarioId
        : undefined,
    underappreciated_scenario_title: typeof record.underappreciated_scenario_title === 'string'
      ? record.underappreciated_scenario_title.trim()
      : typeof record.underappreciatedScenarioTitle === 'string'
        ? record.underappreciatedScenarioTitle.trim()
        : undefined,
    key_conflict_id: typeof record.key_conflict_id === 'string'
      ? record.key_conflict_id
      : typeof record.keyConflictId === 'string'
        ? record.keyConflictId
        : undefined,
    key_conflict_title: typeof record.key_conflict_title === 'string'
      ? record.key_conflict_title.trim()
      : typeof record.keyConflictTitle === 'string'
        ? record.keyConflictTitle.trim()
        : undefined,
    black_swan_threat_id: typeof record.black_swan_threat_id === 'string'
      ? record.black_swan_threat_id
      : typeof record.blackSwanThreatId === 'string'
        ? record.blackSwanThreatId
        : undefined,
    black_swan_threat_title: typeof record.black_swan_threat_title === 'string'
      ? record.black_swan_threat_title.trim()
      : typeof record.blackSwanThreatTitle === 'string'
        ? record.blackSwanThreatTitle.trim()
        : undefined,
    scenario_shift_summary: typeof record.scenario_shift_summary === 'string'
      ? record.scenario_shift_summary.trim()
      : typeof record.scenarioShiftSummary === 'string'
        ? record.scenarioShiftSummary.trim()
        : '',
  };
}

function normalizeWarRoomOutput(input: unknown): AssistantWarRoomOutput | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  const agents = normalizeWarRoomAgents(record.agents);
  const rounds = normalizeWarRoomRounds(record.rounds);
  const disagreements = normalizeWarRoomDisagreements(record.disagreements);
  const convergences = normalizeWarRoomConvergences(record.convergences);
  const debateTranscript = normalizeWarRoomTranscript(record.debate_transcript ?? record.debateTranscript);
  const replayTrace = normalizeWarRoomReplayTrace(record.replay_trace ?? record.replayTrace);
  const disagreementMatrix = normalizeWarRoomDisagreementMatrix(record.disagreement_matrix ?? record.disagreementMatrix);
  const recommendedWatchpoints = toStringArray(record.recommended_watchpoints ?? record.recommendedWatchpoints, 8);
  const updatedWatchpoints = toStringArray(record.updated_watchpoints ?? record.updatedWatchpoints, 8);
  if (agents.length === 0 && rounds.length === 0) {
    return undefined;
  }

  return {
    question: typeof record.question === 'string' ? record.question.trim() : '',
    anchor_label: typeof record.anchor_label === 'string'
      ? record.anchor_label.trim()
      : typeof record.anchorLabel === 'string'
        ? record.anchorLabel.trim()
        : '',
    mode: record.mode === 'fast' ? 'fast' : 'deep',
    active_agent_ids: toStringArray(record.active_agent_ids ?? record.activeAgentIds, 12),
    excluded_agent_ids: toStringArray(record.excluded_agent_ids ?? record.excludedAgentIds, 12),
    round_count: typeof record.round_count === 'number'
      ? record.round_count
      : typeof record.roundCount === 'number'
        ? record.roundCount
        : rounds.length,
    agents,
    rounds,
    debate_transcript: debateTranscript,
    replay_trace: replayTrace,
    disagreement_matrix: disagreementMatrix,
    quality_controls: normalizeWarRoomQualityControls(record.quality_controls ?? record.qualityControls),
    disagreements,
    convergences,
    unresolved_uncertainties: toStringArray(record.unresolved_uncertainties ?? record.unresolvedUncertainties, 8),
    moderator_summary: typeof record.moderator_summary === 'string'
      ? record.moderator_summary.trim()
      : typeof record.moderatorSummary === 'string'
        ? record.moderatorSummary.trim()
        : '',
      executive_summary: typeof record.executive_summary === 'string'
        ? record.executive_summary.trim()
        : typeof record.executiveSummary === 'string'
          ? record.executiveSummary.trim()
          : '',
      final_synthesis: typeof record.final_synthesis === 'string'
        ? record.final_synthesis.trim()
        : typeof record.finalSynthesis === 'string'
          ? record.finalSynthesis.trim()
          : '',
      scenario_ranking: normalizeWarRoomScenarioRanking(record.scenario_ranking ?? record.scenarioRanking),
      scenario_adjustments: normalizeWarRoomScenarioAdjustments(record.scenario_adjustments ?? record.scenarioAdjustments),
      scenario_focus: normalizeWarRoomScenarioFocus(record.scenario_focus ?? record.scenarioFocus),
      executive_recommendations: toStringArray(record.executive_recommendations ?? record.executiveRecommendations, 8),
      updated_watchpoints: updatedWatchpoints.length > 0 ? updatedWatchpoints : recommendedWatchpoints,
      recommended_watchpoints: recommendedWatchpoints,
    };
  }

export const ASSISTANT_RESPONSE_SCHEMA = {
  name: 'qadr110_assistant_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'reportTitle',
      'executiveSummary',
      'observedFacts',
      'analyticalInference',
      'scenarios',
      'uncertainties',
      'recommendations',
      'resilienceNarrative',
      'followUpSuggestions',
    ],
    properties: {
      reportTitle: { type: 'string' },
      executiveSummary: { type: 'string' },
      observedFacts: { type: 'object' },
      analyticalInference: { type: 'object' },
      scenarios: { type: 'array' },
      metaScenario: { type: 'object' },
      warRoom: { type: 'object' },
      decisionSupport: { type: 'object' },
      uncertainties: { type: 'object' },
      recommendations: { type: 'object' },
      resilienceNarrative: { type: 'object' },
      followUpSuggestions: { type: 'array' },
    },
  },
} as const;

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim().replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/, '').trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

export function coerceAssistantStructuredOutput(value: unknown): AssistantStructuredOutput {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};

  return {
    reportTitle: typeof record.reportTitle === 'string' ? record.reportTitle : 'گزارش تحلیلی QADR110',
    executiveSummary: typeof record.executiveSummary === 'string' ? record.executiveSummary.trim() : '',
    observedFacts: normalizeSection(record.observedFacts, 'واقعیت‌های مشاهده‌شده'),
    analyticalInference: normalizeSection(record.analyticalInference, 'استنباط تحلیلی'),
    scenarios: normalizeScenarios(record.scenarios),
    simulation: normalizeSimulation(record.simulation),
    metaScenario: normalizeMetaScenarioOutput(record.metaScenario ?? record.meta_scenario),
    warRoom: normalizeWarRoomOutput(record.warRoom ?? record.war_room),
    decisionSupport: normalizeDecisionSupport(record.decisionSupport ?? record.decision_support),
    uncertainties: normalizeSection(record.uncertainties, 'عدم‌قطعیت‌ها'),
    recommendations: normalizeSection(record.recommendations, 'توصیه‌های دفاعی'),
    resilienceNarrative: normalizeSection(record.resilienceNarrative, 'روایت تاب‌آوری'),
    followUpSuggestions: toStringArray(record.followUpSuggestions, 5),
  };
}

export function parseAssistantResponseJson(raw: string): AssistantStructuredOutput | null {
  if (!raw.trim()) return null;

  try {
    return coerceAssistantStructuredOutput(JSON.parse(extractJsonObject(raw)));
  } catch {
    return null;
  }
}
