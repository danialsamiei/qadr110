import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildWarRoomAssessmentPrompt,
  buildWarRoomCritiquePrompt,
  buildWarRoomModerationPrompt,
  buildWarRoomPromptExamples,
  buildWarRoomSynthesisPrompt,
  getWarRoomPromptRegistryEntry,
  getWarRoomAgent,
  listWarRoomPromptRegistry,
} from '../src/ai/war-room/index.ts';
import { createPointMapContext } from '../src/platform/operations/map-context.ts';
import { createAssistantSessionContext } from '../src/services/ai-orchestrator/session.ts';
import { runScenarioEngine } from '../src/ai/scenario-engine.ts';

describe('war room prompt registry', () => {
  const session = createAssistantSessionContext('war-room-prompts');
  session.activeIntentSummary = 'بررسی چندعاملی ریسک انرژی و تشدید منطقه‌ای';
  session.intentHistory = [{
    query: 'اگر عبور دریایی مختل شود چه رخ می‌دهد؟',
    taskClass: 'scenario-analysis',
    timestamp: '2026-03-17T09:00:00.000Z',
  }];
  session.reusableInsights = [{
    id: 'insight-1',
    query: 'تنگه هرمز',
    summary: 'ریسک انرژی، بیمه و روایت منطقه‌ای هم‌زمان در حال تغییر است.',
    createdAt: '2026-03-17T08:55:00.000Z',
    evidenceCardIds: [],
    relevanceTags: ['energy', 'shipping'],
  }];

  const mapContext = createPointMapContext('map-prompt', {
    lat: 26.5667,
    lon: 56.25,
    countryCode: 'IR',
    countryName: 'ایران',
    label: 'تنگه هرمز',
  }, {
    activeLayers: ['gdelt', 'polymarket', 'osint'],
    nearbySignals: [
      { id: 'sig-1', label: 'افزایش ریسک بیمه', kind: 'shipping', severity: 'high' },
      { id: 'sig-2', label: 'نوسان شدید قیمت انرژی', kind: 'energy', severity: 'medium' },
    ],
    geopoliticalContext: ['گذرگاه حیاتی انرژی'],
    viewport: { zoom: 7, view: 'map' },
  });

  const scenarioOutput = runScenarioEngine({
    trigger: 'اختلال در عبور دریایی',
    query: 'سناریوهای اولیه برای اختلال در عبور دریایی این محدوده را بساز',
    mapContext,
    sessionContext: session,
    localContextPackets: [{
      id: 'ctx-1',
      title: 'خلاصه سیگنال‌ها',
      summary: 'فشار هم‌زمان انرژی، بیمه و ترافیک دریایی دیده می‌شود.',
      content: 'فشار انرژی و هزینه حمل در حال افزایش است.',
      sourceLabel: 'QADR110',
      sourceType: 'model',
      updatedAt: '2026-03-17T09:05:00.000Z',
      score: 0.7,
      tags: ['energy'],
      provenance: { sourceIds: ['ctx-1'], evidenceIds: ['ctx-1'] },
    }],
  });

  const promptContext = {
    question: 'اگر عبور دریایی این محدوده مختل شود، آینده‌های محتمل چیست؟',
    anchorLabel: 'تنگه هرمز',
    mapContext,
    activeScenarios: scenarioOutput.scenarios.slice(0, 3),
    sessionContext: session,
    recentSignals: mapContext.nearbySignals,
    localContextPackets: scenarioOutput.contextPackets.slice(0, 2),
    challengeIteration: 2,
  };

  it('defines reusable prompt metadata for all eight agents', () => {
    const registry = listWarRoomPromptRegistry();
    const strategicEntry = getWarRoomPromptRegistryEntry('strategic-analyst');

    assert.equal(registry.length, 8);
    assert.ok(registry.every((entry) => entry.mission.length > 10));
    assert.ok(registry.every((entry) => entry.analysisStyle.length >= 2));
    assert.ok(registry.every((entry) => entry.blindSpots.length >= 1));
    assert.ok(registry.every((entry) => entry.roleSpecificPriorities.length >= 3));
    assert.ok(registry.every((entry) => entry.challengeBehavior.length >= 1));
    assert.ok(strategicEntry.analysisStyle.includes('تحلیلی'));
    assert.ok(strategicEntry.analysisStyle.includes('ساخت‌یافته'));
    assert.ok(strategicEntry.analysisStyle.includes('آینده‌نگر'));
    assert.ok(strategicEntry.blindSpots.includes('ممکن است رویدادهای کم‌احتمال را کم‌وزن ببیند'));
    assert.ok(strategicEntry.blindSpots.includes('ممکن است عقلانیت بازیگران را بیش‌ازحد مفروض بگیرد'));
    assert.ok(strategicEntry.roleSpecificPriorities.includes('استدلال علّی'));
    assert.ok(strategicEntry.roleSpecificPriorities.includes('پیامدهای راهبردی'));
    assert.ok(strategicEntry.challengeBehavior.includes('زیر سوال بردن فرض‌های ضعیف'));
    assert.ok(strategicEntry.challengeBehavior.includes('مطالبه شفافیت'));
    assert.ok(strategicEntry.challengeBehavior.includes('برجسته کردن ناسازگاری‌های تحلیلی'));
  });

  it('builds explicit Persian JSON-first prompts with map, scenario, signal, and session context', () => {
    const strategic = getWarRoomAgent('strategic-analyst');
    const prompt = buildWarRoomAssessmentPrompt(strategic, promptContext);

    assert.match(prompt, /خروجی را فقط به فارسی تولید کن/);
    assert.match(prompt, /JSON schema required/);
    assert.match(prompt, /تنگه هرمز/);
    assert.match(prompt, /سناریوهای فعال/);
    assert.match(prompt, /سیگنال‌های اخیر/);
    assert.match(prompt, /حافظه جلسه/);
    assert.match(prompt, /executive_summary/);
    assert.match(prompt, /overrated_scenario/);
    assert.match(prompt, /underappreciated_scenario/);
    assert.match(prompt, /supporting_points/);
    assert.match(prompt, /key_drivers/);
    assert.match(prompt, /causal_relationships/);
    assert.match(prompt, /possible_trajectories/);
    assert.match(prompt, /risks/);
    assert.match(prompt, /confidence_level/);
    assert.match(prompt, /driverهای کلیدی/);
    assert.match(prompt, /رابطه‌های علّی/);
    assert.match(prompt, /trajectoryهای راهبردی/);
  });

  it('gives the red team an explicit assumption-attack posture', () => {
    const redTeam = getWarRoomAgent('skeptic-red-team');
    const redTeamEntry = getWarRoomPromptRegistryEntry('skeptic-red-team');
    const prompt = buildWarRoomCritiquePrompt(redTeam, {
      ...promptContext,
      targetAgent: {
        id: 'strategic-analyst',
        role: 'تحلیل‌گر راهبردی',
        label: 'Strategic Analyst',
      },
    });

    assert.ok(redTeamEntry.analysisStyle.includes('خصمانه اما عقلانی'));
    assert.ok(redTeamEntry.analysisStyle.includes('evidence-seeking'));
    assert.ok(redTeamEntry.roleSpecificPriorities.includes('متغیرهای مفقود'));
    assert.ok(redTeamEntry.roleSpecificPriorities.includes('اعتمادبه‌نفس کاذب'));
    assert.ok(redTeamEntry.roleSpecificPriorities.includes('false causality'));
    assert.ok(redTeamEntry.challengeBehavior.includes('همیشه بپرس اگر این غلط باشد چه؟'));
    assert.match(prompt, /روایت غالب را به‌طور صریح attack کن/);
    assert.match(prompt, /نقد را soften نکن/);
    assert.match(prompt, /اگر این روایت غلط باشد چه/);
    assert.match(prompt, /حمله باید بر assumptions/);
    assert.match(prompt, /dominant narrative/);
    assert.match(prompt, /متغیرهای مفقود/);
    assert.match(prompt, /overconfidence/);
    assert.match(prompt, /false causality/);
    assert.match(prompt, /requested_clarifications/);
    assert.match(prompt, /alternative_hypothesis/);
    assert.match(prompt, /risk_escalation_scenario/);
    assert.match(prompt, /uncertainty_analysis/);
  });

  it('gives the economic analyst an explicit geopolitical-to-economic contract', () => {
    const economic = getWarRoomAgent('economic-analyst');
    const economicEntry = getWarRoomPromptRegistryEntry('economic-analyst');
    const prompt = buildWarRoomAssessmentPrompt(economic, promptContext);

    assert.ok(economicEntry.analysisStyle.includes('مبتنی بر بازار و جریان'));
    assert.ok(economicEntry.analysisStyle.includes('trade-off محور'));
    assert.ok(economicEntry.roleSpecificPriorities.includes('بازارها'));
    assert.ok(economicEntry.roleSpecificPriorities.includes('trade flowها'));
    assert.ok(economicEntry.roleSpecificPriorities.includes('سیستم‌های انرژی'));
    assert.ok(economicEntry.roleSpecificPriorities.includes('ریسک‌های بخشی'));
    assert.ok(economicEntry.roleSpecificPriorities.includes('spillover جهانی'));
    assert.ok(economicEntry.challengeBehavior.includes('وادار کردن دیگران به اتصال روشن رویداد ژئوپلیتیکی به پیامد اقتصادی'));
    assert.match(prompt, /رخداد ژئوپلیتیکی را به outcome اقتصادی وصل کن/);
    assert.match(prompt, /بازارها، trade flowها، سیستم‌های انرژی و macro effectها/);
    assert.match(prompt, /short-term و long-term effectها/);
    assert.match(prompt, /sector-level riskها/);
    assert.match(prompt, /global spilloverها/);
    assert.match(prompt, /economic_impact/);
    assert.match(prompt, /short_term_effects/);
    assert.match(prompt, /long_term_effects/);
    assert.match(prompt, /sector_level_risks/);
    assert.match(prompt, /global_spillovers/);
    assert.match(prompt, /geopolitical_to_economic_links/);
    assert.match(prompt, /trade_flow_implications/);
    assert.match(prompt, /energy_system_implications/);
  });

  it('gives the OSINT analyst an explicit signal interpretation contract', () => {
    const osint = getWarRoomAgent('osint-analyst');
    const osintEntry = getWarRoomPromptRegistryEntry('osint-analyst');
    const prompt = buildWarRoomAssessmentPrompt(osint, promptContext);

    assert.ok(osintEntry.analysisStyle.includes('داده‌محور'));
    assert.ok(osintEntry.analysisStyle.includes('منبع‌محور'));
    assert.ok(osintEntry.analysisStyle.includes('محافظه‌کار در برابر گمانه‌زنی'));
    assert.ok(osintEntry.roleSpecificPriorities.includes('سیگنال‌های کلیدی'));
    assert.ok(osintEntry.roleSpecificPriorities.includes('trendهای نوظهور'));
    assert.ok(osintEntry.roleSpecificPriorities.includes('اطلاعات متعارض'));
    assert.ok(osintEntry.roleSpecificPriorities.includes('ارزیابی قابلیت اتکا'));
    assert.ok(osintEntry.roleSpecificPriorities.includes('pattern detection'));
    assert.ok(osintEntry.roleSpecificPriorities.includes('anomaly detection'));
    assert.ok(osintEntry.roleSpecificPriorities.includes('signal clustering'));
    assert.ok(osintEntry.challengeBehavior.includes('challenge ادعاهای speculative و فراتر از data'));
    assert.match(prompt, /تحلیل باید data-driven بماند/);
    assert.match(prompt, /news، GDELT، social media و public data/);
    assert.match(prompt, /patternها، anomalyها و clusterهای مهم/);
    assert.match(prompt, /trendهای نوظهور/);
    assert.match(prompt, /اطلاعات متعارض/);
    assert.match(prompt, /reliability assessment/);
    assert.match(prompt, /key_signals/);
    assert.match(prompt, /emerging_trends/);
    assert.match(prompt, /conflicting_information/);
    assert.match(prompt, /reliability_assessment/);
    assert.match(prompt, /signal_patterns/);
    assert.match(prompt, /signal_anomalies/);
    assert.match(prompt, /signal_clusters/);
    assert.match(prompt, /source_reliability_notes/);
    assert.match(prompt, /coverage_gaps/);
  });

  it('gives the cyber and infrastructure analyst an explicit fragility contract', () => {
    const cyber = getWarRoomAgent('cyber-infrastructure-analyst');
    const cyberEntry = getWarRoomPromptRegistryEntry('cyber-infrastructure-analyst');
    const prompt = buildWarRoomAssessmentPrompt(cyber, promptContext);

    assert.ok(cyberEntry.analysisStyle.includes('شبکه‌محور'));
    assert.ok(cyberEntry.analysisStyle.includes('fragility-first'));
    assert.ok(cyberEntry.analysisStyle.includes('وابستگی‌محور'));
    assert.ok(cyberEntry.roleSpecificPriorities.includes('آسیب‌پذیری‌ها'));
    assert.ok(cyberEntry.roleSpecificPriorities.includes('failure آبشاری'));
    assert.ok(cyberEntry.roleSpecificPriorities.includes('ریسک سیستمیک'));
    assert.ok(cyberEntry.roleSpecificPriorities.includes('fragility'));
    assert.ok(cyberEntry.roleSpecificPriorities.includes('interdependency'));
    assert.ok(cyberEntry.roleSpecificPriorities.includes('گلوگاه‌های لجستیکی'));
    assert.ok(cyberEntry.roleSpecificPriorities.includes('supply chain stress'));
    assert.ok(cyberEntry.challengeBehavior.includes('challenge تحلیل‌های خوش‌بینانه درباره resilience'));
    assert.match(prompt, /fragility و interdependency/);
    assert.match(prompt, /آسیب‌پذیری‌های زیرساخت، ریسک سامانه‌های سایبری، گلوگاه‌های لجستیکی و stress زنجیره تامین/);
    assert.match(prompt, /failureهای آبشاری، systemic risk و محدودیت‌های restoration/);
    assert.match(prompt, /vulnerabilities/);
    assert.match(prompt, /cascading_failures/);
    assert.match(prompt, /systemic_risks/);
    assert.match(prompt, /fragility_factors/);
    assert.match(prompt, /interdependencies/);
    assert.match(prompt, /infrastructure_exposures/);
    assert.match(prompt, /cyber_system_risks/);
    assert.match(prompt, /logistics_bottlenecks/);
    assert.match(prompt, /supply_chain_stresses/);
    assert.match(prompt, /restoration_constraints/);
  });

  it('gives the social sentiment analyst an explicit perception and instability contract', () => {
    const social = getWarRoomAgent('social-sentiment-analyst');
    const socialEntry = getWarRoomPromptRegistryEntry('social-sentiment-analyst');
    const prompt = buildWarRoomAssessmentPrompt(social, promptContext);

    assert.ok(socialEntry.analysisStyle.includes('ادراک‌محور'));
    assert.ok(socialEntry.analysisStyle.includes('اجتماعی-رفتاری'));
    assert.ok(socialEntry.analysisStyle.includes('حساس به narrative dynamics'));
    assert.ok(socialEntry.roleSpecificPriorities.includes('social risks'));
    assert.ok(socialEntry.roleSpecificPriorities.includes('narrative trends'));
    assert.ok(socialEntry.roleSpecificPriorities.includes('instability triggerها'));
    assert.ok(socialEntry.roleSpecificPriorities.includes('sentiment shift'));
    assert.ok(socialEntry.roleSpecificPriorities.includes('polarization'));
    assert.ok(socialEntry.roleSpecificPriorities.includes('unrest potential'));
    assert.ok(socialEntry.challengeBehavior.includes('challenge تحلیل‌هایی که perception و رفتار جمعی را حذف می‌کنند'));
    assert.match(prompt, /ادراک عمومی، behavioral reaction و narrative dynamics/);
    assert.match(prompt, /sentiment shift، polarization، unrest potential و روندهای روایی/);
    assert.match(prompt, /social riskها، reactionهای رفتاری و instability triggerهای محتمل/);
    assert.match(prompt, /social_risks/);
    assert.match(prompt, /narrative_trends/);
    assert.match(prompt, /potential_instability_triggers/);
    assert.match(prompt, /sentiment_shifts/);
    assert.match(prompt, /polarization_patterns/);
    assert.match(prompt, /unrest_potential/);
    assert.match(prompt, /behavioral_reactions/);
    assert.match(prompt, /public_perception_notes/);
    assert.match(prompt, /social_fragility_factors/);
  });

  it('gives the scenario moderator an explicit debate-management contract', () => {
    const moderator = getWarRoomAgent('scenario-moderator');
    const moderatorEntry = getWarRoomPromptRegistryEntry('scenario-moderator');
    const prompt = buildWarRoomModerationPrompt(moderator, promptContext);

    assert.ok(moderatorEntry.analysisStyle.includes('ساختاردهنده'));
    assert.ok(moderatorEntry.analysisStyle.includes('مدیریت‌گر جریان استدلال'));
    assert.ok(moderatorEntry.roleSpecificPriorities.includes('تعارض‌های کلیدی'));
    assert.ok(moderatorEntry.roleSpecificPriorities.includes('پرسش‌های حل‌نشده'));
    assert.ok(moderatorEntry.roleSpecificPriorities.includes('جلوگیری از اجماع سطحی'));
    assert.ok(moderatorEntry.roleSpecificPriorities.includes('راهنمای synthesis'));
    assert.ok(moderatorEntry.challengeBehavior.includes('شکستن اجماع زودرس یا سطحی'));
    assert.match(prompt, /disagreementهای اصلی را برجسته کن/);
    assert.match(prompt, /اجازه نده shallow consensus/);
    assert.match(prompt, /جریان reasoning را کنترل کن/);
    assert.match(prompt, /key conflictها، unresolved questionها و guidance لازم برای synthesis/);
    assert.match(prompt, /key_conflicts/);
    assert.match(prompt, /unresolved_questions/);
    assert.match(prompt, /synthesis_guidance/);
    assert.match(prompt, /strongest_arguments/);
    assert.match(prompt, /clarification_requests/);
    assert.match(prompt, /shallow_consensus_flags/);
  });

  it('gives the executive synthesizer an explicit board-level synthesis contract', () => {
    const executive = getWarRoomAgent('executive-synthesizer');
    const executiveEntry = getWarRoomPromptRegistryEntry('executive-synthesizer');
    const prompt = buildWarRoomSynthesisPrompt(executive, promptContext);

    assert.ok(executiveEntry.analysisStyle.includes('موجز'));
    assert.ok(executiveEntry.analysisStyle.includes('سطح‌بالا'));
    assert.ok(executiveEntry.analysisStyle.includes('تصمیم‌محور'));
    assert.ok(executiveEntry.roleSpecificPriorities.includes('executive summary'));
    assert.ok(executiveEntry.roleSpecificPriorities.includes('top scenarios'));
    assert.ok(executiveEntry.roleSpecificPriorities.includes('critical uncertainties'));
    assert.ok(executiveEntry.roleSpecificPriorities.includes('recommended actions'));
    assert.ok(executiveEntry.roleSpecificPriorities.includes('watch indicators'));
    assert.ok(executiveEntry.roleSpecificPriorities.includes('confidence level'));
    assert.ok(executiveEntry.challengeBehavior.includes('challenge خروجی‌های مبهم و غیرتصمیمی'));
    assert.match(prompt, /board-level، موجز، سطح‌بالا و تصمیم‌محور/);
    assert.match(prompt, /سناریوی غالب، futures رقیب، ریسک‌های کلیدی و black swanها/);
    assert.match(prompt, /recommendationهای روشن و actionable، watch indicatorها و confidence level/);
    assert.match(prompt, /top 3 scenarioها، critical uncertaintyها، recommended actionها و watch indicatorها/);
    assert.match(prompt, /top_3_scenarios/);
    assert.match(prompt, /critical_uncertainties/);
    assert.match(prompt, /recommended_actions/);
    assert.match(prompt, /watch_indicators/);
    assert.match(prompt, /dominant_scenario_summary/);
    assert.match(prompt, /competing_futures/);
    assert.match(prompt, /key_risks/);
    assert.match(prompt, /black_swan_summary/);
    assert.match(prompt, /actionable_insights/);
  });

  it('gives moderator and synthesizer the required higher-order duties', () => {
    const moderator = getWarRoomAgent('scenario-moderator');
    const executive = getWarRoomAgent('executive-synthesizer');
    const moderatorEntry = getWarRoomPromptRegistryEntry('scenario-moderator');
    const synthesisPrompt = buildWarRoomSynthesisPrompt(executive, promptContext);
    const examples = buildWarRoomPromptExamples(promptContext);

    assert.ok(moderatorEntry.roleSpecificPriorities.includes('قوی‌ترین استدلال‌ها'));
    assert.ok(moderatorEntry.roleSpecificPriorities.includes('درخواست شفاف‌سازی'));
    assert.match(examples['scenario-moderator'].assessment, /قوی‌ترین استدلال‌ها/);
    assert.match(synthesisPrompt, /board-level/);
    assert.match(synthesisPrompt, /confidence level/);
    assert.match(synthesisPrompt, /recommended action/);
    assert.match(synthesisPrompt, /watch indicator/);
    assert.equal(examples[moderator.id].revision.includes('remaining_uncertainties'), true);
  });
});
