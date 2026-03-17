import { sendBotAlert, type BotBridgeConfig } from '@/services/bot-bridge';
import { isDesktopRuntime, toApiUrl } from '@/services/runtime';
import { proxyUrl } from '@/utils';

export type MediaLean = 'government' | 'independent' | 'opposition';
export type Platform = 'telegram' | 'instagram' | 'x' | 'web';
export type PipelineExecutionState = 'idle' | 'running' | 'scheduled' | 'paused' | 'failed';

export interface MediaSource {
  name: string;
  country: 'IR' | 'IL';
  lean: MediaLean;
  platform: Platform;
  url: string;
}

export interface PipelineDef {
  id: string;
  title: string;
  countries: Array<'IR' | 'IL'>;
  platforms: Platform[];
  cadence: 'realtime' | 'semi_realtime' | 'batch';
  objective: string;
  sources: MediaSource[];
}

export interface PipelineEvent {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  action: 'run' | 'schedule' | 'pause' | 'deliver-botops' | 'deliver-dssess';
  message: string;
}

export interface PipelineRuntimeState {
  status: PipelineExecutionState;
  lastSuccessAt: string | null;
  latencyMs: number | null;
  failureReason: string | null;
  nextScheduledAt: string | null;
  eventLog: PipelineEvent[];
}

export interface PipelineCollectorSnapshot {
  key: string;
  title: string;
  status: 'live' | 'degraded' | 'offline';
  sampleCount: number;
}

export interface PipelineRunSummary {
  pipelineId: string;
  pipelineTitle: string;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  collectorSnapshots: PipelineCollectorSnapshot[];
  observedItems: number;
  summary: string;
}

export interface DssEssReport {
  id: string;
  generatedAt: string;
  pipelineId: string;
  confidence: 'high' | 'medium' | 'low';
  recommendations: string[];
  summary: string;
}

const MAX_EVENTS = 10;

function apiPath(path: string): string {
  return isDesktopRuntime() ? proxyUrl(path) : toApiUrl(path);
}

async function fetchOk(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

async function fetchCollectorSnapshots(pipeline: PipelineDef): Promise<PipelineCollectorSnapshot[]> {
  const checks: Array<Promise<PipelineCollectorSnapshot>> = [
    fetchOk(apiPath('/api/telegram-feed?limit=20'))
      .then(r => r.json())
      .then((payload: { items?: unknown[] }) => ({
        key: 'telegram',
        title: 'Telegram collector',
        status: 'live' as const,
        sampleCount: payload.items?.length || 0,
      }))
      .catch(() => ({ key: 'telegram', title: 'Telegram collector', status: 'offline' as const, sampleCount: 0 })),
    fetchOk(apiPath('/api/intelligence/v1/search-gdelt-documents'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: pipeline.countries.join(' OR '),
        maxRecords: 8,
        timespan: '72h',
        toneFilter: '',
        sort: 'date',
      }),
    })
      .then(r => r.json())
      .then((payload: { articles?: unknown[] }) => ({
        key: 'gdelt',
        title: 'GDELT intelligence',
        status: 'live' as const,
        sampleCount: payload.articles?.length || 0,
      }))
      .catch(() => ({ key: 'gdelt', title: 'GDELT intelligence', status: 'degraded' as const, sampleCount: 0 })),
    fetchOk(apiPath('/api/netblocks?limit=5'))
      .then(r => r.json())
      .then((payload: { incidents?: unknown[] }) => ({
        key: 'netblocks',
        title: 'NetBlocks collector',
        status: 'live' as const,
        sampleCount: payload.incidents?.length || 0,
      }))
      .catch(() => ({ key: 'netblocks', title: 'NetBlocks collector', status: 'offline' as const, sampleCount: 0 })),
    fetchOk(apiPath('/api/google-trends?geo=IR'))
      .then(r => r.json())
      .then((payload: { trends?: unknown[] }) => ({
        key: 'trends',
        title: 'Google Trends collector',
        status: 'live' as const,
        sampleCount: payload.trends?.length || 0,
      }))
      .catch(() => ({ key: 'trends', title: 'Google Trends collector', status: 'degraded' as const, sampleCount: 0 })),
  ];

  const snapshots = await Promise.all(checks);
  return snapshots.filter((collector) => {
    if (pipeline.platforms.includes('telegram') && collector.key === 'telegram') return true;
    if (collector.key === 'gdelt' || collector.key === 'netblocks' || collector.key === 'trends') return true;
    return false;
  });
}

function createDssEssReport(summary: PipelineRunSummary): DssEssReport {
  const offlineCount = summary.collectorSnapshots.filter(item => item.status === 'offline').length;
  const confidence: DssEssReport['confidence'] = offlineCount === 0 ? 'high' : offlineCount === 1 ? 'medium' : 'low';
  return {
    id: `dssess-${summary.pipelineId}-${Date.now()}`,
    generatedAt: summary.finishedAt,
    pipelineId: summary.pipelineId,
    confidence,
    summary: `خروجی پایپلاین ${summary.pipelineTitle} با ${summary.observedItems} نمونه و تاخیر ${summary.latencyMs}ms تولید شد.`,
    recommendations: [
      'Cross-source همگرایی روایت را برای DSS بازبینی کنید.',
      'شاخص تنش/تاب‌آوری را در ESS با این خروجی به‌روزرسانی کنید.',
      'هشدارهای اولویت‌بالا را به تیم BotOps ارجاع دهید.',
    ],
  };
}

async function deliverToDssEss(report: DssEssReport): Promise<void> {
  await fetchOk(apiPath('/api/dss-ess/reports'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  });
}

const botOpsConfig: BotBridgeConfig = {
  telegramWebhookUrl: (globalThis as { __BOTOPS_TELEGRAM_WEBHOOK__?: string }).__BOTOPS_TELEGRAM_WEBHOOK__,
  baleWebhookUrl: (globalThis as { __BOTOPS_BALE_WEBHOOK__?: string }).__BOTOPS_BALE_WEBHOOK__,
};

function addEvent(state: PipelineRuntimeState, event: Omit<PipelineEvent, 'id'>): PipelineRuntimeState {
  return {
    ...state,
    eventLog: [{ ...event, id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}` }, ...state.eventLog].slice(0, MAX_EVENTS),
  };
}

export const MEDIA_PIPELINES: PipelineDef[] = [
  {
    id: 'ir-mainstream-gov',
    title: 'پایپلاین رسانه‌های حکومتی ایران',
    countries: ['IR'],
    platforms: ['telegram', 'web', 'x'],
    cadence: 'semi_realtime',
    objective: 'رصد روایت رسمی، مواضع حاکمیتی و سیگنال‌های سیاستی',
    sources: [
      { name: 'IRIB News', country: 'IR', lean: 'government', platform: 'web', url: 'https://www.iribnews.ir' },
      { name: 'IRNA', country: 'IR', lean: 'government', platform: 'web', url: 'https://www.irna.ir' },
      { name: 'Fars', country: 'IR', lean: 'government', platform: 'web', url: 'https://www.farsnews.ir' },
      { name: 'Telewebion', country: 'IR', lean: 'government', platform: 'web', url: 'https://www.telewebion.com' },
    ],
  },
  {
    id: 'ir-independent-opposition',
    title: 'پایپلاین رسانه‌های مستقل/اپوزیسیون ایران',
    countries: ['IR'],
    platforms: ['telegram', 'instagram', 'x', 'web'],
    cadence: 'semi_realtime',
    objective: 'تحلیل شکاف روایت داخلی/برون‌مرزی و بررسی تناقض‌های رسانه‌ای',
    sources: [
      { name: 'BBC Persian', country: 'IR', lean: 'opposition', platform: 'web', url: 'https://www.bbc.com/persian' },
      { name: 'Iran International', country: 'IR', lean: 'opposition', platform: 'web', url: 'https://www.iranintl.com' },
      { name: 'Radio Farda', country: 'IR', lean: 'opposition', platform: 'web', url: 'https://www.radiofarda.com' },
      { name: 'ISNA', country: 'IR', lean: 'independent', platform: 'web', url: 'https://www.isna.ir' },
      { name: 'Aparat', country: 'IR', lean: 'independent', platform: 'web', url: 'https://www.aparat.com' },
    ],
  },
  {
    id: 'il-mainstream-spectrum',
    title: 'پایپلاین طیف رسانه‌ای اسرائیل',
    countries: ['IL'],
    platforms: ['telegram', 'x', 'web'],
    cadence: 'semi_realtime',
    objective: 'پایش رسانه‌های رسمی، جریان اصلی و منتقد برای تحلیل تنش/درگیری',
    sources: [
      { name: 'The Times of Israel', country: 'IL', lean: 'independent', platform: 'web', url: 'https://www.timesofisrael.com' },
      { name: 'Haaretz', country: 'IL', lean: 'independent', platform: 'web', url: 'https://www.haaretz.com' },
      { name: 'Jerusalem Post', country: 'IL', lean: 'independent', platform: 'web', url: 'https://www.jpost.com' },
      { name: 'Kan News', country: 'IL', lean: 'government', platform: 'web', url: 'https://www.kan.org.il' },
    ],
  },
  {
    id: 'cross-platform-narrative-diff',
    title: 'پایپلاین مقایسه روایت IR/IL چندپلتفرمی',
    countries: ['IR', 'IL'],
    platforms: ['telegram', 'instagram', 'x', 'web'],
    cadence: 'realtime',
    objective: 'کشف اختلاف روایت، استاندارد دوگانه، و تغییرات ناگهانی در framing',
    sources: [],
  },
];

const pipelineState = new Map<string, PipelineRuntimeState>(
  MEDIA_PIPELINES.map((pipeline) => [pipeline.id, {
    status: 'idle',
    lastSuccessAt: null,
    latencyMs: null,
    failureReason: null,
    nextScheduledAt: null,
    eventLog: [],
  }]),
);

export function pipelineStats(): { totalPipelines: number; totalSources: number; running: number; scheduled: number; paused: number } {
  const totalSources = MEDIA_PIPELINES.reduce((sum, p) => sum + p.sources.length, 0);
  const states = Array.from(pipelineState.values());
  return {
    totalPipelines: MEDIA_PIPELINES.length,
    totalSources,
    running: states.filter((s) => s.status === 'running').length,
    scheduled: states.filter((s) => s.status === 'scheduled').length,
    paused: states.filter((s) => s.status === 'paused').length,
  };
}

export function getPipelineState(pipelineId: string): PipelineRuntimeState {
  return pipelineState.get(pipelineId) || {
    status: 'idle',
    lastSuccessAt: null,
    latencyMs: null,
    failureReason: null,
    nextScheduledAt: null,
    eventLog: [],
  };
}

export async function runPipeline(pipelineId: string): Promise<PipelineRunSummary> {
  const pipeline = MEDIA_PIPELINES.find((item) => item.id === pipelineId);
  if (!pipeline) throw new Error('pipeline-not-found');

  const current = getPipelineState(pipelineId);
  pipelineState.set(pipelineId, addEvent({ ...current, status: 'running', failureReason: null }, {
    timestamp: new Date().toISOString(),
    level: 'info',
    action: 'run',
    message: 'اجرای پایپلاین آغاز شد.',
  }));

  const start = performance.now();
  const startedAt = new Date().toISOString();

  try {
    const collectorSnapshots = await fetchCollectorSnapshots(pipeline);
    const observedItems = collectorSnapshots.reduce((sum, item) => sum + item.sampleCount, 0);
    const latencyMs = Math.max(1, Math.round(performance.now() - start));
    const finishedAt = new Date().toISOString();

    const summary: PipelineRunSummary = {
      pipelineId,
      pipelineTitle: pipeline.title,
      startedAt,
      finishedAt,
      latencyMs,
      collectorSnapshots,
      observedItems,
      summary: `اجرای ${pipeline.title} با ${collectorSnapshots.length} collector انجام شد.`,
    };

    const report = createDssEssReport(summary);

    await Promise.allSettled([
      sendBotAlert(botOpsConfig, {
        title: `Pipeline: ${pipeline.title}`,
        body: report.summary,
        severity: report.confidence === 'low' ? 'warning' : 'info',
        tags: ['pipeline', pipeline.id, 'dss', 'ess'],
      }),
      deliverToDssEss(report),
    ]).then((results) => {
      const runtimeState = getPipelineState(pipelineId);
      const withBotEvent = addEvent(runtimeState, {
        timestamp: finishedAt,
        level: results[0]?.status === 'fulfilled' ? 'info' : 'warning',
        action: 'deliver-botops',
        message: results[0]?.status === 'fulfilled' ? 'خروجی به BotOps ارسال شد.' : 'ارسال به BotOps ناموفق بود (وب‌هوک تنظیم نیست یا endpoint در دسترس نیست).',
      });
      pipelineState.set(pipelineId, addEvent(withBotEvent, {
        timestamp: finishedAt,
        level: results[1]?.status === 'fulfilled' ? 'info' : 'warning',
        action: 'deliver-dssess',
        message: results[1]?.status === 'fulfilled' ? 'گزارش DSS/ESS ثبت شد.' : 'ثبت گزارش DSS/ESS ناموفق بود.',
      }));
    });

    const updated = addEvent({
      ...getPipelineState(pipelineId),
      status: 'idle',
      latencyMs,
      failureReason: null,
      lastSuccessAt: finishedAt,
    }, {
      timestamp: finishedAt,
      level: 'info',
      action: 'run',
      message: `پایپلاین با ${observedItems} آیتم و latency=${latencyMs}ms تکمیل شد.`,
    });
    pipelineState.set(pipelineId, updated);

    return summary;
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : 'unknown-error';
    const failedState = addEvent({
      ...getPipelineState(pipelineId),
      status: 'failed',
      failureReason: message,
    }, {
      timestamp: finishedAt,
      level: 'error',
      action: 'run',
      message: `اجرای پایپلاین ناموفق بود: ${message}`,
    });
    pipelineState.set(pipelineId, failedState);
    throw error;
  }
}

export function schedulePipeline(pipelineId: string, delayMinutes = 15): PipelineRuntimeState {
  const state = getPipelineState(pipelineId);
  const next = new Date(Date.now() + delayMinutes * 60_000).toISOString();
  const updated = addEvent({ ...state, status: 'scheduled', nextScheduledAt: next }, {
    timestamp: new Date().toISOString(),
    level: 'info',
    action: 'schedule',
    message: `اجرای بعدی برای ${delayMinutes} دقیقه آینده زمان‌بندی شد.`,
  });
  pipelineState.set(pipelineId, updated);
  return updated;
}

export function pausePipeline(pipelineId: string): PipelineRuntimeState {
  const state = getPipelineState(pipelineId);
  const updated = addEvent({ ...state, status: 'paused', nextScheduledAt: null }, {
    timestamp: new Date().toISOString(),
    level: 'warning',
    action: 'pause',
    message: 'پایپلاین تا اطلاع بعدی متوقف شد.',
  });
  pipelineState.set(pipelineId, updated);
  return updated;
}

export async function loadMediaMatrixProvider(): Promise<Array<{ title: string; items: Array<{ name: string; url: string; tag: string; health: string }> }>> {
  const matrixPipeline = MEDIA_PIPELINES.find((pipeline) => pipeline.id === 'cross-platform-narrative-diff');
  if (!matrixPipeline) return [];
  const govPipeline = MEDIA_PIPELINES.find((pipeline) => pipeline.id === 'ir-mainstream-gov');
  const mixedPipeline = MEDIA_PIPELINES.find((pipeline) => pipeline.id === 'ir-independent-opposition');

  const collectorHealth = await fetchCollectorSnapshots(matrixPipeline);
  const healthByKey = new Map(collectorHealth.map((item) => [item.key, item.status]));

  return [
    {
      title: 'رسانه‌های حکومتی/رسمی ایران',
      items: (govPipeline?.sources || []).map((source) => ({
        name: source.name,
        url: source.url,
        tag: source.lean === 'government' ? 'حکومتی' : 'رسمی',
        health: healthByKey.get('gdelt') || 'degraded',
      })),
    },
    {
      title: 'رسانه‌های مستقل/تحلیلی فارسی',
      items: (mixedPipeline?.sources || []).filter((source) => source.lean === 'independent').map((source) => ({
        name: source.name,
        url: source.url,
        tag: 'مستقل',
        health: healthByKey.get('trends') || 'degraded',
      })),
    },
    {
      title: 'رسانه‌های برون‌مرزی/اپوزیسیون',
      items: (mixedPipeline?.sources || []).filter((source) => source.lean === 'opposition').map((source) => ({
        name: source.name,
        url: source.url,
        tag: 'برون‌مرزی',
        health: healthByKey.get('telegram') || 'offline',
      })),
    },
  ];
}
