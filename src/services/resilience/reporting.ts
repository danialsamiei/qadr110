import type {
  ResilienceDashboardModel,
  ResilienceReportChart,
  ResilienceReportType,
  ResilienceStructuredReport,
} from './types';
import { describeResilienceBand, getResilienceDashboardModel, getResilienceMethodologySummary } from './engine';

const SPILLOVER_CHANNEL_LABELS = {
  border: 'مرزی',
  trade: 'تجاری',
  energy: 'انرژی',
  migration: 'مهاجرتی',
  information: 'اطلاعاتی',
  security: 'امنیتی',
  logistics: 'لجستیکی',
} as const;

function describeSpilloverChannel(channel: keyof typeof SPILLOVER_CHANNEL_LABELS): string {
  return SPILLOVER_CHANNEL_LABELS[channel] || channel;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function summarizeStrengths(model: ResilienceDashboardModel): string[] {
  return model.primary.dimensionOrder
    .map((id) => model.primary.dimensions[id])
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((dimension) => `${dimension.label} (${dimension.score})`);
}

function summarizeWeaknesses(model: ResilienceDashboardModel): string[] {
  return model.primary.dimensionOrder
    .map((id) => model.primary.dimensions[id])
    .sort((left, right) => left.score - right.score)
    .slice(0, 4)
    .map((dimension) => `${dimension.label} (${dimension.score})`);
}

function buildExecutiveSummary(model: ResilienceDashboardModel, type: ResilienceReportType): string {
  const primary = model.primary;
  const peers = model.rankedRows.filter((row) => row.countryCode !== primary.countryCode);
  const betterPeers = peers.filter((row) => row.overall > primary.composite.score).length;
  const weakerPeers = peers.filter((row) => row.overall < primary.composite.score).length;
  const bandLabel = describeResilienceBand(primary.composite.score);
  const prefix = type === 'international-economic'
    ? `این گزارش بر تاب‌آوری اقتصادی بین‌المللی ${primary.countryName} تمرکز دارد.`
    : type === 'scenario-forecast'
      ? `این گزارش برای سناریوسنجی تاب‌آوری ${primary.countryName} تهیه شده است.`
      : `این گزارش، تاب‌آوری ${primary.countryName} را در قیاس با همتایان منتخب نشان می‌دهد.`;
  return `${prefix} امتیاز کل فعلی ${primary.composite.score} و وضعیت «${bandLabel}» است. در مجموعه مقایسه، ${betterPeers} کشور بالاتر و ${weakerPeers} کشور پایین‌تر از ${primary.countryName} قرار گرفته‌اند. پوشش داده ${primary.coverage.coveragePercent}% و سهم داده زنده ${Math.round(primary.composite.liveShare * 100)}% است.`;
}

function buildCharts(): ResilienceReportChart[] {
  return [
    {
      id: 'trend-series',
      title: 'روند ۱۲ماهه',
      kind: 'time-series',
      caption: 'سری زمانی برای مقایسه جهت حرکت و نه داده ثبتی کامل.',
    },
    {
      id: 'dimension-radar',
      title: 'رادار ابعاد',
      kind: 'radar',
      caption: 'تصویر چندبعدی از قوت‌ها و گلوگاه‌ها در ۱۴ بعد.',
    },
    {
      id: 'comparison-heatmap',
      title: 'نقشه گرمایی مقایسه کشورها',
      kind: 'heatmap',
      caption: 'مقایسه مستقیم ابعاد و پوشش داده در کشورها.',
    },
    {
      id: 'ranked-bars',
      title: 'رتبه‌بندی مقایسه‌ای',
      kind: 'ranked-bars',
      caption: 'مقایسه مستقیم رتبه کشورها در شاخص کل تاب‌آوری.',
    },
    {
      id: 'comparison-table',
      title: 'جدول مقایسه کشورها',
      kind: 'table',
      caption: 'خلاصه نقاط اتکا، گلوگاه‌ها و اختلاف با کشور اصلی.',
    },
    {
      id: 'slope-view',
      title: 'نمای تغییر دوره‌ای',
      kind: 'slope',
      caption: 'مقایسه نقطه شروع و پایان بازه برای تشخیص جهت حرکت.',
    },
    {
      id: 'spillover-network',
      title: 'شبکه سرریز و همجواری',
      kind: 'spillover-network',
      caption: 'نمای کانال‌های سرریز مرزی، تجاری، انرژی و لجستیک.',
    },
    {
      id: 'stress-matrix',
      title: 'ماتریس تنش سناریویی',
      kind: 'stress-matrix',
      caption: 'اثر سناریوهای تحریمی، مرزی، انرژی و اقلیمی بر شاخص کل.',
    },
  ];
}

function formatBullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function buildMarkdown(report: Omit<ResilienceStructuredReport, 'markdown' | 'html'>): string {
  return [
    `# ${report.title}`,
    '',
    report.executiveSummary,
    '',
    `## ${report.baselineFacts.title}`,
    report.baselineFacts.body,
    '',
    formatBullets(report.baselineFacts.bullets),
    '',
    `## ${report.indicators.title}`,
    report.indicators.body,
    '',
    formatBullets(report.indicators.bullets),
    '',
    `## ${report.analyticalInterpretation.title}`,
    report.analyticalInterpretation.body,
    '',
    formatBullets(report.analyticalInterpretation.bullets),
    '',
    `## ${report.risks.title}`,
    report.risks.body,
    '',
    formatBullets(report.risks.bullets),
    '',
    `## ${report.scenarios.title}`,
    report.scenarios.body,
    '',
    formatBullets(report.scenarios.bullets),
    '',
    `## ${report.uncertainty.title}`,
    report.uncertainty.body,
    '',
    formatBullets(report.uncertainty.bullets),
    '',
    `## ${report.monitoringPriorities.title}`,
    report.monitoringPriorities.body,
    '',
    formatBullets(report.monitoringPriorities.bullets),
    '',
    `## ${report.technicalAppendix.title}`,
    report.technicalAppendix.body,
    '',
    formatBullets(report.technicalAppendix.bullets),
    '',
    '## نمودارها',
    report.charts.map((chart) => `- ${chart.title}: ${chart.caption}`).join('\n'),
    '',
    '## خلاصه منابع',
    report.sourceSummary.map((item) => `- ${item}`).join('\n'),
    '',
    '## روش',
    report.methodology,
  ].join('\n');
}

function buildHtml(report: Omit<ResilienceStructuredReport, 'markdown' | 'html'>): string {
  const renderSection = (title: string, body: string, bullets: string[]) => `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(body)}</p>
      <ul>${bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>
    </section>
  `;

  return `<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(report.title)}</title>
    <style>
      body { font-family: Tahoma, sans-serif; margin: 32px; background: #f8fafc; color: #0f172a; line-height: 1.9; }
      h1, h2 { color: #0b1f3a; }
      section { background: white; border: 1px solid #d8dee9; border-radius: 14px; padding: 16px; margin-bottom: 18px; }
      ul { padding-right: 20px; }
      .meta { color: #475569; margin-bottom: 20px; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(report.title)}</h1>
    <div class="meta">${escapeHtml(report.generatedAt)}</div>
    <section><p>${escapeHtml(report.executiveSummary)}</p></section>
    ${renderSection(report.baselineFacts.title, report.baselineFacts.body, report.baselineFacts.bullets)}
    ${renderSection(report.indicators.title, report.indicators.body, report.indicators.bullets)}
    ${renderSection(report.analyticalInterpretation.title, report.analyticalInterpretation.body, report.analyticalInterpretation.bullets)}
    ${renderSection(report.risks.title, report.risks.body, report.risks.bullets)}
    ${renderSection(report.scenarios.title, report.scenarios.body, report.scenarios.bullets)}
    ${renderSection(report.uncertainty.title, report.uncertainty.body, report.uncertainty.bullets)}
    ${renderSection(report.monitoringPriorities.title, report.monitoringPriorities.body, report.monitoringPriorities.bullets)}
    ${renderSection(report.technicalAppendix.title, report.technicalAppendix.body, report.technicalAppendix.bullets)}
    <section>
      <h2>نمودارها</h2>
      <ul>${report.charts.map((chart) => `<li><strong>${escapeHtml(chart.title)}</strong>: ${escapeHtml(chart.caption)}</li>`).join('')}</ul>
    </section>
    <section>
      <h2>خلاصه منابع</h2>
      <ul>${report.sourceSummary.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      <p>${escapeHtml(report.methodology)}</p>
    </section>
  </body>
</html>`;
}

export function buildResilienceReport(
  primaryCountryCode: string,
  compareCountryCodes: string[] = [],
  type: ResilienceReportType = 'national-brief',
): ResilienceStructuredReport {
  const model = getResilienceDashboardModel(primaryCountryCode, compareCountryCodes);
  const primary = model.primary;
  const comparisonNames = model.comparisons.map((item) => item.countryName);
  const topStrengths = summarizeStrengths(model);
  const topWeaknesses = summarizeWeaknesses(model);
  const strongestPeer = model.rankedRows[0];
  const weakestPeer = model.rankedRows[model.rankedRows.length - 1];
  const highestStress = primary.stressMatrix.slice().sort((left, right) => right.delta - left.delta)[0];
  const bandLabel = describeResilienceBand(primary.composite.score);

  const reportBase = {
    id: createId('resilience-report'),
    type,
    title: type === 'comparative-country'
      ? `گزارش مقایسه‌ای تاب‌آوری: ${primary.countryName} در قیاس با ${comparisonNames.join('، ')}`
      : type === 'international-economic'
        ? `گزارش تاب‌آوری اقتصادی بین‌المللی: ${primary.countryName}`
        : type === 'scenario-forecast'
          ? `گزارش سناریویی تاب‌آوری: ${primary.countryName}`
          : `بریـف ملی تاب‌آوری: ${primary.countryName}`,
    generatedAt: new Date().toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }),
    primaryCountryCode: primary.countryCode,
    comparisonCountryCodes: model.comparisons.map((item) => item.countryCode),
    executiveSummary: buildExecutiveSummary(model, type),
    baselineFacts: {
      id: 'baseline-facts',
      title: 'واقعیت‌های پایه',
      body: `${primary.countryName} در گروه «${primary.peerGroup}» قرار گرفته و امتیاز کل آن ${primary.composite.score} با وضعیت «${bandLabel}» و بازه عدم‌قطعیت ${primary.composite.uncertainty.lower} تا ${primary.composite.uncertainty.upper} است.`,
      bullets: [
        `پوشش داده: ${primary.coverage.coveragePercent}%`,
        `سهم داده زنده: ${Math.round(primary.composite.liveShare * 100)}%`,
        `قوی‌ترین بعد: ${topStrengths[0] || 'نامشخص'}`,
        `ضعیف‌ترین بعد: ${topWeaknesses[0] || 'نامشخص'}`,
      ],
    },
    indicators: {
      id: 'indicators',
      title: 'شاخص‌ها و ابعاد',
      body: 'شاخص کل از ۱۴ بعد تشکیل شده و هر بعد روش، پوشش، تازگی و عدم‌قطعیت مستقل خود را دارد.',
      bullets: [
        ...topStrengths.map((item) => `نقطه اتکا: ${item}`),
        ...topWeaknesses.slice(0, 2).map((item) => `گلوگاه: ${item}`),
      ],
    },
    analyticalInterpretation: {
      id: 'interpretation',
      title: 'تفسیر تحلیلی',
      body: `${primary.countryName} در وضعیت «${bandLabel}» قرار دارد که به معنی ${primary.composite.score >= 62 ? 'وجود ضربه‌گیرهای قابل اتکا همراه با چند گلوگاه مشخص' : 'ترکیب همزمان ظرفیت‌های محدود و فشارهای فعال'} است.`,
      bullets: [
        `سیگنال‌های داخلی: ${primary.internalSignalSummary.join(' | ')}`,
        strongestPeer ? `بهترین عملکرد مقایسه‌ای فعلی در مجموعه: ${strongestPeer.countryName} با ${strongestPeer.overall}` : 'مقایسه همتا در دسترس نیست.',
        weakestPeer ? `کم‌تاب‌آورترین عضو مجموعه: ${weakestPeer.countryName} با ${weakestPeer.overall}` : 'کشور مرجع ضعیف‌تر در دسترس نیست.',
      ],
    },
    risks: {
      id: 'risks',
      title: 'ریسک‌ها',
      body: 'ریسک‌ها از شکاف‌های ابعادی، فشارهای زنده واردشده و سرریز همسایگی/زنجیره تامین استخراج شده‌اند.',
      bullets: [
        ...topWeaknesses.map((item) => `ریسک ساختاری: ${item}`),
        ...primary.spillovers.slice(0, 3).map((spillover) => `ریسک سرریز ${describeSpilloverChannel(spillover.channel)}: ${spillover.targetCountryName} (${spillover.intensity})`),
      ],
    },
    scenarios: {
      id: 'scenarios',
      title: 'سناریوها',
      body: highestStress
        ? `بیشترین افت فرضی در سناریو «${highestStress.scenarioTitle}» دیده می‌شود که شاخص کل را به ${highestStress.resultingScore} می‌رساند.`
        : 'سناریوی تنش فعلاً محاسبه نشده است.',
      bullets: primary.stressMatrix.map((item) => `${item.scenarioTitle}: افت ${item.delta} و امتیاز نهایی ${item.resultingScore}`),
    },
    uncertainty: {
      id: 'uncertainty',
      title: 'عدم‌قطعیت و پوشش',
      body: 'این مدل عمداً از دقت‌نمایی کاذب پرهیز می‌کند و شفافیت بالا دارد. بخش نمونه و بخش زنده از هم جدا نمایش داده می‌شوند و داده غایب پنهان نمی‌شود.',
      bullets: [
        `بازه عدم‌قطعیت شاخص کل: ${primary.composite.uncertainty.lower}-${primary.composite.uncertainty.upper}`,
        `شاخص‌های نمونه: ${primary.coverage.syntheticIndicators}`,
        `شاخص‌های زنده: ${primary.coverage.liveIndicators}`,
        `شاخص‌های فاقد پوشش/قدیمی: ${primary.coverage.missingIndicators + primary.coverage.staleIndicators}`,
      ],
    },
    monitoringPriorities: {
      id: 'monitoring',
      title: 'اولویت‌های پایش',
      body: 'پایش باید ابتدا روی گلوگاه‌هایی متمرکز شود که هم در بعد ضعیف هستند و هم در سناریوهای تنش افت بزرگ‌تری می‌گیرند.',
      bullets: [
        ...topWeaknesses.slice(0, 3).map((item) => `پایش متمرکز: ${item}`),
        ...primary.stressScenarios.slice(0, 2).map((scenario) => `سیگنال‌های سناریوی ${scenario.title}: ${scenario.monitoringSignals.join('، ')}`),
      ],
    },
    technicalAppendix: {
      id: 'appendix',
      title: 'پیوست فنی',
      body: 'این گزارش برای استفاده مدیریتی و کارشناسی ساخته شده و قابلیت export به HTML/Markdown/JSON را دارد.',
      bullets: [
        `کشورهای مقایسه: ${comparisonNames.join('، ') || 'ندارد'}`,
        `منابع: ${primary.sources.map((source) => `${source.title}${source.synthetic ? ' (نمونه)' : ''}`).join(' | ')}`,
        `روش: ${getResilienceMethodologySummary()}`,
      ],
    },
    methodology: getResilienceMethodologySummary(),
    charts: buildCharts(),
    sourceSummary: primary.sources.map((source) =>
      `${source.title} | ${source.synthetic ? 'نمونه/نمایشی' : 'زنده/محاسبه‌شده'} | به‌روزرسانی: ${source.lastUpdated}`),
  };

  return {
    ...reportBase,
    markdown: buildMarkdown(reportBase),
    html: buildHtml(reportBase),
  };
}
