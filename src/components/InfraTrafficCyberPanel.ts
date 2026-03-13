import { Panel } from './Panel';
import { loadRealtimeFusionSnapshot } from '@/services/realtime-fusion';

export class InfraTrafficCyberPanel extends Panel {
  constructor() {
    super({ id: 'infra-traffic-cyber', title: 'پایش ترافیک زمینی/هوایی/دریایی + سایبری + IXP', className: 'panel-wide' });
    void this.refresh();
    setInterval(() => { void this.refresh(); }, 45_000);
  }

  private badge(status: 'live' | 'degraded' | 'offline'): string {
    if (status === 'live') return '🟢 زنده';
    if (status === 'degraded') return '🟠 ناپایدار';
    return '🔴 قطع';
  }

  private async refresh(): Promise<void> {
    try {
      const snap = await loadRealtimeFusionSnapshot();
      const rows = snap.streams.map((s) => `<li><strong>${s.title}</strong> — ${this.badge(s.status)}<div>${s.note}</div></li>`).join('');
      this.setContent(`
        <div style="direction:rtl;text-align:right;display:grid;gap:10px;line-height:1.8">
          <p>آخرین بروزرسانی: <span translate="no">${new Date(snap.generatedAt).toLocaleString('fa-IR')}</span></p>
          <ul style="margin:0;padding-inline-start:18px;display:grid;gap:8px">${rows}</ul>
          <p style="opacity:.85">این پنل برای همجوشی داده‌های GDELT، NetBlocks، Google Trends، بازارها، و سیگنال‌های زیرساختی/سایبری طراحی شده است.</p>
        </div>
      `);
      this.setDataBadge('live');
    } catch {
      this.setContent('<div style="direction:rtl;text-align:right">داده‌ها موقتاً در دسترس نیست.</div>');
      this.setDataBadge('unavailable');
    }
  }
}
