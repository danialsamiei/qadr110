import { Panel } from './Panel';
import { loadRealtimeFusionSnapshot, type FusionStream } from '@/services/realtime-fusion';
import { t } from '@/services/i18n';

export class InfraTrafficCyberPanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private snapshot: Awaited<ReturnType<typeof loadRealtimeFusionSnapshot>> | null = null;
  private streamFilter: FusionStream['key'] | 'all' = 'all';

  constructor() {
    super({ id: 'infra-traffic-cyber', title: t('components.infraTraffic.title'), className: 'panel-wide' });
    void this.refresh();
    this.refreshTimer = setInterval(() => { void this.refresh(); }, 45_000);
  }

  destroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    super.destroy();
  }

  public focusStream(streamKey: FusionStream['key'] | 'all'): void {
    this.streamFilter = streamKey;
    this.renderSnapshot();
  }

  private badge(status: 'live' | 'degraded' | 'offline'): string {
    if (status === 'live') return `🟢 ${t('components.infraTraffic.status.healthy')}`;
    if (status === 'degraded') return `🟠 ${t('components.infraTraffic.status.degraded')}`;
    return `🔴 ${t('components.infraTraffic.status.unavailable')}`;
  }

  private freshnessLabel(freshness: FusionStream['freshness']): string {
    if (freshness === 'fresh') return 'تازه';
    if (freshness === 'aging') return 'در حال کهنگی';
    return 'کهنه';
  }

  private confidenceLabel(confidence: number): string {
    return `${Math.round(confidence * 100)}٪`;
  }

  private renderStream(stream: FusionStream): string {
    const flags = stream.contradictionFlags.length
      ? stream.contradictionFlags.map((flag) => `<code>${flag}</code>`).join(' ')
      : 'بدون تضاد ثبت‌شده';

    const entities = stream.entitySummary.length
      ? stream.entitySummary.join('، ')
      : 'بدون موجودیت شاخص';

    return `
      <li style="border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:10px;display:grid;gap:8px">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <strong>${stream.title}</strong>
          <span>${this.badge(stream.status)}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(120px,1fr));gap:8px;font-size:.95em">
          <span>اعتماد منبع: <strong>${this.confidenceLabel(stream.sourceConfidence)}</strong></span>
          <span>تازگی: <strong>${this.freshnessLabel(stream.freshness)}</strong></span>
        </div>
        <div><strong>پرچم تضاد:</strong> ${flags}</div>
        <div><strong>خلاصه موجودیت:</strong> ${entities}</div>
        <div style="opacity:.82">${stream.note}</div>
      </li>
    `;
  }

  private renderSnapshot(): void {
    if (!this.snapshot) {
      this.setContent('<div style="direction:rtl;text-align:right">در حال همجوشی داده‌های لحظه‌ای...</div>');
      return;
    }

    const filters: Array<FusionStream['key'] | 'all'> = ['all', 'gdelt', 'netblocks', 'trends', 'markets'];
    const rows = this.snapshot.streams
      .filter((stream) => this.streamFilter === 'all' || stream.key === this.streamFilter)
      .map((stream) => this.renderStream(stream))
      .join('');
    const filterButtons = filters.map((filter) => {
      const active = filter === this.streamFilter;
      const label = filter === 'all'
        ? 'همه'
        : filter === 'trends'
          ? 'Google Trends'
          : filter === 'gdelt'
            ? 'GDELT'
            : filter === 'netblocks'
              ? 'NetBlocks'
              : 'Markets';
      return `<button type="button" data-stream-filter="${filter}" style="border:1px solid ${active ? 'rgba(86,157,255,.55)' : 'var(--border-color)'};border-radius:999px;padding:4px 10px;background:${active ? 'rgba(86,157,255,.18)' : 'var(--bg-secondary)'};cursor:pointer">${label}</button>`;
    }).join('');

    this.setContent(`
      <div style="direction:rtl;text-align:right;display:grid;gap:12px;line-height:1.8">
        <p>آخرین بروزرسانی: <span translate="no">${new Date(this.snapshot.generatedAt).toLocaleString('fa-IR')}</span></p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${filterButtons}</div>
        <ul style="margin:0;padding-inline-start:0;list-style:none;display:grid;gap:10px">${rows || '<li style="opacity:.82">جریانی برای این فیلتر پیدا نشد.</li>'}</ul>
        <p style="opacity:.85">خروجی همجوشی اکنون با schema تحلیلی شامل اعتماد منبع، تازگی، تضادها و موجودیت‌های غالب نمایش داده می‌شود.</p>
      </div>
    `);
    this.content.querySelectorAll<HTMLButtonElement>('[data-stream-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        const next = button.dataset.streamFilter as FusionStream['key'] | 'all' | undefined;
        if (!next) return;
        this.focusStream(next);
      });
    });
  }

  private async refresh(): Promise<void> {
    try {
      this.snapshot = await loadRealtimeFusionSnapshot();
      this.renderSnapshot();
      this.content.querySelector('#infra-traffic-retry')?.addEventListener('click', () => { void this.refresh(); });
      this.setDataBadge('live');
      this.setErrorState(false);
    } catch {
      this.setContent(`<div style="direction:rtl;text-align:right">${t('components.infraTraffic.unavailable')}</div><div><button class="retry-button" type="button" id="infra-traffic-retry">${t('components.infraTraffic.retry')}</button></div>`);
      this.content.querySelector('#infra-traffic-retry')?.addEventListener('click', () => { void this.refresh(); });
      this.setDataBadge('unavailable');
      this.setErrorState(true);
    } finally {
    }
  }
}
