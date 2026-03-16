import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import {
  clearOpsLogs,
  getOpsLogEntries,
  subscribeOpsLogs,
  type OpsLogEntry,
  getDemoModeState,
  setDemoModeEnabled,
} from '@/platform';
import {
  RUNTIME_FEATURES,
  isFeatureAvailable,
  isFeatureEnabled,
  type RuntimeFeatureDefinition,
} from '@/services/runtime-config';

function downloadJson(payload: unknown, filename: string): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatTime(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleString('fa-IR', { hour12: false });
  } catch {
    return iso;
  }
}

function renderFeatureRow(feature: RuntimeFeatureDefinition): string {
  const enabled = isFeatureEnabled(feature.id);
  const available = isFeatureAvailable(feature.id);
  const badge = available
    ? '<span class="ops-audit-pill ok">آماده</span>'
    : enabled
      ? '<span class="ops-audit-pill warn">کلید/کانکتور لازم است</span>'
      : '<span class="ops-audit-pill off">خاموش</span>';

  return `
    <tr>
      <td><strong>${escapeHtml(feature.name)}</strong><div class="ops-audit-dim">${escapeHtml(feature.id)}</div></td>
      <td>${badge}</td>
      <td class="ops-audit-dim">${escapeHtml(feature.fallback)}</td>
    </tr>
  `;
}

function renderLogEntry(entry: OpsLogEntry): string {
  const levelClass = entry.level === 'error' ? 'err' : entry.level === 'warn' ? 'warn' : 'info';
  const detail = entry.detail ? `<pre>${escapeHtml(JSON.stringify(entry.detail, null, 2))}</pre>` : '';
  return `
    <article class="ops-audit-log ${levelClass}">
      <header>
        <strong>${escapeHtml(entry.message)}</strong>
        <small>${escapeHtml(formatTime(entry.createdAt))} | ${escapeHtml(entry.kind)} | ${escapeHtml(entry.level)}</small>
      </header>
      ${detail}
    </article>
  `;
}

export class OpsAuditPanel extends Panel {
  private logs: OpsLogEntry[] = getOpsLogEntries();
  private unsubscribe: (() => void) | null = null;
  private readonly clickHandler: (event: MouseEvent) => void;

  constructor() {
    super({ id: 'ops-audit', title: 'پایش و ممیزی', className: 'panel-wide' });
    this.unsubscribe = subscribeOpsLogs((entries) => {
      this.logs = entries;
      this.renderView();
      this.setCount(this.logs.length);
    });
    this.clickHandler = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
      const action = target?.dataset.action;
      if (!action) return;

      if (action === 'clear-logs') {
        clearOpsLogs();
        return;
      }
      if (action === 'export-logs') {
        downloadJson({ entries: getOpsLogEntries() }, 'qadr110-ops-log');
        return;
      }
      if (action === 'toggle-demo') {
        const current = getDemoModeState().enabled;
        setDemoModeEnabled(!current);
        window.location.reload();
      }
    };
    this.content.addEventListener('click', this.clickHandler);
    this.renderView();
    this.setCount(this.logs.length);
  }

  public override destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.content.removeEventListener('click', this.clickHandler);
    super.destroy();
  }

  private renderView(): void {
    const demo = getDemoModeState();
    const topFeatures = RUNTIME_FEATURES.filter((feature) => [
      'aiOpenRouter',
      'aiOllama',
      'vectorWeaviate',
      'vectorChroma',
      'threatIntelExchange',
      'palantirFoundry',
    ].includes(feature.id));

    const logsMarkup = this.logs.length > 0
      ? this.logs.slice(0, 60).map(renderLogEntry).join('')
      : '<div class="ops-audit-empty">لاگ عملیاتی ثبت نشده است.</div>';

    this.setContent(`
      <section class="ops-audit" dir="rtl" lang="fa">
        <header class="ops-audit-header">
          <div>
            <h3>وضعیت اجرا</h3>
            <p class="ops-audit-dim">این پنل برای مشاهده trace تحلیل‌ها، وضعیت دمو و ممیزی درون‌برنامه‌ای است.</p>
          </div>
          <div class="ops-audit-actions">
            <span class="ops-audit-pill ${demo.enabled ? 'ok' : 'off'}">دمو: ${demo.enabled ? 'فعال' : 'خاموش'} (${escapeHtml(demo.source)})</span>
            <button type="button" class="ops-audit-btn" data-action="toggle-demo">${demo.enabled ? 'خاموش کردن دمو' : 'فعال کردن دمو'}</button>
            <button type="button" class="ops-audit-btn" data-action="export-logs">خروجی JSON</button>
            <button type="button" class="ops-audit-btn danger" data-action="clear-logs">پاکسازی لاگ</button>
          </div>
        </header>

        <section class="ops-audit-section">
          <h4>آمادگی کانکتورها (نمونه)</h4>
          <div class="ops-audit-table-wrap">
            <table class="ops-audit-table">
              <thead><tr><th>قابلیت</th><th>وضعیت</th><th>Fallback</th></tr></thead>
              <tbody>${topFeatures.map(renderFeatureRow).join('')}</tbody>
            </table>
          </div>
        </section>

        <section class="ops-audit-section">
          <h4>لاگ‌های اخیر</h4>
          <div class="ops-audit-logs">${logsMarkup}</div>
        </section>
      </section>
    `);
  }
}
