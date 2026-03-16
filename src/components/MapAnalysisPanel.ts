import { Panel } from './Panel';
import { replaceChildren } from '@/utils/dom-utils';
import { escapeHtml } from '@/utils/sanitize';
import {
  GEO_ANALYSIS_EVENT_TYPES,
  isDemoModeEnabled,
  type GeoAnalysisOpenResultDetail,
  type GeoAnalysisResultRecord,
  type GeoAnalysisWorkspaceState,
} from '@/platform';
import {
  buildForecastConfidenceLabel,
  buildMapAnalysisEvidenceCards,
  buildMapAnalysisSummary,
  getActiveMapAnalysisResult,
  getMapAnalysisRunningJobs,
  inferGeoCategoryLabel,
  mapAnalysisWorkspace,
  seedDemoMapAnalyses,
} from '@/services/map-analysis-workspace';

function renderTrendPreview(points: Array<{ label: string; value: number }>): string {
  const max = Math.max(1, ...points.map((point) => point.value));
  return `
    <div class="geo-analysis-trend">
      ${points.map((point) => `
        <div class="geo-analysis-trend-col">
          <span>${escapeHtml(point.label)}</span>
          <div class="geo-analysis-trend-bar">
            <div style="height:${Math.max(10, Math.round((point.value / max) * 100))}%"></div>
          </div>
          <strong>${point.value}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function renderStructuredSections(result: GeoAnalysisResultRecord): string {
  const structured = result.response?.message.structured;
  if (!structured) {
    return `
      <div class="geo-analysis-empty">
        ${escapeHtml(result.error || 'هنوز خروجی ساخت‌یافته‌ای برای این تحلیل ثبت نشده است.')}
      </div>
    `;
  }

  const sections = [
    structured.observedFacts,
    structured.analyticalInference,
    structured.uncertainties,
    structured.recommendations,
    structured.resilienceNarrative,
  ];

  const scenarios = structured.scenarios.length > 0 ? `
    <section class="geo-analysis-section">
      <h4>سناریوها</h4>
      <div class="geo-analysis-scenarios">
        ${structured.scenarios.map((scenario) => `
          <article class="geo-analysis-scenario-card">
            <strong>${escapeHtml(scenario.title)}</strong>
            <div>${escapeHtml(scenario.description)}</div>
            <small>احتمال: ${escapeHtml(scenario.probability)} | بازه زمانی: ${escapeHtml(scenario.timeframe)}</small>
            <ul>${scenario.indicators.map((indicator) => `<li>${escapeHtml(indicator)}</li>`).join('')}</ul>
          </article>
        `).join('')}
      </div>
    </section>
  ` : '';

  return `
    <div class="geo-analysis-executive">${escapeHtml(structured.executiveSummary)}</div>
    ${sections.map((section) => `
      <section class="geo-analysis-section">
        <h4>${escapeHtml(section.title)}</h4>
        <p>${escapeHtml(section.narrative)}</p>
        <ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>
        <small>سطح اطمینان: ${escapeHtml(section.confidence.band)} (${Math.round(section.confidence.score * 100)}%)</small>
      </section>
    `).join('')}
    ${scenarios}
    <section class="geo-analysis-section">
      <h4>پرامپت‌های بعدی</h4>
      <div class="geo-analysis-followups">
        ${structured.followUpSuggestions.map((item) => `
          <button type="button" class="geo-analysis-chip" data-followup="${escapeHtml(item)}">
            ${escapeHtml(item)}
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function renderEvidence(result: GeoAnalysisResultRecord): string {
  const evidence = buildMapAnalysisEvidenceCards(result);
  if (evidence.length === 0) {
    return '<div class="geo-analysis-empty">برای این تحلیل کارت شاهدی برنگشته است.</div>';
  }
  return evidence.slice(0, 8).map((item) => `
    <article class="geo-analysis-evidence-card">
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.summary)}</p>
      <small>${escapeHtml(item.source.title)} | ${escapeHtml(item.timeContext)} | ${Math.round(item.score * 100)}%</small>
    </article>
  `).join('');
}

function renderRelatedContext(result: GeoAnalysisResultRecord): string {
  const snapshot = result.descriptor.snapshot;
  const entities = snapshot.selectedEntities.slice(0, 8);
  const signals = snapshot.nearbySignals.slice(0, 6);
  const infra = snapshot.nearbyInfrastructure.slice(0, 6);

  return `
    <section class="geo-analysis-meta-grid">
      <article class="geo-analysis-meta-card">
        <h4>بازیگران و مکان‌های مرتبط</h4>
        <div class="geo-analysis-chip-row">
          ${entities.length > 0 ? entities.map((item) => `<span class="geo-analysis-chip passive">${escapeHtml(item)}</span>`).join('') : '<span class="geo-analysis-empty-inline">موردی ثبت نشده</span>'}
        </div>
      </article>
      <article class="geo-analysis-meta-card">
        <h4>سیگنال‌های نزدیک</h4>
        <ul>${signals.length > 0 ? signals.map((signal) => `<li>${escapeHtml(signal.label)} | ${escapeHtml(signal.kind)} | ${signal.distanceKm.toFixed(0)}km</li>`).join('') : '<li>سیگنال نزدیک معنادار ثبت نشده است.</li>'}</ul>
      </article>
      <article class="geo-analysis-meta-card">
        <h4>زیرساخت و لجستیک</h4>
        <ul>${infra.length > 0 ? infra.map((asset) => `<li>${escapeHtml(asset.name)} | ${escapeHtml(asset.type)} | ${asset.distanceKm.toFixed(0)}km</li>`).join('') : '<li>زیرساخت نزدیک برجسته‌ای ثبت نشده است.</li>'}</ul>
      </article>
      <article class="geo-analysis-meta-card">
        <h4>پیش‌نمایش روند</h4>
        ${renderTrendPreview(snapshot.trendPreview)}
      </article>
    </section>
  `;
}

export class MapAnalysisPanel extends Panel {
  private state: GeoAnalysisWorkspaceState;
  private unsubscribe: (() => void) | null = null;
  private readonly openResultHandler: EventListener;

  constructor() {
    super({ id: 'geo-analysis-workbench', title: 'کارگاه ژئو-تحلیل', className: 'panel-wide' });
    this.state = mapAnalysisWorkspace.getState();
    this.openResultHandler = ((event: CustomEvent<GeoAnalysisOpenResultDetail>) => {
      if (!event.detail?.resultId) return;
      this.state = mapAnalysisWorkspace.getState();
      this.render();
    }) as EventListener;
    document.addEventListener(GEO_ANALYSIS_EVENT_TYPES.openResult, this.openResultHandler);
    this.unsubscribe = mapAnalysisWorkspace.subscribe((state) => {
      this.state = state;
      this.render();
    });
    this.render();
  }

  public override destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    document.removeEventListener(GEO_ANALYSIS_EVENT_TYPES.openResult, this.openResultHandler);
    super.destroy();
  }

  public openResult(resultId: string): void {
    mapAnalysisWorkspace.openResult(resultId);
  }

  private render(): void {
    const active = getActiveMapAnalysisResult(this.state);
    const runningJobs = getMapAnalysisRunningJobs(this.state);
    const demoEnabled = isDemoModeEnabled();
    const root = document.createElement('div');
    root.className = 'geo-analysis-workbench';

    root.innerHTML = `
      <div class="geo-analysis-layout">
        <aside class="geo-analysis-sidebar">
          <div class="geo-analysis-sidebar-header">
            <strong>تحلیل‌های جاری</strong>
            <span>${runningJobs.length}</span>
          </div>
          <div class="geo-analysis-running-list">
            ${runningJobs.length > 0 ? runningJobs.map((job) => `
              <article class="geo-analysis-job-card">
                <strong>${escapeHtml(job.descriptor.title)}</strong>
                <small>${escapeHtml(inferGeoCategoryLabel(job.descriptor.suggestion.category))} | ${job.autoMinimized ? 'پس‌زمینه' : 'در حال اجرا'}</small>
                <div class="geo-analysis-card-actions">
                  <button type="button" class="geo-analysis-chip danger" data-cancel-job="${escapeHtml(job.id)}">لغو</button>
                </div>
              </article>
            `).join('') : '<div class="geo-analysis-empty">تحلیل در حال اجرا وجود ندارد.</div>'}
          </div>

          <div class="geo-analysis-sidebar-header">
            <strong>آرشیو نتایج</strong>
            <span>${this.state.results.length}</span>
          </div>
          <div class="geo-analysis-result-list">
            ${this.state.results.length > 0 ? this.state.results.map((result) => {
              const summary = buildMapAnalysisSummary(result);
              return `
                <article class="geo-analysis-result-card ${active?.id === result.id ? 'active' : ''}">
                  <button type="button" class="geo-analysis-result-btn" data-open-result="${escapeHtml(result.id)}">
                    <strong>${escapeHtml(result.descriptor.title)}</strong>
                    <small>${escapeHtml(inferGeoCategoryLabel(result.descriptor.suggestion.category))} | ${result.unread ? 'جدید' : 'مشاهده‌شده'}</small>
                    <p>${escapeHtml(summary.summary.slice(0, 140))}</p>
                  </button>
                  <div class="geo-analysis-card-actions">
                    <button type="button" class="geo-analysis-chip ${result.pinned ? 'active' : ''}" data-pin-result="${escapeHtml(result.id)}">${result.pinned ? 'برداشتن پین' : 'پین'}</button>
                    <button type="button" class="geo-analysis-chip" data-rerun-result="${escapeHtml(result.id)}">اجرای مجدد</button>
                  </div>
                </article>
              `;
            }).join('') : '<div class="geo-analysis-empty">هنوز تحلیلی از روی نقشه اجرا نشده است.</div>'}
          </div>
        </aside>

        <section class="geo-analysis-main">
          ${active ? this.renderActiveResult(active) : `
            <div class="geo-analysis-empty geo-analysis-empty-large">
              <p>برای شروع، روی نقشه راست‌کلیک کن و یکی از تحلیل‌های پیشنهادی را اجرا کن.</p>
              ${demoEnabled ? `
                <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;align-items:center">
                  <span class="geo-analysis-chip passive">دمو فعال است</span>
                  <button type="button" class="geo-analysis-chip active" data-seed-demo="1">بارگذاری نمونه دمو</button>
                </div>
              ` : ''}
            </div>
          `}
        </section>
      </div>
    `;

    replaceChildren(this.content, root);
    this.bindEvents(root);
    this.setCount(this.state.results.length + runningJobs.length);
  }

  private renderActiveResult(result: GeoAnalysisResultRecord): string {
    const summary = buildMapAnalysisSummary(result);
    return `
      <header class="geo-analysis-header">
        <div>
          <div class="geo-analysis-kicker">${escapeHtml(inferGeoCategoryLabel(result.descriptor.suggestion.category))}</div>
          <h3>${escapeHtml(summary.title)}</h3>
          <p>${escapeHtml(summary.summary)}</p>
        </div>
        <div class="geo-analysis-header-meta">
          <span>${escapeHtml(buildForecastConfidenceLabel(result))}</span>
          <span>${escapeHtml(result.descriptor.snapshot.workspaceMode)}</span>
        </div>
      </header>

      <div class="geo-analysis-toolbar">
        <button type="button" class="geo-analysis-chip" data-open-assistant="${escapeHtml(result.id)}">باز کردن در دستیار</button>
        <button type="button" class="geo-analysis-chip" data-open-scenario="${escapeHtml(result.id)}">باز کردن در سناریوپرداز</button>
        <button type="button" class="geo-analysis-chip" data-export-result="${escapeHtml(result.id)}" data-export-format="json">JSON</button>
        <button type="button" class="geo-analysis-chip" data-export-result="${escapeHtml(result.id)}" data-export-format="markdown">Markdown</button>
        <button type="button" class="geo-analysis-chip" data-export-result="${escapeHtml(result.id)}" data-export-format="html">HTML</button>
      </div>

      ${renderRelatedContext(result)}
      <section class="geo-analysis-section">
        <h4>نتیجه تحلیل</h4>
        ${renderStructuredSections(result)}
      </section>
      <section class="geo-analysis-section">
        <h4>شواهد و منابع</h4>
        <div class="geo-analysis-evidence-grid">${renderEvidence(result)}</div>
      </section>
    `;
  }

  private bindEvents(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-seed-demo]').forEach((button) => {
      button.addEventListener('click', () => {
        void seedDemoMapAnalyses();
      });
    });

    root.querySelectorAll<HTMLElement>('[data-open-result]').forEach((button) => {
      button.addEventListener('click', () => {
        const resultId = button.dataset.openResult;
        if (!resultId) return;
        mapAnalysisWorkspace.openResult(resultId);
      });
    });

    root.querySelectorAll<HTMLElement>('[data-cancel-job]').forEach((button) => {
      button.addEventListener('click', () => {
        const jobId = button.dataset.cancelJob;
        if (!jobId) return;
        mapAnalysisWorkspace.cancel(jobId);
      });
    });

    root.querySelectorAll<HTMLElement>('[data-pin-result]').forEach((button) => {
      button.addEventListener('click', () => {
        const resultId = button.dataset.pinResult;
        if (!resultId) return;
        mapAnalysisWorkspace.togglePinned(resultId);
      });
    });

    root.querySelectorAll<HTMLElement>('[data-rerun-result]').forEach((button) => {
      button.addEventListener('click', async () => {
        const resultId = button.dataset.rerunResult;
        if (!resultId) return;
        await mapAnalysisWorkspace.rerun(resultId);
      });
    });

    root.querySelectorAll<HTMLElement>('[data-open-assistant]').forEach((button) => {
      button.addEventListener('click', () => {
        const resultId = button.dataset.openAssistant;
        if (!resultId) return;
        mapAnalysisWorkspace.openInAssistant(resultId);
      });
    });

    root.querySelectorAll<HTMLElement>('[data-open-scenario]').forEach((button) => {
      button.addEventListener('click', () => {
        const resultId = button.dataset.openScenario;
        if (!resultId) return;
        mapAnalysisWorkspace.openInScenario(resultId);
      });
    });

    root.querySelectorAll<HTMLElement>('[data-export-result]').forEach((button) => {
      button.addEventListener('click', () => {
        const resultId = button.dataset.exportResult;
        const format = button.dataset.exportFormat as 'json' | 'markdown' | 'html';
        if (!resultId || !format) return;
        mapAnalysisWorkspace.exportResult(resultId, format);
      });
    });

    root.querySelectorAll<HTMLElement>('[data-followup]').forEach((button) => {
      button.addEventListener('click', () => {
        const active = getActiveMapAnalysisResult(this.state);
        const followUp = button.dataset.followup;
        if (!active || !followUp) return;
        mapAnalysisWorkspace.openInAssistant(active.id, followUp);
      });
    });
  }
}
