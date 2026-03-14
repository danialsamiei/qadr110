import { Panel } from './Panel';
import {
  MEDIA_PIPELINES,
  getPipelineState,
  pausePipeline,
  pipelineStats,
  runPipeline,
  schedulePipeline,
} from '@/services/media-pipelines';

export class MediaPipelinesPanel extends Panel {
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
    const cards = MEDIA_PIPELINES.map((pipeline) => {
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
        ${cards}
        <p style="opacity:.85">خروجی هر اجرا به BotOps (bot-bridge) و گزارش DSS/ESS ارسال می‌شود.</p>
      </section>
    `);
  }
}
