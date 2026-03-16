import { Panel } from './Panel';
import { loadMediaMatrixProvider } from '@/services/media-pipelines';

type MediaGroup = { title: string; items: Array<{ name: string; url: string; tag: string; health: string }> };

export class IranMediaMatrixPanel extends Panel {
  private groups: MediaGroup[] = [];
  private filterQuery = '';

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

  public applyQuickFilter(query: string): void {
    this.filterQuery = query.trim().toLowerCase();
    this.renderPanel();
  }

  private async loadAndRender(): Promise<void> {
    this.setContent('<div style="direction:rtl;text-align:right">در حال دریافت داده از collector/API...</div>');
    this.groups = await loadMediaMatrixProvider().catch(() => []);
    this.renderPanel();
  }

  private renderPanel(): void {
    const filteredGroups = this.groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (!this.filterQuery) return true;
          const haystack = `${group.title} ${item.name} ${item.tag} ${item.url}`.toLowerCase();
          return haystack.includes(this.filterQuery);
        }),
      }))
      .filter((group) => group.items.length > 0);

    const html = filteredGroups.map((group) => `
      <section>
        <h4 style="margin:0 0 6px">${group.title}</h4>
        <ul style="margin:0;padding-inline-start:18px;display:grid;gap:5px">
          ${group.items.map((item) => `<li><a href="${item.url}" target="_blank" rel="noopener">${item.name}</a> <small style="opacity:.75">(${item.tag})</small> <small style="opacity:.7">collector: ${item.health}</small></li>`).join('')}
        </ul>
      </section>
    `).join('');

    const body = filteredGroups.length > 0
      ? html
      : this.filterQuery
        ? '<p style="opacity:.8">موردی مطابق فیلتر پیدا نشد.</p>'
        : '<p style="opacity:.8">داده زنده از API/collector در دسترس نبود. لطفاً مجدداً تلاش کنید.</p>';

    this.setContent(`
      <div style="direction:rtl;text-align:right;display:grid;gap:12px;line-height:1.8">
        <p>این پنل از لایه data provider برای دریافت داده واقعی از collectors/API استفاده می‌کند تا ماتریس روایت قابل ممیزی بماند.</p>
        <label style="display:grid;gap:6px">
          <span>فیلتر سریع</span>
          <input id="mediaMatrixFilterInput" type="search" value="${this.filterQuery}" placeholder="مثلاً Telegram / Aparat / Telewebion" style="border:1px solid var(--border-color);border-radius:10px;padding:8px 10px;background:var(--bg-secondary);color:var(--text-primary)" />
        </label>
        <div><button data-action="refresh-media-matrix" style="border:1px solid var(--border-color);border-radius:8px;padding:5px 10px;background:var(--bg-secondary);cursor:pointer">بازخوانی داده</button></div>
        ${body}
      </div>
    `);
    this.content.querySelector<HTMLInputElement>('#mediaMatrixFilterInput')?.addEventListener('input', (event) => {
      this.applyQuickFilter((event.target as HTMLInputElement).value);
    });
  }
}
