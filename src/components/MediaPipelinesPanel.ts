import { Panel } from './Panel';
import { MEDIA_PIPELINES, pipelineStats } from '@/services/media-pipelines';

export class MediaPipelinesPanel extends Panel {
  constructor() {
    super({ id: 'media-pipelines', title: 'پایپلاین‌های رسانه‌ای ایران/اسرائیل', className: 'panel-wide' });
    this.renderPipelines();
  }

  private renderPipelines(): void {
    const stats = pipelineStats();
    const cards = MEDIA_PIPELINES.map((p) => `
      <article style="border:1px solid var(--border-color);border-radius:10px;padding:10px;display:grid;gap:6px">
        <strong>${p.title}</strong>
        <div>هدف: ${p.objective}</div>
        <div>کشورها: ${p.countries.join(' / ')} | پلتفرم‌ها: ${p.platforms.join(', ')} | cadence: <span translate="no">${p.cadence}</span></div>
        <div>تعداد منابع: ${p.sources.length}</div>
      </article>
    `).join('');

    this.setContent(`
      <section style="direction:rtl;text-align:right;display:grid;gap:10px;line-height:1.8">
        <p>تعداد پایپلاین‌ها: <strong>${stats.totalPipelines}</strong> | تعداد کل منابع نمونه: <strong>${stats.totalSources}</strong></p>
        ${cards}
        <p style="opacity:.85">این ماژول برای ingest → normalize → analyze → score → alert در کانال‌های Telegram/Instagram/X/Web طراحی شده است.</p>
      </section>
    `);
  }
}
