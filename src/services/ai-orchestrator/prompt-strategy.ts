import { describeMapContextForPrompt } from '@/platform/operations/map-context';
import type { AssistantRunRequest } from '@/platform/ai/assistant-contracts';
import type {
  AssistantSessionContext,
  OrchestratorComplexity,
  OrchestratorPlan,
  OrchestratorToolSpec,
} from '@/platform/ai/orchestrator-contracts';

const INTENT_KEYWORDS: Array<{ id: string; terms: string[] }> = [
  { id: 'strategic-foresight', terms: ['strategic foresight', 'foresight', 'competing futures', 'board-ready', 'future outlook', 'پیش‌نگری راهبردی', 'پیش نگری راهبردی', 'آینده‌های رقیب', 'آینده هاي رقيب', 'جمع‌بندی هیئت', 'جمع بندی هیئت', 'برد-رِدی', 'board ready'] },
  { id: 'forecasting', terms: ['forecast', 'predict', 'پیش‌بینی', 'سناریو', 'scenario', 'spillover'] },
  { id: 'simulation', terms: ['simulate', 'simulation', 'what if', 'branch', 'tree', 'شبیه‌سازی', 'اگر', 'شاخه', 'درخت تصمیم'] },
  { id: 'war-room', terms: ['war room', 'multi-agent', 'debate', 'red team', 'skeptic', 'challenge assumptions', 'اتاق جنگ', 'چندعاملی', 'مناظره', 'ردتیم', 'رد تیم', 'چالش فرض'] },
  { id: 'black-swan', terms: ['black swan', 'assumption stress', 'regime shift', 'surprise', 'قوی سیاه', 'شکست فرض', 'رژیم شیفت', 'شگفتی راهبردی'] },
  { id: 'meta-scenario', terms: ['meta scenario', 'black swan', 'scenario war', 'scenario conflict', 'interaction', 'second-order', 'meta', 'قوی سیاه', 'جنگ سناریو', 'تعارض سناریو', 'تعامل سناریو', 'مرتبه دوم', 'متا'] },
  { id: 'osint-digest', terms: ['osint', 'signal', 'news', 'digest', 'خلاصه', 'خبر', 'سیگنال'] },
  { id: 'resilience', terms: ['resilience', 'تاب‌آوری', 'resiliency'] },
  { id: 'map-analysis', terms: ['map', 'geo', 'route', 'point', 'country', 'نقشه', 'محدوده', 'مسیر'] },
  { id: 'misinformation', terms: ['misinformation', 'narrative', 'disinformation', 'روایت', 'اطلاعات نادرست'] },
  { id: 'infrastructure', terms: ['infrastructure', 'logistics', 'energy', 'زیرساخت', 'لجستیک', 'انرژی'] },
];

function includesKeyword(query: string, terms: string[]): boolean {
  const lowered = query.toLowerCase();
  return terms.some((term) => lowered.includes(term.toLowerCase()));
}

export function inferOrchestratorIntent(
  query: string,
  taskClass: AssistantRunRequest['taskClass'],
  domainMode?: string,
): string {
  for (const keyword of INTENT_KEYWORDS) {
    if (includesKeyword(query, keyword.terms)) {
      return keyword.id;
    }
  }

  if (taskClass === 'forecasting' || taskClass === 'scenario-analysis' || taskClass === 'scenario-building') {
    return 'forecasting';
  }
  if (taskClass === 'resilience-analysis' || domainMode === 'economic-resilience') {
    return 'resilience';
  }
  if (domainMode === 'osint-digest') {
    return 'osint-digest';
  }
  return domainMode || taskClass;
}

export function classifyOrchestratorComplexity(
  request: Pick<AssistantRunRequest, 'query' | 'taskClass' | 'messages' | 'mapContext'>,
): OrchestratorComplexity {
  const query = request.query.trim();
  const longQuery = query.length >= 320;
  const hasHistory = (request.messages?.length ?? 0) >= 5;
  const mapRich = Boolean(request.mapContext?.nearbySignals?.length || request.mapContext?.selectedEntities?.length);

  if (
    request.taskClass === 'structured-json'
    || request.taskClass === 'classification'
    || request.taskClass === 'extraction'
  ) {
    return 'fast';
  }

  if (
    request.taskClass === 'forecasting'
    || request.taskClass === 'scenario-analysis'
    || request.taskClass === 'scenario-building'
    || request.taskClass === 'resilience-analysis'
    || request.taskClass === 'report-generation'
  ) {
    return longQuery || hasHistory || mapRich ? 'complex' : 'reasoning';
  }

  if (longQuery || hasHistory || mapRich) {
    return 'reasoning';
  }

  return 'fast';
}

function needsWebSearch(request: AssistantRunRequest, intent: string): boolean {
  if (intent === 'strategic-foresight' || request.domainMode === 'strategic-foresight') return true;
  if (request.taskClass === 'forecasting' || request.taskClass === 'briefing') return true;
  return ['osint-digest', 'map-analysis', 'misinformation', 'forecasting'].includes(intent);
}

function needsOsintFetch(request: AssistantRunRequest, intent: string): boolean {
  if (intent === 'strategic-foresight' || request.domainMode === 'strategic-foresight') return true;
  if (request.mapContext) return true;
  return ['osint-digest', 'forecasting', 'misinformation', 'infrastructure'].includes(intent)
    || request.domainMode === 'osint-digest'
    || request.domainMode === 'misinformation-analysis';
}

function needsScenarioEngine(request: AssistantRunRequest, intent: string): boolean {
  if (intent === 'strategic-foresight' || request.domainMode === 'strategic-foresight') return true;
  if (request.taskClass === 'forecasting' || request.taskClass === 'scenario-analysis' || request.taskClass === 'scenario-building') {
    return true;
  }
  const query = request.query.toLowerCase();
  return intent === 'forecasting'
    || query.includes('if ')
    || query.includes('what if')
    || query.includes('اگر ')
    || query.includes('در صورت')
    || query.includes('سناریو')
    || query.includes('cascade')
    || query.includes('outcome');
}

function needsScenarioSimulation(request: AssistantRunRequest, intent: string): boolean {
  const query = request.query.toLowerCase();
  return intent === 'simulation'
    || query.includes('simulate')
    || query.includes('simulation')
    || query.includes('what if')
    || query.includes('branch')
    || query.includes('decision tree')
    || query.includes('scenario graph')
    || query.includes('شبیه')
    || query.includes('شاخه')
    || query.includes('درخت تصمیم')
    || query.includes('اگر');
}

function needsStrategicForesight(request: AssistantRunRequest, intent: string): boolean {
  if (request.domainMode === 'strategic-foresight') return true;
  if (intent === 'strategic-foresight') return true;
  const query = request.query.toLowerCase();
  return query.includes('strategic foresight')
    || query.includes('foresight')
    || query.includes('competing futures')
    || query.includes('board-ready')
    || query.includes('dominant scenario')
    || query.includes('پیش‌نگری راهبردی')
    || query.includes('پیش نگری راهبردی')
    || query.includes('آینده‌های رقیب')
    || query.includes('آینده هاي رقيب')
    || query.includes('جمع‌بندی هیئت')
    || query.includes('جمع بندی هیئت');
}

function needsMetaScenarioEngine(request: AssistantRunRequest, intent: string): boolean {
  if (intent === 'strategic-foresight' || request.domainMode === 'strategic-foresight') return true;
  if (!needsScenarioEngine(request, intent)) return false;
  if (request.taskClass === 'forecasting' || request.taskClass === 'scenario-analysis' || request.taskClass === 'scenario-building') {
    return true;
  }
  const query = request.query.toLowerCase();
  return intent === 'meta-scenario'
    || query.includes('meta')
    || query.includes('black swan')
    || query.includes('scenario war')
    || query.includes('scenario conflict')
    || query.includes('interaction')
    || query.includes('second-order')
    || query.includes('قوی سیاه')
    || query.includes('جنگ سناریو')
    || query.includes('تعارض سناریو')
    || query.includes('تعامل سناریو')
    || query.includes('مرتبه دوم')
    || query.includes('متا');
}

function needsWarRoom(request: AssistantRunRequest, intent: string): boolean {
  if (!needsScenarioEngine(request, intent)) return false;
  const query = request.query.toLowerCase();
  return intent === 'war-room'
    || query.includes('war room')
    || query.includes('multi-agent')
    || query.includes('debate')
    || query.includes('red team')
    || query.includes('skeptic')
    || query.includes('challenge assumptions')
    || query.includes('اتاق جنگ')
    || query.includes('چندعاملی')
    || query.includes('مناظره')
    || query.includes('ردتیم')
    || query.includes('رد تیم')
    || query.includes('چالش فرض');
}

function needsWarRoomOnScenarios(request: AssistantRunRequest, intent: string): boolean {
  if (intent === 'strategic-foresight' && request.taskClass === 'scenario-analysis') return true;
  if (!needsScenarioEngine(request, intent)) return false;
  const query = request.query.toLowerCase();
  return query.includes('dominant scenario')
    || query.includes('overrated')
    || query.includes('underappreciated')
    || query.includes('black swan')
    || query.includes('scenario conflict')
    || query.includes('dominant forecast')
    || query.includes('scenario shift')
    || query.includes('سناریوی غالب')
    || query.includes('بیش\u200cبرآورد')
    || query.includes('کم\u200cبرآورد')
    || query.includes('کم برآورد')
    || query.includes('بیش برآورد')
    || query.includes('جایگزین سناریو')
    || query.includes('قوی سیاه')
    || query.includes('تعارض سناریو');
}

function needsBlackSwanEngine(request: AssistantRunRequest, intent: string): boolean {
  if (intent === 'strategic-foresight' || request.domainMode === 'strategic-foresight') return true;
  if (!needsScenarioEngine(request, intent)) return false;
  const query = request.query.toLowerCase();
  return intent === 'black-swan'
    || intent === 'meta-scenario'
    || query.includes('black swan')
    || query.includes('assumption stress')
    || query.includes('regime shift')
    || query.includes('surprise')
    || query.includes('قوی سیاه')
    || query.includes('شکست فرض')
    || query.includes('رژیم شیفت')
    || query.includes('شگفتی');
}

export function buildToolPlan(
  request: AssistantRunRequest,
  sessionContext: AssistantSessionContext,
  routeClass: OrchestratorPlan['routeClass'],
  intent: string,
): OrchestratorToolSpec[] {
  const tools: OrchestratorToolSpec[] = [];
  const strategicForesight = needsStrategicForesight(request, intent);

  if (request.mapContext) {
    tools.push({
      name: 'map_context',
      phase: 'execution',
      required: true,
      reason: 'کانتکست ژئویی باید به prompt و reasoning تزریق شود.',
    });
  }

  if (needsOsintFetch(request, intent)) {
    tools.push({
      name: 'osint_fetch',
      phase: 'execution',
      required: false,
      reason: 'برای سیگنال‌های اخیر و OSINT به داده بیرونی/داخلی نیاز است.',
    });
  }

  if (needsWebSearch(request, intent)) {
    tools.push({
      name: 'web_search',
      phase: 'execution',
      required: false,
      reason: 'برای خبرها و پوشش وب مکمل از جست‌وجوی وب استفاده می‌شود.',
      fallbackTools: ['osint_fetch'],
    });
  }

  if (needsScenarioEngine(request, intent)) {
    tools.push({
      name: 'scenario_engine',
      phase: 'execution',
      required: strategicForesight || request.taskClass === 'forecasting' || request.taskClass === 'scenario-analysis' || request.taskClass === 'scenario-building',
      reason: 'برای triggerهای صریح/ضمنی باید سناریوهای causal و چنددامنه‌ای ساخته شوند.',
    });
  }

  if (needsBlackSwanEngine(request, intent)) {
    tools.push({
      name: 'detect_black_swans',
      phase: 'execution',
      required: intent === 'black-swan',
      reason: 'برای weak signalها، stress test فرض‌ها و futures کم‌احتمال/پراثر باید موتور قوی سیاه اجرا شود.',
    });
  }

  if (needsMetaScenarioEngine(request, intent)) {
    tools.push({
      name: 'meta_scenario_engine',
      phase: 'execution',
      required: strategicForesight || request.taskClass === 'scenario-analysis' || request.taskClass === 'scenario-building',
      reason: 'برای interaction سناریوها، scenario war و Black Swan candidateها باید یک لایه reasoning مرتبه‌دوم اجرا شود.',
    });
  }

  const scenarioWarRoom = needsWarRoomOnScenarios(request, intent);
  const foresightWarRoom = strategicForesight
    && (routeClass === 'cloud-escalation'
      || request.taskClass === 'scenario-analysis'
      || Boolean(request.mapContext?.nearbySignals?.length)
      || sessionContext.reusableInsights.length >= 2);
  if (scenarioWarRoom || foresightWarRoom) {
    tools.push({
      name: 'war_room_on_scenarios',
      phase: 'execution',
      required: strategicForesight || request.taskClass === 'scenario-analysis' || request.taskClass === 'report-generation' || request.taskClass === 'scenario-building',
      reason: 'برای داوری سناریوی غالب، سناریوی بیش‌برآورد/کم‌برآورد، conflictهای کلیدی و تهدید قوی‌سیاه باید War Room سناریومحور اجرا شود.',
    });
  } else if (needsWarRoom(request, intent)) {
    tools.push({
      name: 'run_war_room',
      phase: 'execution',
      required: request.taskClass === 'scenario-analysis' || request.taskClass === 'report-generation',
      reason: 'برای مناظره چندعاملی، challenge فرض‌ها و synthesis راهبردی باید War Room چندنقشی اجرا شود.',
    });
  }

  if (needsScenarioSimulation(request, intent)) {
    tools.push({
      name: 'scenario_simulation',
      phase: 'execution',
      required: request.taskClass === 'scenario-analysis' || request.taskClass === 'scenario-building',
      reason: 'برای what-if و branch exploration باید شبیه‌سازی چندشاخه‌ای و decision tree ساخته شود.',
    });
  }

  if (strategicForesight) {
    tools.push({
      name: 'strategic_foresight',
      phase: 'execution',
      required: true,
      reason: 'برای ترکیب لایه‌های سناریو، متا‌سناریو، قوی‌سیاه، debate و watchpointها در یک synthesis board-ready باید حالت پیش‌نگری راهبردی اجرا شود.',
    });
  }

  tools.push({
    name: 'summarize_context',
    phase: 'execution',
    required: true,
    reason: 'نتایج ابزارها باید به یک digest evidence-aware فشرده شوند.',
  });

  tools.push({
    name: 'prompt_optimizer',
    phase: 'execution',
    required: true,
    reason: 'prompt باید با حافظه جلسه، کانتکست نقشه و سیگنال‌های اخیر بازنویسی شود.',
  });

  if (routeClass === 'cloud-escalation' || sessionContext.reusableInsights.length > 0) {
    tools.push({
      name: 'openrouter_call',
      phase: 'retry',
      required: false,
      reason: 'برای escalation در صورت شکست مسیر محلی یا نیاز به reasoning عمیق‌تر.',
    });
  }

  return tools;
}

function summarizeMapContext(request: AssistantRunRequest): string {
  if (!request.mapContext) return 'کانتکست نقشه‌ای ثبت نشده است.';
  return describeMapContextForPrompt(request.mapContext);
}

function summarizeSessionContext(sessionContext: AssistantSessionContext): string {
  const intents = sessionContext.intentHistory
    .slice(-3)
    .map((item) => `${item.inferredIntent} / ${item.query.slice(0, 72)}`);
  const insights = sessionContext.reusableInsights
    .slice(-3)
    .map((item) => item.summary);
  const mapHits = sessionContext.mapInteractions
    .slice(-2)
    .map((item) => item.label);

  return [
    sessionContext.activeIntentSummary ? `خلاصه intent session: ${sessionContext.activeIntentSummary}` : '',
    intents.length > 0 ? `intentهای اخیر:\n- ${intents.join('\n- ')}` : '',
    mapHits.length > 0 ? `interactionهای نقشه:\n- ${mapHits.join('\n- ')}` : '',
    insights.length > 0 ? `یافته‌های قابل reuse:\n- ${insights.join('\n- ')}` : '',
  ].filter(Boolean).join('\n\n');
}

export function composeOrchestratorSystemPrompt(input: {
  request: AssistantRunRequest;
  timeContext: string;
  plan: OrchestratorPlan;
  sessionContext: AssistantSessionContext;
}): string {
  const { request, timeContext, plan, sessionContext } = input;
  const scenarioSchemaHint = plan.toolPlan.some((item) => item.name === 'scenario_engine')
    ? [
      'When returning scenarios, each scenario object must include:',
      'id, title, description, probability, impact_level, time_horizon, drivers, causal_chain, indicators_to_watch, mitigation_options.',
      'Each causal_chain item must include stage and summary.',
    ].join('\n')
    : '';
  const simulationSchemaHint = plan.toolPlan.some((item) => item.name === 'scenario_simulation')
    ? [
      'When returning simulation data, include simulation.title, simulation.event, simulation.mode, simulation.compare_summary, simulation.controls_summary.',
      'simulation.branches must include id, title, description, probability, probability_score, impact_level, impact_score, uncertainty_level, time_horizon, local_risks, regional_spillovers, global_ripple_effects, controls_summary, tool_plan, steps.',
      'Each simulation.steps item must include id, title, stage, summary, probability_score, impact_score, uncertainty_level, indicators_to_watch, tool_calls.',
      'simulation.graph must include nodes[] and edges[] for a decision tree / scenario graph view.',
    ].join('\n')
    : '';
  const metaScenarioSchemaHint = plan.toolPlan.some((item) => item.name === 'meta_scenario_engine')
    ? [
      'When returning meta-scenario data, include metaScenario.executive_summary and metaScenario.higher_order_insights.',
      'metaScenario.meta_scenarios must include id, title, source_scenarios, relationship_type, summary, combined_probability, impact_level, uncertainty_level, critical_dependencies, trigger_indicators, watchpoints, strategic_implications, recommended_actions.',
      'metaScenario.scenario_conflicts must include id, left_scenario_id, right_scenario_id, relationship_type, interaction_strength, direction, summary, probability_redistribution, decisive_indicators.',
      'metaScenario.black_swan_candidates must include id, title, summary, probability, impact_level, uncertainty_level, why_it_matters, low_probability_reason, high_impact_reason, broken_assumptions, affected_domains, weak_signals, contradictory_evidence, regime_shift_indicators, leading_indicators, watchpoints, recommended_actions, confidence_note, uncertainty_note.',
    ].join('\n')
    : '';
  const blackSwanSchemaHint = plan.toolPlan.some((item) => item.name === 'detect_black_swans')
    ? [
      'When returning black-swan data, populate metaScenario.black_swan_candidates even if metaScenario.meta_scenarios is empty.',
      'Each black_swan candidate must include id, title, summary, probability, impact_level, uncertainty_level, why_it_matters, low_probability_reason, high_impact_reason, broken_assumptions, affected_domains, weak_signals, contradictory_evidence, regime_shift_indicators, leading_indicators, watchpoints, recommended_actions, confidence_note, uncertainty_note.',
    ].join('\n')
    : '';
  const warRoomSchemaHint = plan.toolPlan.some((item) => item.name === 'run_war_room' || item.name === 'war_room_on_scenarios')
    ? [
      'When returning war-room data, include warRoom.question, warRoom.anchor_label, warRoom.mode, warRoom.active_agent_ids, warRoom.excluded_agent_ids, warRoom.round_count, warRoom.moderator_summary, warRoom.executive_summary, warRoom.final_synthesis, warRoom.recommended_watchpoints.',
      'warRoom.agents must include id, role, label, role_prompt, position, revised_position, confidence_score, confidence_note, supporting_points, watchpoints, assumptions, critiques.',
      'Each warRoom.critique item must include target_agent_id, summary, marker.',
      'warRoom.rounds must include id, title, stage, summary, entries.',
      'Each warRoom.entries item must include agent_id, label, content, target_agent_ids, markers.',
      'warRoom.debate_transcript must include id, round_id, round_stage, round_index, agent_id, label, prompt_excerpt, response, target_agent_ids, markers, evidence_basis, quality_flags.',
      'warRoom.replay_trace must include id, from_stage, to_stage, round_id, round_index, summary, timestamp.',
      'warRoom.disagreement_matrix must be a machine-readable pairwise matrix.',
      'warRoom.quality_controls must include repetitive_debate, shallow_agreement, voice_collapse_risk, evidence_backed_disagreement_ratio, alerts, enforcement_notes.',
      'warRoom.disagreements and warRoom.convergences must be machine-readable arrays.',
      'warRoom.scenario_ranking must include scenario_id, title, baseline_rank, revised_rank, stance, summary, why, consensus_shift, linked_agent_ids, linked_conflict_ids, linked_black_swan_ids, watchpoints.',
      'warRoom.scenario_adjustments must include id, scenario_id, title, adjustment_type, summary, rationale, disagreement_driver, affected_agent_ids, linked_conflict_id, linked_black_swan_id, updated_watchpoints, confidence.',
      'warRoom.scenario_focus must include dominant, overrated, underappreciated, key_conflict, black_swan_threat, and scenario_shift_summary fields.',
      'warRoom.executive_recommendations and warRoom.updated_watchpoints must be explicit arrays.',
    ].join('\n')
    : '';
  const strategicForesightSchemaHint = plan.toolPlan.some((item) => item.name === 'strategic_foresight')
    ? [
      'When strategic foresight mode is active, executiveSummary must synthesize dominant scenarios, competing futures, black-swan threats, debate highlights, watch indicators, and recommended next prompts.',
      'Use scenarios[] for the current dominant futures, metaScenario for competing futures / black swans, warRoom for debate highlights, uncertainties for blind spots, recommendations for executive actions, and followUpSuggestions for next prompts.',
    ].join('\n')
    : '';
  return [
    'You are QADR110 local-first AI Orchestrator.',
    'Respond only in Persian and keep the analysis lawful, defensive, evidence-aware, and map-aware.',
    'Separate observed facts, analytical inference, scenarios, uncertainties, and recommendations.',
    'Never fabricate sources, citations, numbers, or certainty.',
    'When data is missing, say it explicitly.',
    `Current time context: ${timeContext}`,
    `Task class: ${request.taskClass}`,
    `Domain mode: ${request.domainMode}`,
    `Orchestrator route: ${plan.routeClass}`,
    `Intent: ${plan.intent}`,
    `Session summary: ${sessionContext.activeIntentSummary || 'none'}`,
    scenarioSchemaHint,
    simulationSchemaHint,
    metaScenarioSchemaHint,
    blackSwanSchemaHint,
    warRoomSchemaHint,
    strategicForesightSchemaHint,
    'Return valid JSON matching the requested schema. Avoid markdown fences.',
  ].join('\n');
}

export function composeOrchestratorUserPrompt(input: {
  request: AssistantRunRequest;
  sessionContext: AssistantSessionContext;
  contextSummary: string;
  optimizedPrompt: string;
  timeContext: string;
}): string {
  const { request, sessionContext, contextSummary, optimizedPrompt, timeContext } = input;
  const sessionSummary = summarizeSessionContext(sessionContext);

  return [
    `Query: ${request.query}`,
    request.promptText ? `Prompt pack:\n${request.promptText}` : '',
    request.mapContext ? `Map context:\n${summarizeMapContext(request)}` : '',
    sessionSummary ? `Session context:\n${sessionSummary}` : '',
    contextSummary ? `Tool-grounded context:\n${contextSummary}` : '',
    optimizedPrompt ? `Optimized execution prompt:\n${optimizedPrompt}` : '',
    `Time context: ${timeContext}`,
  ].filter(Boolean).join('\n\n');
}
