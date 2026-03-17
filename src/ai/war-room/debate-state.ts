import type {
  AssistantProbabilityBand,
  AssistantWarRoomAgent,
  AssistantWarRoomDebateMode,
  AssistantWarRoomDisagreementMatrixRow,
  AssistantWarRoomQualityControls,
  AssistantWarRoomRound,
  AssistantWarRoomStateTransition,
  AssistantWarRoomTranscriptEntry,
  AssistantWarRoomTransitionStage,
} from '@/platform/ai/assistant-contracts';

import {
  getWarRoomAgent,
  listWarRoomAgents,
  type WarRoomAgentDefinition,
  type WarRoomAgentId,
} from './agents';

const FAST_AGENT_IDS: WarRoomAgentId[] = [
  'strategic-analyst',
  'skeptic-red-team',
  'economic-analyst',
  'osint-analyst',
  'scenario-moderator',
  'executive-synthesizer',
];

export interface WarRoomDebateControls {
  mode: AssistantWarRoomDebateMode;
  challengeIterations: number;
  includedAgentIds: WarRoomAgentId[];
  excludedAgentIds: WarRoomAgentId[];
}

export interface WarRoomDebateState {
  question: string;
  anchorLabel: string;
  controls: WarRoomDebateControls;
  startedAt: string;
  currentStage: AssistantWarRoomTransitionStage;
  activeAgents: AssistantWarRoomAgent[];
  rounds: AssistantWarRoomRound[];
  transcript: AssistantWarRoomTranscriptEntry[];
  replayTrace: AssistantWarRoomStateTransition[];
}

export interface WarRoomRoundRecordOptions {
  roundIndex: number;
  promptByAgentId: Partial<Record<string, string>>;
  evidenceByAgentId: Partial<Record<string, string[]>>;
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

function shiftTimestamp(startedAt: string, secondsOffset: number): string {
  const base = Date.parse(startedAt);
  if (!Number.isFinite(base)) return new Date().toISOString();
  return new Date(base + (secondsOffset * 1000)).toISOString();
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

function toBand(score: number): AssistantProbabilityBand {
  if (score >= 0.67) return 'high';
  if (score >= 0.34) return 'medium';
  return 'low';
}

function buildTranscriptEntryId(roundId: string, agentId: string, index: number): string {
  return `${roundId}:${agentId}:${index + 1}`;
}

function targetAgentLabel(agentId: string): string {
  try {
    return getWarRoomAgent(agentId as WarRoomAgentId).label;
  } catch {
    return agentId;
  }
}

export function resolveWarRoomControls(input: {
  mode?: AssistantWarRoomDebateMode;
  challengeIterations?: number;
  includedAgentIds?: WarRoomAgentId[];
  excludedAgentIds?: WarRoomAgentId[];
}): WarRoomDebateControls {
  const mode = input.mode === 'fast' ? 'fast' : 'deep';
  const includedAgentIds = Array.from(new Set(input.includedAgentIds ?? []));
  const excludedAgentIds = Array.from(new Set(input.excludedAgentIds ?? []));
  const defaultIterations = mode === 'fast' ? 1 : 2;
  const maxIterations = mode === 'fast' ? 1 : 3;
  return {
    mode,
    challengeIterations: Math.max(1, Math.min(maxIterations, Math.round(input.challengeIterations ?? defaultIterations))),
    includedAgentIds,
    excludedAgentIds,
  };
}

export function selectWarRoomAgents(controls: WarRoomDebateControls): WarRoomAgentDefinition[] {
  const baseIds = controls.includedAgentIds.length > 0
    ? controls.includedAgentIds
    : controls.mode === 'fast'
      ? FAST_AGENT_IDS
      : listWarRoomAgents().map((agent) => agent.id);
  const selected = baseIds
    .filter((id) => !controls.excludedAgentIds.includes(id))
    .map((id) => getWarRoomAgent(id));
  return selected.length > 0 ? selected : FAST_AGENT_IDS.map((id) => getWarRoomAgent(id));
}

export function createWarRoomDebateState(input: {
  question: string;
  anchorLabel: string;
  controls: WarRoomDebateControls;
  agents: AssistantWarRoomAgent[];
  startedAt?: string;
}): WarRoomDebateState {
  const startedAt = input.startedAt || new Date().toISOString();
  return {
    question: input.question,
    anchorLabel: input.anchorLabel,
    controls: input.controls,
    startedAt,
    currentStage: 'initialized',
    activeAgents: input.agents,
    rounds: [],
    transcript: [],
    replayTrace: [{
      id: `transition:${slugify(`${input.question}:${input.anchorLabel}`)}:0`,
      from_stage: 'initialized',
      to_stage: 'initialized',
      round_index: 0,
      summary: `War Room برای «${input.question}» در ${input.anchorLabel} با ${input.agents.length} عامل آماده شد.`,
      timestamp: startedAt,
    }],
  };
}

export function transitionWarRoomState(
  state: WarRoomDebateState,
  transition: {
    toStage: AssistantWarRoomTransitionStage;
    roundId?: string;
    roundIndex: number;
    summary: string;
  },
): WarRoomDebateState {
  const nextTransition: AssistantWarRoomStateTransition = {
    id: `transition:${transition.roundIndex}:${transition.toStage}`,
    from_stage: state.currentStage,
    to_stage: transition.toStage,
    round_id: transition.roundId,
    round_index: transition.roundIndex,
    summary: transition.summary,
    timestamp: shiftTimestamp(state.startedAt, state.replayTrace.length * 9),
  };
  return {
    ...state,
    currentStage: transition.toStage,
    replayTrace: [...state.replayTrace, nextTransition],
  };
}

export function recordWarRoomRound(
  state: WarRoomDebateState,
  round: AssistantWarRoomRound,
  options: WarRoomRoundRecordOptions,
): WarRoomDebateState {
  const transcriptItems: AssistantWarRoomTranscriptEntry[] = round.entries.map((entry, index) => {
    const evidenceBasis = uniqueStrings([
      ...(options.evidenceByAgentId[entry.agent_id] ?? []),
      ...entry.target_agent_ids.map((targetId) => `target=${targetAgentLabel(targetId)}`),
    ], 6);
    const hasEvidence = evidenceBasis.length > 0;
    return {
      id: buildTranscriptEntryId(round.id, entry.agent_id, index),
      round_id: round.id,
      round_stage: round.stage,
      round_index: options.roundIndex,
      agent_id: entry.agent_id,
      label: entry.label,
      prompt_excerpt: options.promptByAgentId[entry.agent_id] ?? '',
      response: entry.content,
      target_agent_ids: entry.target_agent_ids,
      markers: entry.markers,
      evidence_basis: evidenceBasis,
      quality_flags: uniqueStrings([
        hasEvidence ? 'evidence-backed' : 'needs-evidence',
        entry.markers.includes('uncertainty') ? 'uncertainty-explicit' : undefined,
        entry.markers.includes('challenge') ? 'cross-critique' : undefined,
      ], 4),
    };
  });

  const withRound = {
    ...state,
    rounds: [...state.rounds, round],
    transcript: [...state.transcript, ...transcriptItems],
  };
  return transitionWarRoomState(withRound, {
    toStage: round.stage,
    roundId: round.id,
    roundIndex: options.roundIndex,
    summary: round.summary,
  });
}

export function buildWarRoomDisagreementMatrix(
  agents: AssistantWarRoomAgent[],
  transcript: AssistantWarRoomTranscriptEntry[],
): AssistantWarRoomDisagreementMatrixRow[] {
  return agents.map((agent) => ({
    agent_id: agent.id,
    label: agent.label,
    cells: agents
      .filter((candidate) => candidate.id !== agent.id)
      .map((candidate) => {
        const challengeEntries = transcript.filter((entry) =>
          entry.agent_id === agent.id
          && entry.target_agent_ids.includes(candidate.id)
          && entry.markers.includes('challenge'));
        const score = clamp(
          (challengeEntries.length * 0.32)
          + (challengeEntries.some((entry) => entry.quality_flags.includes('evidence-backed')) ? 0.24 : 0)
          + (challengeEntries.some((entry) => entry.response.includes('فرض') || entry.response.includes('blind spot') || entry.response.includes('کم‌برآورد')) ? 0.22 : 0),
        );
        return {
          target_agent_id: candidate.id,
          disagreement_score: round(score),
          challenge_count: challengeEntries.length,
          evidence_backed: challengeEntries.some((entry) => entry.quality_flags.includes('evidence-backed')),
          summary: challengeEntries[0]?.response || 'اختلاف برجسته‌ای ثبت نشده است.',
        };
      }),
  }));
}

export function evaluateWarRoomQuality(input: {
  agents: AssistantWarRoomAgent[];
  transcript: AssistantWarRoomTranscriptEntry[];
  disagreementsCount: number;
  convergencesCount: number;
}): AssistantWarRoomQualityControls {
  const finalPositions = input.agents.map((agent) => agent.revised_position || agent.position).filter(Boolean);
  const pairwiseSimilarities: number[] = [];
  for (let index = 0; index < finalPositions.length; index += 1) {
    for (let inner = index + 1; inner < finalPositions.length; inner += 1) {
      pairwiseSimilarities.push(overlapRatio(tokenize(finalPositions[index]!), tokenize(finalPositions[inner]!)));
    }
  }
  const averageSimilarity = pairwiseSimilarities.length > 0
    ? pairwiseSimilarities.reduce((sum, item) => sum + item, 0) / pairwiseSimilarities.length
    : 0;
  const repetitiveDebate = averageSimilarity >= 0.72;
  const shallowAgreement = input.disagreementsCount <= 1 && input.convergencesCount >= Math.max(1, Math.floor(input.agents.length / 3));
  const evidenceBackedDisagreements = input.transcript.filter((entry) =>
    entry.markers.includes('challenge') && entry.quality_flags.includes('evidence-backed'));
  const totalChallenges = input.transcript.filter((entry) => entry.markers.includes('challenge')).length;
  const evidenceBackedDisagreementRatio = totalChallenges > 0
    ? round(evidenceBackedDisagreements.length / totalChallenges)
    : 0;
  const voiceCollapseRisk = toBand(
    clamp((averageSimilarity * 0.72) + (shallowAgreement ? 0.18 : 0) + (repetitiveDebate ? 0.12 : 0)),
  );

  return {
    repetitive_debate: repetitiveDebate,
    shallow_agreement: shallowAgreement,
    voice_collapse_risk: voiceCollapseRisk,
    evidence_backed_disagreement_ratio: evidenceBackedDisagreementRatio,
    alerts: uniqueStrings([
      repetitiveDebate ? 'ریسک تکراری شدن بحث بالا رفته و بخشی از پاسخ‌ها به هم نزدیک شده‌اند.' : undefined,
      shallowAgreement ? 'اتفاق‌نظر سریع‌تر از حد مطلوب شکل گرفته و disagreement تازه کم است.' : undefined,
      evidenceBackedDisagreementRatio < 0.5 && totalChallenges > 0 ? 'بخشی از disagreementها هنوز evidence-backed کافی ندارند.' : undefined,
    ], 6),
    enforcement_notes: uniqueStrings([
      voiceCollapseRisk === 'high' ? 'نقش‌ها باید در دور بعدی روی lens اختصاصی خود بازتنظیم شوند.' : undefined,
      repetitiveDebate ? 'در دورهای بعدی challengeها باید به assumptions متفاوت و domainهای مغفول هدایت شوند.' : undefined,
      shallowAgreement ? 'Moderator باید clarification request و سوال تفکیکی تازه اضافه کند.' : undefined,
    ], 6),
  };
}
