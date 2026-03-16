import { Panel } from './Panel';
import { fetchAisSignals, getAisStatus, fetchMilitaryVessels, fetchShippingRates, fetchChokepointStatus } from '@/services';
import { escapeHtml } from '@/utils/sanitize';

function badgeColor(isPositive: boolean): string {
  return isPositive ? '#16a34a' : '#dc2626';
}

function formatSigned(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded > 0) return `+${rounded}`;
  if (rounded < 0) return `${rounded}`;
  return '0';
}

export class MaritimeTrafficPanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({ id: 'maritime-traffic', title: 'ترافیک دریایی', className: 'panel-wide' });
    void this.refresh();
    this.refreshTimer = setInterval(() => { void this.refresh(); }, 60_000);
  }

  destroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    super.destroy();
  }

  private async refresh(): Promise<void> {
    try {
      const [ais, vesselData, shipping, chokepoints] = await Promise.all([
        fetchAisSignals(),
        fetchMilitaryVessels(),
        fetchShippingRates(),
        fetchChokepointStatus(),
      ]);
      const aisStatus = getAisStatus();
      const disruptions = ais.disruptions.slice(0, 5).map((item) => `
        <li style="border:1px solid var(--border-color);border-radius:10px;padding:10px;display:grid;gap:6px">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <strong>${escapeHtml(item.name)}</strong>
            <span style="color:${item.severity === 'high' ? '#ef4444' : item.severity === 'elevated' ? '#f59e0b' : '#22c55e'}">${escapeHtml(item.severity)}</span>
          </div>
          <div>تغییر: <strong>${formatSigned(item.changePct)}٪</strong> | پنجره: <strong>${item.windowHours}h</strong> | کشتی‌ها: <strong>${item.vesselCount ?? 0}</strong></div>
          <div style="opacity:.82">${escapeHtml(item.description)}</div>
        </li>
      `).join('');
      const chokepointRows = chokepoints.chokepoints.slice(0, 4).map((item) => `
        <li style="border:1px solid var(--border-color);border-radius:10px;padding:10px;display:grid;gap:6px">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.status)}</span>
          </div>
          <div>Congestion: <strong>${escapeHtml(item.congestionLevel)}</strong> | هشدار فعال: <strong>${item.activeWarnings}</strong> | AIS disruptions: <strong>${item.aisDisruptions}</strong></div>
          <div style="opacity:.82">${escapeHtml(item.description)}</div>
        </li>
      `).join('');
      const vesselRows = vesselData.vessels.slice(0, 5).map((vessel) => `
        <li style="border:1px solid var(--border-color);border-radius:10px;padding:10px;display:grid;gap:6px">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <strong>${escapeHtml(vessel.name)}</strong>
            <span>${escapeHtml(vessel.operatorCountry)}</span>
          </div>
          <div>${escapeHtml(vessel.vesselType)} | سرعت: <strong>${Math.round(vessel.speed)} kn</strong> | اعتماد: <strong>${escapeHtml(vessel.confidence)}</strong></div>
          <div>چوک‌پوینت: <strong>${escapeHtml(vessel.nearChokepoint || '—')}</strong> | AIS gap: <strong>${vessel.aisGapMinutes ?? 0}m</strong></div>
        </li>
      `).join('');
      const indexRows = shipping.indices.slice(0, 4).map((index) => `
        <li style="display:flex;justify-content:space-between;gap:8px;border:1px solid var(--border-color);border-radius:10px;padding:10px">
          <span>${escapeHtml(index.name)}</span>
          <span style="color:${badgeColor(index.changePct >= 0)}">${formatSigned(index.changePct)}٪</span>
        </li>
      `).join('');

      this.setContent(`
        <section style="direction:rtl;text-align:right;display:grid;gap:14px;line-height:1.8">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
            <div style="border:1px solid var(--border-color);border-radius:12px;padding:10px">
              <div style="opacity:.72">AIS</div>
              <strong>${aisStatus.connected ? 'Live' : 'Degraded'}</strong>
              <div>${aisStatus.vessels} vessel | ${aisStatus.messages} msg</div>
            </div>
            <div style="border:1px solid var(--border-color);border-radius:12px;padding:10px">
              <div style="opacity:.72">اختلالات</div>
              <strong>${ais.disruptions.length}</strong>
              <div>density zones: ${ais.density.length}</div>
            </div>
            <div style="border:1px solid var(--border-color);border-radius:12px;padding:10px">
              <div style="opacity:.72">نظامی</div>
              <strong>${vesselData.vessels.length}</strong>
              <div>cluster: ${vesselData.clusters.length}</div>
            </div>
            <div style="border:1px solid var(--border-color);border-radius:12px;padding:10px">
              <div style="opacity:.72">شاخص حمل‌ونقل</div>
              <strong>${shipping.indices.length}</strong>
              <div>chokepoints: ${chokepoints.chokepoints.length}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">
            <section style="display:grid;gap:8px">
              <h4 style="margin:0">اختلالات AIS</h4>
              <ul style="margin:0;padding:0;list-style:none;display:grid;gap:8px">${disruptions || '<li style="opacity:.8">اختلال شاخصی ثبت نشده است.</li>'}</ul>
            </section>
            <section style="display:grid;gap:8px">
              <h4 style="margin:0">گلوگاه‌های راهبردی</h4>
              <ul style="margin:0;padding:0;list-style:none;display:grid;gap:8px">${chokepointRows || '<li style="opacity:.8">وضعیت chokepoint در دسترس نیست.</li>'}</ul>
            </section>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">
            <section style="display:grid;gap:8px">
              <h4 style="margin:0">کشتی‌های نظامی/حساس</h4>
              <ul style="margin:0;padding:0;list-style:none;display:grid;gap:8px">${vesselRows || '<li style="opacity:.8">داده زنده vessel در دسترس نیست.</li>'}</ul>
            </section>
            <section style="display:grid;gap:8px">
              <h4 style="margin:0">شاخص‌های حمل دریایی</h4>
              <ul style="margin:0;padding:0;list-style:none;display:grid;gap:8px">${indexRows || '<li style="opacity:.8">شاخص حمل‌ونقل در دسترس نیست.</li>'}</ul>
            </section>
          </div>
        </section>
      `);
      this.setDataBadge(aisStatus.connected ? 'live' : 'cached');
      this.setErrorState(false);
    } catch (error) {
      this.showError(error instanceof Error ? error.message : 'Maritime traffic unavailable', () => { void this.refresh(); }, 45);
      this.setDataBadge('unavailable');
    }
  }
}
