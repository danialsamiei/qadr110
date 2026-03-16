import type { GeoAnalysisWorkspaceState } from '@/platform/operations/geo-analysis';
import {
  getMapAnalysisRunningJobs,
  getMapAnalysisUnreadResults,
  mapAnalysisWorkspace,
} from './map-analysis-workspace';
import { escapeHtml } from '@/utils/sanitize';

class MapAnalysisHud {
  private root: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;

  mount(): void {
    if (typeof document === 'undefined' || this.root) return;
    this.root = document.createElement('div');
    this.root.className = 'geo-analysis-hud';
    document.body.appendChild(this.root);
    this.unsubscribe = mapAnalysisWorkspace.subscribe((state) => this.render(state));
    this.render(mapAnalysisWorkspace.getState());
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.root?.remove();
    this.root = null;
  }

  private render(state: GeoAnalysisWorkspaceState): void {
    if (!this.root) return;
    const running = getMapAnalysisRunningJobs(state);
    const unread = getMapAnalysisUnreadResults(state);

    this.root.innerHTML = `
      <div class="geo-analysis-hud-jobs ${running.length > 0 ? 'visible' : ''}">
        ${running.map((job) => `
          <article class="geo-analysis-hud-chip">
            <div>
              <strong>${escapeHtml(job.descriptor.title)}</strong>
              <small>${job.autoMinimized ? 'در پس‌زمینه' : 'در حال اجرا'}</small>
            </div>
            <button type="button" class="geo-analysis-chip danger" data-cancel-job="${escapeHtml(job.id)}">لغو</button>
          </article>
        `).join('')}
      </div>
      <div class="geo-analysis-toast-stack">
        ${unread.map((result) => `
          <article class="geo-analysis-toast">
            <strong>تحلیل آماده شد</strong>
            <p>${escapeHtml(result.descriptor.title)}</p>
            <div class="geo-analysis-card-actions">
              <button type="button" class="geo-analysis-chip active" data-open-result="${escapeHtml(result.id)}">باز کردن</button>
              <button type="button" class="geo-analysis-chip" data-dismiss-result="${escapeHtml(result.id)}">بستن</button>
            </div>
          </article>
        `).join('')}
      </div>
    `;

    this.root.querySelectorAll<HTMLElement>('[data-cancel-job]').forEach((button) => {
      button.addEventListener('click', () => {
        const jobId = button.dataset.cancelJob;
        if (!jobId) return;
        mapAnalysisWorkspace.cancel(jobId);
      });
    });

    this.root.querySelectorAll<HTMLElement>('[data-open-result]').forEach((button) => {
      button.addEventListener('click', () => {
        const resultId = button.dataset.openResult;
        if (!resultId) return;
        mapAnalysisWorkspace.openResult(resultId);
      });
    });

    this.root.querySelectorAll<HTMLElement>('[data-dismiss-result]').forEach((button) => {
      button.addEventListener('click', () => {
        const resultId = button.dataset.dismissResult;
        if (!resultId) return;
        mapAnalysisWorkspace.dismissResultNotification(resultId);
      });
    });
  }
}

const mapAnalysisHud = new MapAnalysisHud();

export function ensureMapAnalysisHudMounted(): void {
  mapAnalysisHud.mount();
}
