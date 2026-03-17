import type {
  AssistantActorModel,
  AssistantDecisionAction,
  AssistantDecisionLeveragePoint,
  AssistantDecisionSupport,
  AssistantDecisionTradeoff,
  AssistantDecisionUncertainty,
  AssistantImpactLevel,
  AssistantProbabilityBand,
  AssistantScenarioDecisionSupport,
} from '@/platform/ai/assistant-contracts';
import type { AssistantSessionContext } from '@/platform/ai/orchestrator-contracts';
import type { MapContextEnvelope } from '@/platform/operations/map-context';

import type {
  ScenarioDomain,
  ScenarioEngineComparison,
  ScenarioEngineScenario,
} from './scenario-engine';

export interface ScenarioDecisionSupportInput {
  trigger: string;
  anchorLabel: string;
  scenarios: ScenarioEngineScenario[];
  domainScores: Record<ScenarioDomain, number>;
  mapContext?: MapContextEnvelope | null;
  sessionContext?: AssistantSessionContext | null;
  comparison?: ScenarioEngineComparison | null;
}

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function uniqueStrings(values: Array<string | undefined>, maxItems = 8): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, maxItems);
}

function toProbabilityScore(probability: AssistantProbabilityBand, fallback = 0.5): number {
  if (probability === 'high') return 0.78;
  if (probability === 'medium') return 0.52;
  if (probability === 'low') return 0.24;
  return fallback;
}

function toImpactScore(impact?: AssistantImpactLevel): number {
  if (impact === 'critical') return 0.92;
  if (impact === 'high') return 0.72;
  if (impact === 'medium') return 0.48;
  if (impact === 'low') return 0.22;
  return 0.5;
}

function actionTimeframe(scenario: ScenarioEngineScenario): AssistantDecisionAction['timeframe'] {
  const probability = scenario.probability_score ?? toProbabilityScore(scenario.probability);
  const impact = scenario.impact_score ?? toImpactScore(scenario.impact_level);
  if (probability >= 0.68 || impact >= 0.78) return 'immediate';
  if (probability >= 0.42 || impact >= 0.52) return 'near-term';
  return 'long-term';
}

function scenarioDomains(scenario: ScenarioEngineScenario): ScenarioDomain[] {
  const scoredDomains = new Map<ScenarioDomain, number>();
  Object.entries(scenario.cross_domain_impacts ?? {}).forEach(([domain, impacts]) => {
    if (!Array.isArray(impacts) || impacts.length === 0) return;
    scoredDomains.set(domain as ScenarioDomain, (scoredDomains.get(domain as ScenarioDomain) ?? 0) + impacts.length);
  });
  scenario.causal_chain.forEach((step) => {
    step.affected_domains.forEach((domain) => {
      scoredDomains.set(domain, (scoredDomains.get(domain) ?? 0) + 1);
    });
  });
  return [...scoredDomains.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([domain]) => domain)
    .slice(0, 3);
}

function domainLabel(domain: ScenarioDomain): string {
  switch (domain) {
    case 'geopolitics':
      return 'ژئوپلیتیک';
    case 'economics':
      return 'اقتصاد';
    case 'infrastructure':
      return 'زیرساخت';
    case 'public_sentiment':
      return 'افکار عمومی';
    case 'cyber':
      return 'سایبری';
    default:
      return domain;
  }
}

function dominantDomains(domainScores: Record<ScenarioDomain, number>): ScenarioDomain[] {
  return [...(Object.keys(domainScores) as ScenarioDomain[])]
    .sort((left, right) => domainScores[right] - domainScores[left])
    .slice(0, 3);
}

function buildRecommendedActions(
  scenario: ScenarioEngineScenario,
  anchorLabel: string,
  domains: ScenarioDomain[],
): AssistantDecisionAction[] {
  const timeframe = actionTimeframe(scenario);
  const domainText = domains.map(domainLabel).join('، ');
  return uniqueStrings([
    scenario.mitigation_options[0]
      ? `اقدام فوری: ${scenario.mitigation_options[0]}`
      : `اقدام فوری: شاخص‌های هشدار «${scenario.title}» را برای ${anchorLabel} در cadence کوتاه‌تر پایش کن.`,
    scenario.indicators_to_watch[0]
      ? `راستی‌آزمایی شاخص «${scenario.indicators_to_watch[0]}» برای کاهش خطای تصمیم`
      : undefined,
    domains[0]
      ? `هماهنگ‌سازی پایش ${domainLabel(domains[0])} با بسته‌های تصمیم‌گیری ${anchorLabel}`
      : undefined,
  ], 3).map((label, index) => ({
    label,
    rationale: index === 0
      ? `این اقدام مستقیما از گزینه‌های کاهش اثر و افق ${scenario.time_horizon} مشتق شده و برای مدیریت فشار ${domainText || 'چنددامنه‌ای'} مفید است.`
      : index === 1
        ? 'این اقدام شکاف بین سیگنال خام و تصمیم اجرایی را کم می‌کند و ریسک برداشت نادرست را پایین می‌آورد.'
        : `این اقدام برای مهار cascadeهای متقاطع در ${anchorLabel} طراحی شده است.`,
    timeframe,
  }));
}

function buildTradeoffs(
  anchorLabel: string,
  domains: ScenarioDomain[],
): AssistantDecisionTradeoff[] {
  const primaryDomain = domains[0];
  const generic: AssistantDecisionTradeoff = {
    label: 'افزایش cadence پایش و آماده‌سازی',
    cost: 'افزایش مصرف منابع تحلیلی و بار هماهنگی',
    benefit: 'کاهش تاخیر تشخیص و افزایش زمان واکنش دفاعی',
    short_term: `در کوتاه‌مدت visibility برای ${anchorLabel} بهتر می‌شود اما فشار عملیاتی روی تیم‌ها بالا می‌رود.`,
    long_term: 'در بلندمدت، داده‌های بهتر باعث اصلاح آستانه‌های هشدار و کاهش غافلگیری می‌شود.',
  };

  const domainSpecific = (() => {
    if (primaryDomain === 'economics') {
      return {
        label: 'تنوع‌بخشی مسیرها و ضربه‌گیر اقتصادی',
        cost: 'هزینه تنظیم مجدد تامین، حمل و پوشش بیمه‌ای',
        benefit: 'کاهش سرایت شوک قیمت و اختلال زنجیره تامین',
        short_term: 'در کوتاه‌مدت هزینه تطبیق بالا می‌رود اما نوسان عملیاتی مهار می‌شود.',
        long_term: 'در بلندمدت انعطاف اقتصادی و تاب‌آوری تجاری بیشتر می‌شود.',
      } satisfies AssistantDecisionTradeoff;
    }
    if (primaryDomain === 'infrastructure') {
      return {
        label: 'سخت‌سازی گلوگاه‌ها و مسیرهای جایگزین',
        cost: 'نیاز به تخصیص ظرفیت، هماهنگی بین‌بخشی و بعضا افت throughput لحظه‌ای',
        benefit: 'کاهش احتمال شکست آبشاری و کوتاه‌تر شدن زمان بازیابی',
        short_term: `در ${anchorLabel} ممکن است throughput موقت پایین بیاید اما ریسک اختلال مزمن کم می‌شود.`,
        long_term: 'در بلندمدت زیرساخت جایگزین و نقشه وابستگی‌ها بلوغ پیدا می‌کند.',
      } satisfies AssistantDecisionTradeoff;
    }
    if (primaryDomain === 'public_sentiment') {
      return {
        label: 'افزایش شفافیت و مدیریت روایت',
        cost: 'نیاز به cadence ارتباطی و راستی‌آزمایی مستمر',
        benefit: 'کاهش شایعه، panic و سوءبرداشت رفتاری',
        short_term: 'در کوتاه‌مدت بار ارتباطی بیشتر می‌شود اما فضای ابهام کمتر می‌شود.',
        long_term: 'در بلندمدت اعتماد و تاب‌آوری ادراکی تقویت می‌شود.',
      } satisfies AssistantDecisionTradeoff;
    }
    if (primaryDomain === 'cyber') {
      return {
        label: 'افزایش logging و سخت‌سازی دفاع دیجیتال',
        cost: 'بار عملیاتی بیشتر و احتمال افزایش نویز تحلیلی',
        benefit: 'کاهش blind spot و تشخیص زودتر اختلال هم‌زمان',
        short_term: 'در کوتاه‌مدت هزینه مانیتورینگ بالا می‌رود اما visibility بهتر می‌شود.',
        long_term: 'در بلندمدت baseline بهتری برای anomaly detection ساخته می‌شود.',
      } satisfies AssistantDecisionTradeoff;
    }
    return {
      label: 'تقویت هماهنگی بازیگران کلیدی',
      cost: 'نیاز به زمان هماهنگی و همسوسازی فرضیات',
      benefit: 'کاهش واگرایی تصمیم و بهبود پاسخ دفاعی',
      short_term: 'در کوتاه‌مدت سرعت بعضی تصمیم‌ها کمتر می‌شود اما خطا پایین می‌آید.',
      long_term: 'در بلندمدت کیفیت playbookها و readiness بهتر می‌شود.',
    } satisfies AssistantDecisionTradeoff;
  })();

  return [generic, domainSpecific];
}

function buildScenarioSupport(
  scenario: ScenarioEngineScenario,
  anchorLabel: string,
): AssistantScenarioDecisionSupport {
  const domains = scenarioDomains(scenario);
  return {
    scenario_id: scenario.id,
    scenario_title: scenario.title,
    probability: scenario.probability,
    impact_level: scenario.impact_level,
    recommended_actions: buildRecommendedActions(scenario, anchorLabel, domains),
    mitigation_strategies: uniqueStrings([
      ...scenario.mitigation_options,
      scenario.second_order_effects[0] ? `پایش پیامد ثانویه: ${scenario.second_order_effects[0]}` : undefined,
    ], 4),
    tradeoffs: buildTradeoffs(anchorLabel, domains),
  };
}

function buildLeveragePoints(
  scenarios: ScenarioEngineScenario[],
  anchorLabel: string,
  mapContext?: MapContextEnvelope | null,
): AssistantDecisionLeveragePoint[] {
  return uniqueStrings([
    scenarios[0]?.drivers[0] ? `مهار محرک «${scenarios[0].drivers[0]}»` : undefined,
    scenarios[0]?.indicators_to_watch[0] ? `پایش زودهنگام «${scenarios[0].indicators_to_watch[0]}»` : undefined,
    mapContext?.selectedEntities?.[0] ? `هماهنگی نزدیک با بازیگر «${mapContext.selectedEntities[0]}»` : undefined,
    mapContext?.activeLayers?.length ? `هم‌پوشانی لایه‌های ${(mapContext.activeLayers ?? []).slice(0, 3).join('، ')} در ${anchorLabel}` : undefined,
  ], 4).map((title, index) => ({
    title,
    why: index === 0
      ? 'این نقطه اهرمی بیشترین ظرفیت را برای کاهش cascade اولیه دارد.'
      : index === 1
        ? 'تغییر زودهنگام این شاخص می‌تواند ranking سناریوها را قبل از وقوع اثر کامل عوض کند.'
        : index === 2
          ? 'تصمیم این بازیگر می‌تواند چند دامنه را هم‌زمان تحت تاثیر قرار دهد.'
          : 'هم‌پوشانی داده در این نقطه، بهترین بازده را برای تصمیم‌سازی evidence-aware می‌دهد.',
  }));
}

function buildCriticalUncertainties(
  scenarios: ScenarioEngineScenario[],
  mapContext?: MapContextEnvelope | null,
): AssistantDecisionUncertainty[] {
  return scenarios.slice(0, 3).map((scenario) => ({
    title: `عدم‌قطعیت کلیدی در «${scenario.title}»`,
    why: scenario.uncertainty_level === 'high'
      ? 'داده‌های فعلی برای تثبیت causal chain این سناریو کافی نیستند و رفتار بازیگران می‌تواند ranking را سریع جابه‌جا کند.'
      : scenario.signal_agreement !== undefined && scenario.signal_agreement < 0.45
        ? 'همگرایی سیگنال‌ها پایین است و بخشی از evidenceها ممکن است فقط indicator باشند نه driver.'
        : 'زمان‌بندی واکنش‌ها و کیفیت راستی‌آزمایی هنوز روی نتیجه نهایی اثر قابل‌توجه دارد.',
    indicators: uniqueStrings([
      ...scenario.indicators_to_watch.slice(0, 3),
      ...(mapContext?.nearbySignals ?? []).slice(0, 2).map((signal) => signal.label),
    ], 4),
  }));
}

function actorRoleForDomain(domain: ScenarioDomain): { role: string; intent: string; behavior: string; constraint: string } {
  if (domain === 'geopolitics') {
    return {
      role: 'بازیگر حاکمیتی / امنیتی',
      intent: 'حفظ بازدارندگی، مدیریت posture و کنترل spillover منطقه‌ای',
      behavior: 'تغییر سطح هشدار، سیگنال‌دهی بازدارنده و مدیریت مسیرهای deconfliction',
      constraint: 'هزینه تشدید، فشار منطقه‌ای و محدودیت هماهنگی بین‌بازیگری',
    };
  }
  if (domain === 'economics') {
    return {
      role: 'بازیگر اقتصادی / زنجیره تامین',
      intent: 'حفظ throughput، کاهش shock قیمت و مدیریت ریسک بازار',
      behavior: 'تنوع‌بخشی مسیر، پوشش ریسک و بازقیمت‌گذاری عملیات',
      constraint: 'هزینه تطبیق، محدودیت بیمه و وابستگی تجاری',
    };
  }
  if (domain === 'infrastructure') {
    return {
      role: 'بازیگر زیرساختی / عملیاتی',
      intent: 'حفظ خدمت، جلوگیری از backlog و کوتاه کردن زمان بازیابی',
      behavior: 'اولویت‌بندی گلوگاه‌ها، تغییر مسیر و حفاظت از ظرفیت حیاتی',
      constraint: 'ظرفیت محدود، dependencyهای پنهان و افت throughput',
    };
  }
  if (domain === 'public_sentiment') {
    return {
      role: 'بازیگر اجتماعی / رسانه‌ای',
      intent: 'مدیریت برداشت عمومی و کاهش فشار ادراکی',
      behavior: 'تولید روایت، واکنش به شایعه و تغییر tone ارتباطی',
      constraint: 'شکاف اعتماد، سرعت انتشار روایت و کمبود داده تاییدشده',
    };
  }
  return {
    role: 'بازیگر دیجیتال / دفاع سایبری',
    intent: 'حفظ visibility و محدود کردن اختلال ترکیبی',
    behavior: 'افزایش مانیتورینگ، سخت‌سازی و بازآرایی دفاعی',
    constraint: 'نویز بالا، محدودیت telemetry و هم‌زمانی اختلال‌ها',
  };
}

function buildActorModels(
  scenarios: ScenarioEngineScenario[],
  domainScores: Record<ScenarioDomain, number>,
  mapContext?: MapContextEnvelope | null,
  sessionContext?: AssistantSessionContext | null,
): AssistantActorModel[] {
  const actorNames = uniqueStrings([
    ...(mapContext?.selectedEntities ?? []).slice(0, 3),
    mapContext?.selection.kind === 'point' ? mapContext.selection.label : undefined,
    mapContext?.selection.kind === 'country' ? mapContext.selection.countryName : undefined,
    ...(sessionContext?.reusableInsights ?? []).slice(-2).map((insight) => insight.query),
  ], 4);

  const domains = dominantDomains(domainScores);
  const defaults = domains.map((domain) => {
    const template = actorRoleForDomain(domain);
    return {
      actor: `بازیگر ${domainLabel(domain)}`,
      role: template.role,
      intent: template.intent,
      likely_behaviors: uniqueStrings([
        template.behavior,
        scenarios[0]?.drivers[0] ? `واکنش به محرک «${scenarios[0].drivers[0]}»` : undefined,
      ], 3),
      constraints: uniqueStrings([
        template.constraint,
        scenarios[0]?.indicators_to_watch[0] ? `وابستگی به شاخص «${scenarios[0].indicators_to_watch[0]}»` : undefined,
      ], 3),
    } satisfies AssistantActorModel;
  });

  if (actorNames.length === 0) {
    return defaults.slice(0, 4);
  }

  return actorNames.map((actor, index) => {
    const domain = domains[index % Math.max(1, domains.length)] ?? 'geopolitics';
    const template = actorRoleForDomain(domain);
    return {
      actor,
      role: template.role,
      intent: template.intent,
      likely_behaviors: uniqueStrings([
        template.behavior,
        scenarios[index % Math.max(1, scenarios.length)]?.mitigation_options[0]
          ? `واکنش به countermeasure «${scenarios[index % Math.max(1, scenarios.length)]!.mitigation_options[0]}»`
          : undefined,
      ], 3),
      constraints: uniqueStrings([
        template.constraint,
        mapContext?.dataFreshness?.overallStatus ? `محدودیت visibility: ${mapContext.dataFreshness.overallStatus}` : undefined,
      ], 3),
    };
  }).slice(0, 4);
}

function buildStrategicInsights(
  trigger: string,
  anchorLabel: string,
  scenarios: ScenarioEngineScenario[],
  comparison: ScenarioEngineComparison | null,
): string[] {
  const top = scenarios[0];
  const second = scenarios[1];
  return uniqueStrings([
    top ? `سناریوی غالب «${top.title}» نشان می‌دهد محرک «${trigger}» در ${anchorLabel} باید به‌صورت چنددامنه‌ای مدیریت شود.` : undefined,
    second ? `سناریوی جایگزین «${second.title}» باید به‌عنوان hedge در تصمیم‌سازی نگه داشته شود.` : undefined,
    comparison?.summary,
    top?.second_order_effects[0] ? `پیامد ثانویه مهم: ${top.second_order_effects[0]}` : undefined,
  ], 4);
}

export function buildScenarioDecisionSupport(input: ScenarioDecisionSupportInput): AssistantDecisionSupport {
  const rankedScenarios = [...input.scenarios]
    .sort((left, right) => {
      const leftScore = ((left.probability_score ?? toProbabilityScore(left.probability)) * 0.35)
        + ((left.impact_score ?? toImpactScore(left.impact_level)) * 0.4)
        + ((left.strategic_relevance ?? 0.5) * 0.25);
      const rightScore = ((right.probability_score ?? toProbabilityScore(right.probability)) * 0.35)
        + ((right.impact_score ?? toImpactScore(right.impact_level)) * 0.4)
        + ((right.strategic_relevance ?? 0.5) * 0.25);
      return rightScore - leftScore;
    })
    .slice(0, 4);

  const scenarioSupport = rankedScenarios.map((scenario) => buildScenarioSupport(scenario, input.anchorLabel));
  const leveragePoints = buildLeveragePoints(rankedScenarios, input.anchorLabel, input.mapContext);
  const criticalUncertainties = buildCriticalUncertainties(rankedScenarios, input.mapContext);
  const actorModels = buildActorModels(rankedScenarios, input.domainScores, input.mapContext, input.sessionContext);
  const strategicInsights = buildStrategicInsights(input.trigger, input.anchorLabel, rankedScenarios, input.comparison ?? null);
  const actionableInsights = uniqueStrings([
    ...scenarioSupport.flatMap((item) => item.recommended_actions.slice(0, 2).map((action) => action.label)),
    ...leveragePoints.slice(0, 2).map((item) => `نقطه اهرمی: ${item.title}`),
  ], 6);

  const top = rankedScenarios[0];
  const topLikelihood = clamp(top?.probability_score ?? toProbabilityScore(top?.probability ?? 'medium'));
  const topImpact = clamp(top?.impact_score ?? toImpactScore(top?.impact_level));
  const domainText = dominantDomains(input.domainScores).map(domainLabel).join('، ');

  return {
    executive_summary: top
      ? `برای ${input.anchorLabel}، تصمیم‌یار سناریو نشان می‌دهد «${top.title}» در حال حاضر محتمل‌ترین یا راهبردی‌ترین مسیر است. با این حال تصمیم عملیاتی باید بین مهار فوری اثر، حفظ ظرفیت بلندمدت و مدیریت عدم‌قطعیت‌های حوزه‌های ${domainText} توازن ایجاد کند.`
      : `برای ${input.anchorLabel}، داده کافی برای تصمیم‌یار سناریو موجود نیست و باید ابتدا پوشش شواهد تقویت شود.`,
    actionable_insights: actionableInsights,
    strategic_insights: uniqueStrings([
      ...strategicInsights,
      topLikelihood >= 0.7 && topImpact >= 0.7 ? 'ترکیب احتمال و اثر در سناریوی برتر، cadence پایش و آمادگی را از حالت عادی فراتر می‌برد.' : undefined,
    ], 5),
    leverage_points: leveragePoints,
    critical_uncertainties: criticalUncertainties,
    actor_models: actorModels,
    scenario_support: scenarioSupport,
  };
}
