import type {
  AssistantBlackSwanCandidate,
  AssistantProbabilityBand,
  AssistantScenarioConflict,
  AssistantWarRoomAgent,
  AssistantWarRoomDisagreement,
  AssistantWarRoomScenarioAdjustment,
  AssistantWarRoomScenarioFocus,
  AssistantWarRoomScenarioRankingItem,
} from '@/platform/ai/assistant-contracts';

import type { ScenarioEngineScenario } from '../scenario-engine';

export interface WarRoomScenarioSelection {
  agent_id: string;
  scenario_id: string;
  scenario_title: string;
}

export interface WarRoomScenarioIntegrationInput {
  scenarios: ScenarioEngineScenario[];
  agents: AssistantWarRoomAgent[];
  selections: WarRoomScenarioSelection[];
  disagreements: AssistantWarRoomDisagreement[];
  conflicts: AssistantScenarioConflict[];
  blackSwans: AssistantBlackSwanCandidate[];
}

export interface WarRoomScenarioIntegrationOutput {
  scenarioRanking: AssistantWarRoomScenarioRankingItem[];
  scenarioAdjustments: AssistantWarRoomScenarioAdjustment[];
  scenarioFocus: AssistantWarRoomScenarioFocus;
  updatedWatchpoints: string[];
  executiveRecommendations: string[];
}

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function uniqueStrings(values: Array<string | undefined>, maxItems = 10): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, maxItems);
}

function probabilityScore(scenario: ScenarioEngineScenario): number {
  if (typeof scenario.probability_score === 'number') return clamp(scenario.probability_score);
  if (scenario.probability === 'high') return 0.76;
  if (scenario.probability === 'low') return 0.24;
  return 0.52;
}

function scenarioThreatCount(input: {
  scenario: ScenarioEngineScenario;
  disagreements: AssistantWarRoomDisagreement[];
  conflicts: AssistantScenarioConflict[];
  blackSwans: AssistantBlackSwanCandidate[];
}): number {
  const lowerTitle = input.scenario.title.toLowerCase();
  const disagreementHits = input.disagreements.filter((item) => item.title.toLowerCase().includes(lowerTitle)).length;
  const conflictHits = input.conflicts.filter((item) => item.left_scenario_id === input.scenario.id || item.right_scenario_id === input.scenario.id).length;
  const blackSwanHits = input.blackSwans.filter((item) => item.id.endsWith(input.scenario.id) || item.title.toLowerCase().includes(lowerTitle)).length;
  return disagreementHits + conflictHits + blackSwanHits;
}

function toBand(score: number): AssistantProbabilityBand {
  if (score >= 0.68) return 'high';
  if (score >= 0.34) return 'medium';
  return 'low';
}

export function buildWarRoomScenarioIntegration(
  input: WarRoomScenarioIntegrationInput,
): WarRoomScenarioIntegrationOutput {
  const selectionMap = new Map(input.selections.map((item) => [item.agent_id, item.scenario_id] as const));
  const baselineScenarios = input.scenarios.slice(0, 6);
  const ranking = baselineScenarios.map((scenario, index) => {
    const linkedAgentIds = input.selections
      .filter((selection) => selection.scenario_id === scenario.id)
      .map((selection) => selection.agent_id);
    const linkedConflicts = input.conflicts.filter((item) => item.left_scenario_id === scenario.id || item.right_scenario_id === scenario.id);
    const linkedBlackSwans = input.blackSwans.filter((item) => item.id.endsWith(scenario.id) || item.title.includes(scenario.title));
    const inboundChallenges = input.agents.flatMap((agent) => agent.critiques.filter((critique) => {
      const targetScenarioId = selectionMap.get(critique.target_agent_id);
      return targetScenarioId === scenario.id;
    })).length;
    const outboundSupport = linkedAgentIds.length;
    const conflictPressure = linkedConflicts.length;
    const blackSwanPressure = linkedBlackSwans.length;
    const revisedScore = clamp(
      (probabilityScore(scenario) * 0.54)
      + (Math.min(outboundSupport, 4) * 0.09)
      - (Math.min(inboundChallenges, 4) * 0.08)
      - (Math.min(conflictPressure, 3) * 0.07)
      - (Math.min(blackSwanPressure, 2) * 0.05),
    );

    return {
      scenario,
      baselineRank: index + 1,
      revisedScore,
      linkedAgentIds,
      linkedConflicts,
      linkedBlackSwans,
      inboundChallenges,
    };
  }).sort((left, right) => right.revisedScore - left.revisedScore);

  const scenarioRanking: AssistantWarRoomScenarioRankingItem[] = ranking.map((item, index) => {
    const revisedRank = index + 1;
    const rankDelta = item.baselineRank - revisedRank;
    const threatCount = scenarioThreatCount({
      scenario: item.scenario,
      disagreements: input.disagreements,
      conflicts: input.conflicts,
      blackSwans: input.blackSwans,
    });

    let stance: AssistantWarRoomScenarioRankingItem['stance'] = 'contested';
    if (revisedRank === 1 && item.baselineRank === 1) {
      stance = threatCount >= 2 ? 'contested' : 'dominant';
    } else if (revisedRank === 1 && item.baselineRank > 1) {
      stance = 'replacement';
    } else if (rankDelta >= 1) {
      stance = 'underappreciated';
    } else if (rankDelta <= -1) {
      stance = 'overrated';
    }

    return {
      scenario_id: item.scenario.id,
      title: item.scenario.title,
      baseline_rank: item.baselineRank,
      revised_rank: revisedRank,
      stance,
      summary: stance === 'dominant'
        ? `این سناریو پس از مناظره همچنان چارچوب غالب باقی مانده است.`
        : stance === 'replacement'
          ? `این سناریو در مناظره جایگزین مسیر baseline شد و explanatory dominance را به دست آورد.`
          : stance === 'underappreciated'
            ? `این سناریو در baseline پایین‌تر دیده می‌شد اما در مناظره وزن بیشتری گرفت.`
            : stance === 'overrated'
              ? `این سناریو در baseline بیش‌برآورد شده بود و پس از challenge افت کرد.`
              : `این سناریو زیر فشار تعارض، قوی‌سیاه یا challenge چندعاملی contested باقی ماند.`,
      why: uniqueStrings([
        item.scenario.drivers[0],
        item.scenario.indicators_to_watch[0],
        item.linkedConflicts[0]?.summary,
        item.linkedBlackSwans[0]?.why_it_matters,
      ], 3).join(' | ') || item.scenario.description,
      consensus_shift: Number((item.revisedScore - probabilityScore(item.scenario)).toFixed(2)),
      linked_agent_ids: item.linkedAgentIds,
      linked_conflict_ids: item.linkedConflicts.map((conflict) => conflict.id),
      linked_black_swan_ids: item.linkedBlackSwans.map((candidate) => candidate.id),
      watchpoints: uniqueStrings([
        ...item.scenario.indicators_to_watch.slice(0, 3),
        ...item.linkedConflicts.flatMap((conflict) => conflict.decisive_indicators.slice(0, 2)),
        ...item.linkedBlackSwans.flatMap((candidate) => candidate.leading_indicators.slice(0, 2)),
      ], 6),
    };
  });

  const dominant = scenarioRanking[0];
  const overrated = scenarioRanking.find((item) => item.stance === 'overrated') ?? null;
  const underappreciated = scenarioRanking.find((item) => item.stance === 'underappreciated' || item.stance === 'replacement') ?? null;
  const keyConflict = input.conflicts[0] ?? null;
  const blackSwanThreat = input.blackSwans[0] ?? null;

  const scenarioAdjustments: AssistantWarRoomScenarioAdjustment[] = scenarioRanking
    .filter((item) => item.stance !== 'dominant' || item.linked_conflict_ids.length > 0 || item.linked_black_swan_ids.length > 0)
    .slice(0, 5)
    .map((item, index) => ({
      id: `war-room-adjustment-${index + 1}-${item.scenario_id}`,
      scenario_id: item.scenario_id,
      title: item.title,
      adjustment_type: item.stance === 'underappreciated'
        ? 'promote'
        : item.stance === 'overrated'
          ? 'demote'
          : item.stance === 'replacement'
            ? 'replace'
            : 'watch',
      summary: item.summary,
      rationale: item.why,
      disagreement_driver: input.disagreements.find((entry) => entry.agent_ids.some((agentId) => item.linked_agent_ids.includes(agentId)))?.summary
        || keyConflict?.summary
        || blackSwanThreat?.summary
        || 'مناظره چندعاملی این سناریو را به بازنگری واداشت.',
      affected_agent_ids: item.linked_agent_ids,
      linked_conflict_id: item.linked_conflict_ids[0],
      linked_black_swan_id: item.linked_black_swan_ids[0],
      updated_watchpoints: item.watchpoints,
      confidence: toBand(clamp(0.42 + Math.abs(item.consensus_shift) + (item.linked_conflict_ids.length * 0.08))),
    }));

  const updatedWatchpoints = uniqueStrings([
    ...scenarioRanking.flatMap((item) => item.watchpoints),
    ...input.agents.flatMap((agent) => agent.watchpoints),
    ...input.blackSwans.flatMap((item) => item.leading_indicators),
  ], 10);

  const executiveRecommendations = uniqueStrings([
    dominant ? `سناریوی غالب فعلی «${dominant.title}» است؛ watchpointهای ${dominant.watchpoints.slice(0, 2).join(' / ')} باید در cadence نزدیک پایش شوند.` : undefined,
    overrated ? `سناریوی «${overrated.title}» بیش‌برآورد شده و باید وزن آن در briefingهای بعدی کاهش یابد.` : undefined,
    underappreciated ? `سناریوی «${underappreciated.title}» کم‌برآورد شده و باید در تصمیم‌سازی و مانیتورینگ ارتقا یابد.` : undefined,
    keyConflict ? `تعارض سناریویی «${keyConflict.id}» مهم‌ترین conflict جاری است و با ${keyConflict.decisive_indicators[0] || 'شاخص decisive'} می‌تواند ranking را جابه‌جا کند.` : undefined,
    blackSwanThreat ? `قوی‌سیاه «${blackSwanThreat.title}» مهم‌ترین تهدید برای نگاه غالب است و باید به‌صورت مستقل روی watchlist بماند.` : undefined,
  ], 6);

  const scenarioFocus: AssistantWarRoomScenarioFocus = {
    dominant_scenario_id: dominant?.scenario_id,
    dominant_scenario_title: dominant?.title,
    overrated_scenario_id: overrated?.scenario_id,
    overrated_scenario_title: overrated?.title,
    underappreciated_scenario_id: underappreciated?.scenario_id,
    underappreciated_scenario_title: underappreciated?.title,
    key_conflict_id: keyConflict?.id,
    key_conflict_title: keyConflict?.summary ? keyConflict.id : undefined,
    black_swan_threat_id: blackSwanThreat?.id,
    black_swan_threat_title: blackSwanThreat?.title,
    scenario_shift_summary: uniqueStrings([
      dominant ? `سناریوی غالب: ${dominant.title}` : undefined,
      overrated ? `بیش‌برآورد شده: ${overrated.title}` : undefined,
      underappreciated ? `کم‌برآورد/جایگزین: ${underappreciated.title}` : undefined,
      keyConflict ? `تعارض کلیدی: ${keyConflict.summary}` : undefined,
      blackSwanThreat ? `تهدید قوی‌سیاه: ${blackSwanThreat.title}` : undefined,
    ], 5).join(' | '),
  };

  return {
    scenarioRanking,
    scenarioAdjustments,
    scenarioFocus,
    updatedWatchpoints,
    executiveRecommendations,
  };
}
