import {
  createConfidenceRecord,
  type AssistantDecisionSupport,
  type AssistantContextPacket,
  type AssistantProbabilityBand,
  type AssistantStructuredOutput,
} from '@/platform/ai/assistant-contracts';
import type { AssistantSessionContext } from '@/platform/ai/orchestrator-contracts';
import type { MapContextEnvelope } from '@/platform/operations/map-context';

import { buildScenarioDecisionSupport } from './scenario-decision-support';

export type ScenarioDomain =
  | 'geopolitics'
  | 'economics'
  | 'infrastructure'
  | 'public_sentiment'
  | 'cyber';

export type ScenarioImpactLevel = 'low' | 'medium' | 'high' | 'critical';
export type ScenarioUncertaintyLevel = 'low' | 'medium' | 'high';
export type ScenarioCausalStage = 'event' | 'reaction' | 'escalation' | 'outcome';
export type ScenarioConfidenceLevel = 'low' | 'medium' | 'high';
export type ScenarioTrendDirection = 'up' | 'down' | 'flat';
export type ScenarioSignalSource =
  | 'gdelt'
  | 'polymarket'
  | 'news-cluster'
  | 'social-sentiment'
  | 'nearby-signal'
  | 'map'
  | 'session-memory'
  | 'user-query'
  | 'osint';
export type ScenarioSignalPolarity = 'escalatory' | 'stabilizing' | 'neutral';
export type ScenarioDriftDirection = 'increase' | 'decrease' | 'emerged' | 'stabilized';

export interface ScenarioEngineCausalStep {
  stage: ScenarioCausalStage;
  summary: string;
  affected_domains: ScenarioDomain[];
}

export interface ScenarioEngineScenario {
  id: string;
  title: string;
  description: string;
  probability: AssistantProbabilityBand;
  probability_score?: number;
  impact_level: ScenarioImpactLevel;
  impact_score?: number;
  time_horizon: string;
  drivers: string[];
  causal_chain: ScenarioEngineCausalStep[];
  indicators_to_watch: string[];
  mitigation_options: string[];
  uncertainty_level: ScenarioUncertaintyLevel;
  second_order_effects: string[];
  cross_domain_impacts: Partial<Record<ScenarioDomain, string[]>>;
  strategic_relevance?: number;
  likelihood_score?: number;
  confidence_score?: number;
  confidence_level?: ScenarioConfidenceLevel;
  signal_agreement?: number;
  trend_direction?: ScenarioTrendDirection;
}

export interface ScenarioSignalRecord {
  id: string;
  source: ScenarioSignalSource;
  label: string;
  summary: string;
  strength: number;
  polarity: ScenarioSignalPolarity;
  domainWeights: Partial<Record<ScenarioDomain, number>>;
  occurredAt?: string;
  evidenceIds?: string[];
}

export interface ScenarioSignalFusionSummary {
  signalCount: number;
  sourceDiversity: number;
  agreement: number;
  anomalyScore: number;
  trendShift: boolean;
  dominantPolarity: 'escalatory' | 'stabilizing' | 'mixed' | 'neutral';
  sourceBreakdown: Partial<Record<ScenarioSignalSource, number>>;
}

export interface ScenarioTimelinePoint {
  timestamp: string;
  probabilityScore: number;
  impactScore: number;
  confidenceScore: number;
  reason: string;
  signalCount: number;
}

export interface ScenarioEngineComparison {
  leftId: string;
  rightId: string;
  likelihoodDelta: number;
  impactDelta: number;
  confidenceDelta: number;
  strategicDelta: number;
  strongerScenarioId: string;
  summary: string;
}

export interface ScenarioEngineDriftRecord {
  scenarioId: string;
  title: string;
  direction: ScenarioDriftDirection;
  previousProbability: number | null;
  currentProbability: number;
  delta: number;
  confidenceLevel: ScenarioConfidenceLevel;
  reason: string;
  signalLabels: string[];
  detectedAt: string;
}

export interface ScenarioEngineInput {
  trigger: string;
  query?: string;
  mapContext?: MapContextEnvelope | null;
  localContextPackets?: AssistantContextPacket[];
  sessionContext?: AssistantSessionContext | null;
  timeContext?: string;
  maxScenarios?: number;
}

export interface ScenarioEngineOutput {
  trigger: string;
  normalizedTrigger: string;
  anchorLabel: string;
  domainScores: Record<ScenarioDomain, number>;
  dataRichness: number;
  scenarios: ScenarioEngineScenario[];
  decisionSupport: AssistantDecisionSupport;
  structuredOutput: AssistantStructuredOutput;
  contextPackets: AssistantContextPacket[];
  sourceSummary: string[];
}

export interface ScenarioEngineState extends ScenarioEngineOutput {
  updatedAt: string;
  contextKey: string;
  inputSnapshot: ScenarioEngineInput;
  signals: ScenarioSignalRecord[];
  signalFusion: ScenarioSignalFusionSummary;
  timeline: Record<string, ScenarioTimelinePoint[]>;
  drift: ScenarioEngineDriftRecord[];
  compare: ScenarioEngineComparison | null;
}

export interface ScenarioEngineUpdateInput {
  previousState: ScenarioEngineState;
  newSignals: ScenarioSignalRecord[];
  query?: string;
  mapContext?: MapContextEnvelope | null;
  sessionContext?: AssistantSessionContext | null;
  timeContext?: string;
  reason?: string;
  maxScenarios?: number;
}

interface ScenarioTemplate {
  id: string;
  title: (trigger: string, anchor: string) => string;
  description: (trigger: string, anchor: string) => string;
  reaction: (trigger: string, anchor: string) => string;
  escalation: (trigger: string, anchor: string) => string;
  outcome: (trigger: string, anchor: string) => string;
  timeHorizon: string;
  baseLikelihood: number;
  baseImpact: number;
  uncertaintyBase: number;
  stabilizing?: boolean;
  domainBias: Record<ScenarioDomain, number>;
  driverSeeds: string[];
  indicatorSeeds: string[];
  mitigationSeeds: string[];
}

const DOMAIN_KEYWORDS: Record<ScenarioDomain, string[]> = {
  geopolitics: [
    'geopolit', 'strait', 'block', 'blockade', 'hormuz', 'border', 'navy', 'military', 'armed', 'regional', 'sanction',
    'ژئوپلیت', 'تنگه', 'مسدود', 'بسته', 'مرز', 'نظامی', 'منطقه', 'تحریم', 'دریایی', 'درگیری',
  ],
  economics: [
    'oil', 'gas', 'energy', 'market', 'shipping', 'trade', 'price', 'inflation', 'econom', 'commodity', 'insurance',
    'نفت', 'گاز', 'انرژی', 'بازار', 'تجارت', 'قیمت', 'تورم', 'اقتصاد', 'بیمه', 'کالا', 'ارز',
  ],
  infrastructure: [
    'port', 'route', 'logistics', 'traffic', 'outage', 'grid', 'supply chain', 'corridor', 'pipeline', 'transport',
    'بندر', 'مسیر', 'لجستیک', 'ترافیک', 'اختلال', 'زیرساخت', 'شبکه', 'زنجیره تامین', 'کریدور', 'حمل', 'خط لوله',
  ],
  public_sentiment: [
    'protest', 'public', 'narrative', 'misinformation', 'panic', 'sentiment', 'displacement', 'humanitarian',
    'اعتراض', 'افکار', 'روایت', 'اطلاعات نادرست', 'وحشت', 'احساسات', 'جابجایی', 'انسانی', 'اجتماعی',
  ],
  cyber: [
    'cyber', 'digital', 'communications', 'network', 'satcom', 'malware', 'outage', 'telecom', 'platform',
    'سایبر', 'دیجیتال', 'ارتباطات', 'شبکه', 'مخابرات', 'پلتفرم', 'خدمات آنلاین', 'اختلال دیجیتال',
  ],
};

const LAYER_HINTS: Partial<Record<string, ScenarioDomain[]>> = {
  polymarket: ['economics', 'geopolitics'],
  gdelt: ['geopolitics', 'public_sentiment'],
  osint: ['geopolitics', 'public_sentiment'],
  roadTraffic: ['infrastructure', 'economics'],
  ais: ['infrastructure', 'economics', 'geopolitics'],
  military: ['geopolitics', 'infrastructure'],
  protests: ['public_sentiment', 'geopolitics'],
  cyberThreats: ['cyber', 'infrastructure'],
  sanctions: ['economics', 'geopolitics'],
  outages: ['infrastructure', 'public_sentiment'],
  flights: ['infrastructure', 'geopolitics'],
};

const SIGNAL_HINTS: Array<{ match: string; domains: ScenarioDomain[] }> = [
  { match: 'riot', domains: ['public_sentiment', 'geopolitics'] },
  { match: 'protest', domains: ['public_sentiment', 'geopolitics'] },
  { match: 'traffic', domains: ['infrastructure', 'economics'] },
  { match: 'shipping', domains: ['infrastructure', 'economics'] },
  { match: 'cyber', domains: ['cyber', 'infrastructure'] },
  { match: 'military', domains: ['geopolitics', 'infrastructure'] },
  { match: 'sanction', domains: ['economics', 'geopolitics'] },
  { match: 'energy', domains: ['economics', 'infrastructure'] },
  { match: 'اعتراض', domains: ['public_sentiment', 'geopolitics'] },
  { match: 'ترافیک', domains: ['infrastructure', 'economics'] },
  { match: 'سایبر', domains: ['cyber', 'infrastructure'] },
  { match: 'نظامی', domains: ['geopolitics', 'infrastructure'] },
  { match: 'تحریم', domains: ['economics', 'geopolitics'] },
  { match: 'انرژی', domains: ['economics', 'infrastructure'] },
];

const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'contained-disruption',
    title: (_trigger, anchor) => `اختلال مهارشده در ${anchor}`,
    description: (trigger, anchor) => `سناریوی پایه این است که «${trigger}» در ${anchor} رخ دهد اما بازیگران اصلی با اقدامات محدودکننده، دامنه آن را مهار کنند و از تبدیل سریع آن به بحران گسترده‌تر جلوگیری شود.`,
    reaction: (trigger, anchor) => `پس از ${trigger}، بازیگران منطقه‌ای و نهادهای عملیاتی در ${anchor} روی مهار، بازآرایی مسیرها و پیام‌رسانی بازدارنده تمرکز می‌کنند.`,
    escalation: (_trigger, anchor) => `تشدید در ${anchor} محدود می‌ماند اما هزینه عملیاتی، تاخیر و ریسک ادراکی به‌صورت کنترل‌شده افزایش می‌یابد.`,
    outcome: (_trigger, anchor) => `پیامد نهایی در ${anchor} اختلال قابل‌مدیریت همراه با نیاز به پایش مستمر، نه فروپاشی فوری، خواهد بود.`,
    timeHorizon: 'ساعت‌ها تا چند روز',
    baseLikelihood: 0.64,
    baseImpact: 0.46,
    uncertaintyBase: 0.38,
    domainBias: { geopolitics: 0.72, economics: 0.46, infrastructure: 0.68, public_sentiment: 0.42, cyber: 0.22 },
    driverSeeds: ['سرعت واکنش اولیه', 'کارایی مسیرهای جایگزین', 'شدت واقعی اختلال', 'میزان پیام‌رسانی کنترل‌کننده'],
    indicatorSeeds: ['کاهش تراکم سیگنال‌های نزدیک', 'بازگشایی مسیرهای جایگزین', 'ثبات روایت رسمی', 'کاهش شکاف داده'],
    mitigationSeeds: ['پایش مسیرهای جایگزین', 'بررسی ظرفیت لجستیکی', 'رصد پیام‌های رسمی و نیمه‌رسمی', 'تثبیت watchlistهای کلیدی'],
  },
  {
    id: 'regional-security-escalation',
    title: (_trigger, anchor) => `تشدید امنیتی منطقه‌ای پیرامون ${anchor}`,
    description: (trigger, anchor) => `در این سناریو، «${trigger}» از یک رویداد منفرد عبور کرده و به واکنش‌های متقابل امنیتی/نظامی، افزایش posture دفاعی و ریسک spillover منطقه‌ای در ${anchor} منجر می‌شود.`,
    reaction: (trigger, anchor) => `پس از ${trigger}، بازیگران دولتی و امنیتی در ${anchor} posture خود را بازتنظیم کرده و سیگنال‌های بازدارندگی را افزایش می‌دهند.`,
    escalation: (_trigger, anchor) => `در ${anchor} احتمال تراکم واکنش‌های متقابل، خطای محاسباتی، و سخت‌تر شدن deconfliction افزایش می‌یابد.`,
    outcome: (_trigger, anchor) => `خروجی نهایی در ${anchor} می‌تواند افزایش فشار منطقه‌ای، گسترش پایش نظامی دفاعی و اختلال ثانویه در تجارت و لجستیک باشد.`,
    timeHorizon: 'چند روز تا دو هفته',
    baseLikelihood: 0.48,
    baseImpact: 0.82,
    uncertaintyBase: 0.44,
    domainBias: { geopolitics: 0.98, economics: 0.74, infrastructure: 0.58, public_sentiment: 0.48, cyber: 0.54 },
    driverSeeds: ['واکنش متقابل بازیگران امنیتی', 'شکست یا موفقیت deconfliction', 'شدت posture دفاعی', 'سطح پیام‌رسانی بازدارنده'],
    indicatorSeeds: ['افزایش تحرکات دفاعی', 'انباشت روایت‌های هشداردهنده', 'افزایش سیگنال‌های همگرا در GDELT/OSINT', 'افزایش هزینه بیمه/کشتیرانی'],
    mitigationSeeds: ['پایش خطوط تماس و deconfliction', 'رصد زیرساخت‌های حساس منطقه‌ای', 'پایش زنجیره تامین انرژی', 'بروزرسانی ماتریس spillover'],
  },
  {
    id: 'economic-spillover',
    title: (_trigger, anchor) => `شوک اقتصادی و کالایی مرتبط با ${anchor}`,
    description: (trigger, anchor) => `در این سناریو «${trigger}» سریع‌تر از بعد سیاسی، از مسیر قیمت، تجارت، بیمه، و انتظارات بازار به اقتصاد داخلی و منطقه‌ای متصل می‌شود و در ${anchor} یک شوک اقتصادی چندلایه می‌سازد.`,
    reaction: (trigger, anchor) => `پس از ${trigger}، بازارها در ${anchor} و پیرامون آن قیمت‌گذاری مجدد ریسک، تاخیر لجستیکی و هزینه‌های بیمه/حمل را آغاز می‌کنند.`,
    escalation: (_trigger, anchor) => `در ${anchor} اثرات دومرتبه‌ای شامل فشار ارزی، هزینه انرژی، کاهش قطعیت تجاری و اختلال در زنجیره تامین پدیدار می‌شود.`,
    outcome: (_trigger, anchor) => `خروجی نهایی در ${anchor} افزایش نوسان بازار، هزینه تجارت و نیاز به مداخله دفاعی-سیاستی برای مدیریت شوک خواهد بود.`,
    timeHorizon: 'ساعت‌ها تا چند هفته',
    baseLikelihood: 0.72,
    baseImpact: 0.78,
    uncertaintyBase: 0.34,
    domainBias: { geopolitics: 0.58, economics: 0.98, infrastructure: 0.76, public_sentiment: 0.38, cyber: 0.18 },
    driverSeeds: ['واکنش بازار انرژی', 'رفتار بیمه و حمل', 'گلوگاه‌های تجاری', 'واکنش ارز و دارایی‌های حساس'],
    indicatorSeeds: ['شکاف قیمتی انرژی', 'افزایش هزینه بیمه/حمل', 'فشار روی مسیرهای صادرات/واردات', 'همگرایی Polymarket با داده‌های خبری'],
    mitigationSeeds: ['پایش شوک قیمت و بیمه', 'شناسایی مسیرهای جایگزین تجارت', 'رصد موجودی و زمان‌بندی تامین', 'به‌روزرسانی برآورد تاب‌آوری اقتصادی'],
  },
  {
    id: 'infrastructure-strain',
    title: (_trigger, anchor) => `فشار زیرساختی و لجستیکی در ${anchor}`,
    description: (trigger, anchor) => `در این سناریو «${trigger}» بیش از هر چیز به گلوگاه‌های زیرساختی، مسیرهای تردد، بنادر، حمل‌ونقل و زنجیره لجستیک در ${anchor} فشار می‌آورد و اختلال‌های زنجیره‌ای ایجاد می‌کند.`,
    reaction: (trigger, anchor) => `پس از ${trigger}، اپراتورها و نهادهای عملیاتی در ${anchor} با افت ظرفیت، تاخیر و نیاز به rerouting مواجه می‌شوند.`,
    escalation: (_trigger, anchor) => `اگر فشار ادامه پیدا کند، در ${anchor} شکست‌های آبشاری، backlog و وابستگی متقابل زیرساخت‌ها آشکارتر می‌شود.`,
    outcome: (_trigger, anchor) => `نتیجه نهایی در ${anchor} کاهش throughput، فشار بر خدمات عمومی و افزایش حساسیت اقتصاد و امنیت به اختلال‌های ثانویه است.`,
    timeHorizon: 'چند ساعت تا یک هفته',
    baseLikelihood: 0.66,
    baseImpact: 0.74,
    uncertaintyBase: 0.33,
    domainBias: { geopolitics: 0.52, economics: 0.72, infrastructure: 0.99, public_sentiment: 0.41, cyber: 0.34 },
    driverSeeds: ['وابستگی متقابل بنادر و مسیرها', 'ظرفیت rerouting', 'ظرفیت خدمات عمومی', 'شدت تراکم و تاخیر'],
    indicatorSeeds: ['افزایش زمان عبور', 'تجمع backlog', 'کاهش throughput', 'افزایش اخطارهای outage و traffic'],
    mitigationSeeds: ['پایش گلوگاه‌های حیاتی', 'فعال‌سازی مسیرهای جایگزین', 'تفکیک dependencyهای حساس', 'اولویت‌بندی خدمات حیاتی'],
  },
  {
    id: 'social-sentiment-spillover',
    title: (_trigger, anchor) => `سرریز اجتماعی و روایی در ${anchor}`,
    description: (trigger, anchor) => `در این سناریو «${trigger}» به میدان ادراکی و اجتماعی سرریز می‌کند: افکار عمومی، روایت‌ها، اضطراب بازار و احتمال تجمع/اعتراض یا فشار اجتماعی در ${anchor} افزایش می‌یابد.`,
    reaction: (trigger, anchor) => `پس از ${trigger}، روایت‌های متضاد و سیگنال‌های احساسی در ${anchor} و شبکه‌های مرتبط تقویت می‌شوند.`,
    escalation: (_trigger, anchor) => `در ${anchor} اگر پیام‌رسانی رسمی و پوشش داده‌ای ضعیف باشد، شکاف ادراکی و رفتارهای واکنشی تشدید می‌شود.`,
    outcome: (_trigger, anchor) => `نتیجه نهایی در ${anchor} می‌تواند فشار بر خدمات عمومی، نوسان در اعتماد و افزایش نیاز به monitoring اجتماعی-اطلاعاتی باشد.`,
    timeHorizon: 'چند ساعت تا چند روز',
    baseLikelihood: 0.54,
    baseImpact: 0.58,
    uncertaintyBase: 0.42,
    domainBias: { geopolitics: 0.44, economics: 0.36, infrastructure: 0.34, public_sentiment: 0.98, cyber: 0.46 },
    driverSeeds: ['کیفیت روایت رسمی', 'شدت محتوای احساسی', 'تراکم نشانه‌های اجتماعی', 'پوشش رسانه‌ای و شبکه‌ای'],
    indicatorSeeds: ['افزایش روایت‌های متناقض', 'افزایش سیگنال‌های اعتراض/نارضایتی', 'رشد هشتگ‌ها یا ترندها', 'افزایش درخواست برای اطلاعات تکمیلی'],
    mitigationSeeds: ['پایش narrative و disinformation', 'تقویت راستی‌آزمایی', 'شناسایی شکاف داده و شایعه', 'رصد فشار بر خدمات عمومی'],
  },
  {
    id: 'cyber-pressure-wave',
    title: (_trigger, anchor) => `موج فشار سایبری و دیجیتال پیرامون ${anchor}`,
    description: (trigger, anchor) => `در این سناریو «${trigger}» فرصت یا انگیزه‌ای برای افزایش فشارهای سایبری/دیجیتال علیه سامانه‌های ارتباطی و زیرساختی مرتبط با ${anchor} ایجاد می‌کند؛ نه لزوماً به‌عنوان علت اولیه، بلکه به‌عنوان بهره‌برداری ثانویه.`,
    reaction: (trigger, anchor) => `پس از ${trigger}، در ${anchor} احتمال افزایش probing، اختلال خدمات، یا فشار بر کانال‌های ارتباطی و اطلاعاتی بالاتر می‌رود.`,
    escalation: (_trigger, anchor) => `اگر دفاع دیجیتال ضعیف باشد، در ${anchor} اختلال‌های محدود می‌تواند با اختلال لجستیکی و ادراکی هم‌زمان شود.`,
    outcome: (_trigger, anchor) => `پیامد نهایی در ${anchor} افزایش نیاز به hardening، redundancy و پایش هم‌زمان cyber + infrastructure است.`,
    timeHorizon: 'چند ساعت تا یک هفته',
    baseLikelihood: 0.42,
    baseImpact: 0.64,
    uncertaintyBase: 0.47,
    domainBias: { geopolitics: 0.56, economics: 0.28, infrastructure: 0.68, public_sentiment: 0.34, cyber: 0.99 },
    driverSeeds: ['سطح آماده‌باش سایبری', 'وابستگی دیجیتال زیرساخت', 'شدت جنگ روایت', 'پوشش و visibility سامانه‌های حساس'],
    indicatorSeeds: ['افزایش اخطارهای cyber', 'اختلال‌های ارتباطی موضعی', 'هم‌زمانی outage و سیگنال خبری', 'افزایش chatter دیجیتال'],
    mitigationSeeds: ['تقویت hardening و logging', 'پایش وابستگی‌های ارتباطی', 'فعال‌سازی redundancy دیجیتال', 'رصد هم‌زمان outage و cyber signal'],
  },
  {
    id: 'managed-de-escalation',
    title: (_trigger, anchor) => `مدیریت تنش و کاهش‌تشدید در ${anchor}`,
    description: (trigger, anchor) => `سناریوی کم‌احتمال اما راهبردی این است که «${trigger}» پس از شوک اولیه، از مسیر میانجی‌گری، مدیریت پیام و سازوکارهای محدودکننده در ${anchor} به کاهش‌تشدید و تثبیت نسبی منجر شود.`,
    reaction: (trigger, anchor) => `پس از ${trigger}، در ${anchor} کانال‌های دیپلماتیک و عملیاتی برای محدود کردن سرریز فعال می‌شوند.`,
    escalation: (_trigger, anchor) => `به‌جای زنجیره تشدید، در ${anchor} سیگنال‌های reassurance و مدیریت بحران جایگزین می‌شود.`,
    outcome: (_trigger, anchor) => `خروجی نهایی در ${anchor} می‌تواند تثبیت نسبی، کاهش نوسان بازار و افت سیگنال‌های پرخطر باشد؛ هرچند شکننده و وابسته به تداوم coordination است.`,
    timeHorizon: 'چند روز تا چند هفته',
    baseLikelihood: 0.34,
    baseImpact: 0.4,
    uncertaintyBase: 0.41,
    stabilizing: true,
    domainBias: { geopolitics: 0.82, economics: 0.54, infrastructure: 0.36, public_sentiment: 0.3, cyber: 0.18 },
    driverSeeds: ['کانال‌های میانجی‌گری', 'پایداری پیام‌های کاهنده تنش', 'انعطاف بازیگران کلیدی', 'وجود سازوکارهای deconfliction'],
    indicatorSeeds: ['افت سیگنال‌های همگرا', 'کاهش لحن هشداردهنده', 'بازگشت throughput', 'تثبیت قیمت‌ها و انتظارات'],
    mitigationSeeds: ['پایش نشانه‌های de-escalation', 'راستی‌آزمایی توافق‌های عملیاتی', 'رصد بازگشت جریان‌های تجاری', 'حفظ readiness تا تثبیت کامل'],
  },
];

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function roundScore(value: number): number {
  return Number(clamp(value).toFixed(2));
}

function roundSigned(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function confidenceLevel(score: number): ScenarioConfidenceLevel {
  if (score >= 0.72) return 'high';
  if (score >= 0.46) return 'medium';
  return 'low';
}

function inferSignalSource(text: string): ScenarioSignalSource {
  const normalized = normalizeText(text);
  if (normalized.includes('polymarket')) return 'polymarket';
  if (normalized.includes('gdelt')) return 'gdelt';
  if (normalized.includes('sentiment') || normalized.includes('social') || normalized.includes('اجتماع') || normalized.includes('افکار')) {
    return 'social-sentiment';
  }
  if (normalized.includes('osint')) return 'osint';
  return 'news-cluster';
}

function inferSignalPolarity(text: string): ScenarioSignalPolarity {
  const normalized = normalizeText(text);
  const escalatoryTerms = [
    'attack', 'strike', 'closure', 'block', 'blockade', 'disruption', 'anomaly', 'protest', 'riot', 'outage',
    'حمله', 'بستن', 'مسدود', 'انسداد', 'اختلال', 'اعتراض', 'ناآرام', 'قطع',
  ];
  const stabilizingTerms = [
    'de-escalation', 'ceasefire', 'diplomatic', 'stabiliz', 'mediation', 'reopen', 'recover',
    'کاهش تنش', 'آتش بس', 'میانجی', 'ثبات', 'بازگشایی', 'بازیابی',
  ];
  if (stabilizingTerms.some((term) => normalized.includes(normalizeText(term)))) return 'stabilizing';
  if (escalatoryTerms.some((term) => normalized.includes(normalizeText(term)))) return 'escalatory';
  return 'neutral';
}

function inferSignalDomainWeights(text: string): Partial<Record<ScenarioDomain, number>> {
  const weights: Partial<Record<ScenarioDomain, number>> = {};
  (Object.keys(DOMAIN_KEYWORDS) as ScenarioDomain[]).forEach((domain) => {
    const hits = keywordHits(text, DOMAIN_KEYWORDS[domain]);
    if (hits > 0) {
      weights[domain] = clamp(0.25 + (hits * 0.16));
    }
  });
  return weights;
}

function buildScenarioSignals(input: ScenarioEngineInput, anchorLabel: string): ScenarioSignalRecord[] {
  const signals: ScenarioSignalRecord[] = [];
  const pushSignal = (signal: ScenarioSignalRecord | null) => {
    if (!signal) return;
    if (signals.some((item) => item.id === signal.id)) return;
    signals.push(signal);
  };

  pushSignal({
    id: `scenario-signal:${slugify(input.trigger || anchorLabel)}:query`,
    source: 'user-query',
    label: input.trigger,
    summary: input.query?.trim() || input.trigger,
    strength: clamp(0.44 + (detectSeverity(input.trigger) * 0.36)),
    polarity: inferSignalPolarity(`${input.trigger} ${input.query || ''}`),
    domainWeights: inferSignalDomainWeights(`${input.trigger} ${input.query || ''}`),
  });

  (input.mapContext?.nearbySignals ?? []).slice(0, 8).forEach((signal, index) => {
    const severityBoost = signal.severity === 'high' ? 0.28 : signal.severity === 'medium' ? 0.16 : 0.08;
    const distancePenalty = clamp((320 - Math.min(320, signal.distanceKm ?? 160)) / 320, 0.1, 1);
    pushSignal({
      id: signal.id || `scenario-signal:nearby:${index}:${slugify(signal.label)}`,
      source: 'nearby-signal',
      label: signal.label,
      summary: signal.kind,
      strength: roundScore(clamp(0.24 + severityBoost + (distancePenalty * 0.32))),
      polarity: inferSignalPolarity(`${signal.label} ${signal.kind}`),
      domainWeights: inferSignalDomainWeights(`${signal.label} ${signal.kind}`),
      occurredAt: signal.occurredAt,
    });
  });

  (input.localContextPackets ?? []).slice(0, 10).forEach((packet, index) => {
    const body = `${packet.title} ${packet.summary} ${packet.sourceLabel}`;
    pushSignal({
      id: packet.id || `scenario-signal:packet:${index}:${slugify(packet.title)}`,
      source: inferSignalSource(body),
      label: packet.title,
      summary: packet.summary,
      strength: roundScore(clamp((packet.score ?? 0.55) * 0.95 + 0.08)),
      polarity: inferSignalPolarity(body),
      domainWeights: inferSignalDomainWeights(body),
      occurredAt: packet.updatedAt,
      evidenceIds: [packet.id],
    });
  });

  (input.sessionContext?.reusableInsights ?? []).slice(-4).forEach((insight, index) => {
    pushSignal({
      id: insight.id || `scenario-signal:session:${index}`,
      source: 'session-memory',
      label: insight.summary.slice(0, 80),
      summary: insight.summary,
      strength: roundScore(clamp(0.26 + ((insight.evidenceCardIds?.length ?? 0) * 0.05))),
      polarity: inferSignalPolarity(`${insight.summary} ${insight.relevanceTags?.join(' ') || ''}`),
      domainWeights: inferSignalDomainWeights(`${insight.summary} ${insight.relevanceTags?.join(' ') || ''}`),
      occurredAt: insight.createdAt,
      evidenceIds: insight.evidenceCardIds,
    });
  });

  if ((input.mapContext?.activeLayers ?? []).length > 0) {
    const layerText = `layers ${(input.mapContext?.activeLayers ?? []).join(' ')}`;
    pushSignal({
      id: `scenario-signal:map:${slugify(anchorLabel)}`,
      source: 'map',
      label: `لایه‌های فعال ${anchorLabel}`,
      summary: (input.mapContext?.activeLayers ?? []).join('، '),
      strength: roundScore(clamp(0.18 + (((input.mapContext?.activeLayers ?? []).length) * 0.05))),
      polarity: 'neutral',
      domainWeights: inferSignalDomainWeights(layerText),
    });
  }

  return signals.slice(0, 18);
}

function mergeScenarioSignals(existing: ScenarioSignalRecord[], incoming: ScenarioSignalRecord[]): ScenarioSignalRecord[] {
  const merged = new Map<string, ScenarioSignalRecord>();
  [...existing, ...incoming].forEach((signal) => {
    const key = signal.id || `${signal.source}:${slugify(signal.label)}`;
    const current = merged.get(key);
    if (!current || signal.strength >= current.strength) {
      merged.set(key, signal);
    }
  });
  return Array.from(merged.values())
    .sort((left, right) => (right.occurredAt || '').localeCompare(left.occurredAt || '') || right.strength - left.strength)
    .slice(0, 24);
}

function summarizeSignalFusion(signals: ScenarioSignalRecord[]): ScenarioSignalFusionSummary {
  const sourceBreakdown: Partial<Record<ScenarioSignalSource, number>> = {};
  let escalatory = 0;
  let stabilizing = 0;
  let neutral = 0;

  signals.forEach((signal) => {
    sourceBreakdown[signal.source] = (sourceBreakdown[signal.source] ?? 0) + 1;
    if (signal.polarity === 'escalatory') escalatory += signal.strength;
    else if (signal.polarity === 'stabilizing') stabilizing += signal.strength;
    else neutral += signal.strength;
  });

  const total = escalatory + stabilizing + neutral || 1;
  const dominantStrength = Math.max(escalatory, stabilizing, neutral);
  const agreement = clamp(dominantStrength / total);
  const anomalyScore = clamp(
    (Math.min(escalatory, stabilizing) / total) * 1.7
    + (Object.keys(sourceBreakdown).length >= 4 ? 0.12 : 0)
    + (signals.length >= 10 ? 0.08 : 0),
  );
  const dominantPolarity = agreement < 0.42
    ? 'mixed'
    : escalatory >= stabilizing && escalatory >= neutral
      ? 'escalatory'
      : stabilizing >= neutral
        ? 'stabilizing'
        : 'neutral';

  return {
    signalCount: signals.length,
    sourceDiversity: Object.keys(sourceBreakdown).length,
    agreement: roundScore(agreement),
    anomalyScore: roundScore(anomalyScore),
    trendShift: anomalyScore >= 0.42 || agreement <= 0.5,
    dominantPolarity,
    sourceBreakdown,
  };
}

function scenarioRelevantDomains(scenario: ScenarioEngineScenario): ScenarioDomain[] {
  const domains = Object.keys(scenario.cross_domain_impacts ?? {}) as ScenarioDomain[];
  if (domains.length > 0) return domains.slice(0, 3);
  return ['geopolitics', 'economics', 'infrastructure'];
}

function computeScenarioSignalSupport(
  scenario: ScenarioEngineScenario,
  signals: ScenarioSignalRecord[],
): { support: number; agreement: number; trend: ScenarioTrendDirection } {
  if (signals.length === 0) {
    return { support: 0.42, agreement: 0.42, trend: 'flat' };
  }
  const relevantDomains = scenarioRelevantDomains(scenario);
  const expectedPolarity: ScenarioSignalPolarity = scenario.id === 'managed-de-escalation' ? 'stabilizing' : 'escalatory';

  let weightedSupport = 0;
  let totalStrength = 0;
  let positive = 0;
  let negative = 0;

  signals.forEach((signal) => {
    const domainAlignment = relevantDomains.reduce((sum, domain) => sum + (signal.domainWeights[domain] ?? 0), 0) / relevantDomains.length;
    const polarityAlignment = signal.polarity === expectedPolarity ? 1 : signal.polarity === 'neutral' ? 0.56 : 0.18;
    const contribution = signal.strength * ((domainAlignment * 0.58) + (polarityAlignment * 0.42));
    weightedSupport += contribution;
    totalStrength += signal.strength;
    if (signal.polarity === expectedPolarity) positive += signal.strength;
    else if (signal.polarity !== 'neutral') negative += signal.strength;
  });

  const support = totalStrength > 0 ? clamp(weightedSupport / totalStrength) : 0.42;
  const agreement = totalStrength > 0 ? clamp(positive / Math.max(totalStrength, 0.0001)) : 0.42;
  const trend = positive - negative > 0.16 ? 'up' : negative - positive > 0.16 ? 'down' : 'flat';
  return { support: roundScore(support), agreement: roundScore(agreement), trend };
}

function buildScenarioConfidence(
  scenario: ScenarioEngineScenario,
  signals: ScenarioSignalRecord[],
  dataRichness: number,
  fusion: ScenarioSignalFusionSummary,
): { score: number; level: ScenarioConfidenceLevel; agreement: number; trend: ScenarioTrendDirection } {
  const support = computeScenarioSignalSupport(scenario, signals);
  const dataQuality = clamp((dataRichness * 0.72) + ((fusion.sourceDiversity / 6) * 0.28));
  const score = clamp(
    ((scenario.probability_score ?? 0.5) * 0.28)
    + (support.support * 0.34)
    + (dataQuality * 0.22)
    + (support.agreement * 0.1)
    + ((1 - fusion.anomalyScore) * 0.06),
  );
  return {
    score: roundScore(score),
    level: confidenceLevel(score),
    agreement: support.agreement,
    trend: support.trend,
  };
}

function buildScenarioTimelinePoint(
  scenario: ScenarioEngineScenario,
  signalCount: number,
  reason: string,
  timestamp: string,
): ScenarioTimelinePoint {
  return {
    timestamp,
    probabilityScore: roundScore(scenario.probability_score ?? 0.5),
    impactScore: roundScore(scenario.impact_score ?? 0.5),
    confidenceScore: roundScore(scenario.confidence_score ?? 0.5),
    reason,
    signalCount,
  };
}

function buildScenarioContextKey(input: ScenarioEngineInput, anchorLabel: string): string {
  return slugify([
    input.trigger,
    input.query,
    anchorLabel,
    ...(input.mapContext?.activeLayers ?? []).slice(0, 6),
    input.mapContext?.cacheKey,
  ].filter(Boolean).join('|'));
}

function toContextPacketsFromSignals(signals: ScenarioSignalRecord[]): AssistantContextPacket[] {
  return signals.slice(0, 8).map((signal) => ({
    id: signal.id,
    title: signal.label,
    summary: signal.summary,
    content: `${signal.label}\n${signal.summary}`,
    sourceLabel: signal.source,
    sourceType: signal.source === 'session-memory' ? 'manual' : 'feed',
    updatedAt: signal.occurredAt || new Date().toISOString(),
    score: signal.strength,
    tags: ['scenario-signal', signal.source, signal.polarity],
    provenance: {
      sourceIds: signal.evidenceIds ?? [signal.id],
      evidenceIds: signal.evidenceIds ?? [signal.id],
      derivedFromIds: signal.evidenceIds ?? [],
    },
  }));
}

function uniqueStrings(values: Array<string | undefined>, maxItems = 8): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    items.push(normalized);
    if (items.length >= maxItems) break;
  }
  return items;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'scenario';
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function keywordHits(text: string, keywords: string[]): number {
  const corpus = normalizeText(text);
  return keywords.reduce((count, keyword) => count + (corpus.includes(normalizeText(keyword)) ? 1 : 0), 0);
}

function detectSeverity(trigger: string): number {
  const normalized = normalizeText(trigger);
  const severeTerms = ['blocked', 'blockade', 'closure', 'closed', 'severe', 'major', 'attack', 'strike', 'مسدود', 'بسته', 'شدید', 'بزرگ', 'اختلال', 'انسداد', 'بستن'];
  const mediumTerms = ['delay', 'pressure', 'disruption', 'risk', 'تنش', 'فشار', 'تاخیر', 'ریسک'];
  let score = 0.34;
  for (const term of severeTerms) {
    if (normalized.includes(normalizeText(term))) score += 0.12;
  }
  for (const term of mediumTerms) {
    if (normalized.includes(normalizeText(term))) score += 0.05;
  }
  return clamp(score, 0.25, 0.95);
}

function deriveAnchorLabel(mapContext?: MapContextEnvelope | null): string {
  if (!mapContext) return 'این منطقه';
  const { selection } = mapContext;
  if (selection.kind === 'point') return selection.label || selection.countryName || 'نقطه انتخاب‌شده';
  if (selection.kind === 'country') return selection.countryName;
  if (selection.kind === 'polygon') return selection.label || 'محدوده انتخاب‌شده';
  if (selection.kind === 'layer') return selection.layerLabel || selection.layerId;
  return selection.label;
}

function buildContextCorpus(input: ScenarioEngineInput, anchorLabel: string): string {
  const packets = (input.localContextPackets ?? [])
    .slice(0, 10)
    .map((packet) => `${packet.title} ${packet.summary} ${packet.sourceLabel}`)
    .join(' ');
  const mapText = input.mapContext
    ? [
      anchorLabel,
      ...(input.mapContext.activeLayers ?? []),
      ...(input.mapContext.selectedEntities ?? []),
      ...(input.mapContext.geopoliticalContext ?? []),
      ...(input.mapContext.nearbySignals ?? []).map((signal) => `${signal.label} ${signal.kind}`),
    ].join(' ')
    : '';
  const sessionText = input.sessionContext
    ? [
      ...(input.sessionContext.intentHistory ?? []).slice(-3).map((intent) => `${intent.query} ${intent.inferredIntent}`),
      ...(input.sessionContext.reusableInsights ?? []).slice(-3).map((insight) => insight.summary),
    ].join(' ')
    : '';
  return [input.trigger, input.query || '', packets, mapText, sessionText].filter(Boolean).join(' ');
}

function deriveDomainScores(input: ScenarioEngineInput, anchorLabel: string): Record<ScenarioDomain, number> {
  const text = buildContextCorpus(input, anchorLabel);
  const scores: Record<ScenarioDomain, number> = {
    geopolitics: 0.12,
    economics: 0.12,
    infrastructure: 0.12,
    public_sentiment: 0.12,
    cyber: 0.08,
  };

  (Object.keys(DOMAIN_KEYWORDS) as ScenarioDomain[]).forEach((domain) => {
    scores[domain] += keywordHits(text, DOMAIN_KEYWORDS[domain]) * 0.08;
  });

  (input.mapContext?.activeLayers ?? []).forEach((layer) => {
    for (const domain of LAYER_HINTS[layer] ?? []) {
      scores[domain] += 0.14;
    }
  });

  (input.mapContext?.nearbySignals ?? []).forEach((signal) => {
    const haystack = `${signal.label} ${signal.kind}`.toLowerCase();
    SIGNAL_HINTS.forEach((hint) => {
      if (haystack.includes(hint.match.toLowerCase())) {
        hint.domains.forEach((domain) => {
          scores[domain] += 0.1;
        });
      }
    });
    if ((signal.severity || '').toLowerCase() === 'high') {
      scores.geopolitics += 0.03;
      scores.infrastructure += 0.03;
    }
  });

  (input.localContextPackets ?? []).forEach((packet) => {
    const haystack = `${packet.title} ${packet.summary} ${packet.sourceLabel}`.toLowerCase();
    SIGNAL_HINTS.forEach((hint) => {
      if (haystack.includes(hint.match.toLowerCase())) {
        hint.domains.forEach((domain) => {
          scores[domain] += 0.05;
        });
      }
    });
    if (haystack.includes('polymarket')) {
      scores.economics += 0.08;
      scores.geopolitics += 0.04;
    }
    if (haystack.includes('gdelt')) {
      scores.geopolitics += 0.06;
      scores.public_sentiment += 0.05;
    }
  });

  const sessionBoost = clamp(
    ((input.sessionContext?.reusableInsights.length ?? 0) * 0.04)
      + ((input.sessionContext?.intentHistory.length ?? 0) * 0.02),
    0,
    0.18,
  );
  scores.geopolitics += sessionBoost * 0.55;
  scores.economics += sessionBoost * 0.35;
  scores.infrastructure += sessionBoost * 0.25;
  scores.public_sentiment += sessionBoost * 0.25;
  scores.cyber += sessionBoost * 0.2;

  (Object.keys(scores) as ScenarioDomain[]).forEach((domain) => {
    scores[domain] = clamp(scores[domain], 0, 1);
  });

  return scores;
}

function deriveDataRichness(input: ScenarioEngineInput): number {
  const packetCount = input.localContextPackets?.length ?? 0;
  const signalCount = input.mapContext?.nearbySignals?.length ?? 0;
  const sessionCount = (input.sessionContext?.reusableInsights?.length ?? 0) + (input.sessionContext?.intentHistory?.length ?? 0);
  const layerCount = input.mapContext?.activeLayers?.length ?? 0;
  return clamp((packetCount * 0.055) + (signalCount * 0.07) + (sessionCount * 0.025) + (layerCount * 0.03) + (input.mapContext ? 0.12 : 0));
}

function scoreTemplate(
  template: ScenarioTemplate,
  domainScores: Record<ScenarioDomain, number>,
  severity: number,
  dataRichness: number,
  input: ScenarioEngineInput,
): { likelihood: number; impact: number; strategic: number; uncertainty: number; ranking: number } {
  const domainAlignment = (Object.keys(template.domainBias) as ScenarioDomain[])
    .reduce((total, domain) => total + (template.domainBias[domain] * domainScores[domain]), 0)
    / 5;
  const mapBonus = input.mapContext ? 0.06 : 0;
  const packetBonus = clamp((input.localContextPackets?.length ?? 0) * 0.01, 0, 0.08);

  const likelihood = clamp(
    template.baseLikelihood
      + (domainAlignment * 0.32)
      + (dataRichness * 0.14)
      + packetBonus
      + mapBonus
      + (template.stabilizing ? -severity * 0.09 : severity * 0.08),
  );
  const impact = clamp(
    template.baseImpact
      + (severity * 0.24)
      + (domainScores.infrastructure * 0.08)
      + (domainScores.economics * 0.08)
      + (domainScores.geopolitics * 0.1)
      - (template.stabilizing ? 0.12 : 0),
  );
  const strategic = clamp(
    (domainAlignment * 0.42)
      + (severity * 0.22)
      + (dataRichness * 0.18)
      + (mapBonus * 0.8)
      + (template.stabilizing ? 0.04 : 0.08),
  );
  const uncertainty = clamp(template.uncertaintyBase - (dataRichness * 0.2) + ((input.localContextPackets?.length ?? 0) === 0 ? 0.08 : 0));
  const ranking = clamp((likelihood * 0.38) + (impact * 0.26) + (strategic * 0.36));

  return { likelihood, impact, strategic, uncertainty, ranking };
}

function probabilityLabel(score: number): AssistantProbabilityBand {
  if (score >= 0.72) return 'high';
  if (score >= 0.42) return 'medium';
  return 'low';
}

function uncertaintyLabel(score: number): ScenarioUncertaintyLevel {
  if (score <= 0.3) return 'low';
  if (score <= 0.58) return 'medium';
  return 'high';
}

function impactLabel(score: number): ScenarioImpactLevel {
  if (score >= 0.82) return 'critical';
  if (score >= 0.66) return 'high';
  if (score >= 0.42) return 'medium';
  return 'low';
}

function topDomains(domainScores: Record<ScenarioDomain, number>, limit = 2): ScenarioDomain[] {
  return [...(Object.keys(domainScores) as ScenarioDomain[])]
    .sort((left, right) => domainScores[right] - domainScores[left])
    .slice(0, limit);
}

function buildCrossDomainImpacts(
  template: ScenarioTemplate,
  domainScores: Record<ScenarioDomain, number>,
  trigger: string,
  anchor: string,
): Partial<Record<ScenarioDomain, string[]>> {
  const impacts: Partial<Record<ScenarioDomain, string[]>> = {};
  const include = (domain: ScenarioDomain, value: string) => {
    impacts[domain] = [...(impacts[domain] ?? []), value];
  };

  if ((domainScores.geopolitics + template.domainBias.geopolitics) / 2 >= 0.45) {
    include('geopolitics', `در ${anchor}، ${trigger} می‌تواند محاسبات بازیگران و posture منطقه‌ای را بازتنظیم کند.`);
  }
  if ((domainScores.economics + template.domainBias.economics) / 2 >= 0.45) {
    include('economics', `در ${anchor}، اثرات قیمتی، بیمه‌ای و تجاری می‌تواند سریع‌تر از انتظار سرریز کند.`);
  }
  if ((domainScores.infrastructure + template.domainBias.infrastructure) / 2 >= 0.45) {
    include('infrastructure', `در ${anchor}، گلوگاه‌های حمل‌ونقل و زیرساختی نسبت به ${trigger} حساسیت بالاتری پیدا می‌کنند.`);
  }
  if ((domainScores.public_sentiment + template.domainBias.public_sentiment) / 2 >= 0.42) {
    include('public_sentiment', `در ${anchor}، روایت‌ها، اضطراب عمومی و فشار اجتماعی می‌تواند به اثر ثانویه مهم بدل شود.`);
  }
  if ((domainScores.cyber + template.domainBias.cyber) / 2 >= 0.38) {
    include('cyber', `در ${anchor}، اختلال‌های دیجیتال یا فشارهای سایبری می‌تواند به‌عنوان لایه مکمل بحران ظاهر شود.`);
  }

  return impacts;
}

function buildDrivers(template: ScenarioTemplate, input: ScenarioEngineInput, anchor: string): string[] {
  const signalDrivers = (input.mapContext?.nearbySignals ?? []).slice(0, 3).map((signal) => `${signal.label} (${signal.kind})`);
  const packetDrivers = (input.localContextPackets ?? []).slice(0, 3).map((packet) => `${packet.sourceLabel}: ${packet.title}`);
  const mapDrivers = input.mapContext?.activeLayers?.length
    ? [`لایه‌های فعال در ${anchor}: ${(input.mapContext.activeLayers ?? []).slice(0, 4).join('، ')}`]
    : [];

  return uniqueStrings([...template.driverSeeds, ...signalDrivers, ...packetDrivers, ...mapDrivers], 6);
}

function buildIndicators(template: ScenarioTemplate, input: ScenarioEngineInput): string[] {
  const signalIndicators = (input.mapContext?.nearbySignals ?? []).slice(0, 4).map((signal) => signal.occurredAt ? `${signal.label} | ${signal.kind} | ${signal.occurredAt}` : `${signal.label} | ${signal.kind}`);
  const packetIndicators = (input.localContextPackets ?? []).slice(0, 3).map((packet) => `${packet.title} | ${packet.sourceLabel}`);
  return uniqueStrings([...template.indicatorSeeds, ...signalIndicators, ...packetIndicators], 6);
}

function buildMitigations(template: ScenarioTemplate, anchor: string, topScenarioDomains: ScenarioDomain[]): string[] {
  const domainMitigations = topScenarioDomains.flatMap((domain) => {
    if (domain === 'geopolitics') return ['پایش deconfliction و سیگنال‌های posture دفاعی', `بازبینی spilloverهای منطقه‌ای مرتبط با ${anchor}`];
    if (domain === 'economics') return ['پایش قیمت، بیمه و هزینه حمل', 'به‌روزرسانی سنجه‌های شوک تجاری و ارزی'];
    if (domain === 'infrastructure') return ['شناسایی گلوگاه‌ها و dependencyهای حیاتی', 'رصد ظرفیت مسیرهای جایگزین و throughput'];
    if (domain === 'public_sentiment') return ['پایش روایت‌ها، شایعات و فشار اجتماعی', 'افزایش coverage برای شکاف‌های داده اجتماعی'];
    return ['تقویت hardening و logging دفاعی', 'پایش اختلال‌های هم‌زمان cyber + infrastructure'];
  });

  return uniqueStrings([...template.mitigationSeeds, ...domainMitigations], 6);
}

function buildSecondOrderEffects(impacts: Partial<Record<ScenarioDomain, string[]>>, anchor: string): string[] {
  const effects: string[] = [];
  if (impacts.economics) effects.push(`در ${anchor}، هزینه تجارت و بیمه می‌تواند رفتار بازیگران اقتصادی را تغییر دهد.`);
  if (impacts.infrastructure) effects.push(`در ${anchor}، backlog و تاخیر می‌تواند به افت خدمات عمومی و فشار بر زنجیره تامین منجر شود.`);
  if (impacts.public_sentiment) effects.push(`در ${anchor}، فشار اجتماعی می‌تواند روایت‌های متناقض و تقاضا برای اطلاعات تاییدشده را افزایش دهد.`);
  if (impacts.cyber) effects.push(`در ${anchor}، اختلال دیجیتال می‌تواند کیفیت visibility و سرعت تصمیم‌گیری را کاهش دهد.`);
  return uniqueStrings(effects, 4);
}

function buildCausalChain(
  template: ScenarioTemplate,
  trigger: string,
  anchor: string,
  domainScores: Record<ScenarioDomain, number>,
): ScenarioEngineCausalStep[] {
  const dominantDomains = topDomains(domainScores, 3);
  return [
    { stage: 'event', summary: `رخداد اولیه: ${trigger} در ${anchor} یا پیرامون آن به‌عنوان محرک سناریو ثبت می‌شود.`, affected_domains: dominantDomains },
    { stage: 'reaction', summary: template.reaction(trigger, anchor), affected_domains: dominantDomains },
    { stage: 'escalation', summary: template.escalation(trigger, anchor), affected_domains: dominantDomains },
    { stage: 'outcome', summary: template.outcome(trigger, anchor), affected_domains: dominantDomains },
  ];
}

function desiredScenarioCount(input: ScenarioEngineInput, dataRichness: number): number {
  const explicit = input.maxScenarios ?? (dataRichness >= 0.72 ? 6 : dataRichness >= 0.42 ? 5 : 4);
  return Math.max(3, Math.min(7, explicit));
}

function selectScenarioSet(candidates: Array<ScenarioEngineScenario & { _ranking: number }>, count: number): ScenarioEngineScenario[] {
  const selected = candidates.slice(0, count).map(({ _ranking, ...scenario }) => scenario);
  const hasStabilizing = selected.some((scenario) => scenario.id === 'managed-de-escalation');
  const stabilizing = candidates.find((scenario) => scenario.id === 'managed-de-escalation');
  if (!hasStabilizing && stabilizing && count >= 4) {
    const { _ranking, ...scenario } = stabilizing;
    selected[selected.length - 1] = scenario;
  }
  return selected;
}

function buildObservedSection(input: ScenarioEngineInput, anchor: string, sourceSummary: string[]) {
  const bullets = uniqueStrings([
    `محرک تحلیل: ${input.trigger}`,
    input.mapContext ? `کانتکست نقشه: ${anchor}` : undefined,
    ...(input.mapContext?.nearbySignals ?? []).slice(0, 4).map((signal) => `${signal.label} (${signal.kind})`),
    ...sourceSummary.slice(0, 4),
  ], 6);

  return {
    title: 'واقعیت‌های مشاهده‌شده',
    bullets,
    narrative: bullets.join('\n'),
    confidence: createConfidenceRecord(
      clamp(0.44 + (sourceSummary.length * 0.03) + ((input.mapContext?.nearbySignals?.length ?? 0) * 0.02)),
      'این بخش از trigger، کانتکست نقشه، سیگنال‌های نزدیک و بسته‌های OSINT/حافظه ساخته شده است.',
    ),
  };
}

function buildInferenceSection(anchor: string, domainScores: Record<ScenarioDomain, number>, trigger: string, dataRichness: number) {
  const sortedDomains = [...(Object.keys(domainScores) as ScenarioDomain[])].sort((left, right) => domainScores[right] - domainScores[left]);
  const bullets = [
    `بیشترین حساسیت در این تحلیل مربوط به ${sortedDomains[0]} و ${sortedDomains[1]} است.`,
    `پیامدهای ${trigger} در ${anchor} به‌صورت چنددامنه‌ای، نه تک‌بخشی، ظاهر می‌شود.`,
    dataRichness >= 0.5
      ? 'تراکم داده به‌اندازه‌ای هست که چند سناریوی plausible از هم تفکیک شوند.'
      : 'پوشش داده محدودتر است و سناریوها باید محافظه‌کارانه‌تر تفسیر شوند.',
  ];

  return {
    title: 'استنباط تحلیلی',
    bullets,
    narrative: `در ${anchor}، محرک «${trigger}» بیش از همه روی ابعاد ${sortedDomains.slice(0, 3).join('، ')} فشار می‌گذارد و زنجیره پیامدها را از حوزه ژئوپلیتیک به اقتصاد، زیرساخت، جامعه و فضای دیجیتال متصل می‌کند.`,
    confidence: createConfidenceRecord(clamp(0.48 + (dataRichness * 0.2)), 'استنباط تحلیلی بر اساس وزن‌دهی دامنه‌ها، سیگنال‌های نزدیک و history جلسه ساخته شده است.'),
  };
}

function buildUncertaintySection(input: ScenarioEngineInput, dataRichness: number) {
  const bullets = uniqueStrings([
    dataRichness < 0.35 ? 'پوشش داده محدود است و بعضی سناریوها به‌ناچار coarse هستند.' : undefined,
    input.localContextPackets?.length ? undefined : 'بسته‌های OSINT/دانش محلی برای این trigger کم هستند.',
    input.mapContext?.dataFreshness?.overallStatus === 'limited' || input.mapContext?.dataFreshness?.overallStatus === 'insufficient'
      ? 'تازگی/پوشش داده نقشه محدود است.'
      : undefined,
    'رفتار بازیگران کلیدی و زمان‌بندی واکنش‌ها می‌تواند ranking سناریوها را تغییر دهد.',
    'سیگنال‌های Polymarket/GDELT لزوماً causal نیستند و باید به‌عنوان indicator خوانده شوند.',
  ], 5);

  return {
    title: 'عدم‌قطعیت‌ها',
    bullets,
    narrative: bullets.join('\n'),
    confidence: createConfidenceRecord(clamp(0.32 + (dataRichness * 0.12)), 'عدم‌قطعیت از شکاف داده، محدودیت دید روی واکنش بازیگران و نوسان سیگنال‌ها ناشی می‌شود.'),
  };
}

function buildRecommendationsSection(scenarios: ScenarioEngineScenario[]) {
  return {
    title: 'توصیه‌های دفاعی',
    bullets: uniqueStrings(scenarios.flatMap((scenario) => scenario.mitigation_options), 6),
    narrative: 'اقدامات پیشنهادی بر پایش زودهنگام، حفظ visibility، حفاظت از زیرساخت و کاهش shockهای لجستیکی/اطلاعاتی متمرکز هستند.',
    confidence: createConfidenceRecord(0.58, 'این توصیه‌ها از هم‌پوشانی گزینه‌های کاهش اثر در سناریوهای برتر استخراج شده‌اند.'),
  };
}

function buildResilienceSection(anchor: string, scenarios: ScenarioEngineScenario[], domainScores: Record<ScenarioDomain, number>) {
  const top = scenarios[0];
  const bullets = uniqueStrings([
    top ? `سناریوی غالب «${top.title}» بیشترین فشار را بر ابعاد ${topDomains(domainScores, 3).join('، ')} می‌گذارد.` : undefined,
    domainScores.infrastructure >= 0.5 ? `در ${anchor}، گلوگاه‌های زیرساختی باید به‌عنوان locus اصلی تاب‌آوری دیده شوند.` : undefined,
    domainScores.economics >= 0.5 ? `در ${anchor}، shock اقتصادی و بیمه/حمل می‌تواند سرعت بازیابی را تعیین کند.` : undefined,
    domainScores.public_sentiment >= 0.45 ? `در ${anchor}، روایت‌ها و فشار اجتماعی بخشی از resilience picture هستند.` : undefined,
    domainScores.cyber >= 0.38 ? `در ${anchor}، بعد دیجیتال/سایبری یک accelerator برای cascadeها است.` : undefined,
  ], 5);

  return {
    title: 'روایت تاب‌آوری',
    bullets,
    narrative: `تاب‌آوری ${anchor} در برابر این trigger به ظرفیت نگهداشت throughput، مدیریت روایت، مهار shockهای اقتصادی و حفظ visibility دیجیتال وابسته است.`,
    confidence: createConfidenceRecord(0.54, 'روایت تاب‌آوری از هم‌پوشانی دامنه‌های غالب و سناریوهای برتر جمع‌بندی شده است.'),
  };
}

function buildFollowUps(scenarios: ScenarioEngineScenario[], anchor: string): string[] {
  return uniqueStrings([
    ...scenarios.slice(0, 2).map((scenario) => `شاخص‌های هشدار سناریوی «${scenario.title}» را برای ${anchor} پایش کن.`),
    ...scenarios.slice(0, 2).map((scenario) => `اثر اقتصادی و لجستیکی سناریوی «${scenario.title}» را کمی‌سازی کن.`),
    'همگرایی GDELT / Polymarket / سیگنال‌های نقشه را دوباره بررسی کن.',
    'ماتریس بازیگران و شرایط ابطال سناریوها را به‌روزرسانی کن.',
  ], 5);
}

function buildSourceSummary(input: ScenarioEngineInput): string[] {
  return uniqueStrings([
    ...(input.localContextPackets ?? []).slice(0, 6).map((packet) => `${packet.sourceLabel}: ${packet.title}`),
    ...(input.mapContext?.nearbySignals ?? []).slice(0, 4).map((signal) => `Map signal: ${signal.label}`),
    ...(input.sessionContext?.reusableInsights ?? []).slice(-3).map((insight) => `Session: ${insight.summary}`),
  ], 8);
}

function buildScenarioContextPackets(
  scenarios: ScenarioEngineScenario[],
  trigger: string,
  anchor: string,
  derivedFromIds: string[],
): AssistantContextPacket[] {
  const baseId = `scenario-engine:${slugify(`${trigger}:${anchor}`)}`;
  const summaryPacket: AssistantContextPacket = {
    id: `${baseId}:summary`,
    title: `خلاصه موتور سناریو برای ${anchor}`,
    summary: `سناریوهای محتمل برای «${trigger}» با محوریت ${anchor} تولید شدند.`,
    content: scenarios.map((scenario) => `${scenario.title}: ${scenario.description}`).join('\n\n'),
    sourceLabel: 'QADR110 Scenario Engine',
    sourceType: 'model',
    updatedAt: new Date().toISOString(),
    score: 0.7,
    tags: ['scenario-engine', 'causal-chain', 'defensive'],
    provenance: {
      sourceIds: [`${baseId}:source`],
      evidenceIds: [`${baseId}:summary`],
      derivedFromIds,
    },
  };

  const scenarioPackets = scenarios.slice(0, 3).map((scenario) => ({
    id: `${baseId}:${scenario.id}`,
    title: scenario.title,
    summary: `${scenario.description} | احتمال ${scenario.probability} | اثر ${scenario.impact_level}`,
    content: [
      scenario.description,
      `Drivers: ${scenario.drivers.join(' | ')}`,
      `Indicators: ${scenario.indicators_to_watch.join(' | ')}`,
      `Mitigations: ${scenario.mitigation_options.join(' | ')}`,
    ].join('\n'),
    sourceLabel: 'QADR110 Scenario Engine',
    sourceType: 'model' as const,
    updatedAt: new Date().toISOString(),
    score: clamp((scenario.strategic_relevance ?? 0.5) * 0.9, 0.4, 0.9),
    tags: ['scenario-engine', scenario.impact_level],
    provenance: {
      sourceIds: [`${baseId}:source`],
      evidenceIds: [`${baseId}:${scenario.id}`],
      derivedFromIds,
    },
  }));

  return [summaryPacket, ...scenarioPackets];
}

function mergeContextPackets(
  primary: AssistantContextPacket[],
  secondary: AssistantContextPacket[],
): AssistantContextPacket[] {
  const merged = new Map<string, AssistantContextPacket>();
  [...primary, ...secondary].forEach((packet) => {
    merged.set(packet.id, packet);
  });
  return Array.from(merged.values()).slice(0, 18);
}

function detectScenarioDrift(
  previousState: ScenarioEngineState,
  nextScenarios: ScenarioEngineScenario[],
  timestamp: string,
  reason: string,
  signals: ScenarioSignalRecord[],
): ScenarioEngineDriftRecord[] {
  const previousById = new Map(previousState.scenarios.map((scenario) => [scenario.id, scenario] as const));
  const drifts: ScenarioEngineDriftRecord[] = [];

  nextScenarios.forEach((scenario) => {
    const previous = previousById.get(scenario.id);
    const currentProbability = scenario.probability_score ?? 0.5;
    const previousProbability = previous?.probability_score ?? null;
    const delta = previousProbability === null ? currentProbability : currentProbability - previousProbability;

    let direction: ScenarioDriftDirection | null = null;
    if (!previous) {
      direction = 'emerged';
    } else if (scenario.id === 'managed-de-escalation' && delta >= 0.06) {
      direction = 'stabilized';
    } else if (delta >= 0.08) {
      direction = 'increase';
    } else if (delta <= -0.08) {
      direction = 'decrease';
    }

    if (!direction) return;
    drifts.push({
      scenarioId: scenario.id,
      title: scenario.title,
      direction,
      previousProbability: previousProbability !== null ? roundScore(previousProbability) : null,
      currentProbability: roundScore(currentProbability),
      delta: roundScore(Math.abs(delta)),
      confidenceLevel: scenario.confidence_level ?? confidenceLevel(scenario.confidence_score ?? 0.5),
      reason,
      signalLabels: signals.slice(0, 4).map((signal) => signal.label),
      detectedAt: timestamp,
    });
  });

  return drifts.slice(0, 5);
}

function buildScenarioEngineOutput(
  input: ScenarioEngineInput,
  prebuiltSignals?: ScenarioSignalRecord[],
): ScenarioEngineOutput {
  const trigger = input.trigger.trim() || input.query?.trim() || 'اختلال راهبردی در یک گلوگاه حساس';
  const anchorLabel = deriveAnchorLabel(input.mapContext);
  const severity = detectSeverity(trigger);
  const domainScores = deriveDomainScores(input, anchorLabel);
  const dataRichness = deriveDataRichness(input);

  const candidates = SCENARIO_TEMPLATES.map((template) => {
    const scores = scoreTemplate(template, domainScores, severity, dataRichness, input);
    const blendedDomains = (Object.keys(domainScores) as ScenarioDomain[]).reduce((acc, domain) => {
      acc[domain] = clamp((domainScores[domain] + template.domainBias[domain]) / 2);
      return acc;
    }, {} as Record<ScenarioDomain, number>);
    const dominantDomains = topDomains(blendedDomains, 3);
    const impacts = buildCrossDomainImpacts(template, domainScores, trigger, anchorLabel);

    return {
      id: template.id,
      title: template.title(trigger, anchorLabel),
      description: template.description(trigger, anchorLabel),
      probability: probabilityLabel(scores.likelihood),
      probability_score: Number(scores.likelihood.toFixed(2)),
      impact_level: impactLabel(scores.impact),
      impact_score: Number(scores.impact.toFixed(2)),
      time_horizon: template.timeHorizon,
      drivers: buildDrivers(template, input, anchorLabel),
      causal_chain: buildCausalChain(template, trigger, anchorLabel, domainScores),
      indicators_to_watch: buildIndicators(template, input),
      mitigation_options: buildMitigations(template, anchorLabel, dominantDomains),
      uncertainty_level: uncertaintyLabel(scores.uncertainty),
      second_order_effects: buildSecondOrderEffects(impacts, anchorLabel),
      cross_domain_impacts: impacts,
      strategic_relevance: Number(scores.strategic.toFixed(2)),
      likelihood_score: Number(scores.likelihood.toFixed(2)),
      _ranking: scores.ranking,
    };
  }).sort((left, right) => right._ranking - left._ranking);

  const initialScenarios = selectScenarioSet(candidates, desiredScenarioCount(input, dataRichness));
  const signals = prebuiltSignals ?? buildScenarioSignals(input, anchorLabel);
  const signalFusion = summarizeSignalFusion(signals);
  const scenarios = initialScenarios.map((scenario) => {
    const confidence = buildScenarioConfidence(scenario, signals, dataRichness, signalFusion);
    return {
      ...scenario,
      confidence_score: confidence.score,
      confidence_level: confidence.level,
      signal_agreement: confidence.agreement,
      trend_direction: confidence.trend,
    };
  });
  const sourceSummary = buildSourceSummary(input);
  const derivedFromIds = uniqueStrings((input.localContextPackets ?? []).map((packet) => packet.id), 12);
  const comparison = scenarios.length >= 2 ? compareScenarios(scenarios[0]!, scenarios[1]!) : null;
  const decisionSupport = buildScenarioDecisionSupport({
    trigger,
    anchorLabel,
    scenarios,
    domainScores,
    mapContext: input.mapContext,
    sessionContext: input.sessionContext ?? null,
    comparison,
  });

  const structuredOutput: AssistantStructuredOutput = {
    reportTitle: `موتور سناریو: اگر ${trigger} رخ دهد`,
    executiveSummary: `برای ${anchorLabel}، موتور سناریو ${scenarios.length} مسیر plausible تولید کرد. محتمل‌ترین سناریو «${scenarios[0]?.title ?? 'نامشخص'}» است، اما از نظر اثر راهبردی، چند زنجیره موازی در حوزه‌های ژئوپلیتیک، اقتصاد، زیرساخت، افکار عمومی و سایبر باید هم‌زمان پایش شوند.`,
    observedFacts: buildObservedSection(input, anchorLabel, sourceSummary),
    analyticalInference: buildInferenceSection(anchorLabel, domainScores, trigger, dataRichness),
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      probability: scenario.probability,
      timeframe: scenario.time_horizon,
      time_horizon: scenario.time_horizon,
      description: scenario.description,
      indicators: [...scenario.indicators_to_watch],
      indicators_to_watch: [...scenario.indicators_to_watch],
      drivers: [...scenario.drivers],
      causal_chain: [...scenario.causal_chain],
      mitigation_options: [...scenario.mitigation_options],
      impact_level: scenario.impact_level,
      impact_score: scenario.impact_score,
      probability_score: scenario.probability_score,
      uncertainty_level: scenario.uncertainty_level,
      second_order_effects: [...scenario.second_order_effects],
      cross_domain_impacts: { ...scenario.cross_domain_impacts },
      strategic_relevance: scenario.strategic_relevance,
      likelihood_score: scenario.likelihood_score,
      confidence: createConfidenceRecord(
        scenario.confidence_score ?? clamp(((scenario.probability_score ?? 0.5) * 0.56) + ((scenario.strategic_relevance ?? 0.5) * 0.24) + ((scenario.uncertainty_level === 'high' ? 0.3 : scenario.uncertainty_level === 'medium' ? 0.5 : 0.75) * 0.2)),
        'سطح اطمینان سناریو از likelihood، کیفیت داده و میزان همگرایی سیگنال‌ها به‌دست آمده است.',
      ),
    })),
    decisionSupport,
    uncertainties: buildUncertaintySection(input, dataRichness),
    recommendations: buildRecommendationsSection(scenarios),
    resilienceNarrative: buildResilienceSection(anchorLabel, scenarios, domainScores),
    followUpSuggestions: buildFollowUps(scenarios, anchorLabel),
  };

  return {
    trigger,
    normalizedTrigger: slugify(trigger),
    anchorLabel,
    domainScores,
    dataRichness: Number(dataRichness.toFixed(2)),
    scenarios,
    decisionSupport,
    structuredOutput,
    contextPackets: buildScenarioContextPackets(scenarios, trigger, anchorLabel, derivedFromIds),
    sourceSummary,
  };
}

export function runScenarioEngine(input: ScenarioEngineInput): ScenarioEngineOutput {
  return buildScenarioEngineOutput(input);
}

export function compareScenarios(
  left: ScenarioEngineScenario,
  right: ScenarioEngineScenario,
): ScenarioEngineComparison {
  const likelihoodDelta = roundSigned((left.probability_score ?? 0.5) - (right.probability_score ?? 0.5));
  const impactDelta = roundSigned((left.impact_score ?? 0.5) - (right.impact_score ?? 0.5));
  const confidenceDelta = roundSigned((left.confidence_score ?? 0.5) - (right.confidence_score ?? 0.5));
  const strategicDelta = roundSigned((left.strategic_relevance ?? 0.5) - (right.strategic_relevance ?? 0.5));
  const strongerScenarioId = (
    ((left.probability_score ?? 0.5) * 0.4)
    + ((left.impact_score ?? 0.5) * 0.3)
    + ((left.confidence_score ?? 0.5) * 0.3)
  ) >= (
    ((right.probability_score ?? 0.5) * 0.4)
    + ((right.impact_score ?? 0.5) * 0.3)
    + ((right.confidence_score ?? 0.5) * 0.3)
  ) ? left.id : right.id;

  return {
    leftId: left.id,
    rightId: right.id,
    likelihoodDelta,
    impactDelta,
    confidenceDelta,
    strategicDelta,
    strongerScenarioId,
    summary: `در مقایسه «${left.title}» و «${right.title}»، سناریوی ${strongerScenarioId === left.id ? 'اول' : 'دوم'} از نظر ترکیب احتمال، اثر و اطمینان جلوتر است.`,
  };
}

export function getScenarios(input: ScenarioEngineInput): ScenarioEngineState {
  const output = buildScenarioEngineOutput(input);
  const signals = buildScenarioSignals(input, output.anchorLabel);
  const signalFusion = summarizeSignalFusion(signals);
  const updatedAt = input.timeContext || new Date().toISOString();

  return {
    ...output,
    updatedAt,
    contextKey: buildScenarioContextKey(input, output.anchorLabel),
    inputSnapshot: {
      ...input,
      localContextPackets: [...(input.localContextPackets ?? [])],
    },
    signals,
    signalFusion,
    timeline: Object.fromEntries(
      output.scenarios.map((scenario) => [
        scenario.id,
        [buildScenarioTimelinePoint(scenario, signals.length, 'initial', updatedAt)],
      ]),
    ),
    drift: [],
    compare: output.scenarios.length >= 2 ? compareScenarios(output.scenarios[0]!, output.scenarios[1]!) : null,
  };
}

export function updateScenarios(update: ScenarioEngineUpdateInput): ScenarioEngineState {
  const previousState = update.previousState;
  const mergedSignals = mergeScenarioSignals(previousState.signals, update.newSignals);
  const nextInput: ScenarioEngineInput = {
    ...previousState.inputSnapshot,
    query: update.query ?? previousState.inputSnapshot.query,
    mapContext: update.mapContext ?? previousState.inputSnapshot.mapContext,
    sessionContext: update.sessionContext ?? previousState.inputSnapshot.sessionContext,
    timeContext: update.timeContext ?? new Date().toISOString(),
    maxScenarios: update.maxScenarios ?? previousState.inputSnapshot.maxScenarios,
  };

  nextInput.localContextPackets = mergeContextPackets(
    nextInput.localContextPackets ?? [],
    toContextPacketsFromSignals(mergedSignals),
  );

  const output = buildScenarioEngineOutput(nextInput, mergedSignals);
  const updatedAt = nextInput.timeContext || new Date().toISOString();
  const drift = detectScenarioDrift(
    previousState,
    output.scenarios,
    updatedAt,
    update.reason || 'signals-updated',
    mergedSignals,
  );
  const timeline: Record<string, ScenarioTimelinePoint[]> = {};
  output.scenarios.forEach((scenario) => {
    const previousTimeline = previousState.timeline[scenario.id] ?? [];
    timeline[scenario.id] = [
      ...previousTimeline.slice(-11),
      buildScenarioTimelinePoint(
        scenario,
        mergedSignals.length,
        update.reason || 'signals-updated',
        updatedAt,
      ),
    ];
  });

  return {
    ...output,
    updatedAt,
    contextKey: buildScenarioContextKey(nextInput, output.anchorLabel),
    inputSnapshot: nextInput,
    signals: mergedSignals,
    signalFusion: summarizeSignalFusion(mergedSignals),
    timeline,
    drift,
    compare: output.scenarios.length >= 2 ? compareScenarios(output.scenarios[0]!, output.scenarios[1]!) : null,
  };
}
