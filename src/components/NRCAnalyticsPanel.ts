import { Panel } from './Panel';
import { t } from '@/services/i18n';
import { h, replaceChildren } from '@/utils/dom-utils';
import { getNRCScore, getNRCHistory, getRegionalAverages, type NRCScore, type NRCDomainKey } from '@/services/nrc-resilience';
import {
  nrcForecast, movingAverage, momentum, volatility, growthRate,
  detectTrend, detectCrossovers, pearsonCorrelation,
  controlChart, detectChangepoints, deaEfficiency,
  type ForecastResult, type DEAUnit,
} from '@/services/nrc-statistics';

type TabKey = 'forecast' | 'trends' | 'analysis' | 'efficiency';

const DOMAIN_KEYS: NRCDomainKey[] = ['economic', 'social', 'governance', 'health', 'infrastructure', 'cognitiveSocial'];

export class NRCAnalyticsPanel extends Panel {
  private currentTab: TabKey = 'forecast';
  private selectedCountry = 'IR';

  constructor() {
    super({
      id: 'nrc-analytics',
      title: t('panels.nrcAnalytics') || 'NRC Analytics',
      infoTooltip: t('nrc.analyticsTooltip') || 'Advanced NRC trend analysis, forecasting, and efficiency',
    });
    this.showLoading(t('common.loading'));
  }

  private buildTabs(): HTMLElement {
    const tabs: Array<{ key: TabKey; label: string }> = [
      { key: 'forecast', label: t('nrc.forecast') || 'Forecast' },
      { key: 'trends', label: t('nrc.trends') || 'Trends' },
      { key: 'analysis', label: t('nrc.analysis') || 'Analysis' },
      { key: 'efficiency', label: t('nrc.efficiency') || 'Efficiency (DEA)' },
    ];

    const tabBar = h('div', { className: 'nrc-tab-bar' },
      ...tabs.map(tab => {
        const btn = h('button', {
          className: `nrc-tab${tab.key === this.currentTab ? ' nrc-tab-active' : ''}`,
          dataset: { tab: tab.key },
        }, tab.label);
        return btn;
      }),
    );

    tabBar.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
      if (target?.dataset.tab) {
        this.currentTab = target.dataset.tab as TabKey;
        void this.refresh();
      }
    });

    return tabBar;
  }

  private buildForecastTab(history: number[], _score: NRCScore | null): HTMLElement {
    if (history.length < 3) {
      return h('div', { className: 'nrc-analytics-empty' }, t('nrc.insufficientData') || 'Insufficient historical data for forecast');
    }

    const forecast: ForecastResult = nrcForecast(history, 30, 0.3);
    const lastValue = history[history.length - 1] ?? 50;
    const direction = forecast.probabilityUp > 0.5 ? 'improvement' : 'decline';
    const probability = Math.round(Math.max(forecast.probabilityUp, forecast.probabilityDown) * 100);

    return h('div', { className: 'nrc-forecast' },
      h('h4', {}, t('nrc.forecastTitle') || '30-Day NRC Forecast'),
      h('div', { className: 'nrc-forecast-summary' },
        h('div', { className: 'nrc-metric' },
          h('span', { className: 'nrc-metric-label' }, 'Current'),
          h('span', { className: 'nrc-metric-value' }, String(lastValue)),
        ),
        h('div', { className: 'nrc-metric' },
          h('span', { className: 'nrc-metric-label' }, 'Forecast (30d)'),
          h('span', { className: 'nrc-metric-value' }, String(forecast.values[forecast.values.length - 1] ?? lastValue)),
        ),
        h('div', { className: 'nrc-metric' },
          h('span', { className: 'nrc-metric-label' }, 'MAPE'),
          h('span', { className: 'nrc-metric-value' }, `${forecast.mape}%`),
        ),
        h('div', { className: 'nrc-metric' },
          h('span', { className: 'nrc-metric-label' }, 'R²'),
          h('span', { className: 'nrc-metric-value' }, String(forecast.rSquared)),
        ),
      ),
      h('div', { className: 'nrc-probability-narrative' },
        h('p', {}, `${probability}% probability of ${direction} over the next 30 days. ` +
          `CI: [${forecast.confidenceIntervals[forecast.confidenceIntervals.length - 1]?.lower ?? '–'}, ` +
          `${forecast.confidenceIntervals[forecast.confidenceIntervals.length - 1]?.upper ?? '–'}]`),
      ),
      // Sparkline representation of forecast values
      h('div', { className: 'nrc-forecast-chart' },
        ...forecast.values.slice(0, 15).map((v, i) =>
          h('div', {
            className: 'nrc-forecast-bar',
            style: `height: ${v}%; background: ${v > lastValue ? '#22c55e' : '#ef4444'};`,
            title: `Day ${i + 1}: ${v}`,
          }),
        ),
      ),
    );
  }

  private buildTrendsTab(history: number[], _score: NRCScore | null): HTMLElement {
    if (history.length < 5) {
      return h('div', { className: 'nrc-analytics-empty' }, 'Need at least 5 data points for trend analysis');
    }

    const trend = detectTrend(history);
    const ma20 = movingAverage(history, Math.min(20, history.length));
    const ma50 = movingAverage(history, Math.min(50, history.length));
    const mom = momentum(history, Math.min(10, history.length - 1));
    const vol = volatility(history);
    const growth = growthRate(history, Math.min(10, history.length - 1));
    const crossovers = ma20.length > 0 && ma50.length > 0 ? detectCrossovers(ma20, ma50) : [];

    const trendIcon = trend === 'rising' ? '📈' : trend === 'falling' ? '📉' : '➡️';
    const trendColor = trend === 'rising' ? '#22c55e' : trend === 'falling' ? '#ef4444' : '#eab308';

    return h('div', { className: 'nrc-trends' },
      h('h4', {}, t('nrc.trendsTitle') || 'Trend Analysis'),
      h('div', { className: 'nrc-trend-direction', style: `color: ${trendColor};` },
        h('span', {}, `${trendIcon} ${trend.charAt(0).toUpperCase() + trend.slice(1)}`),
      ),
      h('div', { className: 'nrc-trend-metrics' },
        h('div', { className: 'nrc-metric' },
          h('span', { className: 'nrc-metric-label' }, t('nrc.momentum') || 'Momentum'),
          h('span', { className: 'nrc-metric-value' }, `${mom.toFixed(1)}%`),
        ),
        h('div', { className: 'nrc-metric' },
          h('span', { className: 'nrc-metric-label' }, t('nrc.volatility') || 'Volatility'),
          h('span', { className: 'nrc-metric-value' }, vol.toFixed(4)),
        ),
        h('div', { className: 'nrc-metric' },
          h('span', { className: 'nrc-metric-label' }, t('nrc.growthRate') || 'Growth Rate'),
          h('span', { className: 'nrc-metric-value' }, `${growth.toFixed(1)}%`),
        ),
        h('div', { className: 'nrc-metric' },
          h('span', { className: 'nrc-metric-label' }, 'MA Crossovers'),
          h('span', { className: 'nrc-metric-value' }, String(crossovers.length)),
        ),
      ),
      crossovers.length > 0
        ? h('div', { className: 'nrc-crossovers' },
            ...crossovers.slice(-3).map(c =>
              h('span', { className: `nrc-crossover nrc-crossover-${c.type}` },
                `${c.type === 'golden' ? '🌟 Golden' : '💀 Death'} Cross at index ${c.index}`),
            ),
          )
        : h('span', {}),
    );
  }

  private buildAnalysisTab(history: number[], score: NRCScore | null): HTMLElement {
    if (!score || history.length < 6) {
      return h('div', { className: 'nrc-analytics-empty' }, 'Need more data for advanced analysis');
    }

    // Control chart
    const chart = controlChart(history);

    // Changepoint detection
    const changepoints = detectChangepoints(history, 2.0);

    // Cross-domain correlation (using domain values)
    const domainValues = DOMAIN_KEYS.map(k => score.domains[k].value);
    const corr = domainValues.length >= 2
      ? pearsonCorrelation(domainValues.slice(0, 3), domainValues.slice(3))
      : 0;

    return h('div', { className: 'nrc-analysis' },
      h('h4', {}, t('nrc.analysisTitle') || 'Statistical Analysis'),
      h('div', { className: 'nrc-control-chart-info' },
        h('div', { className: 'nrc-metric' },
          h('span', { className: 'nrc-metric-label' }, 'Mean'),
          h('span', { className: 'nrc-metric-value' }, chart.mean.toFixed(1)),
        ),
        h('div', { className: 'nrc-metric' },
          h('span', { className: 'nrc-metric-label' }, 'Std Dev'),
          h('span', { className: 'nrc-metric-value' }, chart.stdDev.toFixed(2)),
        ),
        h('div', { className: 'nrc-metric' },
          h('span', { className: 'nrc-metric-label' }, '2σ Violations'),
          h('span', { className: 'nrc-metric-value' }, String(chart.violations2Sigma.length)),
        ),
        h('div', { className: 'nrc-metric' },
          h('span', { className: 'nrc-metric-label' }, '3σ Violations'),
          h('span', { className: 'nrc-metric-value' }, String(chart.violations3Sigma.length)),
        ),
      ),
      h('div', { className: 'nrc-changepoints' },
        h('span', { className: 'nrc-metric-label' }, 'Changepoints Detected'),
        h('span', { className: 'nrc-metric-value' }, changepoints.length > 0 ? changepoints.join(', ') : 'None'),
      ),
      h('div', { className: 'nrc-correlation' },
        h('span', { className: 'nrc-metric-label' }, 'Cross-domain Correlation'),
        h('span', { className: 'nrc-metric-value' }, corr.toFixed(3)),
      ),
    );
  }

  private buildEfficiencyTab(): HTMLElement {
    const regions = getRegionalAverages();
    if (regions.length === 0) {
      return h('div', { className: 'nrc-analytics-empty' }, 'No regional data available');
    }

    // DEA: inputs = number of countries, outputs = average NRC score
    const deaUnits: DEAUnit[] = regions.map(r => ({
      id: r.region,
      name: r.region,
      inputs: [r.countries],
      outputs: [r.avgScore],
    }));

    const deaResults = deaEfficiency(deaUnits);

    return h('div', { className: 'nrc-efficiency' },
      h('h4', {}, t('nrc.efficiencyTitle') || 'Regional Efficiency (DEA)'),
      h('div', { className: 'nrc-dea-list' },
        ...deaResults.map(r => {
          const pct = Math.round(r.efficiency * 100);
          const color = pct >= 90 ? '#22c55e' : pct >= 60 ? '#eab308' : '#ef4444';
          return h('div', { className: 'nrc-dea-row' },
            h('span', { className: 'nrc-dea-rank' }, `#${r.rank}`),
            h('span', { className: 'nrc-dea-name' }, r.name),
            h('div', { className: 'nrc-dea-bar-container' },
              h('div', { className: 'nrc-dea-bar', style: `width: ${pct}%; background: ${color};` }),
            ),
            h('span', { className: 'nrc-dea-value' }, `${pct}%`),
            r.isBenchmark ? h('span', { className: 'nrc-dea-benchmark' }, '⭐') : h('span', {}),
          );
        }),
      ),
    );
  }

  public async refresh(): Promise<void> {
    try {
      const score = getNRCScore(this.selectedCountry);
      const history = getNRCHistory(this.selectedCountry);

      this.setErrorState(false);

      let tabContent: HTMLElement;
      switch (this.currentTab) {
        case 'forecast':
          tabContent = this.buildForecastTab(history, score);
          break;
        case 'trends':
          tabContent = this.buildTrendsTab(history, score);
          break;
        case 'analysis':
          tabContent = this.buildAnalysisTab(history, score);
          break;
        case 'efficiency':
          tabContent = this.buildEfficiencyTab();
          break;
      }

      replaceChildren(this.content,
        this.buildTabs(),
        h('div', { className: 'nrc-country-selector' },
          h('label', {}, t('nrc.country') || 'Country: '),
          h('span', { className: 'nrc-selected-country' }, score?.countryName ?? this.selectedCountry),
        ),
        tabContent,
      );
    } catch (error) {
      console.error('[NRCAnalyticsPanel] Refresh error:', error);
      this.showError(t('nrc.error') || 'Failed to load analytics', () => void this.refresh());
    }
  }

  public setCountry(code: string): void {
    this.selectedCountry = code;
    void this.refresh();
  }
}
