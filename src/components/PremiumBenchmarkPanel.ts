import { Panel } from './Panel';

const BENCHMARKS = [
  { capability: 'تحلیل چندمنبعی خبر', status: 'فعال', gap: 'نیاز به امتیازدهی پیشرفته اصالت خبر در سطح منبع/روایت' },
  { capability: 'DSS/ESS', status: 'فعال', gap: 'نیاز به workflow تصمیم‌گیری قابل ممیزی و KPI-driven' },
  { capability: 'تحلیل سناریو', status: 'فعال', gap: 'نیاز به Backtest خودکار و سنجه دقت سناریو' },
  { capability: 'رصد رسانه اجتماعی', status: 'در حال توسعه', gap: 'نیاز به کانکتورهای رسمی ترند و API rate governance' },
  { capability: 'BotOps', status: 'فعال', gap: 'نیاز به Rule-engine هشدار و playbook پاسخ' },
];

export class PremiumBenchmarkPanel extends Panel {
  constructor() {
    super({ id: 'premium-benchmark', title: 'مقایسه با سامانه‌های پریمیوم', className: 'panel-wide' });
    this.renderView();
  }

  private renderView(): void {
    const rows = BENCHMARKS.map((b) => `
      <tr>
        <td>${b.capability}</td>
        <td><strong>${b.status}</strong></td>
        <td>${b.gap}</td>
      </tr>
    `).join('');

    this.setContent(`
      <div style="direction:rtl;text-align:right;line-height:1.8;display:grid;gap:10px">
        <p>این بخش وضعیت QADR110 را با الگوی قابلیت‌های رایج در سامانه‌های پریمیوم مقایسه می‌کند تا مسیر توسعه شفاف شود.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr>
              <th style="text-align:right;border-bottom:1px solid var(--border-color);padding:6px">قابلیت</th>
              <th style="text-align:right;border-bottom:1px solid var(--border-color);padding:6px">وضعیت</th>
              <th style="text-align:right;border-bottom:1px solid var(--border-color);padding:6px">گپ توسعه</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `);
  }
}
