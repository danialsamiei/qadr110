import { Panel } from './Panel';
import type { PredictionMarket } from '@/services/prediction';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import type { ConvergenceSignal } from '@/services/spatial-convergence';

export class PredictionPanel extends Panel {
  private convergence: ConvergenceSignal[] = [];

  constructor() {
    super({
      id: 'polymarket',
      title: t('panels.polymarket'),
      infoTooltip: t('components.prediction.infoTooltip'),
    });
  }

  private formatVolume(volume?: number): string {
    if (!volume) return '';
    if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
    if (volume >= 1_000) return `$${(volume / 1_000).toFixed(0)}K`;
    return `$${volume.toFixed(0)}`;
  }


  public setConvergenceSummary(items: ConvergenceSignal[]): void {
    this.convergence = items;
    this.bindConvergenceControls();
  }

  private bindConvergenceControls(): void {
    this.content.querySelectorAll<HTMLElement>('[data-conv-view]').forEach((el) => {
      el.onclick = () => {
        const view = el.dataset.convView as 'off' | 'polymarket' | 'gdelt' | 'cyber' | 'combined';
        window.dispatchEvent(new CustomEvent('qadr110:convergence-view', { detail: view }));
      };
    });
    this.content.querySelectorAll<HTMLElement>('[data-market-title]').forEach((el) => {
      el.onclick = () => {
        const title = el.dataset.marketTitle || '';
        if (!title) return;
        window.dispatchEvent(new CustomEvent('qadr110:polymarket-focus', { detail: { title } }));
      };
    });
  }

  public renderPredictions(data: PredictionMarket[]): void {
    if (data.length === 0) {
      this.showError(t('common.failedPredictions'));
      return;
    }

    const convTop = this.convergence.length > 0
      ? `<div class="prediction-convergence"><div class="prediction-convergence-title">${t('components.convergence.title')}</div><div class="prediction-convergence-controls"><button type="button" data-conv-view="polymarket">Polymarket</button><button type="button" data-conv-view="gdelt">GDELT</button><button type="button" data-conv-view="cyber">Cyber</button><button type="button" data-conv-view="combined">${t('components.convergence.combined')}</button></div></div>`
      : `<div class="prediction-convergence"><div class="prediction-convergence-title">${t('components.convergence.title')}</div><div class="prediction-convergence-empty">${t('components.convergence.empty')}</div></div>`;

    const html = convTop + data
      .map((p) => {
        const yesPercent = Math.round(p.yesPrice);
        const noPercent = 100 - yesPercent;
        const volumeStr = this.formatVolume(p.volume);

        const safeUrl = sanitizeUrl(p.url || '');
        const titleHtml = safeUrl
          ? `<a href="${safeUrl}" target="_blank" rel="noopener" class="prediction-question prediction-link">${escapeHtml(p.title)}</a>`
          : `<div class="prediction-question">${escapeHtml(p.title)}</div>`;

        let expiryHtml = '';
        if (p.endDate) {
          const d = new Date(p.endDate);
          if (Number.isFinite(d.getTime())) {
            const formatted = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            expiryHtml = `<span class="prediction-expiry">${t('components.predictions.closes')}: ${formatted}</span>`;
          }
        }

        const metaHtml = (volumeStr || expiryHtml)
          ? `<div class="prediction-meta">${volumeStr ? `<span class="prediction-volume">${t('components.predictions.vol')}: ${volumeStr}</span>` : ''}${expiryHtml}</div>`
          : '';

        return `
      <div class="prediction-item" data-market-title="${escapeHtml(p.title)}">
        ${titleHtml}
        ${metaHtml}
        <div class="prediction-bar">
          <div class="prediction-yes" style="width: ${yesPercent}%">
            <span class="prediction-label">${t('components.predictions.yes')} ${yesPercent}%</span>
          </div>
          <div class="prediction-no" style="width: ${noPercent}%">
            <span class="prediction-label">${t('components.predictions.no')} ${noPercent}%</span>
          </div>
        </div>
      </div>
    `;
      })
      .join('');

    this.setContent(html);
    this.bindConvergenceControls();
  }
}
