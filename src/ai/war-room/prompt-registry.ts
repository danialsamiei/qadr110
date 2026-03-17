import type { AssistantContextPacket } from '@/platform/ai/assistant-contracts';
import type { AssistantSessionContext } from '@/platform/ai/orchestrator-contracts';
import {
  describeMapContextForPrompt,
  type MapContextEnvelope,
  type MapNearbySignalContext,
} from '@/platform/operations/map-context';

import type { ScenarioEngineScenario } from '../scenario-engine';
import type { WarRoomAgentDefinition, WarRoomAgentId } from './agents';
import { getWarRoomAgent, listWarRoomAgents } from './agents';

export type WarRoomPromptStage = 'assessment' | 'critique' | 'revision' | 'moderation' | 'synthesis';

export interface WarRoomPromptContext {
  question: string;
  anchorLabel: string;
  mapContext?: MapContextEnvelope | null;
  activeScenarios?: ScenarioEngineScenario[];
  sessionContext?: AssistantSessionContext | null;
  recentSignals?: MapNearbySignalContext[];
  localContextPackets?: AssistantContextPacket[];
  targetAgent?: Pick<WarRoomAgentDefinition, 'id' | 'role' | 'label'> | null;
  challengeIteration?: number;
}

export interface WarRoomPromptRegistryEntry {
  agentId: WarRoomAgentId;
  mission: string;
  analysisStyle: string[];
  blindSpots: string[];
  roleSpecificPriorities: string[];
  challengeBehavior: string[];
  outputContract: Record<WarRoomPromptStage, string[]>;
}

const COMMON_RULES = [
  'خروجی را فقط به فارسی تولید کن.',
  'پاسخ باید evidence-aware و بدون منبع‌سازی یا قطعیت کاذب باشد.',
  'میان observed facts، analytical inference، uncertainty و watchpoints تفکیک روشن بگذار.',
  'به‌طور صریح بگو کدام سناریو overrated است، کدام underappreciated است، کدام black swan نگاه غالب را تهدید می‌کند و کدام scenario conflict از همه مهم‌تر است.',
  'در ابتدای خروجی یک executive_summary کوتاه و board-friendly بده.',
  'خروجی را به JSON ساخت‌یافته معتبر برگردان و از متن آزاد خارج از JSON خودداری کن.',
];

const STAGE_OBJECTIVES: Record<WarRoomPromptStage, string> = {
  assessment: 'ارزیابی مستقل و اولیه نقش خودت را ثبت کن.',
  critique: 'تحلیل یک عامل دیگر را به‌صورت هوشمند و مبتنی بر evidence challenge کن.',
  revision: 'پس از challenge، موضع خودت را revise و تفاوت با دور قبل را شفاف کن.',
  moderation: 'قوی‌ترین استدلال‌ها، unresolved conflicts و clarification requestها را استخراج کن.',
  synthesis: 'یک synthesis اجرایی و board-ready با confidence و key decisions بساز.',
};

const OUTPUT_CONTRACTS: Record<WarRoomPromptStage, string[]> = {
  assessment: [
    'executive_summary',
    'position',
    'dominant_scenario',
    'overrated_scenario',
    'underappreciated_scenario',
    'black_swan_threat',
    'supporting_points[]',
    'assumptions[]',
    'watchpoints[]',
    'blind_spot_alerts[]',
    'confidence_note',
  ],
  critique: [
    'executive_summary',
    'target_agent_id',
    'challenge_summary',
    'assumptions_under_attack[]',
    'most_important_conflict',
    'requested_clarifications[]',
    'evidence_gaps[]',
    'watchpoints[]',
  ],
  revision: [
    'executive_summary',
    'updated_position',
    'revised_scenario_ranking[]',
    'changes_from_prior_round[]',
    'remaining_uncertainties[]',
    'watchpoints[]',
    'confidence_note',
  ],
  moderation: [
    'executive_summary',
    'strongest_arguments[]',
    'convergences[]',
    'scenario_shift_summary',
    'unresolved_conflicts[]',
    'clarification_requests[]',
    'watchpoints[]',
  ],
  synthesis: [
    'executive_summary',
    'board_ready_synthesis',
    'revised_scenario_ranking[]',
    'confidence_level',
    'key_decisions[]',
    'watchpoints[]',
    'fallback_if_wrong[]',
  ],
};

const ROLE_OUTPUT_AUGMENTS: Partial<Record<WarRoomAgentId, Partial<Record<WarRoomPromptStage, string[]>>>> = {
  'strategic-analyst': {
    assessment: [
      'summary',
      'key_drivers[]',
      'causal_relationships[]',
      'possible_trajectories[]',
      'risks[]',
      'confidence_level',
    ],
    critique: [
      'weak_assumptions[]',
      'clarity_demands[]',
      'inconsistencies[]',
    ],
    revision: [
      'summary',
      'key_drivers[]',
      'causal_relationships[]',
      'possible_trajectories[]',
      'risks[]',
      'confidence_level',
    ],
  },
  'skeptic-red-team': {
    assessment: [
      'critique',
      'alternative_hypothesis',
      'risk_escalation_scenario',
      'uncertainty_analysis',
      'missing_variables[]',
      'hidden_biases[]',
      'overconfidence_flags[]',
      'false_causality_flags[]',
    ],
    critique: [
      'critique',
      'alternative_hypothesis',
      'risk_escalation_scenario',
      'uncertainty_analysis',
      'missing_variables[]',
      'overconfidence_flags[]',
      'false_causality_flags[]',
    ],
    revision: [
      'critique',
      'alternative_hypothesis',
      'risk_escalation_scenario',
      'uncertainty_analysis',
      'missing_variables[]',
      'hidden_biases[]',
      'overconfidence_flags[]',
      'false_causality_flags[]',
    ],
  },
  'economic-analyst': {
    assessment: [
      'economic_impact',
      'short_term_effects[]',
      'long_term_effects[]',
      'sector_level_risks[]',
      'global_spillovers[]',
      'geopolitical_to_economic_links[]',
      'market_signals[]',
      'trade_flow_implications[]',
      'energy_system_implications[]',
    ],
    critique: [
      'economic_impact',
      'sector_level_risks[]',
      'global_spillovers[]',
      'geopolitical_to_economic_links[]',
      'missing_economic_links[]',
    ],
    revision: [
      'economic_impact',
      'short_term_effects[]',
      'long_term_effects[]',
      'sector_level_risks[]',
      'global_spillovers[]',
      'geopolitical_to_economic_links[]',
      'market_signals[]',
      'trade_flow_implications[]',
      'energy_system_implications[]',
    ],
  },
  'osint-analyst': {
    assessment: [
      'key_signals[]',
      'emerging_trends[]',
      'conflicting_information[]',
      'reliability_assessment',
      'signal_patterns[]',
      'signal_anomalies[]',
      'signal_clusters[]',
      'source_reliability_notes[]',
      'coverage_gaps[]',
    ],
    critique: [
      'key_signals[]',
      'conflicting_information[]',
      'reliability_assessment',
      'source_reliability_notes[]',
      'coverage_gaps[]',
      'speculative_claim_flags[]',
    ],
    revision: [
      'key_signals[]',
      'emerging_trends[]',
      'conflicting_information[]',
      'reliability_assessment',
      'signal_patterns[]',
      'signal_anomalies[]',
      'signal_clusters[]',
      'source_reliability_notes[]',
      'coverage_gaps[]',
    ],
  },
  'cyber-infrastructure-analyst': {
    assessment: [
      'vulnerabilities[]',
      'cascading_failures[]',
      'systemic_risks[]',
      'fragility_factors[]',
      'interdependencies[]',
      'infrastructure_exposures[]',
      'cyber_system_risks[]',
      'logistics_bottlenecks[]',
      'supply_chain_stresses[]',
      'restoration_constraints[]',
    ],
    critique: [
      'vulnerabilities[]',
      'cascading_failures[]',
      'systemic_risks[]',
      'fragility_factors[]',
      'interdependencies[]',
      'missing_dependencies[]',
      'resilience_overestimation_flags[]',
    ],
    revision: [
      'vulnerabilities[]',
      'cascading_failures[]',
      'systemic_risks[]',
      'fragility_factors[]',
      'interdependencies[]',
      'infrastructure_exposures[]',
      'cyber_system_risks[]',
      'logistics_bottlenecks[]',
      'supply_chain_stresses[]',
      'restoration_constraints[]',
    ],
  },
  'social-sentiment-analyst': {
    assessment: [
      'social_risks[]',
      'narrative_trends[]',
      'potential_instability_triggers[]',
      'sentiment_shifts[]',
      'polarization_patterns[]',
      'unrest_potential',
      'behavioral_reactions[]',
      'public_perception_notes[]',
      'social_fragility_factors[]',
    ],
    critique: [
      'social_risks[]',
      'narrative_trends[]',
      'potential_instability_triggers[]',
      'behavioral_reactions[]',
      'missing_social_factors[]',
      'perception_blind_spots[]',
    ],
    revision: [
      'social_risks[]',
      'narrative_trends[]',
      'potential_instability_triggers[]',
      'sentiment_shifts[]',
      'polarization_patterns[]',
      'unrest_potential',
      'behavioral_reactions[]',
      'public_perception_notes[]',
      'social_fragility_factors[]',
    ],
  },
  'scenario-moderator': {
    assessment: [
      'key_conflicts[]',
      'unresolved_questions[]',
      'synthesis_guidance[]',
      'strongest_arguments[]',
      'clarification_requests[]',
      'shallow_consensus_flags[]',
    ],
    critique: [
      'key_conflicts[]',
      'unresolved_questions[]',
      'clarification_requests[]',
      'shallow_consensus_flags[]',
    ],
    revision: [
      'key_conflicts[]',
      'unresolved_questions[]',
      'synthesis_guidance[]',
      'strongest_arguments[]',
      'clarification_requests[]',
      'shallow_consensus_flags[]',
    ],
    moderation: [
      'key_conflicts[]',
      'unresolved_questions[]',
      'synthesis_guidance[]',
      'shallow_consensus_flags[]',
    ],
  },
  'executive-synthesizer': {
    assessment: [
      'executive_summary',
      'top_3_scenarios[]',
      'critical_uncertainties[]',
      'recommended_actions[]',
      'watch_indicators[]',
      'confidence_level',
      'dominant_scenario_summary',
      'competing_futures[]',
      'key_risks[]',
      'black_swan_summary[]',
      'actionable_insights[]',
    ],
    critique: [
      'executive_summary',
      'critical_uncertainties[]',
      'recommended_actions[]',
      'watch_indicators[]',
      'decision_gaps[]',
    ],
    revision: [
      'executive_summary',
      'top_3_scenarios[]',
      'critical_uncertainties[]',
      'recommended_actions[]',
      'watch_indicators[]',
      'confidence_level',
      'dominant_scenario_summary',
      'competing_futures[]',
      'key_risks[]',
      'black_swan_summary[]',
      'actionable_insights[]',
    ],
    synthesis: [
      'top_3_scenarios[]',
      'critical_uncertainties[]',
      'recommended_actions[]',
      'watch_indicators[]',
      'dominant_scenario_summary',
      'competing_futures[]',
      'key_risks[]',
      'black_swan_summary[]',
      'actionable_insights[]',
    ],
  },
};

function uniqueStrings(values: Array<string | undefined>, maxItems = 8): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, maxItems);
}

function summarizeScenarios(scenarios: ScenarioEngineScenario[] | undefined): string[] {
  return (scenarios ?? [])
    .slice(0, 3)
    .map((scenario) => [
      `- ${scenario.title}`,
      `probability=${scenario.probability}`,
      `impact=${scenario.impact_level}`,
      `time=${scenario.time_horizon}`,
      scenario.drivers[0] ? `driver=${scenario.drivers[0]}` : undefined,
    ].filter(Boolean).join(' | '));
}

function summarizeSignals(
  recentSignals: MapNearbySignalContext[] | undefined,
  localContextPackets: AssistantContextPacket[] | undefined,
): string[] {
  return uniqueStrings([
    ...(recentSignals ?? []).slice(0, 4).map((signal) => `${signal.label} (${signal.kind}${signal.severity ? `/${signal.severity}` : ''})`),
    ...(localContextPackets ?? []).slice(0, 3).map((packet) => `${packet.title}: ${packet.summary}`),
  ], 6);
}

function summarizeSession(sessionContext: AssistantSessionContext | null | undefined): string[] {
  if (!sessionContext) return [];
  return uniqueStrings([
    sessionContext.activeIntentSummary ? `intent=${sessionContext.activeIntentSummary}` : undefined,
    ...sessionContext.intentHistory.slice(-2).map((item) => `history=${item.query}`),
    ...sessionContext.reusableInsights.slice(-2).map((item) => `insight=${item.summary}`),
    ...sessionContext.mapInteractions.slice(-2).map((item) => `map=${item.label || item.selectionKind}`),
  ], 6);
}

function buildContextBlock(context: WarRoomPromptContext): string[] {
  return [
    `سوال مشترک: ${context.question}`,
    `کانون جغرافیایی/تحلیلی: ${context.anchorLabel}`,
    context.mapContext ? `کانتکست نقشه:\n${describeMapContextForPrompt(context.mapContext)}` : undefined,
    summarizeScenarios(context.activeScenarios).length ? `سناریوهای فعال:\n${summarizeScenarios(context.activeScenarios).join('\n')}` : undefined,
    summarizeSignals(context.recentSignals, context.localContextPackets).length ? `سیگنال‌های اخیر:\n${summarizeSignals(context.recentSignals, context.localContextPackets).map((line) => `- ${line}`).join('\n')}` : undefined,
    summarizeSession(context.sessionContext).length ? `حافظه جلسه:\n${summarizeSession(context.sessionContext).map((line) => `- ${line}`).join('\n')}` : undefined,
  ].filter((value): value is string => Boolean(value));
}

function buildRoleBlock(agent: WarRoomAgentDefinition): string[] {
  return [
    `نقش شما: ${agent.role} (${agent.label})`,
    `ماموریت: ${agent.mission}`,
    `سبک تحلیل: ${agent.analysisStyle.join('، ')}`,
    `اولویت‌های اختصاصی: ${agent.rolePriorities.join('، ')}`,
    `نقاط کور محتمل: ${agent.blindSpots.join('، ')}`,
    `نحوه challenge: ${agent.challengeBehavior.join('، ')}`,
    ...agent.instructions.map((instruction) => `- ${instruction}`),
  ];
}

function buildTargetBlock(context: WarRoomPromptContext): string[] {
  if (!context.targetAgent) return [];
  return [
    `عامل هدف challenge: ${context.targetAgent.role} (${context.targetAgent.label})`,
    'حمله باید بر assumptions، dominant narrative و blind spotهای عامل مقابل متمرکز باشد، نه بر مخالفت تصادفی.',
  ];
}

function stageSpecificLines(agent: WarRoomAgentDefinition, stage: WarRoomPromptStage): string[] {
  const lines: string[] = [STAGE_OBJECTIVES[stage]];

  if (agent.id === 'strategic-analyst') {
    if (stage === 'assessment' || stage === 'revision') {
      lines.push('driverهای کلیدی، رابطه‌های علّی، trajectoryهای راهبردی، سناریوهای plausible و ریسک‌ها را صریح و ساخت‌یافته بنویس.');
      lines.push('وضوح را بر verbosity مقدم بگذار و implicationهای راهبردی را از دل causal reasoning بیرون بکش.');
    }
    if (stage === 'critique') {
      lines.push('فرض‌های ضعیف را زیر سوال ببر، شفافیت مطالبه کن و inconsistencyهای تحلیلی را بدون مخالفت تصادفی برجسته کن.');
    }
  }
  if (agent.id === 'skeptic-red-team') {
    lines.push('روایت غالب را به‌طور صریح attack کن و بگو کدام assumption اگر فروبپاشد، کل framing عوض می‌شود.');
    lines.push('هرگز blind agreement نداشته باش و نقد را soften نکن؛ مخالفت باید عقلانی، evidence-seeking و دقیق باشد.');
    lines.push('همیشه این پرسش را صریح وارد تحلیل کن: اگر این روایت غلط باشد چه؟');
    lines.push('متغیرهای مفقود، overconfidence، false causality و biasهای پنهان را آشکار و نام‌گذاری کن.');
    if (stage === 'assessment' || stage === 'revision') {
      lines.push('علاوه بر critique، یک alternative hypothesis معتبر، یک risk escalation scenario و یک uncertainty analysis صریح ارائه کن.');
    }
    if (stage === 'critique') {
      lines.push('اجماع، منطق ضعیف و causal jumpهای عامل مقابل را بدون ملاحظه challenge کن و اگر لازم است explanation جایگزین پیشنهاد بده.');
    }
  }
  if (agent.id === 'economic-analyst') {
    lines.push('همیشه رخداد ژئوپلیتیکی را به outcome اقتصادی وصل کن و causal bridge را صریح بنویس.');
    if (stage === 'assessment' || stage === 'revision') {
      lines.push('اثر بر بازارها، trade flowها، سیستم‌های انرژی و macro effectها را جداگانه تحلیل کن.');
      lines.push('short-term و long-term effectها را تفکیک کن، sector-level riskها را نام ببر و global spilloverها را روشن کن.');
    }
    if (stage === 'critique') {
      lines.push('اگر تحلیل عامل مقابل پیوند ژئوپلیتیک به اقتصاد را مبهم، ناقص یا کم‌برآورد کرده، همان خلأ را با صراحت challenge کن.');
    }
  }
  if (agent.id === 'osint-analyst') {
    lines.push('تحلیل باید data-driven بماند و از speculation بدون پشتوانه فاصله بگیرد.');
    if (stage === 'assessment' || stage === 'revision') {
      lines.push('سیگنال‌های کلیدی را از news، GDELT، social media و public data جمع‌بندی کن و patternها، anomalyها و clusterهای مهم را استخراج کن.');
      lines.push('trendهای نوظهور، اطلاعات متعارض و reliability assessment را روشن و جداگانه ثبت کن.');
    }
    if (stage === 'critique') {
      lines.push('اگر عامل مقابل از data موجود فراتر رفته، اطلاعات متعارض را نادیده گرفته یا reliability را مبهم گذاشته، همان را به‌طور صریح challenge کن.');
    }
  }
  if (agent.id === 'cyber-infrastructure-analyst') {
    lines.push('تحلیل را بر fragility و interdependency بنا کن، نه بر خوش‌بینی عمومی درباره تاب‌آوری.');
    if (stage === 'assessment' || stage === 'revision') {
      lines.push('آسیب‌پذیری‌های زیرساخت، ریسک سامانه‌های سایبری، گلوگاه‌های لجستیکی و stress زنجیره تامین را جداگانه صورت‌بندی کن.');
      lines.push('failureهای آبشاری، systemic risk و محدودیت‌های restoration را صریح و ساخت‌یافته بنویس.');
    }
    if (stage === 'critique') {
      lines.push('اگر عامل مقابل dependencyها، bottleneckها، fragility یا cascadeها را کم‌برآورد کرده، همان را با صراحت challenge کن.');
    }
  }
  if (agent.id === 'social-sentiment-analyst') {
    lines.push('تحلیل را بر ادراک عمومی، behavioral reaction و narrative dynamics بنا کن، نه فقط بر شاخص‌های سخت.');
    if (stage === 'assessment' || stage === 'revision') {
      lines.push('sentiment shift، polarization، unrest potential و روندهای روایی را جداگانه ارزیابی کن.');
      lines.push('social riskها، reactionهای رفتاری و instability triggerهای محتمل را صریح و ساخت‌یافته بنویس.');
    }
    if (stage === 'critique') {
      lines.push('اگر عامل مقابل perception، mood swing، polarization یا triggerهای ناآرامی را نادیده گرفته، همان را با صراحت challenge کن.');
    }
  }
  if (agent.id === 'scenario-moderator') {
    lines.push('قوی‌ترین استدلال‌ها را شناسایی کن، disagreementهای اصلی را برجسته کن و clarification request صریح بده.');
    lines.push('اجازه نده shallow consensus یا جمع‌بندی زودرس جای conflict واقعی را بگیرد.');
    lines.push('جریان reasoning را کنترل کن و synthesis guidance روشن برای دور بعد یا جمع‌بندی نهایی بده.');
    if (stage === 'assessment' || stage === 'revision' || stage === 'moderation') {
      lines.push('key conflictها، unresolved questionها و guidance لازم برای synthesis را به‌صورت ساخت‌یافته ثبت کن.');
    }
  }
  if (agent.id === 'executive-synthesizer') {
    lines.push('خروجی باید board-level، موجز، سطح‌بالا و تصمیم‌محور باشد.');
    lines.push('همه ورودی‌های عامل‌ها را synthesize کن و سناریوی غالب، futures رقیب، ریسک‌های کلیدی و black swanها را صریح نام ببر.');
    lines.push('recommendationهای روشن و actionable، watch indicatorها و confidence level را بدون ابهام ثبت کن.');
    if (stage === 'assessment' || stage === 'revision' || stage === 'synthesis') {
      lines.push('executive summary، top 3 scenarioها، critical uncertaintyها، recommended actionها و watch indicatorها را به‌صورت ساخت‌یافته برگردان.');
    }
  }
  if (stage === 'critique') {
    lines.push('فقط disagreementهای معنادار و evidence-backed را برجسته کن؛ با نقد تصادفی یا سلیقه‌ای مخالفت نکن.');
  }
  if (stage === 'assessment') {
    lines.push('از همین دور اول observed facts را از inference جدا کن و watchpointهای decisive بده.');
  }
  if (stage === 'revision') {
    lines.push('اگر تغییری در موضع ندادی، دلیل مقاومت در برابر challenge را شفاف و محدود بنویس.');
  }

  return lines;
}

function buildStageContract(agent: WarRoomAgentDefinition, stage: WarRoomPromptStage): string[] {
  return [
    ...OUTPUT_CONTRACTS[stage],
    ...((ROLE_OUTPUT_AUGMENTS[agent.id]?.[stage] ?? []).filter(Boolean)),
  ];
}

function buildOutputContract(agent: WarRoomAgentDefinition, stage: WarRoomPromptStage): string {
  return `JSON schema required: { ${buildStageContract(agent, stage).join(', ')} }`;
}

function buildPrompt(agent: WarRoomAgentDefinition, stage: WarRoomPromptStage, context: WarRoomPromptContext): string {
  return [
    ...COMMON_RULES,
    ...buildRoleBlock(agent),
    ...buildContextBlock(context),
    ...buildTargetBlock(context),
    ...stageSpecificLines(agent, stage),
    `دور challenge فعلی: ${context.challengeIteration ?? 1}`,
    buildOutputContract(agent, stage),
  ].join('\n');
}

export function listWarRoomPromptRegistry(): WarRoomPromptRegistryEntry[] {
  return listWarRoomAgents().map((agent) => ({
    agentId: agent.id,
    mission: agent.mission,
    analysisStyle: agent.analysisStyle.slice(),
    blindSpots: agent.blindSpots.slice(),
    roleSpecificPriorities: agent.rolePriorities.slice(),
    challengeBehavior: agent.challengeBehavior.slice(),
    outputContract: {
      assessment: buildStageContract(agent, 'assessment'),
      critique: buildStageContract(agent, 'critique'),
      revision: buildStageContract(agent, 'revision'),
      moderation: buildStageContract(agent, 'moderation'),
      synthesis: buildStageContract(agent, 'synthesis'),
    },
  }));
}

export function getWarRoomPromptRegistryEntry(agentId: WarRoomAgentId): WarRoomPromptRegistryEntry {
  const agent = getWarRoomAgent(agentId);
  return listWarRoomPromptRegistry().find((entry) => entry.agentId === agent.id)!;
}

export function buildWarRoomAssessmentPrompt(agent: WarRoomAgentDefinition, context: WarRoomPromptContext): string {
  return buildPrompt(agent, 'assessment', context);
}

export function buildWarRoomCritiquePrompt(agent: WarRoomAgentDefinition, context: WarRoomPromptContext): string {
  return buildPrompt(agent, 'critique', context);
}

export function buildWarRoomRevisionPrompt(agent: WarRoomAgentDefinition, context: WarRoomPromptContext): string {
  return buildPrompt(agent, 'revision', context);
}

export function buildWarRoomModerationPrompt(agent: WarRoomAgentDefinition, context: WarRoomPromptContext): string {
  return buildPrompt(agent, 'moderation', context);
}

export function buildWarRoomSynthesisPrompt(agent: WarRoomAgentDefinition, context: WarRoomPromptContext): string {
  return buildPrompt(agent, 'synthesis', context);
}

export function buildWarRoomPromptExamples(context: WarRoomPromptContext): Record<WarRoomAgentId, { assessment: string; critique: string; revision: string }> {
  return Object.fromEntries(
    listWarRoomAgents().map((agent) => [
      agent.id,
      {
        assessment: buildWarRoomAssessmentPrompt(agent, context),
        critique: buildWarRoomCritiquePrompt(agent, context),
        revision: buildWarRoomRevisionPrompt(agent, context),
      },
    ]),
  ) as Record<WarRoomAgentId, { assessment: string; critique: string; revision: string }>;
}
