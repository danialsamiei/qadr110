import type { IntelligenceOntologyBundle } from '../domain/ontology';

export interface DefensiveWorkflowResult {
  workflowId: string;
  title: string;
  summary: string;
  supportingEventIds: string[];
  affectedGeographyIds: string[];
  recommendations: string[];
}

function pickTopEventIds(bundle: IntelligenceOntologyBundle, kind: string, limit = 5): string[] {
  return bundle.events.filter((event) => event.kind === kind).slice(0, limit).map((event) => event.id);
}

function pickTopGeographies(bundle: IntelligenceOntologyBundle, limit = 5): string[] {
  return bundle.geographies.slice(0, limit).map((geography) => geography.id);
}

export function analyzeBorderAnomalyMonitoring(bundle: IntelligenceOntologyBundle): DefensiveWorkflowResult {
  return {
    workflowId: 'border-anomaly-monitoring',
    title: 'پایش ناهنجاری مرزی',
    summary: `${pickTopEventIds(bundle, 'incident').length} سیگنال مرزی/رخدادی برای مرور سریع شناسایی شد.`,
    supportingEventIds: pickTopEventIds(bundle, 'incident'),
    affectedGeographyIds: pickTopGeographies(bundle),
    recommendations: [
      'رویدادهای مرزی را با watchlistهای محلی و تغییرات لجستیکی هم‌بسته کنید.',
      'افزایش ناگهانی ترافیک، قطعی زیرساخت یا روایت‌های متناقض را در یک timeline مشترک قرار دهید.',
    ],
  };
}

export function analyzeRouteDisruption(bundle: IntelligenceOntologyBundle): DefensiveWorkflowResult {
  return {
    workflowId: 'route-disruption-analysis',
    title: 'تحلیل اختلال مسیرهای هوایی و دریایی',
    summary: `${pickTopEventIds(bundle, 'aviation').length + pickTopEventIds(bundle, 'maritime').length} رخداد مسیرمحور برای تحلیل وجود دارد.`,
    supportingEventIds: [...pickTopEventIds(bundle, 'aviation'), ...pickTopEventIds(bundle, 'maritime')],
    affectedGeographyIds: pickTopGeographies(bundle),
    recommendations: [
      'مسیرهای جایگزین، گلوگاه‌ها و شدت هم‌زمانی اختلال‌ها را در اولویت قرار دهید.',
      'اطلاعات NOTAM/AIS را با گزارش‌های OSINT و هشدارهای زیرساختی تلفیق کنید.',
    ],
  };
}

export function analyzeInfrastructureOutageCorrelation(bundle: IntelligenceOntologyBundle): DefensiveWorkflowResult {
  return {
    workflowId: 'infrastructure-outage-correlation',
    title: 'هم‌بستگی اختلال زیرساخت',
    summary: `${pickTopEventIds(bundle, 'infrastructure').length} رخداد زیرساختی برای ارزیابی زنجیره اثر موجود است.`,
    supportingEventIds: pickTopEventIds(bundle, 'infrastructure'),
    affectedGeographyIds: pickTopGeographies(bundle),
    recommendations: [
      'زنجیره وابستگی انرژی، ارتباطات و حمل‌ونقل را کنار هم بررسی کنید.',
      'شدت اختلال را از سطح observation به resilience narrative قابل‌اقدام ترجمه کنید.',
    ],
  };
}

export function analyzeSanctionsShockMapping(bundle: IntelligenceOntologyBundle): DefensiveWorkflowResult {
  return {
    workflowId: 'sanctions-shock-mapping',
    title: 'نقشه‌برداری شوک تحریم و زنجیره تامین',
    summary: `${pickTopEventIds(bundle, 'economic').length} رخداد اقتصادی/تحریمی در bundle موجود است.`,
    supportingEventIds: pickTopEventIds(bundle, 'economic'),
    affectedGeographyIds: pickTopGeographies(bundle),
    recommendations: [
      'اثر تحریم را به تفکیک مسیر، کالا و بازیگر اقتصادی برآورد کنید.',
      'وابستگی‌های تک‌گلوگاهی را با سناریوهای کوتاه‌مدت و میان‌مدت کنار هم نمایش دهید.',
    ],
  };
}

export function analyzeMisinformationMapping(bundle: IntelligenceOntologyBundle): DefensiveWorkflowResult {
  return {
    workflowId: 'misinformation-mapping',
    title: 'نقشه‌برداری اطلاعات نادرست و نفوذ روایی',
    summary: `${pickTopEventIds(bundle, 'media').length} رخداد رسانه‌ای برای تحلیل روایی در دسترس است.`,
    supportingEventIds: pickTopEventIds(bundle, 'media'),
    affectedGeographyIds: pickTopGeographies(bundle),
    recommendations: [
      'ادعاهای کم‌پشتوانه را از facts و inference جدا نگه دارید.',
      'منابع state-affiliated و منابع مستقل را با confidence جداگانه مقایسه کنید.',
    ],
  };
}

export function analyzeHumanitarianStress(bundle: IntelligenceOntologyBundle): DefensiveWorkflowResult {
  return {
    workflowId: 'humanitarian-logistics-stress',
    title: 'پایش فشار بشردوستانه و لجستیکی',
    summary: `${pickTopEventIds(bundle, 'humanitarian').length + pickTopEventIds(bundle, 'logistics').length} رخداد لجستیکی/بشردوستانه برای ارزیابی موجود است.`,
    supportingEventIds: [...pickTopEventIds(bundle, 'humanitarian'), ...pickTopEventIds(bundle, 'logistics')],
    affectedGeographyIds: pickTopGeographies(bundle),
    recommendations: [
      'فشار بر توزیع، جابه‌جایی و زیرساخت‌های خدماتی را روی یک نقشه واحد بیاورید.',
      'داده‌های تحرک، قطع ارتباط و کمبودهای گزارش‌شده را با هم راستی‌آزمایی کنید.',
    ],
  };
}
