import { Panel } from './Panel';
import { t } from '@/services/i18n';
import { h, replaceChildren } from '@/utils/dom-utils';
import { getNRCScore, getNRCLevelColor, type NRCScore } from '@/services/nrc-resilience';

export class CSRCPanel extends Panel {
  private selectedCountry = 'IR';

  constructor() {
    super({
      id: 'csrc-cognitive',
      title: t('panels.csrcCognitive') || 'Cognitive-Social (CSRC)',
      infoTooltip: t('nrc.csrcTooltip') || 'CSRC = 0.55 × Cognitive + 0.45 × Social resilience',
    });
    this.showLoading(t('common.loading'));
  }

  private buildCSRCView(score: NRCScore): HTMLElement {
    const csrc = score.domains.cognitiveSocial;
    const social = score.domains.social;
    const color = getNRCLevelColor(score.level);

    // Estimate CogR and SocR from the composite
    // CSRC = 0.55 × CogR + 0.45 × SocR; we approximate
    const socR = social.value;
    const cogR = csrc.value > 0 ? (csrc.value - 0.45 * socR) / 0.55 : 0;
    const cogRClamped = Math.max(0, Math.min(100, Math.round(cogR)));

    return h('div', { className: 'csrc-content' },
      h('div', { className: 'csrc-header' },
        h('h4', {}, `${score.countryName} — CSRC`),
        h('span', { className: 'csrc-overall', style: `color: ${color};` }, String(csrc.value)),
      ),
      // Two-part display: Cognitive vs Social
      h('div', { className: 'csrc-dual' },
        h('div', { className: 'csrc-section' },
          h('h5', {}, '🧠 ' + (t('nrc.cognitiveResilience') || 'Cognitive Resilience')),
          h('div', { className: 'csrc-score-display' }, String(cogRClamped)),
          h('div', { className: 'csrc-bar-container' },
            h('div', { className: 'csrc-bar', style: `width: ${cogRClamped}%; background: #6366f1;` }),
          ),
          h('div', { className: 'csrc-components' },
            h('span', {}, `${t('nrc.psychResilience') || 'Psychological Resilience'}: 40%`),
            h('span', {}, `${t('nrc.mentalHealth') || 'Mental Health'}: 35%`),
            h('span', {}, `${t('nrc.coping') || 'Coping'}: 25%`),
          ),
        ),
        h('div', { className: 'csrc-section' },
          h('h5', {}, '👥 ' + (t('nrc.socialResilience') || 'Social Resilience')),
          h('div', { className: 'csrc-score-display' }, String(socR)),
          h('div', { className: 'csrc-bar-container' },
            h('div', { className: 'csrc-bar', style: `width: ${socR}%; background: #f59e0b;` }),
          ),
          h('div', { className: 'csrc-components' },
            h('span', {}, `${t('nrc.socialCapital') || 'Social Capital'}: 40%`),
            h('span', {}, `${t('nrc.cohesion') || 'Social Cohesion'}: 35%`),
            h('span', {}, `${t('nrc.belonging') || 'Sense of Belonging'}: 25%`),
          ),
        ),
      ),
      h('div', { className: 'csrc-formula' },
        h('span', {}, 'CSRC = 0.55 × CogR + 0.45 × SocR'),
      ),
      h('div', { className: 'csrc-confidence' },
        h('span', {}, `${t('nrc.confidence') || 'Confidence'}: ${Math.round(csrc.confidence * 100)}%`),
      ),
    );
  }

  public async refresh(): Promise<void> {
    try {
      const score = getNRCScore(this.selectedCountry);

      if (!score) {
        this.setErrorState(false);
        replaceChildren(this.content, h('div', { className: 'empty-state' }, t('nrc.noData') || 'No CSRC data available'));
        return;
      }

      this.setErrorState(false);
      replaceChildren(this.content, this.buildCSRCView(score));
    } catch (error) {
      console.error('[CSRCPanel] Refresh error:', error);
      this.showError(t('nrc.error') || 'Failed to load CSRC data', () => void this.refresh());
    }
  }

  public setCountry(code: string): void {
    this.selectedCountry = code;
    void this.refresh();
  }
}
