import { Panel } from './Panel';
import { calculateNRC, getNRCLevelColor, type NRCScore, type NRCDomainKey } from '@/services/nrc-resilience';
import { t } from '@/services/i18n';
import { h, replaceChildren } from '@/utils/dom-utils';

const DOMAIN_LABELS: Record<NRCDomainKey, { en: string; icon: string }> = {
  economic: { en: 'Economic', icon: '💰' },
  social: { en: 'Social', icon: '👥' },
  governance: { en: 'Governance', icon: '🏛️' },
  health: { en: 'Health', icon: '🏥' },
  infrastructure: { en: 'Infrastructure', icon: '🔧' },
  cognitiveSocial: { en: 'Cognitive-Social', icon: '🧠' },
};

const DOMAIN_KEYS: NRCDomainKey[] = ['economic', 'social', 'governance', 'health', 'infrastructure', 'cognitiveSocial'];

export class NRCPanel extends Panel {
  private scores: NRCScore[] = [];
  private onCountryClick?: (code: string) => void;

  constructor() {
    super({
      id: 'nrc-resilience',
      title: t('panels.nrcResilience') || 'نمای کلی تاب‌آوری ملی',
      infoTooltip: t('nrc.infoTooltip') || 'نمای خلاصه ۶دامنه‌ای از وضعیت تاب‌آوری برای ورود سریع به تحلیل عمیق‌تر',
    });
    this.showLoading(t('common.loading'));
  }

  public setCountryClickHandler(handler: (code: string) => void): void {
    this.onCountryClick = handler;
  }

  private getLevelLabel(level: NRCScore['level']): string {
    const labels: Record<string, string> = {
      very_high: '🟢 بسیار بالا',
      high: '🔵 بالا',
      moderate: '🟡 متوسط',
      low: '🟠 پایین',
      very_low: '🔴 بسیار پایین',
    };
    return labels[level] ?? level;
  }

  private buildTrendArrow(trend: NRCScore['trend'], change: number): HTMLElement {
    if (trend === 'rising') return h('span', { className: 'trend-up' }, `↑${change > 0 ? change : ''}`);
    if (trend === 'falling') return h('span', { className: 'trend-down' }, `↓${Math.abs(change)}`);
    return h('span', { className: 'trend-stable' }, '→');
  }

  private buildDomainBar(key: NRCDomainKey, score: NRCScore): HTMLElement {
    const domain = score.domains[key];
    const info = DOMAIN_LABELS[key];
    const color = getNRCLevelColor(score.level);
    return h('div', { className: 'nrc-domain-row' },
      h('span', { className: 'nrc-domain-icon' }, info.icon),
      h('span', { className: 'nrc-domain-name' }, t(`nrc.${key}`) || info.en),
      h('div', { className: 'nrc-domain-bar-container' },
        h('div', { className: 'nrc-domain-bar', style: `width: ${domain.value}%; background: ${color};` }),
      ),
      h('span', { className: 'nrc-domain-value' }, String(domain.value)),
    );
  }

  private buildCountryCard(score: NRCScore): HTMLElement {
    const color = getNRCLevelColor(score.level);

    const domainBars = DOMAIN_KEYS.map(k => this.buildDomainBar(k, score));

    return h('div', { className: 'nrc-country', dataset: { code: score.countryCode } },
      h('div', { className: 'nrc-header' },
        h('span', { className: 'nrc-name' }, score.countryName),
        h('span', { className: 'nrc-score', style: `color: ${color};` }, String(score.overallScore)),
        this.buildTrendArrow(score.trend, score.change24h),
        h('span', { className: 'nrc-level-badge', style: `background: ${color}22; color: ${color};` }, this.getLevelLabel(score.level)),
      ),
      h('div', { className: 'nrc-gauge-container' },
        h('div', { className: 'nrc-gauge-bar', style: `width: ${score.overallScore}%; background: linear-gradient(90deg, #ef4444, #eab308, #22c55e);` }),
      ),
      h('div', { className: 'nrc-domains' }, ...domainBars),
      h('div', { className: 'nrc-meta' },
        h('span', { title: t('nrc.cronbachAlpha') || "Cronbach's Alpha" }, `α=${score.cronbachAlpha}`),
        h('span', { title: t('nrc.confidenceInterval') || 'CI' }, `CI: ${score.confidenceInterval.lower}-${score.confidenceInterval.upper}`),
      ),
    );
  }

  private bindHandlers(): void {
    if (!this.onCountryClick) return;
    this.content.querySelectorAll('.nrc-country').forEach(el => {
      el.addEventListener('click', () => {
        const code = (el as HTMLElement).dataset.code;
        if (code && this.onCountryClick) this.onCountryClick(code);
      });
    });
  }

  public async refresh(): Promise<void> {
    try {
      const scores = calculateNRC();
      const withData = scores.filter(s => s.overallScore > 0);
      this.scores = scores;
      this.setCount(withData.length);

      if (withData.length === 0) {
        this.setErrorState(false);
        replaceChildren(this.content, h('div', { className: 'empty-state' }, t('nrc.noData') || 'No NRC data available'));
        return;
      }

      this.setErrorState(false);
      const listEl = h('div', { className: 'nrc-list' }, ...withData.map(s => this.buildCountryCard(s)));
      replaceChildren(this.content, listEl);
      this.bindHandlers();
    } catch (error) {
      console.error('[NRCPanel] Refresh error:', error);
      this.showError(t('nrc.error') || 'Failed to load NRC data', () => void this.refresh());
    }
  }

  public getScores(): NRCScore[] {
    return this.scores;
  }
}
