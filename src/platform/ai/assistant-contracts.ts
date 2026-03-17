import type {
  ConfidenceBand,
  ConfidenceRecord,
  EvidenceRecord,
  ProvenanceRecord,
  SourceRecord,
} from '../domain/model';
import type { MapContextEnvelope } from '../operations/map-context';
import type { AiGatewayProvider, AiTaskClass } from './contracts';
import type {
  AssistantSessionContext,
  OrchestratorNodeName,
  OrchestratorRouteClass,
  OrchestratorToolName,
} from './orchestrator-contracts';
export type { AssistantSessionContext } from './orchestrator-contracts';

export type AssistantDomainMode =
  | 'osint-digest'
  | 'security-brief'
  | 'military-monitoring-defensive'
  | 'economic-resilience'
  | 'social-resilience'
  | 'cultural-cognitive-analysis'
  | 'strategic-foresight'
  | 'scenario-planning'
  | 'predictive-analysis'
  | 'infrastructure-risk'
  | 'border-dynamics'
  | 'sanctions-impact'
  | 'misinformation-analysis';

export type AssistantMessageRole = 'system' | 'user' | 'assistant';
export type AssistantProbabilityBand = 'low' | 'medium' | 'high';
export type AssistantImpactLevel = 'low' | 'medium' | 'high' | 'critical';
export type AssistantUncertaintyLevel = 'low' | 'medium' | 'high';
export type AssistantCausalStage = 'event' | 'reaction' | 'escalation' | 'outcome';
export type AssistantRunStatus = 'completed' | 'refused' | 'failed';
export type AssistantExportFormat = 'json' | 'markdown' | 'html';
export type AssistantSimulationMode = 'fast' | 'deep';
export type AssistantMetaScenarioRelationshipType = 'amplifying' | 'suppressing' | 'competing' | 'converging';

export interface AssistantContextPacket {
  id: string;
  title: string;
  summary: string;
  content: string;
  sourceLabel: string;
  sourceUrl?: string;
  sourceType: SourceRecord['type'];
  updatedAt: string;
  score: number;
  tags: string[];
  provenance: ProvenanceRecord;
}

export interface AssistantSection {
  title: string;
  bullets: string[];
  narrative: string;
  confidence: ConfidenceRecord;
}

export interface AssistantScenarioCausalStep {
  stage: AssistantCausalStage;
  summary: string;
  affected_domains?: string[];
}

export interface AssistantScenario {
  id?: string;
  title: string;
  probability: AssistantProbabilityBand;
  probability_score?: number;
  timeframe: string;
  time_horizon?: string;
  description: string;
  indicators: string[];
  indicators_to_watch?: string[];
  drivers?: string[];
  causal_chain?: AssistantScenarioCausalStep[];
  mitigation_options?: string[];
  impact_level?: AssistantImpactLevel;
  impact_score?: number;
  uncertainty_level?: AssistantUncertaintyLevel;
  second_order_effects?: string[];
  cross_domain_impacts?: Record<string, string[]>;
  strategic_relevance?: number;
  likelihood_score?: number;
  confidence: ConfidenceRecord;
}

export interface AssistantSimulationStep {
  id: string;
  title: string;
  stage: AssistantCausalStage | 'checkpoint';
  summary: string;
  probability_score: number;
  impact_score: number;
  uncertainty_level: AssistantUncertaintyLevel;
  indicators_to_watch: string[];
  tool_calls: string[];
}

export interface AssistantSimulationBranch {
  id: string;
  title: string;
  description: string;
  probability: AssistantProbabilityBand;
  probability_score: number;
  impact_level: AssistantImpactLevel;
  impact_score: number;
  uncertainty_level: AssistantUncertaintyLevel;
  time_horizon: string;
  local_risks: string[];
  regional_spillovers: string[];
  global_ripple_effects: string[];
  controls_summary: string[];
  tool_plan: string[];
  steps: AssistantSimulationStep[];
}

export interface AssistantSimulationGraphNode {
  id: string;
  label: string;
  kind: 'root' | 'branch' | 'step';
  branch_id?: string;
  emphasis?: number;
}

export interface AssistantSimulationGraphEdge {
  from: string;
  to: string;
  label: string;
  weight?: number;
}

export interface AssistantSimulation {
  title: string;
  event: string;
  mode: AssistantSimulationMode;
  compare_summary: string;
  controls_summary: string[];
  branches: AssistantSimulationBranch[];
  graph: {
    nodes: AssistantSimulationGraphNode[];
    edges: AssistantSimulationGraphEdge[];
  };
}

export interface AssistantDecisionAction {
  label: string;
  rationale: string;
  timeframe: 'immediate' | 'near-term' | 'long-term';
}

export interface AssistantDecisionTradeoff {
  label: string;
  cost: string;
  benefit: string;
  short_term: string;
  long_term: string;
}

export interface AssistantDecisionLeveragePoint {
  title: string;
  why: string;
}

export interface AssistantDecisionUncertainty {
  title: string;
  why: string;
  indicators: string[];
}

export interface AssistantActorModel {
  actor: string;
  role: string;
  intent: string;
  likely_behaviors: string[];
  constraints: string[];
}

export interface AssistantScenarioDecisionSupport {
  scenario_id?: string;
  scenario_title: string;
  probability: AssistantProbabilityBand;
  impact_level?: AssistantImpactLevel;
  recommended_actions: AssistantDecisionAction[];
  mitigation_strategies: string[];
  tradeoffs: AssistantDecisionTradeoff[];
}

export interface AssistantDecisionSupport {
  executive_summary: string;
  actionable_insights: string[];
  strategic_insights: string[];
  leverage_points: AssistantDecisionLeveragePoint[];
  critical_uncertainties: AssistantDecisionUncertainty[];
  actor_models: AssistantActorModel[];
  scenario_support: AssistantScenarioDecisionSupport[];
}

export interface AssistantMetaScenario {
  id: string;
  title: string;
  source_scenarios: string[];
  relationship_type: AssistantMetaScenarioRelationshipType;
  summary: string;
  combined_probability: AssistantProbabilityBand;
  combined_probability_score?: number;
  impact_level: AssistantImpactLevel;
  uncertainty_level: AssistantUncertaintyLevel;
  critical_dependencies: string[];
  trigger_indicators: string[];
  watchpoints: string[];
  strategic_implications: string[];
  recommended_actions: string[];
}

export interface AssistantScenarioConflict {
  id: string;
  left_scenario_id: string;
  right_scenario_id: string;
  relationship_type: Extract<AssistantMetaScenarioRelationshipType, 'suppressing' | 'competing'>;
  interaction_strength: number;
  direction: string;
  summary: string;
  probability_redistribution: Record<string, number>;
  decisive_indicators: string[];
}

export interface AssistantBlackSwanCandidate {
  id: string;
  title: string;
  summary: string;
  probability: AssistantProbabilityBand;
  impact_level: AssistantImpactLevel;
  uncertainty_level: AssistantUncertaintyLevel;
  why_it_matters: string;
  low_probability_reason: string;
  high_impact_reason: string;
  broken_assumptions: string[];
  affected_domains: string[];
  weak_signals: string[];
  contradictory_evidence: string[];
  regime_shift_indicators: string[];
  leading_indicators: string[];
  watchpoints: string[];
  recommended_actions: string[];
  confidence_note: string;
  uncertainty_note: string;
  severity_score?: number;
  monitoring_status?: 'watch' | 'rising' | 'critical' | 'cooling';
}

export interface AssistantMetaScenarioOutput {
  executive_summary: string;
  higher_order_insights: string[];
  meta_scenarios: AssistantMetaScenario[];
  scenario_conflicts: AssistantScenarioConflict[];
  black_swan_candidates: AssistantBlackSwanCandidate[];
}

export type AssistantWarRoomMarker = 'support' | 'challenge' | 'revision' | 'uncertainty';
export type AssistantWarRoomRoundStage = 'assessment' | 'critique' | 'revision' | 'synthesis';
export type AssistantWarRoomDebateMode = 'fast' | 'deep';
export type AssistantWarRoomTransitionStage = 'initialized' | AssistantWarRoomRoundStage | 'completed';
export type AssistantWarRoomScenarioStance = 'dominant' | 'overrated' | 'underappreciated' | 'contested' | 'replacement';
export type AssistantWarRoomScenarioAdjustmentType = 'promote' | 'demote' | 'watch' | 'replace';

export interface AssistantWarRoomAgentCritique {
  target_agent_id: string;
  summary: string;
  marker: AssistantWarRoomMarker;
}

export interface AssistantWarRoomAgent {
  id: string;
  role: string;
  label: string;
  role_prompt: string;
  position: string;
  revised_position?: string;
  confidence_score: number;
  confidence_note: string;
  supporting_points: string[];
  watchpoints: string[];
  assumptions: string[];
  critiques: AssistantWarRoomAgentCritique[];
}

export interface AssistantWarRoomRoundEntry {
  agent_id: string;
  label: string;
  content: string;
  target_agent_ids: string[];
  markers: AssistantWarRoomMarker[];
}

export interface AssistantWarRoomRound {
  id: string;
  title: string;
  stage: AssistantWarRoomRoundStage;
  summary: string;
  entries: AssistantWarRoomRoundEntry[];
}

export interface AssistantWarRoomDisagreement {
  id: string;
  title: string;
  summary: string;
  agent_ids: string[];
  severity: AssistantProbabilityBand;
}

export interface AssistantWarRoomConvergence {
  id: string;
  title: string;
  summary: string;
  agent_ids: string[];
}

export interface AssistantWarRoomTranscriptEntry {
  id: string;
  round_id: string;
  round_stage: AssistantWarRoomRoundStage;
  round_index: number;
  agent_id: string;
  label: string;
  prompt_excerpt: string;
  response: string;
  target_agent_ids: string[];
  markers: AssistantWarRoomMarker[];
  evidence_basis: string[];
  quality_flags: string[];
}

export interface AssistantWarRoomStateTransition {
  id: string;
  from_stage: AssistantWarRoomTransitionStage;
  to_stage: AssistantWarRoomTransitionStage;
  round_id?: string;
  round_index: number;
  summary: string;
  timestamp: string;
}

export interface AssistantWarRoomDisagreementMatrixCell {
  target_agent_id: string;
  disagreement_score: number;
  challenge_count: number;
  evidence_backed: boolean;
  summary: string;
}

export interface AssistantWarRoomDisagreementMatrixRow {
  agent_id: string;
  label: string;
  cells: AssistantWarRoomDisagreementMatrixCell[];
}

export interface AssistantWarRoomQualityControls {
  repetitive_debate: boolean;
  shallow_agreement: boolean;
  voice_collapse_risk: AssistantProbabilityBand;
  evidence_backed_disagreement_ratio: number;
  alerts: string[];
  enforcement_notes: string[];
}

export interface AssistantWarRoomScenarioRankingItem {
  scenario_id: string;
  title: string;
  baseline_rank: number;
  revised_rank: number;
  stance: AssistantWarRoomScenarioStance;
  summary: string;
  why: string;
  consensus_shift: number;
  linked_agent_ids: string[];
  linked_conflict_ids: string[];
  linked_black_swan_ids: string[];
  watchpoints: string[];
}

export interface AssistantWarRoomScenarioAdjustment {
  id: string;
  scenario_id: string;
  title: string;
  adjustment_type: AssistantWarRoomScenarioAdjustmentType;
  summary: string;
  rationale: string;
  disagreement_driver: string;
  affected_agent_ids: string[];
  linked_conflict_id?: string;
  linked_black_swan_id?: string;
  updated_watchpoints: string[];
  confidence: AssistantProbabilityBand;
}

export interface AssistantWarRoomScenarioFocus {
  dominant_scenario_id?: string;
  dominant_scenario_title?: string;
  overrated_scenario_id?: string;
  overrated_scenario_title?: string;
  underappreciated_scenario_id?: string;
  underappreciated_scenario_title?: string;
  key_conflict_id?: string;
  key_conflict_title?: string;
  black_swan_threat_id?: string;
  black_swan_threat_title?: string;
  scenario_shift_summary: string;
}

export interface AssistantWarRoomOutput {
  question: string;
  anchor_label: string;
  mode: AssistantWarRoomDebateMode;
  active_agent_ids: string[];
  excluded_agent_ids: string[];
  round_count: number;
  agents: AssistantWarRoomAgent[];
  rounds: AssistantWarRoomRound[];
  debate_transcript: AssistantWarRoomTranscriptEntry[];
  replay_trace: AssistantWarRoomStateTransition[];
  disagreement_matrix: AssistantWarRoomDisagreementMatrixRow[];
  quality_controls: AssistantWarRoomQualityControls;
  disagreements: AssistantWarRoomDisagreement[];
  convergences: AssistantWarRoomConvergence[];
  unresolved_uncertainties: string[];
  moderator_summary: string;
  executive_summary: string;
  final_synthesis: string;
  scenario_ranking: AssistantWarRoomScenarioRankingItem[];
  scenario_adjustments: AssistantWarRoomScenarioAdjustment[];
  scenario_focus: AssistantWarRoomScenarioFocus;
  executive_recommendations: string[];
  updated_watchpoints: string[];
  recommended_watchpoints: string[];
}

export interface AssistantEvidenceCard {
  id: string;
  title: string;
  summary: string;
  timeContext: string;
  score: number;
  freshnessWeight: number;
  source: SourceRecord;
  evidence: EvidenceRecord;
  provenance: ProvenanceRecord;
  confidence: ConfidenceRecord;
  tags: string[];
  pinned?: boolean;
}

export interface AssistantStructuredOutput {
  reportTitle: string;
  executiveSummary: string;
  observedFacts: AssistantSection;
  analyticalInference: AssistantSection;
  scenarios: AssistantScenario[];
  simulation?: AssistantSimulation;
  decisionSupport?: AssistantDecisionSupport;
  metaScenario?: AssistantMetaScenarioOutput;
  warRoom?: AssistantWarRoomOutput;
  uncertainties: AssistantSection;
  recommendations: AssistantSection;
  resilienceNarrative: AssistantSection;
  followUpSuggestions: string[];
}

export interface AssistantMessage {
  id: string;
  role: AssistantMessageRole;
  createdAt: string;
  content: string;
  domainMode?: AssistantDomainMode;
  taskClass?: AiTaskClass;
  structured?: AssistantStructuredOutput;
  evidenceCards?: AssistantEvidenceCard[];
  provider?: string;
  model?: string;
  traceId?: string;
  trace?: AssistantTraceMetadata;
  confidenceBand?: ConfidenceBand;
}

export interface AssistantSavedWorkflow {
  id: string;
  name: string;
  description: string;
  promptId: string;
  domainMode: AssistantDomainMode;
  taskClass: AiTaskClass;
  createdAt: string;
  updatedAt: string;
  promptOverride?: string;
}

export interface AssistantMemoryNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AssistantConversationThread {
  id: string;
  title: string;
  domainMode: AssistantDomainMode;
  taskClass: AiTaskClass;
  createdAt: string;
  updatedAt: string;
  messages: AssistantMessage[];
  pinnedEvidenceIds: string[];
  workflowId?: string;
  sessionContext?: AssistantSessionContext;
}

export interface AssistantTraceMetadata {
  traceId: string;
  taskClass: AiTaskClass;
  policyLabel: string;
  providerOrder: AiGatewayProvider[];
  selectedProvider?: string;
  selectedModel?: string;
  startedAt: string;
  completedAt: string;
  cached: boolean;
  timeContext: string;
  warnings: string[];
  profile?: string;
  safetyProfile?: string;
  cacheNamespace?: string;
  providerTags?: string[];
  openRouterProviderOrder?: string[];
  orchestratorRoute?: OrchestratorRouteClass;
  orchestratorNodes?: OrchestratorNodeName[];
  toolPlan?: OrchestratorToolName[];
  sessionReuseCount?: number;
}

export interface AssistantRunRequest {
  conversationId: string;
  locale: 'fa-IR';
  domainMode: AssistantDomainMode;
  taskClass: AiTaskClass;
  query: string;
  promptId?: string;
  promptText?: string;
  messages: Array<Pick<AssistantMessage, 'role' | 'content' | 'createdAt'>>;
  mapContext?: MapContextEnvelope | null;
  pinnedEvidence: AssistantEvidenceCard[];
  localContextPackets: AssistantContextPacket[];
  memoryNotes: AssistantMemoryNote[];
  sessionContext?: AssistantSessionContext;
  workflowId?: string;
  stream?: boolean;
}

export interface AssistantRefusal {
  reason: string;
  redirect: string;
}

export interface AssistantRunResponse {
  conversationId: string;
  message: AssistantMessage;
  status: AssistantRunStatus;
  provider: string;
  model: string;
  cached: boolean;
  followUpSuggestions: string[];
  evidenceCards: AssistantEvidenceCard[];
  trace: AssistantTraceMetadata;
  refusal?: AssistantRefusal;
}

export const ASSISTANT_DOMAIN_MODE_OPTIONS: Array<{
  id: AssistantDomainMode;
  label: string;
  summary: string;
}> = [
  {
    id: 'osint-digest',
    label: 'هضم OSINT',
    summary: 'خلاصه‌سازی چندمنبعی، تشخیص سیگنال و اولویت‌بندی شواهد.',
  },
  {
    id: 'security-brief',
    label: 'بریـف امنیتی',
    summary: 'ارزیابی ریسک، نشانه‌های تشدید و پیشنهادهای دفاعی.',
  },
  {
    id: 'military-monitoring-defensive',
    label: 'پایش نظامی دفاعی',
    summary: 'پایش تحرکات نظامی، خطوط قرمز و آثار ثانویه صرفاً در چارچوب دفاعی.',
  },
  {
    id: 'economic-resilience',
    label: 'تاب‌آوری اقتصادی',
    summary: 'شوک‌های تحریم، زنجیره تامین، بازار انرژی و پایداری اقتصاد.',
  },
  {
    id: 'social-resilience',
    label: 'تاب‌آوری اجتماعی',
    summary: 'پایداری اجتماعی، سیگنال‌های نارضایتی و ظرفیت سازگاری جامعه.',
  },
  {
    id: 'cultural-cognitive-analysis',
    label: 'تحلیل شناختی-فرهنگی',
    summary: 'جنگ روایت، الگوهای شناختی، و میدان ادراکی.',
  },
  {
    id: 'strategic-foresight',
    label: 'پیش‌نگری راهبردی',
    summary: 'ترکیب سناریو، متا‌سناریو، قوی‌سیاه، debate و watchpointها در یک synthesis هیئت‌محور.',
  },
  {
    id: 'scenario-planning',
    label: 'برنامه‌ریزی سناریو',
    summary: 'ساخت سناریوهای پایه/خوش‌بینانه/بدبینانه و نشانه‌های راهنما.',
  },
  {
    id: 'predictive-analysis',
    label: 'تحلیل پیش‌بین',
    summary: 'پیش‌بینی کوتاه‌مدت با صراحت درباره عدم‌قطعیت.',
  },
  {
    id: 'infrastructure-risk',
    label: 'ریسک زیرساخت',
    summary: 'ریسک زیرساخت‌های حیاتی، گلوگاه‌ها و راهکارهای تاب‌آوری.',
  },
  {
    id: 'border-dynamics',
    label: 'پویایی مرزی',
    summary: 'تحرکات مرزی، گذرگاه‌ها، و فشارهای منطقه‌ای.',
  },
  {
    id: 'sanctions-impact',
    label: 'اثر تحریم',
    summary: 'ردیابی اثر تحریم‌ها بر تجارت، ارز، انرژی و مسیرهای تطبیق.',
  },
  {
    id: 'misinformation-analysis',
    label: 'تحلیل اطلاعات نادرست',
    summary: 'ردیابی روایت‌های مخدوش، شکاف‌های راستی‌آزمایی و آسیب‌پذیری شناختی.',
  },
];

export const DEFAULT_ASSISTANT_DOMAIN_MODE: AssistantDomainMode = 'osint-digest';

export function createConfidenceRecord(score: number, rationale: string): ConfidenceRecord {
  const boundedScore = Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0));
  let band: ConfidenceBand = 'low';
  if (boundedScore >= 0.85) {
    band = 'very-high';
  } else if (boundedScore >= 0.7) {
    band = 'high';
  } else if (boundedScore >= 0.45) {
    band = 'medium';
  }

  return {
    band,
    score: Number(boundedScore.toFixed(2)),
    uncertainty: Number((1 - boundedScore).toFixed(2)),
    rationale,
  };
}
