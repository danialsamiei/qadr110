import { Panel } from './Panel';
import { replaceChildren } from '@/utils/dom-utils';
import { escapeHtml } from '@/utils/sanitize';
import {
  buildResilienceReport,
  describeResilienceBand,
  getResilienceComparisonSet,
  getResilienceDashboardModel,
  getResilienceMethodologySummary,
  listResilienceBaselineCountries,
  narrateResilienceReportWithAi,
  type ResilienceDashboardModel,
  type ResilienceStructuredReport,
} from '@/services';
import {
  RESILIENCE_EVENT_TYPES,
  type ResilienceDashboardTab,
  type ResilienceOpenDetail,
  type ResilienceReportKind,
} from '@/platform';

const COUNTRIES = listResilienceBaselineCountries();
const DEFAULT_COMPARE_LIMIT = 7;
const SPILLOVER_CHANNEL_LABELS = {
  border: 'مرزی',
  trade: 'تجاری',
  energy: 'انرژی',
  migration: 'مهاجرتی',
  information: 'اطلاعاتی',
  security: 'امنیتی',
  logistics: 'لجستیکی',
} as const;

function defaultCompareCountries(primaryCountryCode: string): string[] {
  return getResilienceComparisonSet(primaryCountryCode).slice(0, DEFAULT_COMPARE_LIMIT);
}

function describeSpilloverChannel(channel: keyof typeof SPILLOVER_CHANNEL_LABELS): string {
  return SPILLOVER_CHANNEL_LABELS[channel] || channel;
}

function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function colorForScore(score: number): string {
  if (score >= 75) return '#1d8348';
  if (score >= 62) return '#3d9970';
  if (score >= 47) return '#d6a31c';
  if (score >= 32) return '#d97706';
  return '#dc2626';
}

function radarPolygon(values: number[], radius: number, center: number): string {
  return values.map((value, index) => {
    const angle = ((Math.PI * 2) / values.length) * index - (Math.PI / 2);
    const scaled = radius * (value / 100);
    const x = center + (Math.cos(angle) * scaled);
    const y = center + (Math.sin(angle) * scaled);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

export class NRCAnalyticsPanel extends Panel {
  private currentTab: ResilienceDashboardTab = 'dashboard';
  private selectedCountry = 'IR';
  private compareCountryCodes = defaultCompareCountries('IR');
  private reportType: ResilienceReportKind = 'national-brief';
  private statusLine = 'داشبورد تاب‌آوری آماده است.';
  private aiNarrationHtml = '';
  private aiNarrationStatus = '';
  private scenarioNote: ResilienceOpenDetail['scenario'] | null = null;
  private readonly openHandler: EventListener;

  constructor() {
    super({
      id: 'nrc-analytics',
      title: 'داشبورد تاب‌آوری و گزارش‌ساز',
      className: 'panel-wide',
      infoTooltip: 'موتور تاب‌آوری شفاف با ۱۴ بعد، پوشش داده، عدم‌قطعیت، سناریو و گزارش فارسی.',
    });
    this.openHandler = ((event: CustomEvent<ResilienceOpenDetail>) => {
      this.applyOpenDetail(event.detail);
    }) as EventListener;
    document.addEventListener(RESILIENCE_EVENT_TYPES.openDashboard, this.openHandler);
    void this.refresh();
  }

  public override destroy(): void {
    document.removeEventListener(RESILIENCE_EVENT_TYPES.openDashboard, this.openHandler);
    super.destroy();
  }

  public setCountry(code: string): void {
    this.selectedCountry = code.toUpperCase();
    this.compareCountryCodes = defaultCompareCountries(this.selectedCountry);
    void this.refresh();
  }

  private applyOpenDetail(detail: ResilienceOpenDetail): void {
    if (detail.primaryCountryCode) {
      this.selectedCountry = detail.primaryCountryCode.toUpperCase();
    }
    if (detail.compareCountryCodes?.length) {
      this.compareCountryCodes = detail.compareCountryCodes.map((code) => code.toUpperCase()).filter((code) => code !== this.selectedCountry).slice(0, DEFAULT_COMPARE_LIMIT);
    } else {
      this.compareCountryCodes = defaultCompareCountries(this.selectedCountry);
    }
    if (detail.focusTab) this.currentTab = detail.focusTab;
    if (detail.reportType) this.reportType = detail.reportType;
    this.scenarioNote = detail.scenario ?? null;
    this.statusLine = detail.title ? `درخواست ورودی: ${detail.title}` : 'تمرکز داشبورد به‌روزرسانی شد.';
    this.show();
    this.getElement().scrollIntoView({ behavior: 'smooth', block: 'start' });
    void this.refresh();
  }

  private buildTabs(): string {
    const tabs: Array<{ id: ResilienceDashboardTab; label: string }> = [
      { id: 'dashboard', label: 'نمای اصلی' },
      { id: 'compare', label: 'مقایسه' },
      { id: 'stress', label: 'تنش و سرریز' },
      { id: 'report', label: 'گزارش فارسی' },
      { id: 'methodology', label: 'روش و منابع' },
    ];
    return `
      <div class="nrc-tab-bar">
        ${tabs.map((tab) => `
          <button type="button" class="nrc-tab ${this.currentTab === tab.id ? 'nrc-tab-active' : ''}" data-tab="${tab.id}">
            ${tab.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  private buildToolbar(model: ResilienceDashboardModel): string {
    return `
      <div class="resilience-toolbar">
        <div class="resilience-toolbar-group">
          <label>کشور اصلی</label>
          <select data-role="primary-country">
            ${COUNTRIES.map((country) => `<option value="${country.code}" ${country.code === this.selectedCountry ? 'selected' : ''}>${country.name}</option>`).join('')}
          </select>
        </div>
        <div class="resilience-toolbar-group grow">
          <label>کشورهای مقایسه</label>
          <div class="resilience-chip-row">
            ${COUNTRIES.filter((country) => country.code !== this.selectedCountry).map((country) => `
              <button
                type="button"
                class="resilience-filter-chip ${this.compareCountryCodes.includes(country.code) ? 'active' : ''}"
                data-compare-country="${country.code}"
              >${country.name}</button>
            `).join('')}
          </div>
        </div>
        <div class="resilience-toolbar-group">
          <label>نوع گزارش</label>
          <select data-role="report-type">
            <option value="national-brief" ${this.reportType === 'national-brief' ? 'selected' : ''}>بریـف ملی</option>
            <option value="comparative-country" ${this.reportType === 'comparative-country' ? 'selected' : ''}>مقایسه کشورها</option>
            <option value="international-economic" ${this.reportType === 'international-economic' ? 'selected' : ''}>تاب‌آوری اقتصادی بین‌المللی</option>
            <option value="scenario-forecast" ${this.reportType === 'scenario-forecast' ? 'selected' : ''}>پیش‌بینی سناریویی</option>
          </select>
        </div>
        <div class="resilience-toolbar-summary">
          <strong>${model.primary.countryName}</strong>
          <span>${model.primary.asOfLabel}</span>
        </div>
      </div>
      <div class="resilience-status-line">${escapeHtml(this.statusLine)}</div>
    `;
  }

  private renderHero(model: ResilienceDashboardModel): string {
    const primary = model.primary;
    const topStrength = model.rankedRows.find((row) => row.countryCode === primary.countryCode)?.topStrength || 'نامشخص';
    const topWeakness = model.rankedRows.find((row) => row.countryCode === primary.countryCode)?.topWeakness || 'نامشخص';
    return `
      <section class="resilience-hero-grid">
        <article class="resilience-hero-card">
          <span>شاخص کل</span>
          <strong style="color:${colorForScore(primary.composite.score)}">${primary.composite.score}</strong>
          <small>${describeResilienceBand(primary.composite.score)} | بازه ${primary.composite.uncertainty.lower}-${primary.composite.uncertainty.upper}</small>
        </article>
        <article class="resilience-hero-card">
          <span>پوشش و تازگی</span>
          <strong>${primary.coverage.coveragePercent}%</strong>
          <small>تازگی ${primary.composite.freshnessPercent}% | داده زنده ${Math.round(primary.composite.liveShare * 100)}%</small>
        </article>
        <article class="resilience-hero-card">
          <span>نقطه اتکا</span>
          <strong>${escapeHtml(topStrength)}</strong>
          <small>گلوگاه اصلی: ${escapeHtml(topWeakness)}</small>
        </article>
        <article class="resilience-hero-card">
          <span>روند و تغییر</span>
          <strong>${primary.composite.change1m >= 0 ? '+' : ''}${primary.composite.change1m}</strong>
          <small>سیگنال‌های داخلی: ${escapeHtml(primary.internalSignalSummary[0] || 'ثبت نشده')}</small>
        </article>
      </section>
    `;
  }

  private renderTimeSeries(model: ResilienceDashboardModel): string {
    return `
      <section class="resilience-card">
        <h4>روند ۱۲ماهه</h4>
        <div class="resilience-timeseries-grid">
          ${model.trendSeries.map((series) => `
            <article class="resilience-mini-series">
              <strong>${series.countryName}</strong>
              <div class="resilience-mini-bars">
                ${series.points.map((point) => `<div class="resilience-mini-bar" title="${escapeHtml(point.label)}: ${point.overall}" style="height:${Math.max(8, point.overall)}%; background:${colorForScore(point.overall)}"></div>`).join('')}
              </div>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  private renderRadar(model: ResilienceDashboardModel): string {
    const series = model.radarSeries.slice(0, 3);
    const size = 220;
    const center = size / 2;
    const radius = 84;
    const rings = [20, 40, 60, 80].map((value) =>
      `<circle cx="${center}" cy="${center}" r="${radius * (value / 100)}" fill="none" stroke="#d7dde8" stroke-width="1" />`).join('');
    const labels = model.primary.dimensionOrder.map((dimensionId, index) => {
      const angle = ((Math.PI * 2) / model.primary.dimensionOrder.length) * index - (Math.PI / 2);
      const x = center + (Math.cos(angle) * (radius + 20));
      const y = center + (Math.sin(angle) * (radius + 20));
      const label = model.primary.dimensions[dimensionId].label.slice(0, 10);
      return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" font-size="9">${escapeHtml(label)}</text>`;
    }).join('');
    const polygons = series.map((item, index) => {
      const color = ['#0f766e', '#d97706', '#7c3aed'][index] || '#475569';
      const points = radarPolygon(item.values.map((value) => value.score), radius, center);
      return `<polygon points="${points}" fill="${color}22" stroke="${color}" stroke-width="2"></polygon>`;
    }).join('');
    return `
      <section class="resilience-card">
        <h4>رادار چندبعدی</h4>
        <div class="resilience-radar-wrap">
          <svg viewBox="0 0 ${size} ${size}" class="resilience-radar-svg" role="img" aria-label="رادار تاب‌آوری">
            ${rings}
            ${polygons}
            ${labels}
          </svg>
          <div class="resilience-legend">
            ${series.map((item, index) => `<span><i style="background:${['#0f766e', '#d97706', '#7c3aed'][index] || '#475569'}"></i>${item.countryName}</span>`).join('')}
          </div>
        </div>
      </section>
    `;
  }

  private renderRankedBars(model: ResilienceDashboardModel): string {
    return `
      <section class="resilience-card">
        <h4>رتبه‌بندی کشورها</h4>
        <div class="resilience-ranked-list">
          ${model.rankedRows.map((row, index) => `
            <div class="resilience-ranked-row">
              <span class="resilience-rank-label">#${index + 1} ${row.countryName}</span>
              <div class="resilience-ranked-track"><div class="resilience-ranked-fill" style="width:${row.overall}%;background:${colorForScore(row.overall)}"></div></div>
              <span class="resilience-rank-score">${row.overall}</span>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  private renderHeatmap(model: ResilienceDashboardModel): string {
    const header = [model.primary, ...model.comparisons].map((item) => `<th>${item.countryName}</th>`).join('');
    const rows = model.heatmapRows.map((row) => `
      <tr>
        <th>${row.label}</th>
        ${row.values.map((value) => `<td style="background:${colorForScore(value.score)}22">${value.score}<small>${value.coveragePercent}%</small></td>`).join('')}
      </tr>
    `).join('');
    return `
      <section class="resilience-card">
        <h4>Heatmap ابعاد</h4>
        <table class="resilience-table resilience-heatmap">
          <thead><tr><th>بعد</th>${header}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `;
  }

  private renderComparison(model: ResilienceDashboardModel): string {
    return `
      <div class="resilience-grid-two">
        ${this.renderHeatmap(model)}
        <section class="resilience-card">
          <h4>جدول مقایسه‌ای</h4>
          <table class="resilience-table">
            <thead><tr><th>کشور</th><th>شاخص کل</th><th>اختلاف با کشور اصلی</th><th>قوت</th><th>گلوگاه</th></tr></thead>
            <tbody>
              ${model.rankedRows.map((row) => `
                <tr>
                  <td>${row.countryName}</td>
                  <td>${row.overall}</td>
                  <td>${row.deltaVsPrimary >= 0 ? '+' : ''}${row.deltaVsPrimary}</td>
                  <td>${row.topStrength}</td>
                  <td>${row.topWeakness}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>
        <section class="resilience-card">
          <h4>نمای تغییر دوره‌ای</h4>
          <div class="resilience-slope-list">
            ${model.slopeSeries.map((row) => `
              <div class="resilience-slope-row">
                <strong>${row.countryName}</strong>
                <span>${row.start}</span>
                <div class="resilience-slope-line"><i style="width:${Math.max(8, Math.abs(row.delta) * 5)}%;background:${row.delta >= 0 ? '#15803d' : '#b91c1c'}"></i></div>
                <span>${row.end}</span>
                <small>${row.delta >= 0 ? '+' : ''}${row.delta}</small>
              </div>
            `).join('')}
          </div>
        </section>
      </div>
    `;
  }

  private renderStress(model: ResilienceDashboardModel): string {
    const nodeLabels = new Map(model.spilloverNetwork.nodes.map((node) => [node.countryCode, node.countryName]));
    const scenarioBanner = this.scenarioNote ? `
      <div class="resilience-scenario-note">
        <strong>ورودی از سناریوپرداز:</strong>
        <span>${escapeHtml(this.scenarioNote.title || this.scenarioNote.event || '')}</span>
      </div>
    ` : '';
    return `
      ${scenarioBanner}
      <div class="resilience-grid-two">
        <section class="resilience-card">
          <h4>ماتریس تنش</h4>
          <table class="resilience-table">
            <thead><tr><th>سناریو</th>${[model.primary, ...model.comparisons].map((item) => `<th>${item.countryName}</th>`).join('')}</tr></thead>
            <tbody>
              ${model.primary.stressScenarios.map((scenario) => `
                <tr>
                  <th>${scenario.title}</th>
                  ${[model.primary, ...model.comparisons].map((snapshot) => {
                    const cell = snapshot.stressMatrix.find((item) => item.scenarioId === scenario.id);
                    return `<td style="background:${cell ? colorForScore(cell.resultingScore) : '#94a3b822'}">${cell ? `${cell.resultingScore}<small>-${cell.delta}</small>` : '—'}</td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>
        <section class="resilience-card">
          <h4>شبکه سرریز</h4>
          <div class="resilience-network-list">
            ${model.spilloverNetwork.links.slice(0, 10).map((link) => `
              <div class="resilience-network-row">
                <span>${nodeLabels.get(link.from) || link.from}</span>
                <div class="resilience-network-track"><i style="width:${Math.max(10, link.intensity)}%;background:${colorForScore(100 - link.intensity)}"></i></div>
                <span>${nodeLabels.get(link.to) || link.to}</span>
                <small>${describeSpilloverChannel(link.channel)}</small>
              </div>
            `).join('')}
          </div>
          <div class="resilience-source-list">
            ${model.primary.spillovers.slice(0, 5).map((spillover) => `<div><strong>${spillover.targetCountryName}</strong>: ${spillover.note}</div>`).join('')}
          </div>
        </section>
      </div>
    `;
  }

  private renderReport(report: ResilienceStructuredReport): string {
    return `
      <section class="resilience-card">
        <div class="resilience-report-toolbar">
          <button type="button" class="nrc-tab" data-report-export="json">JSON</button>
          <button type="button" class="nrc-tab" data-report-export="markdown">Markdown</button>
          <button type="button" class="nrc-tab" data-report-export="html">HTML</button>
          <button type="button" class="nrc-tab nrc-tab-active" data-action="ai-narration">روایت AI</button>
        </div>
        <h4>${escapeHtml(report.title)}</h4>
        <p>${escapeHtml(report.executiveSummary)}</p>
        ${[
          report.baselineFacts,
          report.indicators,
          report.analyticalInterpretation,
          report.risks,
          report.scenarios,
          report.uncertainty,
          report.monitoringPriorities,
          report.technicalAppendix,
        ].map((section) => `
          <article class="resilience-report-section">
            <h5>${escapeHtml(section.title)}</h5>
            <p>${escapeHtml(section.body)}</p>
            <ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>
          </article>
        `).join('')}
        <div class="resilience-source-list">
          ${report.sourceSummary.map((item) => `<div>${escapeHtml(item)}</div>`).join('')}
        </div>
      </section>
      ${this.aiNarrationStatus ? `<div class="resilience-status-line">${escapeHtml(this.aiNarrationStatus)}</div>` : ''}
      ${this.aiNarrationHtml ? `<section class="resilience-card">${this.aiNarrationHtml}</section>` : ''}
    `;
  }

  private renderMethodology(model: ResilienceDashboardModel): string {
    return `
      <section class="resilience-card">
        <h4>روش، پوشش و منابع</h4>
        <p>${escapeHtml(getResilienceMethodologySummary())}</p>
        <div class="resilience-grid-two">
          <div>
            <h5>منابع ${model.primary.countryName}</h5>
            <div class="resilience-source-list">
              ${model.primary.sources.map((source) => `<div><strong>${escapeHtml(source.title)}</strong> | ${source.synthetic ? 'نمونه' : 'زنده'} | ${escapeHtml(source.coverageNote)}</div>`).join('')}
            </div>
          </div>
          <div>
            <h5>یادداشت پوشش</h5>
            <div class="resilience-source-list">
              <div>شاخص‌های موجود: ${model.primary.coverage.availableIndicators}</div>
              <div>شاخص‌های فاقد پوشش: ${model.primary.coverage.missingIndicators}</div>
              <div>شاخص‌های نمونه: ${model.primary.coverage.syntheticIndicators}</div>
              <div>شاخص‌های زنده: ${model.primary.coverage.liveIndicators}</div>
              <div>شاخص‌های stale: ${model.primary.coverage.staleIndicators}</div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  private buildBody(model: ResilienceDashboardModel, report: ResilienceStructuredReport): string {
    if (this.currentTab === 'compare') return this.renderComparison(model);
    if (this.currentTab === 'stress') return this.renderStress(model);
    if (this.currentTab === 'report') return this.renderReport(report);
    if (this.currentTab === 'methodology') return this.renderMethodology(model);
    return `
      ${this.renderHero(model)}
      <div class="resilience-grid-two">
        ${this.renderTimeSeries(model)}
        ${this.renderRadar(model)}
        ${this.renderRankedBars(model)}
        ${this.renderHeatmap(model)}
      </div>
    `;
  }

  private bindEvents(root: HTMLElement, report: ResilienceStructuredReport): void {
    root.querySelectorAll<HTMLElement>('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const next = button.dataset.tab as ResilienceDashboardTab | undefined;
        if (!next) return;
        this.currentTab = next;
        void this.refresh();
      });
    });

    root.querySelector<HTMLSelectElement>('[data-role="primary-country"]')?.addEventListener('change', (event) => {
      const next = (event.currentTarget as HTMLSelectElement).value;
      this.selectedCountry = next;
      this.compareCountryCodes = defaultCompareCountries(next);
      this.statusLine = `کشور اصلی به ${COUNTRIES.find((country) => country.code === next)?.name || next} تغییر کرد.`;
      this.aiNarrationHtml = '';
      void this.refresh();
    });

    root.querySelector<HTMLSelectElement>('[data-role="report-type"]')?.addEventListener('change', (event) => {
      this.reportType = (event.currentTarget as HTMLSelectElement).value as ResilienceReportKind;
      this.statusLine = 'نوع گزارش به‌روزرسانی شد.';
      void this.refresh();
    });

    root.querySelectorAll<HTMLElement>('[data-compare-country]').forEach((button) => {
      button.addEventListener('click', () => {
        const code = button.dataset.compareCountry;
        if (!code) return;
        if (this.compareCountryCodes.includes(code)) {
          this.compareCountryCodes = this.compareCountryCodes.filter((item) => item !== code);
        } else if (this.compareCountryCodes.length < DEFAULT_COMPARE_LIMIT) {
          this.compareCountryCodes = [...this.compareCountryCodes, code];
        }
        this.statusLine = 'مجموعه مقایسه به‌روزرسانی شد.';
        void this.refresh();
      });
    });

    root.querySelectorAll<HTMLElement>('[data-report-export]').forEach((button) => {
      button.addEventListener('click', () => {
        const format = button.dataset.reportExport;
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        if (format === 'json') {
          downloadTextFile(JSON.stringify(report, null, 2), `qadr-resilience-${stamp}.json`, 'application/json');
        } else if (format === 'markdown') {
          downloadTextFile(report.markdown, `qadr-resilience-${stamp}.md`, 'text/markdown');
        } else {
          downloadTextFile(report.html, `qadr-resilience-${stamp}.html`, 'text/html');
        }
      });
    });

    root.querySelector<HTMLElement>('[data-action="ai-narration"]')?.addEventListener('click', async () => {
      this.aiNarrationStatus = 'در حال اجرای روایت AI مبتنی بر داده ساخت‌یافته...';
      this.aiNarrationHtml = '';
      void this.refresh();
      try {
        const narration = await narrateResilienceReportWithAi(this.selectedCountry, this.compareCountryCodes, this.reportType);
        const structured = narration.response.message.structured;
        this.aiNarrationStatus = `روایت AI آماده شد. تعداد evidence cardها: ${narration.evidenceCount}`;
        this.aiNarrationHtml = structured ? `
          <h4>${escapeHtml(structured.reportTitle)}</h4>
          <p>${escapeHtml(structured.executiveSummary)}</p>
          ${[structured.observedFacts, structured.analyticalInference, structured.uncertainties, structured.recommendations, structured.resilienceNarrative].map((section) => `
            <article class="resilience-report-section">
              <h5>${escapeHtml(section.title)}</h5>
              <p>${escapeHtml(section.narrative)}</p>
              <ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>
            </article>
          `).join('')}
        ` : `<p>${escapeHtml(narration.response.message.content)}</p>`;
      } catch (error) {
        this.aiNarrationStatus = `خطا در روایت AI: ${error instanceof Error ? error.message : 'خطای نامشخص'}`;
      }
      void this.refresh();
    });
  }

  public async refresh(): Promise<void> {
    try {
      const model = getResilienceDashboardModel(this.selectedCountry, this.compareCountryCodes);
      const report = buildResilienceReport(this.selectedCountry, this.compareCountryCodes, this.reportType);
      this.setErrorState(false);
      this.setCount(COUNTRIES.length);

      const root = document.createElement('div');
      root.className = 'resilience-workbench';
      root.innerHTML = `
        ${this.buildTabs()}
        ${this.buildToolbar(model)}
        ${this.buildBody(model, report)}
      `;
      replaceChildren(this.content, root);
      this.bindEvents(root, report);
    } catch (error) {
      console.error('[NRCAnalyticsPanel] Refresh error:', error);
      this.showError('بارگذاری داشبورد تاب‌آوری ناموفق بود.', () => void this.refresh());
    }
  }
}
