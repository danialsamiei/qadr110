import { Panel } from './Panel';
import {
  MEDIA_PIPELINES,
  getPipelineState,
  pausePipeline,
  type Platform,
  pipelineStats,
  runPipeline,
  schedulePipeline,
} from '@/services/media-pipelines';

export class MediaPipelinesPanel extends Panel {
  private platformFilter: Platform | 'all' = 'all';

  constructor() {
    super({ id: 'media-pipelines', title: 'پایپلاین‌های رسانه‌ای ایران/اسرائیل', className: 'panel-wide' });
    this.content.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>('button[data-action][data-pipeline]');
      if (!button) return;
      const pipelineId = button.dataset.pipeline;
      const action = button.dataset.action;
      if (!pipelineId || !action) return;
      void this.handleAction(action, pipelineId);
    });
    this.renderPipelines();
  }

  public applyPlatformFilter(platform: Platform | 'all'): void {
    this.platformFilter = platform;
    this.renderPipelines();
  }

  private async handleAction(action: string, pipelineId: string): Promise<void> {
    if (action === 'run') {
      await runPipeline(pipelineId).catch(() => undefined);
    }
    if (action === 'schedule') {
      schedulePipeline(pipelineId, 20);
    }
    if (action === 'pause') {
      pausePipeline(pipelineId);
    }
    this.renderPipelines();
  }

  private renderPipelines(): void {
    const stats = pipelineStats();
    const platforms: Array<Platform | 'all'> = ['all', 'telegram', 'instagram', 'x', 'web'];
    const activePlatform = this.platformFilter;
    const pipelines = activePlatform === 'all'
      ? MEDIA_PIPELINES
      : MEDIA_PIPELINES.filter((pipeline) => pipeline.platforms.includes(activePlatform));
    const filterButtons = platforms.map((platform) => {
      const active = platform === this.platformFilter;
      const label = platform === 'all' ? 'همه' : platform;
      return `<button type="button" data-platform-filter="${platform}" style="border:1px solid ${active ? 'rgba(86,157,255,.55)' : 'var(--border-color)'};border-radius:999px;padding:4px 10px;background:${active ? 'rgba(86,157,255,.18)' : 'var(--bg-secondary)'};cursor:pointer">${label}</button>`;
    }).join('');
    const cards = pipelines.map((pipeline) => {
      const state = getPipelineState(pipeline.id);
      const events = state.eventLog.length > 0
        ? `<ul style="margin:0;padding-inline-start:18px;display:grid;gap:4px">${state.eventLog.slice(0, 4).map((item) => `<li><small><strong>${item.action}</strong> · ${new Date(item.timestamp).toLocaleTimeString('fa-IR')} · ${item.message}</small></li>`).join('')}</ul>`
        : '<small style="opacity:.75">هنوز event ثبت نشده است.</small>';

      return `
      <article style="border:1px solid var(--border-color);border-radius:10px;padding:10px;display:grid;gap:6px">
        <strong>${pipeline.title}</strong>
        <div>هدف: ${pipeline.objective}</div>
        <div>کشورها: ${pipeline.countries.join(' / ')} | پلتفرم‌ها: ${pipeline.platforms.join(', ')} | cadence: <span translate="no">${pipeline.cadence}</span></div>
        <div>تعداد منابع: ${pipeline.sources.length}</div>
        <div>وضعیت اجرا: <strong>${state.status}</strong> | آخرین موفق: <strong>${state.lastSuccessAt ? new Date(state.lastSuccessAt).toLocaleString('fa-IR') : 'ندارد'}</strong></div>
        <div>latency: <strong>${state.latencyMs ? `${state.latencyMs}ms` : '—'}</strong> | failure: <strong>${state.failureReason || '—'}</strong></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button data-action="run" data-pipeline="${pipeline.id}" style="border:1px solid var(--border-color);border-radius:8px;padding:5px 10px;background:var(--bg-secondary);cursor:pointer">run</button>
          <button data-action="schedule" data-pipeline="${pipeline.id}" style="border:1px solid var(--border-color);border-radius:8px;padding:5px 10px;background:var(--bg-secondary);cursor:pointer">schedule</button>
          <button data-action="pause" data-pipeline="${pipeline.id}" style="border:1px solid var(--border-color);border-radius:8px;padding:5px 10px;background:var(--bg-secondary);cursor:pointer">pause</button>
        </div>
        <div style="border-top:1px dashed var(--border-color);padding-top:6px;display:grid;gap:4px">
          <small style="opacity:.85">event log (آخرین اجراها)</small>
          ${events}
        </div>
      </article>
    `;
    }).join('');

    this.setContent(`
      <section style="direction:rtl;text-align:right;display:grid;gap:10px;line-height:1.8">
        <p>تعداد پایپلاین‌ها: <strong>${stats.totalPipelines}</strong> | منابع: <strong>${stats.totalSources}</strong> | running: <strong>${stats.running}</strong> | scheduled: <strong>${stats.scheduled}</strong> | paused: <strong>${stats.paused}</strong></p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${filterButtons}</div>
        ${cards || '<p style="opacity:.8">برای این فیلتر هنوز پایپلاینی تعریف نشده است.</p>'}
        <p style="opacity:.85">خروجی هر اجرا به BotOps (bot-bridge) و گزارش DSS/ESS ارسال می‌شود.</p>
      </section>
    `);
    this.content.querySelectorAll<HTMLButtonElement>('[data-platform-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        const next = button.dataset.platformFilter as Platform | 'all' | undefined;
        if (!next) return;
        this.applyPlatformFilter(next);
      });
    });
  }
}
