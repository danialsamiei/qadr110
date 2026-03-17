import type {
  AssistantContextPacket,
  AssistantWarRoomAgent,
  AssistantWarRoomTranscriptEntry,
} from '@/platform/ai/assistant-contracts';
import type { ScenarioDomain, ScenarioEngineState, ScenarioSignalRecord } from '@/ai/scenario-engine';
import type { WarRoomOutput } from '@/ai/war-room';

export type WarRoomViewMode = 'overview' | 'consensus' | 'conflict' | 'executive' | 'red-team';
export type WarRoomDebatePreset = 'quick' | 'deep' | 'scenario-linked';
export type WarRoomHeatTone = 'muted' | 'low' | 'medium' | 'high' | 'critical';
export type WarRoomLayerTone = 'accent' | 'danger' | 'warning' | 'success' | 'neutral';
export type WarRoomDeckMode = 'board' | 'battlefield' | 'timeline' | 'evidence';
export type WarRoomDrilldownKind = 'agent' | 'round' | 'scenario' | 'conflict' | 'executive' | 'evidence';

export interface WarRoomDeckTab {
  id: WarRoomDeckMode;
  label: string;
  summary: string;
  countLabel: string;
}

export interface WarRoomShortcutHint {
  id: string;
  keys: string;
  label: string;
  description: string;
}

export interface WarRoomDrilldownRef {
  kind: WarRoomDrilldownKind;
  id: string;
}

export interface WarRoomDrilldownSection {
  id: string;
  title: string;
  items: string[];
}

export interface WarRoomDrilldownTarget {
  id: string;
  kind: WarRoomDrilldownKind;
  title: string;
  subtitle: string;
  summary: string;
  chips: string[];
  sections: WarRoomDrilldownSection[];
  prompt: string;
}

export interface WarRoomLayerCard {
  id: string;
  title: string;
  metric: string;
  summary: string;
  bullets: string[];
  tone: WarRoomLayerTone;
}

export interface WarRoomInfluenceVector {
  id: string;
  label: string;
  magnitude: number;
  summary: string;
  tone: WarRoomLayerTone;
}

export interface WarRoomPropagationNode {
  id: string;
  label: string;
  detail: string;
  tone: WarRoomLayerTone;
}

export interface WarRoomPropagationEdge {
  from: string;
  to: string;
  label: string;
  strength: number;
  tone: WarRoomLayerTone;
}

export interface WarRoomOperationalLayer {
  summary: string;
  cards: WarRoomLayerCard[];
  watchpoints: string[];
  actions: string[];
}

export interface WarRoomCognitiveLayer extends WarRoomOperationalLayer {
  nodes: WarRoomPropagationNode[];
  edges: WarRoomPropagationEdge[];
  vectors: WarRoomInfluenceVector[];
}

const COGNITIVE_KEYWORDS = [
  'روایت',
  'رسانه',
  'شناختی',
  'narrative',
  'sentiment',
  'social',
  'misinformation',
  'disinformation',
  'campaign',
  'hashtag',
  'polarization',
  'اعتراض',
  'نارضایتی',
];

const CYBER_KEYWORDS = [
  'cyber',
  'سایبر',
  'زیرساخت',
  'infrastructure',
  'outage',
  'datacenter',
  'network',
  'logistics',
  'supply chain',
  'بندر',
  'اختلال',
  'حمل',
];

const DEFENSE_KEYWORDS = [
  'mitigation',
  'counter',
  'defensive',
  'پایش',
  'کاهش',
  'تاب‌آوری',
  'بازیابی',
  'حفاظت',
  'resilience',
];

function uniqueStrings(values: Array<string | undefined>, maxItems = 8): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, maxItems);
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function toPercent(value: number): string {
  return `${Math.round(clamp(value) * 100)}%`;
}

function toLower(text: string): string {
  return text.toLocaleLowerCase('fa-IR');
}

function keywordHits(text: string, keywords: string[]): number {
  const haystack = toLower(text);
  return keywords.reduce((count, keyword) => count + (haystack.includes(toLower(keyword)) ? 1 : 0), 0);
}

function signalHits(signal: ScenarioSignalRecord, keywords: string[]): number {
  return keywordHits(`${signal.label} ${signal.summary}`, keywords);
}

function toneForScore(score: number, positive = false): WarRoomLayerTone {
  if (positive) {
    if (score >= 0.7) return 'success';
    if (score >= 0.45) return 'accent';
    if (score >= 0.2) return 'warning';
    return 'neutral';
  }
  if (score >= 0.72) return 'danger';
  if (score >= 0.48) return 'warning';
  if (score >= 0.24) return 'accent';
  return 'neutral';
}

function averageSignalStrength(signals: ScenarioSignalRecord[]): number {
  if (!signals.length) return 0;
  return clamp(signals.reduce((sum, signal) => sum + signal.strength, 0) / signals.length);
}

function sourceDiversityRatio(state: ScenarioEngineState | null): number {
  return clamp((state?.signalFusion.sourceDiversity ?? 0) / 6);
}

function activeLayerRatio(state: ScenarioEngineState | null, candidateLayers: string[]): number {
  const activeLayers = state?.inputSnapshot.mapContext?.activeLayers ?? [];
  if (!candidateLayers.length) return 0;
  return clamp(activeLayers.filter((layer) => candidateLayers.includes(String(layer))).length / candidateLayers.length);
}

function topScenario(state: ScenarioEngineState | null) {
  return state?.scenarios[0] ?? null;
}

function anchorLabel(state: ScenarioEngineState | null, warRoom: WarRoomOutput): string {
  return state?.anchorLabel || warRoom.anchorLabel || 'این منطقه';
}

function filterSignals(
  state: ScenarioEngineState | null,
  keywords: string[],
  preferredSources: string[],
): ScenarioSignalRecord[] {
  return (state?.signals ?? []).filter((signal) =>
    preferredSources.includes(signal.source)
    || signalHits(signal, keywords) > 0,
  );
}

function findDriftReasons(state: ScenarioEngineState | null, keywords: string[]): string[] {
  return (state?.drift ?? [])
    .filter((drift) => keywordHits(`${drift.title} ${drift.reason} ${drift.signalLabels.join(' ')}`, keywords) > 0)
    .map((drift) => `${drift.title}: ${drift.reason}`);
}

function crossDomainBullets(state: ScenarioEngineState | null, domain: ScenarioDomain): string[] {
  return topScenario(state)?.cross_domain_impacts?.[domain] ?? [];
}

function scenarioMitigations(state: ScenarioEngineState | null): string[] {
  return topScenario(state)?.mitigation_options ?? [];
}

function scenarioIndicators(state: ScenarioEngineState | null): string[] {
  return topScenario(state)?.indicators_to_watch ?? [];
}

function scenarioEffects(state: ScenarioEngineState | null): string[] {
  return topScenario(state)?.second_order_effects ?? [];
}

function scenarioDrivers(state: ScenarioEngineState | null): string[] {
  return topScenario(state)?.drivers ?? [];
}

function transcriptForAgent(warRoom: WarRoomOutput, agentId: string): AssistantWarRoomTranscriptEntry[] {
  return warRoom.debateTranscript.filter((entry) => entry.agent_id === agentId);
}

function transcriptForRound(warRoom: WarRoomOutput, roundId: string): AssistantWarRoomTranscriptEntry[] {
  return warRoom.debateTranscript.filter((entry) => entry.round_id === roundId);
}

function packetScoreLabel(packet: AssistantContextPacket): string {
  return `${Math.round(clamp(packet.score) * 100)}%`;
}

function packetSummary(packet: AssistantContextPacket): string {
  return `${packet.sourceLabel} · ${packet.updatedAt}`;
}

function narrativeDisagreementPressure(warRoom: WarRoomOutput): number {
  return clamp(
    (warRoom.disagreements.length * 0.08)
    + (warRoom.scoring.disagreementDensity * 0.52)
    + (warRoom.qualityControls.evidence_backed_disagreement_ratio * 0.18),
  );
}

export function localizeWarRoomViewMode(view: WarRoomViewMode): string {
  switch (view) {
    case 'consensus':
      return 'نمای اجماع';
    case 'conflict':
      return 'نمای تعارض';
    case 'executive':
      return 'نمای اجرایی';
    case 'red-team':
      return 'نمای ردتیم';
    default:
      return 'نمای کلی';
  }
}

export function localizeWarRoomDebatePreset(preset: WarRoomDebatePreset): string {
  switch (preset) {
    case 'quick':
      return 'مناظره سریع';
    case 'scenario-linked':
      return 'مناظره سناریومحور';
    default:
      return 'مناظره عمیق';
  }
}

export function debatePresetToEngineMode(preset: WarRoomDebatePreset): 'fast' | 'deep' {
  return preset === 'quick' ? 'fast' : 'deep';
}

export function localizeWarRoomDeckMode(mode: WarRoomDeckMode): string {
  switch (mode) {
    case 'battlefield':
      return 'میدان سناریو';
    case 'timeline':
      return 'Timeline مناظره';
    case 'evidence':
      return 'Evidence Stack';
    default:
      return 'Board تحلیلی';
  }
}

export function buildWarRoomDeckTabs(
  warRoom: WarRoomOutput,
  scenarioState: ScenarioEngineState | null,
): WarRoomDeckTab[] {
  return [
    {
      id: 'board',
      label: localizeWarRoomDeckMode('board'),
      summary: 'نمای فشرده برای عامل‌ها، جمع‌بندی و نقاط تنش.',
      countLabel: `${warRoom.agents.length} عامل`,
    },
    {
      id: 'battlefield',
      label: localizeWarRoomDeckMode('battlefield'),
      summary: 'میدان سناریو، تعارض‌ها و لایه‌های شناختی/سایبری/دفاعی.',
      countLabel: `${warRoom.scenarioRanking.length || scenarioState?.scenarios.length || 0} سناریو`,
    },
    {
      id: 'timeline',
      label: localizeWarRoomDeckMode('timeline'),
      summary: 'Replay دورها، critiqueها و revisionهای مناظره.',
      countLabel: `${warRoom.rounds.length} round`,
    },
    {
      id: 'evidence',
      label: localizeWarRoomDeckMode('evidence'),
      summary: 'بسته‌های شواهد، traceها و watchpointهای تصمیم‌پذیر.',
      countLabel: `${warRoom.contextPackets.length || warRoom.debateTranscript.length} مدرک`,
    },
  ];
}

export function buildWarRoomShortcutHints(): WarRoomShortcutHint[] {
  return [
    {
      id: 'views',
      keys: '1-5',
      label: 'تعویض view',
      description: 'جابجایی سریع بین نمای کلی، اجماع، تعارض، اجرایی و ردتیم.',
    },
    {
      id: 'agents',
      keys: 'J / K',
      label: 'چرخش عامل‌ها',
      description: 'حرکت به عامل بعدی یا قبلی بدون خروج از board فعلی.',
    },
    {
      id: 'decks',
      keys: 'B / G / T / E',
      label: 'تعویض deck',
      description: 'جابجایی بین board، battlefield، timeline و evidence stack.',
    },
    {
      id: 'open',
      keys: 'Enter',
      label: 'بازکردن drill-down',
      description: 'گشودن report-within-report برای عامل یا آیتم فعلی.',
    },
    {
      id: 'back',
      keys: 'Esc / ?',
      label: 'خروج و راهنما',
      description: 'Esc لایه فعلی را می‌بندد؛ ? پنل shortcutها را باز یا بسته می‌کند.',
    },
  ];
}

export function strongestObjection(agent: AssistantWarRoomAgent): string {
  return agent.critiques[0]?.summary || 'اعتراض برجسته‌ای ثبت نشده است.';
}

export function cycleWarRoomFocusAgent(
  agents: AssistantWarRoomAgent[],
  currentAgentId: string | null | undefined,
  direction: 1 | -1,
): string | null {
  if (!agents.length) return null;
  const currentIndex = agents.findIndex((agent) => agent.id === currentAgentId);
  const nextIndex = currentIndex < 0
    ? 0
    : (currentIndex + direction + agents.length) % agents.length;
  return agents[nextIndex]?.id ?? null;
}

function sortAgentsByConfidence(agents: AssistantWarRoomAgent[]): AssistantWarRoomAgent[] {
  return agents
    .slice()
    .sort((left, right) => (right.confidence_score - left.confidence_score) || right.watchpoints.length - left.watchpoints.length);
}

export function filterWarRoomAgentsByView(warRoom: WarRoomOutput, view: WarRoomViewMode): AssistantWarRoomAgent[] {
  switch (view) {
    case 'consensus': {
      const ids = new Set(warRoom.convergences.flatMap((item) => item.agent_ids));
      return ids.size > 0
        ? sortAgentsByConfidence(warRoom.agents.filter((agent) => ids.has(agent.id)))
        : sortAgentsByConfidence(warRoom.agents).slice(0, 4);
    }
    case 'conflict': {
      const ids = new Set(warRoom.disagreements.flatMap((item) => item.agent_ids));
      return ids.size > 0
        ? sortAgentsByConfidence(warRoom.agents.filter((agent) => ids.has(agent.id)))
        : sortAgentsByConfidence(warRoom.agents).slice(0, 4);
    }
    case 'executive': {
      const preferred = ['executive-synthesizer', 'scenario-moderator', 'strategic-analyst'];
      return preferred
        .map((id) => warRoom.agents.find((agent) => agent.id === id))
        .filter((agent): agent is AssistantWarRoomAgent => Boolean(agent));
    }
    case 'red-team': {
      const redTeam = warRoom.agents.find((agent) => agent.id === 'skeptic-red-team');
      return redTeam ? [redTeam] : warRoom.agents.slice(0, 1);
    }
    default:
      return sortAgentsByConfidence(warRoom.agents);
  }
}

export function pickWarRoomFocusAgent(
  warRoom: WarRoomOutput,
  view: WarRoomViewMode,
  selectedAgentId?: string | null,
): AssistantWarRoomAgent | null {
  const visibleAgents = filterWarRoomAgentsByView(warRoom, view);
  const selected = selectedAgentId ? visibleAgents.find((agent) => agent.id === selectedAgentId) : null;
  if (selected) return selected;
  if (view === 'executive') {
    return visibleAgents[0] ?? null;
  }
  if (view === 'red-team') {
    return visibleAgents[0] ?? null;
  }
  return visibleAgents[0] ?? warRoom.agents[0] ?? null;
}

export function buildWarRoomViewNarrative(warRoom: WarRoomOutput, view: WarRoomViewMode): string {
  switch (view) {
    case 'consensus':
      return warRoom.convergences[0]?.summary || 'این نما روی نقاط اجماع، watchpointهای مشترک و evidence همگرا تمرکز دارد.';
    case 'conflict':
      return warRoom.disagreements[0]?.summary || 'این نما روی شکاف تحلیلی، challengeهای evidence-backed و battleline عامل‌ها متمرکز است.';
    case 'executive':
      return warRoom.executiveSummary;
    case 'red-team':
      return strongestObjection(warRoom.agents.find((agent) => agent.id === 'skeptic-red-team') ?? warRoom.agents[0]!);
    default:
      return warRoom.finalSynthesis;
  }
}

export function buildWarRoomHeatTone(score: number): WarRoomHeatTone {
  if (!Number.isFinite(score) || score <= 0.05) return 'muted';
  if (score < 0.28) return 'low';
  if (score < 0.52) return 'medium';
  if (score < 0.76) return 'high';
  return 'critical';
}

export function buildWarRoomSpecialViewNotes(warRoom: WarRoomOutput, view: WarRoomViewMode): string[] {
  switch (view) {
    case 'consensus':
      return uniqueStrings([
        ...warRoom.convergences.map((item) => item.title),
        ...warRoom.recommendedWatchpoints.slice(0, 3),
      ], 6);
    case 'conflict':
      return uniqueStrings([
        ...warRoom.disagreements.map((item) => item.title),
        ...warRoom.qualityControls.alerts,
      ], 6);
    case 'executive':
      return uniqueStrings([
        warRoom.executiveSummary,
        ...warRoom.recommendedWatchpoints.slice(0, 4),
      ], 6);
    case 'red-team': {
      const redTeam = warRoom.agents.find((agent) => agent.id === 'skeptic-red-team');
      return uniqueStrings([
        redTeam?.assumptions[0],
        redTeam?.critiques[0]?.summary,
        ...warRoom.unresolvedUncertainties.slice(0, 3),
      ], 6);
    }
    default:
      return uniqueStrings([
        warRoom.moderatorSummary,
        ...warRoom.qualityControls.enforcement_notes,
        ...warRoom.recommendedWatchpoints.slice(0, 3),
      ], 6);
  }
}

export function buildWarRoomContextBanner(warRoom: WarRoomOutput, preset: WarRoomDebatePreset): string {
  if (preset === 'scenario-linked') {
    return `این مناظره به سناریوی فعال و watchpointهای ${warRoom.anchorLabel} گره خورده است.`;
  }
  if (preset === 'quick') {
    return 'نسخه سریع روی عامل‌های کلیدی و disagreementهای decisive تمرکز می‌کند.';
  }
  return 'نسخه عمیق روی تمام roleها، trace کامل مناظره و replay state machine متمرکز است.';
}

export function buildWarRoomCognitiveLayer(
  warRoom: WarRoomOutput,
  scenarioState: ScenarioEngineState | null,
): WarRoomCognitiveLayer {
  const anchor = anchorLabel(scenarioState, warRoom);
  const socialSignals = filterSignals(scenarioState, COGNITIVE_KEYWORDS, ['social', 'news', 'gdelt', 'polymarket']);
  const publicSentimentScore = scenarioState?.domainScores.public_sentiment ?? 0;
  const narrativePressure = clamp(
    (averageSignalStrength(socialSignals) * 0.34)
    + (publicSentimentScore * 0.34)
    + (narrativeDisagreementPressure(warRoom) * 0.2)
    + (sourceDiversityRatio(scenarioState) * 0.12),
  );
  const driftPressure = clamp(
    (findDriftReasons(scenarioState, COGNITIVE_KEYWORDS).length * 0.16)
    + (publicSentimentScore * 0.46)
    + (averageSignalStrength(socialSignals.filter((signal) => signal.polarity === 'escalatory')) * 0.22),
  );
  const coordinationPressure = clamp(
    (sourceDiversityRatio(scenarioState) * 0.28)
    + (activeLayerRatio(scenarioState, ['gdelt', 'polymarket', 'protests', 'cyberThreats']) * 0.18)
    + (uniqueStrings(socialSignals.map((signal) => signal.source), 6).length * 0.09)
    + (socialSignals.length * 0.05),
  );
  const driftNotes = findDriftReasons(scenarioState, COGNITIVE_KEYWORDS);

  return {
    summary: `لایه شناختی ${anchor} اکنون روی سه بردار فشار می‌چرخد: تزریق روایت، drift احساسی/اجتماعی و احتمال کمپین‌های هماهنگ. این ارزیابی از ترکیب سیگنال‌های OSINT، شدت disagreement و وزن حوزه public sentiment ساخته شده است.`,
    cards: [
      {
        id: 'narrative-injection',
        title: 'تزریق روایت',
        metric: toPercent(narrativePressure),
        summary: `اگر narrative pressure در ${anchor} بالا بماند، سناریوی غالب می‌تواند از مسیر امنیتی صرف به مسیر شناختی-اجتماعی تغییر فاز دهد.`,
        bullets: uniqueStrings([
          ...socialSignals.slice(0, 3).map((signal) => signal.label),
          ...warRoom.disagreements.slice(0, 2).map((item) => item.title),
        ], 4),
        tone: toneForScore(narrativePressure),
      },
      {
        id: 'sentiment-drift',
        title: 'drift احساسی',
        metric: toPercent(driftPressure),
        summary: `سیگنال‌های افکار عمومی و تغییر framing اگر به drift پایدار برسند، اولویت watchpointها و ترتیب سناریوها را جابه‌جا می‌کنند.`,
        bullets: uniqueStrings([
          ...driftNotes,
          ...scenarioIndicators(scenarioState).slice(0, 2),
        ], 4),
        tone: toneForScore(driftPressure),
      },
      {
        id: 'coordinated-campaigns',
        title: 'کمپین هماهنگ',
        metric: toPercent(coordinationPressure),
        summary: 'هم‌زمانی سیگنال‌ها در GDELT، خبر و فضای اجتماعی می‌تواند نشانه amplification هماهنگ یا contest بر سر روایت غالب باشد.',
        bullets: uniqueStrings([
          ...socialSignals.slice(0, 2).map((signal) => `${signal.source}: ${signal.label}`),
          ...warRoom.updatedWatchpoints.slice(0, 2),
        ], 4),
        tone: toneForScore(coordinationPressure),
      },
    ],
    nodes: [
      {
        id: 'sources',
        label: 'ورود روایت',
        detail: uniqueStrings(socialSignals.slice(0, 2).map((signal) => signal.label), 2).join(' / ') || 'ورودی‌های رسانه‌ای و سیگنال‌های ضعیف',
        tone: toneForScore(narrativePressure),
      },
      {
        id: 'amplifiers',
        label: 'تقویت و بازنشر',
        detail: `تنوع منابع ${Math.round(sourceDiversityRatio(scenarioState) * 100)}% و disagreement مستند ${Math.round(warRoom.qualityControls.evidence_backed_disagreement_ratio * 100)}%`,
        tone: toneForScore(coordinationPressure),
      },
      {
        id: 'effects',
        label: 'اثر رفتاری',
        detail: uniqueStrings([
          ...driftNotes,
          ...crossDomainBullets(scenarioState, 'public_sentiment').slice(0, 1),
        ], 2).join(' / ') || 'اثر بالقوه بر رفتار عمومی و ناپایداری روایت',
        tone: toneForScore(driftPressure),
      },
    ],
    edges: [
      {
        from: 'sources',
        to: 'amplifiers',
        label: socialSignals[0]?.summary || 'خوشه‌های رسانه‌ای سیگنال اولیه را تقویت می‌کنند.',
        strength: narrativePressure,
        tone: toneForScore(narrativePressure),
      },
      {
        from: 'amplifiers',
        to: 'effects',
        label: driftNotes[0] || 'تقویت شبکه‌ای می‌تواند به drift احساسی و اثر رفتاری برسد.',
        strength: Math.max(driftPressure, coordinationPressure),
        tone: toneForScore(Math.max(driftPressure, coordinationPressure)),
      },
    ],
    vectors: [
      {
        id: 'pressure-vector',
        label: 'فشار روایی',
        magnitude: narrativePressure,
        summary: 'قدرت ورود و تکرار روایت‌های مسلط یا inject شده در محیط اطلاعاتی.',
        tone: toneForScore(narrativePressure),
      },
      {
        id: 'drift-vector',
        label: 'جابجایی احساس عمومی',
        magnitude: driftPressure,
        summary: 'میزان فاصله گرفتن افکار عمومی از baseline قبلی و اثر آن بر ناآرامی/قطبی‌شدن.',
        tone: toneForScore(driftPressure),
      },
      {
        id: 'coordination-vector',
        label: 'هم‌آهنگی انتشار',
        magnitude: coordinationPressure,
        summary: 'شدت شباهت زمانی و موضوعی سیگنال‌ها در کانال‌های مختلف.',
        tone: toneForScore(coordinationPressure),
      },
    ],
    watchpoints: uniqueStrings([
      ...scenarioIndicators(scenarioState).slice(0, 2),
      ...driftNotes,
      ...socialSignals.slice(0, 2).map((signal) => signal.label),
      ...warRoom.updatedWatchpoints.slice(0, 2),
    ], 6),
    actions: uniqueStrings([
      'راستی‌آزمایی خوشه‌های خبری/اجتماعی با مقایسه منبع و زمان‌بندی انتشار',
      publicSentimentScore >= 0.42 ? `پایش روزانه drift احساسی و polarization در ${anchor}` : undefined,
      coordinationPressure >= 0.45 ? 'ردیابی بردارهای amplification و منبع اولیه روایت‌های غالب' : undefined,
      'جداسازی سیگنال‌های محلی از بازنشرهای ثانویه برای جلوگیری از false escalation',
    ], 4),
  };
}

export function buildWarRoomCyberLayer(
  warRoom: WarRoomOutput,
  scenarioState: ScenarioEngineState | null,
): WarRoomOperationalLayer {
  const anchor = anchorLabel(scenarioState, warRoom);
  const cyberSignals = filterSignals(scenarioState, CYBER_KEYWORDS, ['osint', 'gdelt', 'news', 'map']);
  const cyberScore = scenarioState?.domainScores.cyber ?? 0;
  const infrastructureScore = scenarioState?.domainScores.infrastructure ?? 0;
  const logisticsScore = scenarioState?.domainScores.economics ?? 0;
  const vulnerabilityPressure = clamp(
    (cyberScore * 0.38)
    + (infrastructureScore * 0.34)
    + (averageSignalStrength(cyberSignals) * 0.18)
    + (activeLayerRatio(scenarioState, ['cyberThreats', 'outages', 'datacenters', 'roadTraffic', 'ais']) * 0.1),
  );
  const cascadePressure = clamp(
    (scenarioEffects(scenarioState).length * 0.11)
    + (crossDomainBullets(scenarioState, 'infrastructure').length * 0.12)
    + (warRoom.scenarioAdjustments.length * 0.08)
    + (infrastructureScore * 0.26),
  );
  const patternPressure = clamp(
    (cyberSignals.filter((signal) => signal.polarity === 'escalatory').length * 0.16)
    + (logisticsScore * 0.22)
    + (averageSignalStrength(cyberSignals) * 0.26)
    + (activeLayerRatio(scenarioState, ['roadTraffic', 'ais', 'waterways']) * 0.14),
  );

  return {
    summary: `لایه سایبری/زیرساختی ${anchor} روی fragility، interdependency و زنجیره‌های شکست متمرکز است. این نما سناریوی غالب را به گلوگاه‌های شبکه، حمل‌ونقل و بازیابی خدمات ترجمه می‌کند.`,
    cards: [
      {
        id: 'vulnerabilities',
        title: 'آسیب‌پذیری‌ها',
        metric: toPercent(vulnerabilityPressure),
        summary: 'گلوگاه‌های زیرساختی و dependencyهای لایه سایبری اگر هم‌زمان فعال شوند، shock اولیه را چندبرابر می‌کنند.',
        bullets: uniqueStrings([
          ...crossDomainBullets(scenarioState, 'infrastructure').slice(0, 2),
          ...scenarioDrivers(scenarioState).slice(0, 2),
        ], 4),
        tone: toneForScore(vulnerabilityPressure),
      },
      {
        id: 'attack-patterns',
        title: 'الگوهای اختلال',
        metric: toPercent(patternPressure),
        summary: 'الگوی اختلال از یک نقطه فنی شروع نمی‌شود؛ معمولاً هم‌زمان شبکه، لجستیک و visibility عملیاتی را تحت فشار می‌گذارد.',
        bullets: uniqueStrings([
          ...cyberSignals.slice(0, 3).map((signal) => signal.label),
          ...scenarioIndicators(scenarioState).slice(0, 1),
        ], 4),
        tone: toneForScore(patternPressure),
      },
      {
        id: 'cascading-failures',
        title: 'شکست‌های آبشاری',
        metric: toPercent(cascadePressure),
        summary: 'شدت cascade تابع interdependency میان زیرساخت، supply chain و کیفیت بازیابی است؛ نه فقط trigger اولیه.',
        bullets: uniqueStrings([
          ...scenarioEffects(scenarioState).slice(0, 3),
          ...warRoom.scenarioAdjustments.slice(0, 1).map((item) => item.rationale),
        ], 4),
        tone: toneForScore(cascadePressure),
      },
    ],
    watchpoints: uniqueStrings([
      ...scenarioIndicators(scenarioState).slice(0, 3),
      ...cyberSignals.slice(0, 2).map((signal) => signal.label),
      ...warRoom.updatedWatchpoints.slice(0, 2),
    ], 6),
    actions: uniqueStrings([
      ...scenarioMitigations(scenarioState).slice(0, 2),
      ...warRoom.executiveRecommendations.filter((item) => keywordHits(item, [...CYBER_KEYWORDS, ...DEFENSE_KEYWORDS]) > 0).slice(0, 2),
      'بازبینی dependency بین حمل‌ونقل، انرژی و سرویس‌های دیجیتال قبل از هر escalation تازه',
    ], 5),
  };
}

export function buildWarRoomDefenseLayer(
  warRoom: WarRoomOutput,
  scenarioState: ScenarioEngineState | null,
): WarRoomOperationalLayer {
  const anchor = anchorLabel(scenarioState, warRoom);
  const readinessScore = clamp(
    (warRoom.qualityControls.evidence_backed_disagreement_ratio * 0.34)
    + (warRoom.scoring.signalCoverage * 0.24)
    + (sourceDiversityRatio(scenarioState) * 0.18)
    + (scenarioMitigations(scenarioState).length * 0.06),
  );
  const mitigationDepth = clamp(
    (scenarioMitigations(scenarioState).length * 0.09)
    + (warRoom.executiveRecommendations.length * 0.08)
    + (scenarioIndicators(scenarioState).length * 0.05),
  );
  const monitoringDiscipline = clamp(
    (warRoom.updatedWatchpoints.length * 0.1)
    + (warRoom.recommendedWatchpoints.length * 0.06)
    + (scenarioState?.drift.length ?? 0) * 0.05,
  );

  return {
    summary: `لایه دفاعی ${anchor} خروجی مناظره و battlefield سناریوها را به counter-strategy، mitigation plan و cadence پایش تبدیل می‌کند تا تصمیم‌گیری فقط descriptive نماند.`,
    cards: [
      {
        id: 'counter-strategies',
        title: 'راهبردهای مقابله',
        metric: toPercent(readinessScore),
        summary: 'Counter strategyهای پیشنهادی از هم‌پوشانی recommendationهای اجرایی، mitigationهای سناریوی غالب و pressure domainها استخراج شده‌اند.',
        bullets: uniqueStrings([
          ...warRoom.executiveRecommendations.slice(0, 3),
          ...scenarioMitigations(scenarioState).slice(0, 1),
        ], 4),
        tone: toneForScore(readinessScore, true),
      },
      {
        id: 'mitigation-plans',
        title: 'برنامه‌های کاهش اثر',
        metric: toPercent(mitigationDepth),
        summary: 'این plans روی containment، visibility و کاهش spillover در زنجیره اقتصادی/زیرساختی تمرکز دارند.',
        bullets: uniqueStrings([
          ...scenarioMitigations(scenarioState).slice(0, 3),
          ...crossDomainBullets(scenarioState, 'economics').slice(0, 1),
        ], 4),
        tone: toneForScore(mitigationDepth, true),
      },
      {
        id: 'watch-discipline',
        title: 'انضباط پایش',
        metric: toPercent(monitoringDiscipline),
        summary: 'بدون watchpointهای روشن، حتی سنتز خوب هم به تصمیم‌پذیری عملیاتی تبدیل نمی‌شود.',
        bullets: uniqueStrings([
          ...warRoom.updatedWatchpoints.slice(0, 3),
          ...scenarioIndicators(scenarioState).slice(0, 1),
        ], 4),
        tone: toneForScore(monitoringDiscipline, true),
      },
    ],
    watchpoints: uniqueStrings([
      ...warRoom.updatedWatchpoints,
      ...warRoom.recommendedWatchpoints,
      ...scenarioIndicators(scenarioState).slice(0, 2),
    ], 6),
    actions: uniqueStrings([
      ...warRoom.executiveRecommendations.slice(0, 3),
      ...scenarioMitigations(scenarioState).slice(0, 2),
      `بازبینی روزانه watchpointهای حیاتی در ${anchor} و به‌روزرسانی ranking سناریوها`,
    ], 5),
  };
}

function agentDrilldown(warRoom: WarRoomOutput, agentId: string): WarRoomDrilldownTarget | null {
  const agent = warRoom.agents.find((item) => item.id === agentId);
  if (!agent) return null;
  const transcript = transcriptForAgent(warRoom, agent.id).slice(0, 4);
  return {
    id: agent.id,
    kind: 'agent',
    title: agent.role,
    subtitle: agent.label,
    summary: agent.revised_position || agent.position,
    chips: uniqueStrings([
      agent.confidence_note,
      ...agent.watchpoints.slice(0, 3),
    ], 5),
    sections: [
      {
        id: 'support',
        title: 'شواهد و استدلال',
        items: agent.supporting_points,
      },
      {
        id: 'critiques',
        title: 'اعتراض‌های کلیدی',
        items: agent.critiques.map((critique) => `${critique.target_agent_id}: ${critique.summary}`),
      },
      {
        id: 'assumptions',
        title: 'فرض‌ها و watchpointها',
        items: uniqueStrings([
          ...agent.assumptions,
          ...agent.watchpoints,
        ], 8),
      },
      {
        id: 'transcript',
        title: 'ردپای مناظره',
        items: transcript.map((entry) => `${entry.round_stage}: ${entry.response}`),
      },
    ],
    prompt: `موضع ${agent.role} را با تمرکز بر اعتراض‌ها، فرض‌ها و watchpointهایش بازبینی و در صورت لزوم بازنویسی کن.`,
  };
}

function roundDrilldown(warRoom: WarRoomOutput, roundId: string): WarRoomDrilldownTarget | null {
  const round = warRoom.rounds.find((item) => item.id === roundId);
  if (!round) return null;
  const transcript = transcriptForRound(warRoom, round.id);
  return {
    id: round.id,
    kind: 'round',
    title: round.title,
    subtitle: round.summary,
    summary: `${round.entries.length} مداخله در stage ${round.stage}.`,
    chips: uniqueStrings([
      round.stage,
      ...round.entries.flatMap((entry) => entry.markers),
    ], 6),
    sections: [
      {
        id: 'entries',
        title: 'مداخله‌های این round',
        items: round.entries.map((entry) => `${entry.label}: ${entry.content}`),
      },
      {
        id: 'targets',
        title: 'چالش‌ها و targetها',
        items: uniqueStrings(round.entries.flatMap((entry) =>
          entry.target_agent_ids.map((target) => `${entry.label} -> ${target}`)), 8),
      },
      {
        id: 'evidence',
        title: 'evidence basis',
        items: uniqueStrings(transcript.flatMap((entry) => entry.evidence_basis), 8),
      },
      {
        id: 'flags',
        title: 'quality flags',
        items: uniqueStrings(transcript.flatMap((entry) => entry.quality_flags), 8),
      },
    ],
    prompt: `round «${round.title}» را بازبینی کن و بگو کدام challengeها و evidence basis باید در دور بعدی برجسته‌تر شوند.`,
  };
}

function scenarioDrilldown(
  warRoom: WarRoomOutput,
  scenarioId: string,
): WarRoomDrilldownTarget | null {
  const ranking = warRoom.scenarioRanking.find((item) => item.scenario_id === scenarioId);
  if (!ranking) return null;
  const baseScenario = warRoom.baseScenarioOutput.scenarios.find((item) => item.id === scenarioId || item.title === ranking.title);
  const conflicts = warRoom.metaScenarioOutput.scenario_conflicts
    .filter((conflict) => conflict.left_scenario_id === scenarioId || conflict.right_scenario_id === scenarioId)
    .slice(0, 3);
  const blackSwans = warRoom.metaScenarioOutput.black_swan_candidates
    .filter((candidate) => ranking.linked_black_swan_ids.includes(candidate.id))
    .slice(0, 3);

  return {
    id: ranking.scenario_id,
    kind: 'scenario',
    title: ranking.title,
    subtitle: `رتبه پایه ${ranking.baseline_rank} → رتبه بازبینی ${ranking.revised_rank}`,
    summary: ranking.summary,
    chips: uniqueStrings([
      ranking.stance,
      ...ranking.watchpoints.slice(0, 3),
    ], 5),
    sections: [
      {
        id: 'shift',
        title: 'جابه‌جایی و چرایی',
        items: uniqueStrings([
          ranking.why,
          `consensus shift: ${Math.round(ranking.consensus_shift * 100)}%`,
          ...ranking.linked_agent_ids.map((agentId) => `agent: ${agentId}`),
        ], 8),
      },
      {
        id: 'drivers',
        title: 'محرک‌ها و watchpointها',
        items: uniqueStrings([
          ...(baseScenario?.drivers ?? []),
          ...ranking.watchpoints,
          ...(baseScenario?.indicators_to_watch ?? []),
        ], 8),
      },
      {
        id: 'conflicts',
        title: 'تعارض‌ها و جایگزین‌ها',
        items: uniqueStrings([
          ...conflicts.map((conflict) => conflict.summary),
          ...warRoom.scenarioAdjustments
            .filter((adjustment) => adjustment.scenario_id === ranking.scenario_id)
            .map((adjustment) => `${adjustment.adjustment_type}: ${adjustment.rationale}`),
        ], 8),
      },
      {
        id: 'black-swans',
        title: 'تهدیدهای Black Swan',
        items: uniqueStrings(blackSwans.map((candidate) => `${candidate.title}: ${candidate.why_it_matters}`), 6),
      },
    ],
    prompt: `سناریوی «${ranking.title}» را با تمرکز بر رتبه بازبینی‌شده، تعارض‌ها و Black Swanهای مرتبط دوباره ارزیابی کن.`,
  };
}

function conflictDrilldown(warRoom: WarRoomOutput, conflictId: string): WarRoomDrilldownTarget | null {
  const conflict = warRoom.disagreements.find((item) => item.id === conflictId);
  if (!conflict) return null;
  const matrixRows = warRoom.disagreementMatrix
    .filter((row) => conflict.agent_ids.includes(row.agent_id))
    .flatMap((row) => row.cells
      .filter((cell) => conflict.agent_ids.includes(cell.target_agent_id))
      .map((cell) => `${row.label} -> ${cell.target_agent_id}: ${cell.summary}`));

  return {
    id: conflict.id,
    kind: 'conflict',
    title: conflict.title,
    subtitle: `شدت تعارض: ${conflict.severity}`,
    summary: conflict.summary,
    chips: uniqueStrings(conflict.agent_ids, 4),
    sections: [
      {
        id: 'agents',
        title: 'عامل‌های درگیر',
        items: conflict.agent_ids.map((agentId) => {
          const agent = warRoom.agents.find((item) => item.id === agentId);
          return agent ? `${agent.role}: ${agent.revised_position || agent.position}` : agentId;
        }),
      },
      {
        id: 'battleline',
        title: 'battleline مناظره',
        items: uniqueStrings(matrixRows, 8),
      },
      {
        id: 'scenario-effects',
        title: 'اثر بر سناریوها',
        items: uniqueStrings(
          warRoom.scenarioAdjustments
            .filter((adjustment) => adjustment.linked_conflict_id === conflict.id)
            .map((adjustment) => `${adjustment.title}: ${adjustment.rationale}`),
          8,
        ),
      },
      {
        id: 'uncertainties',
        title: 'ابهام‌های حل‌نشده',
        items: warRoom.unresolvedUncertainties.slice(0, 6),
      },
    ],
    prompt: `تعارض «${conflict.title}» را بازبینی کن و بگو کدام clarificationها می‌توانند این شکاف را به تصمیم‌پذیری تبدیل کنند.`,
  };
}

function executiveDrilldown(warRoom: WarRoomOutput): WarRoomDrilldownTarget {
  return {
    id: 'executive-summary',
    kind: 'executive',
    title: 'Executive Synthesis',
    subtitle: warRoom.anchorLabel,
    summary: warRoom.executiveSummary,
    chips: uniqueStrings([
      warRoom.mode === 'fast' ? 'fast' : 'deep',
      ...warRoom.updatedWatchpoints.slice(0, 3),
    ], 5),
    sections: [
      {
        id: 'final',
        title: 'سنتز نهایی',
        items: [warRoom.finalSynthesis],
      },
      {
        id: 'recommendations',
        title: 'اقدام‌های توصیه‌شده',
        items: warRoom.executiveRecommendations,
      },
      {
        id: 'watchpoints',
        title: 'watch indicators',
        items: warRoom.updatedWatchpoints.length > 0 ? warRoom.updatedWatchpoints : warRoom.recommendedWatchpoints,
      },
      {
        id: 'uncertainties',
        title: 'critical uncertainties',
        items: warRoom.unresolvedUncertainties,
      },
    ],
    prompt: 'جمع‌بندی اجرایی War Room را با تمرکز بر تصمیم‌های پیش‌رو، watchpointها و uncertaintyهای بحرانی بازنویسی کن.',
  };
}

function evidenceDrilldown(warRoom: WarRoomOutput, packetId: string): WarRoomDrilldownTarget | null {
  const packet = warRoom.contextPackets.find((item) => item.id === packetId);
  if (!packet) return null;
  const relatedTranscript = warRoom.debateTranscript
    .filter((entry) => entry.evidence_basis.some((basis) => basis.includes(packet.title) || basis.includes(packet.sourceLabel)))
    .slice(0, 4);

  return {
    id: packet.id,
    kind: 'evidence',
    title: packet.title,
    subtitle: packetSummary(packet),
    summary: packet.summary,
    chips: uniqueStrings([
      packet.sourceLabel,
      packetScoreLabel(packet),
      ...packet.tags.slice(0, 3),
    ], 5),
    sections: [
      {
        id: 'content',
        title: 'خلاصه و محتوا',
        items: uniqueStrings([packet.summary, packet.content], 2),
      },
      {
        id: 'tags',
        title: 'برچسب‌ها و provenance',
        items: uniqueStrings([
          ...packet.tags,
          ...packet.provenance.sourceIds,
          ...packet.provenance.evidenceIds,
        ], 8),
      },
      {
        id: 'usage',
        title: 'موارد استفاده در مناظره',
        items: relatedTranscript.map((entry) => `${entry.label}: ${entry.response}`),
      },
      {
        id: 'watchpoints',
        title: 'watchpoints مرتبط',
        items: uniqueStrings([
          ...warRoom.updatedWatchpoints.slice(0, 3),
          ...warRoom.recommendedWatchpoints.slice(0, 3),
        ], 6),
      },
    ],
    prompt: `بسته شواهد «${packet.title}» را بازبینی کن و بگو چگونه باید در دور بعدی مناظره یا جمع‌بندی اجرایی وزن‌گذاری شود.`,
  };
}

export function resolveWarRoomDrilldown(
  warRoom: WarRoomOutput,
  _scenarioState: ScenarioEngineState | null,
  ref: WarRoomDrilldownRef,
): WarRoomDrilldownTarget | null {
  switch (ref.kind) {
    case 'agent':
      return agentDrilldown(warRoom, ref.id);
    case 'round':
      return roundDrilldown(warRoom, ref.id);
    case 'scenario':
      return scenarioDrilldown(warRoom, ref.id);
    case 'conflict':
      return conflictDrilldown(warRoom, ref.id);
    case 'evidence':
      return evidenceDrilldown(warRoom, ref.id);
    case 'executive':
      return executiveDrilldown(warRoom);
    default:
      return null;
  }
}
