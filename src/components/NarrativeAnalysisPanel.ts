import { Panel } from './Panel';
import type { ClusteredEvent, NewsItem } from '@/types';
import { buildNarrativeAnalysis, type EventNarrativeAnalysis } from '@/services/intel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';

export class NarrativeAnalysisPanel extends Panel {
  constructor() {
    super({ id: 'narrative-analysis', title: t('panels.narrativeAnalysis'), className: 'panel-wide' });
    this.setContent('<div class="panel-empty">منتظر داده‌های روایت…</div>');
  }

  renderNarratives(news: NewsItem[], clusters: ClusteredEvent[]): void {
    const analyses = buildNarrativeAnalysis(news, clusters);
    if (analyses.length === 0) {
      this.setContent('<div class="panel-empty">داده کافی برای تحلیل روایت موجود نیست.</div>');
      return;
    }

    this.setCount(analyses.length);
    this.setContent(analyses.map((a) => this.renderCard(a)).join(''));
  }

  private renderCard(analysis: EventNarrativeAnalysis): string {
    const polarityPct = Math.round((analysis.metrics.narrativePolarity + 1) * 50);
    return `
      <article class="narrative-card">
        <header>
          <h4>${escapeHtml(analysis.title)}</h4>
          <div class="narrative-meta">
            <span>Confidence: ${Math.round(analysis.confidence * 100)}%</span>
            <span>Framing Shift: ${analysis.metrics.framingShift}</span>
            <span>Propaganda Intensity: ${analysis.metrics.propagandaIntensity}</span>
            <span>Narrative Polarity: ${polarityPct}</span>
          </div>
        </header>

        <div class="narrative-aligned">Aligned Narrative: ${escapeHtml(analysis.alignedNarrative || '—')}</div>

        <div class="narrative-bloc-chart">
          ${analysis.blocs.map((bloc) => `
            <div class="narrative-bloc-row">
              <div class="narrative-bloc-label">${escapeHtml(bloc.bloc)} (${bloc.sourceCount})</div>
              <div class="narrative-bloc-bar">
                <span class="fill" style="width:${Math.max(8, Math.round((bloc.avgPolarity + 1) * 50))}%"></span>
              </div>
              <div class="narrative-bloc-score">${Math.round(bloc.avgPolarity * 100)}</div>
            </div>
          `).join('')}
        </div>

        <ul class="narrative-evidence-list">
          ${analysis.evidence.map((e) => `
            <li>
              <a href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(e.source)}</a>
              <span class="lang">${e.language.toUpperCase()}</span>
              <span class="conf">${Math.round(e.confidence * 100)}%</span>
              <p>${escapeHtml(e.claim)}</p>
            </li>
          `).join('')}
        </ul>
      </article>
    `;
  }
}
