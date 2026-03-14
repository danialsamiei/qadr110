import { Panel } from './Panel';
import { loadMediaMatrixProvider } from '@/services/media-pipelines';

type MediaGroup = { title: string; items: Array<{ name: string; url: string; tag: string; health: string }> };

export class IranMediaMatrixPanel extends Panel {
  private groups: MediaGroup[] = [];

  constructor() {
    super({ id: 'iran-media-matrix', title: 'ماتریس رسانه‌ای ایران (درون/برون‌مرزی)', className: 'panel-wide' });
    this.content.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const refresh = target.closest<HTMLButtonElement>('button[data-action="refresh-media-matrix"]');
      if (!refresh) return;
      void this.loadAndRender();
    });
    void this.loadAndRender();
  }

  private async loadAndRender(): Promise<void> {
    this.setContent('<div style="direction:rtl;text-align:right">در حال دریافت داده از collector/API...</div>');
    this.groups = await loadMediaMatrixProvider().catch(() => []);
    this.renderPanel();
  }

  private renderPanel(): void {
    const html = this.groups.map((group) => `
      <section>
        <h4 style="margin:0 0 6px">${group.title}</h4>
        <ul style="margin:0;padding-inline-start:18px;display:grid;gap:5px">
          ${group.items.map((item) => `<li><a href="${item.url}" target="_blank" rel="noopener">${item.name}</a> <small style="opacity:.75">(${item.tag})</small> <small style="opacity:.7">collector: ${item.health}</small></li>`).join('')}
        </ul>
      </section>
    `).join('');

    const body = this.groups.length > 0
      ? html
      : '<p style="opacity:.8">داده زنده از API/collector در دسترس نبود. لطفاً مجدداً تلاش کنید.</p>';

    this.setContent(`
      <div style="direction:rtl;text-align:right;display:grid;gap:12px;line-height:1.8">
        <p>این پنل از لایه data provider برای دریافت داده واقعی از collectors/API استفاده می‌کند تا ماتریس روایت قابل ممیزی بماند.</p>
        <div><button data-action="refresh-media-matrix" style="border:1px solid var(--border-color);border-radius:8px;padding:5px 10px;background:var(--bg-secondary);cursor:pointer">بازخوانی داده</button></div>
        ${body}
      </div>
    `);
  }
}
