import { Panel } from './Panel';
import { blackSwanIntelligenceStore } from '@/services/black-swan-intelligence';
import type { BlackSwanEngineState } from '@/ai/black-swan-engine';

export class BlackSwanPanel extends Panel {
  private state: BlackSwanEngineState | null = null;
  private showAnalystMode = true;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super({
      id: 'black-swan-watch',
      title: 'رصد قوی سیاه',
      className: 'panel-wide',
    });
    this.state = blackSwanIntelligenceStore.getState();
    this.unsubscribe = blackSwanIntelligenceStore.subscribe((state) => {
      this.state = state;
      this.render();
    });
    this.content.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-black-swan-action]');
      if (!target) return;
      if (target.dataset.blackSwanAction === 'toggle-analyst-mode') {
        this.showAnalystMode = !this.showAnalystMode;
        this.render();
      }
    });
    this.render();
  }

  public override destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    super.destroy();
  }

  private renderEmpty(): void {
    this.setContent(`
      <div class="black-swan-panel">
        <div class="black-swan-empty">
          <strong>هنوز candidate فعالی ثبت نشده است</strong>
          <p>با کلیک روی نقشه، اجرای سناریو، یا ورود سیگنال‌های تازه، این پنل futures کم‌احتمال اما پراثر را رصد می‌کند.</p>
        </div>
      </div>
    `);
  }

  private render(): void {
    if (!this.state) {
      this.renderEmpty();
      return;
    }

    const top = this.state.candidates[0];
    const baseline = this.state.baseScenarioOutput.scenarios.slice(0, 3);
    const watchlist = this.state.watchlist.slice(0, 6);

    this.setContent(`
      <div class="black-swan-panel">
        <div class="black-swan-toolbar">
          <div>
            <strong>لنگر: ${this.escape(this.state.anchorLabel)}</strong>
            <div class="black-swan-toolbar-meta">به‌روزرسانی: ${this.escape(this.state.updatedAt)}</div>
          </div>
          <button class="black-swan-toggle-btn" data-black-swan-action="toggle-analyst-mode">
            ${this.showAnalystMode ? 'خاموش‌کردن توضیح تحلیلی' : 'نمای توضیح تحلیلی'}
          </button>
        </div>

        <div class="black-swan-summary-grid">
          <article class="black-swan-summary-card">
            <span>Candidate فعال</span>
            <strong>${this.state.candidates.length}</strong>
          </article>
          <article class="black-swan-summary-card">
            <span>شاخص‌های watchlist</span>
            <strong>${watchlist.length}</strong>
          </article>
          <article class="black-swan-summary-card">
            <span>Blind-spot pressure</span>
            <strong>${Math.round(this.state.scoring.blindSpotPressure * 100)}%</strong>
          </article>
          <article class="black-swan-summary-card">
            <span>پوشش baseline</span>
            <strong>${Math.round(this.state.scoring.baselineCoverage * 100)}%</strong>
          </article>
        </div>

        ${top ? `
          <section class="black-swan-featured">
            <div class="black-swan-featured-head">
              <strong>${this.escape(top.title)}</strong>
              <span class="black-swan-status black-swan-status-${this.escape(top.monitoring_status || 'watch')}">${this.escape(top.monitoring_status || 'watch')}</span>
            </div>
            <p>${this.escape(top.summary)}</p>
            <div class="black-swan-metrics">
              <span>شدت ${Math.round((top.severity_score || 0.5) * 100)}%</span>
              <span>اثر ${this.escape(top.impact_level)}</span>
              <span>احتمال ${this.escape(top.probability)}</span>
            </div>
            ${this.showAnalystMode ? `
              <div class="black-swan-analyst-note">
                <div><strong>کم‌احتمال چون:</strong> ${this.escape(top.low_probability_reason)}</div>
                <div><strong>پراثر چون:</strong> ${this.escape(top.high_impact_reason)}</div>
                <div><strong>عدم‌قطعیت:</strong> ${this.escape(top.uncertainty_note)}</div>
              </div>
            ` : ''}
          </section>
        ` : ''}

        <section class="black-swan-section">
          <h4>Black Swan candidateها</h4>
          <div class="black-swan-candidate-list">
            ${this.state.candidates.map((candidate) => `
              <article class="black-swan-candidate-card">
                <div class="black-swan-candidate-head">
                  <strong>${this.escape(candidate.title)}</strong>
                  <span>${Math.round((candidate.severity_score || 0.5) * 100)}%</span>
                </div>
                <p>${this.escape(candidate.why_it_matters)}</p>
                <div class="black-swan-chip-row">
                  ${candidate.affected_domains.map((domain) => `<span class="black-swan-chip">${this.escape(domain)}</span>`).join('')}
                </div>
                <div class="black-swan-mini-list">
                  <div><strong>فرض‌های شکسته:</strong> ${this.escape(candidate.broken_assumptions.slice(0, 2).join(' | '))}</div>
                  <div><strong>شاخص‌های پیش‌نگر:</strong> ${this.escape(candidate.leading_indicators.slice(0, 3).join(' | '))}</div>
                </div>
              </article>
            `).join('')}
          </div>
        </section>

        <section class="black-swan-section">
          <h4>واچ‌لیست پایش</h4>
          <div class="black-swan-watchlist">
            ${watchlist.map((item) => `
              <article class="black-swan-watch-card">
                <strong>${this.escape(item.label)}</strong>
                <div class="black-swan-watch-meta">${this.escape(item.kind)} | ${this.escape(item.status)} | ${Math.round(item.strength * 100)}%</div>
              </article>
            `).join('')}
          </div>
        </section>

        <section class="black-swan-section">
          <h4>مقایسه با baseline</h4>
          <div class="black-swan-baseline-list">
            ${baseline.map((scenario) => `
              <article class="black-swan-baseline-card">
                <strong>${this.escape(scenario.title)}</strong>
                <div class="black-swan-watch-meta">احتمال ${this.escape(scenario.probability)} | اثر ${this.escape(scenario.impact_level)}</div>
                <p>${this.escape(scenario.description)}</p>
              </article>
            `).join('')}
          </div>
        </section>
      </div>
    `);
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
