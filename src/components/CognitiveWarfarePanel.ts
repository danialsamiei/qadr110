import { Panel } from './Panel';
import type { ScenarioEngineState } from '@/ai/scenario-engine';
import { scenarioIntelligenceStore } from '@/services/scenario-intelligence';
import {
  buildCognitiveWarfareModel,
  type CognitiveDefensePlan,
  type CognitiveEvidenceItem,
  type CognitiveHeatmapRow,
  type CognitiveInfluenceEdge,
  type CognitiveInfluenceNode,
  type CognitiveNarrativeCluster,
  type CognitiveSentimentAnomaly,
  type CognitiveSeverity,
  type CognitiveWarfareModel,
} from '@/services/cognitive-warfare';
import type { ClusteredEvent, NewsItem } from '@/types';
import { escapeHtml } from '@/utils/sanitize';

type CognitiveView = 'graph' | 'heatmap' | 'defense';

function severityLabel(severity: CognitiveSeverity): string {
  switch (severity) {
    case 'critical':
      return 'بحرانی';
    case 'high':
      return 'بالا';
    case 'medium':
      return 'متوسط';
    default:
      return 'پایین';
  }
}

function uniqueStrings(values: Array<string | undefined>, maxItems = 8): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, maxItems);
}

export class CognitiveWarfarePanel extends Panel {
  private news: NewsItem[] = [];
  private clusters: ClusteredEvent[] = [];
  private scenarioState: ScenarioEngineState | null = scenarioIntelligenceStore.getState();
  private model: CognitiveWarfareModel | null = null;
  private view: CognitiveView = 'graph';
  private unsubscribeScenario: (() => void) | null = null;

  constructor() {
    super({
      id: 'cognitive-warfare',
      title: 'جنگ شناختی: کشف و دفاع',
      className: 'panel-wide',
    });
    this.unsubscribeScenario = scenarioIntelligenceStore.subscribe((state) => {
      this.scenarioState = state;
      this.recompute();
      this.render();
    });
    this.bindEvents();
    this.recompute();
    this.render();
  }

  public override destroy(): void {
    this.unsubscribeScenario?.();
    this.unsubscribeScenario = null;
    super.destroy();
  }

  public renderIntelligence(news: NewsItem[], clusters: ClusteredEvent[]): void {
    this.news = news;
    this.clusters = clusters;
    this.recompute();
    this.render();
  }

  public setView(view: CognitiveView): void {
    this.view = view;
    this.render();
  }

  private bindEvents(): void {
    this.content.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-cognitive-action]');
      if (!target) return;
      const action = target.dataset.cognitiveAction;
      if (action === 'set-view') {
        const nextView = target.dataset.cognitiveView as CognitiveView | undefined;
        if (nextView === 'graph' || nextView === 'heatmap' || nextView === 'defense') {
          this.setView(nextView);
        }
        return;
      }
      if (action === 'refresh') {
        this.recompute();
        this.render();
      }
    });
  }

  private recompute(): void {
    this.model = buildCognitiveWarfareModel({
      news: this.news,
      clusters: this.clusters,
      scenarioState: this.scenarioState,
    });
  }

  private hasLiveContext(): boolean {
    return this.news.length > 0
      || this.clusters.length > 0
      || Boolean(this.scenarioState);
  }

  private renderEmpty(): void {
    this.setContent(`
      <div class="cognitive-warfare-panel">
        <div class="cognitive-warfare-empty">
          <strong>هنوز context زنده‌ای برای تشخیص جنگ شناختی وجود ندارد</strong>
          <p>با ورود داده خبری، اجرای سناریو، یا کلیک روی نقشه، این پنل خوشه‌های روایت، drift احساسی و برنامه‌های دفاعی را نمایش می‌دهد.</p>
        </div>
      </div>
    `);
  }

  private renderAlertList(model: CognitiveWarfareModel): string {
    return model.alerts.length > 0
      ? model.alerts.map((alert) => `
        <article class="cognitive-alert-card tone-${escapeHtml(alert.severity)}">
          <div class="cognitive-alert-head">
            <strong>${escapeHtml(alert.title)}</strong>
            <span class="cognitive-severity-badge tone-${escapeHtml(alert.severity)}">${escapeHtml(severityLabel(alert.severity))}</span>
          </div>
          <p>${escapeHtml(alert.summary)}</p>
          <div class="cognitive-chip-row">
            ${alert.watchSignals.map((item) => `<span class="cognitive-chip">${escapeHtml(item)}</span>`).join('')}
          </div>
        </article>
      `).join('')
      : '<div class="cognitive-inline-empty">فعلا هشدار معناداری ثبت نشده است.</div>';
  }

  private renderNarrativeCards(clusters: CognitiveNarrativeCluster[]): string {
    return clusters.length > 0
      ? clusters.map((cluster) => `
        <article class="cognitive-narrative-card tone-${escapeHtml(cluster.severity)}">
          <div class="cognitive-card-head">
            <div>
              <strong>${escapeHtml(cluster.title)}</strong>
              <p>${escapeHtml(cluster.summary)}</p>
            </div>
            <span class="cognitive-severity-badge tone-${escapeHtml(cluster.severity)}">${escapeHtml(severityLabel(cluster.severity))}</span>
          </div>
          <div class="cognitive-kpi-row">
            <span>framing ${cluster.framingShift}</span>
            <span>propaganda ${cluster.propagandaIntensity}</span>
            <span>polarity ${cluster.polarityPercent}</span>
            <span>${Math.round(cluster.confidence * 100)}% اطمینان</span>
          </div>
          <div class="cognitive-chip-row">
            ${cluster.evidence.map((item) => `<span class="cognitive-chip">${escapeHtml(item)}</span>`).join('')}
          </div>
        </article>
      `).join('')
      : '<div class="cognitive-inline-empty">هنوز خوشه روایتی کافی برای نمایش وجود ندارد.</div>';
  }

  private renderGraphNodes(nodes: CognitiveInfluenceNode[], groups: Array<CognitiveInfluenceNode['group']>, title: string): string {
    const filtered = nodes.filter((node) => groups.includes(node.group));
    return `
      <section class="cognitive-graph-column">
        <div class="cognitive-graph-column-title">${escapeHtml(title)}</div>
        ${filtered.length > 0
          ? filtered.map((node) => `
            <article class="cognitive-graph-node tone-${escapeHtml(node.severity)} group-${escapeHtml(node.group)}">
              <strong>${escapeHtml(node.label)}</strong>
              <span>${escapeHtml(node.detail)}</span>
            </article>
          `).join('')
          : '<div class="cognitive-inline-empty">موردی ثبت نشده است.</div>'}
      </section>
    `;
  }

  private renderEdgeList(edges: CognitiveInfluenceEdge[], nodes: CognitiveInfluenceNode[]): string {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return edges.length > 0
      ? edges.map((edge) => `
        <div class="cognitive-flow-row tone-${escapeHtml(edge.severity)}">
          <div class="cognitive-flow-head">
            <strong>${escapeHtml(byId.get(edge.from)?.label || edge.from)}</strong>
            <span class="cognitive-flow-arrow">←</span>
            <strong>${escapeHtml(byId.get(edge.to)?.label || edge.to)}</strong>
          </div>
          <div class="cognitive-flow-bar">
            <span class="cognitive-flow-fill tone-${escapeHtml(edge.severity)}" style="width:${Math.max(10, Math.round(edge.weight * 100))}%"></span>
          </div>
          <small>${escapeHtml(edge.label)}</small>
        </div>
      `).join('')
      : '<div class="cognitive-inline-empty">فعلا بردار اثر معناداری ثبت نشده است.</div>';
  }

  private renderGraphView(model: CognitiveWarfareModel): string {
    const { nodes, edges } = model.influenceGraph;
    return `
      <section class="cognitive-view-section">
        <div class="cognitive-section-head">
          <div>
            <strong>شبکه اثر و تزریق روایت</strong>
            <p>منابع، خوشه‌های روایت و سیگنال‌های تشدیدکننده در یک نمای RTL برای دنبال‌کردن flow اثر چیده شده‌اند.</p>
          </div>
        </div>
        <div class="cognitive-graph-shell">
          ${this.renderGraphNodes(nodes, ['government', 'independent', 'opposition', 'regional'], 'شبکه‌های منبع')}
          ${this.renderGraphNodes(nodes, ['narrative'], 'خوشه‌های روایت')}
          ${this.renderGraphNodes(nodes, ['signal'], 'بردارهای سیگنال')}
        </div>
        <div class="cognitive-flow-list">
          ${this.renderEdgeList(edges, nodes)}
        </div>
        <div class="cognitive-narrative-grid">
          ${this.renderNarrativeCards(model.narrativeClusters)}
        </div>
      </section>
    `;
  }

  private renderHeatmapRow(row: CognitiveHeatmapRow): string {
    return `
      <div class="cognitive-heatmap-row">
        <strong>${escapeHtml(row.label)}</strong>
        <div class="cognitive-heatmap-cells">
          ${row.cells.map((cell) => `
            <div class="cognitive-heatmap-cell tone-${escapeHtml(cell.severity)}">
              <span>${escapeHtml(cell.label)}</span>
              <div class="cognitive-heatmap-bar">
                <span class="cognitive-heatmap-fill tone-${escapeHtml(cell.severity)}" style="height:${Math.max(10, Math.round(cell.value * 100))}%"></span>
              </div>
              <small>${Math.round(cell.value * 100)}%</small>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderAnomalyCard(anomaly: CognitiveSentimentAnomaly): string {
    return `
      <article class="cognitive-anomaly-card tone-${escapeHtml(anomaly.severity)}">
        <div class="cognitive-card-head">
          <div>
            <strong>${escapeHtml(anomaly.title)}</strong>
            <p>${escapeHtml(anomaly.summary)}</p>
          </div>
          <span class="cognitive-severity-badge tone-${escapeHtml(anomaly.severity)}">${Math.round(anomaly.score * 100)}%</span>
        </div>
        <p class="cognitive-supporting-copy">${escapeHtml(anomaly.whyItMatters)}</p>
        <div class="cognitive-chip-row">
          ${anomaly.signals.map((item) => `<span class="cognitive-chip">${escapeHtml(item)}</span>`).join('')}
        </div>
      </article>
    `;
  }

  private renderHeatmapView(model: CognitiveWarfareModel): string {
    return `
      <section class="cognitive-view-section">
        <div class="cognitive-section-head">
          <div>
            <strong>نقشه حرارتی drift و بی‌ثباتی</strong>
            <p>این heatmap فشار روایت، شبکه اثر، drift احساسی و آمادگی دفاعی را در افق‌های زمانی کوتاه و میان‌مدت کنار هم می‌گذارد.</p>
          </div>
        </div>
        <div class="cognitive-heatmap-shell">
          ${model.heatmap.map((row) => this.renderHeatmapRow(row)).join('')}
        </div>
        <div class="cognitive-anomaly-grid">
          ${model.sentimentAnomalies.length > 0
            ? model.sentimentAnomalies.map((anomaly) => this.renderAnomalyCard(anomaly)).join('')
            : '<div class="cognitive-inline-empty">فعلا ناهنجاری معنادار sentiment ثبت نشده است.</div>'}
        </div>
      </section>
    `;
  }

  private renderDefenseCard(plan: CognitiveDefensePlan): string {
    return `
      <article class="cognitive-defense-card tone-${escapeHtml(plan.severity)}">
        <div class="cognitive-card-head">
          <div>
            <strong>${escapeHtml(plan.title)}</strong>
            <p>${escapeHtml(plan.summary)}</p>
          </div>
          <span class="cognitive-severity-badge tone-${escapeHtml(plan.severity)}">${escapeHtml(severityLabel(plan.severity))}</span>
        </div>
        <div class="cognitive-defense-columns">
          <section>
            <h5>ضدروایت‌ها</h5>
            <ul>${plan.counterNarratives.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          </section>
          <section>
            <h5>برنامه پاسخ</h5>
            <ul>${plan.responsePlan.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
          </section>
        </div>
      </article>
    `;
  }

  private renderDefenseView(model: CognitiveWarfareModel): string {
    return `
      <section class="cognitive-view-section">
        <div class="cognitive-section-head">
          <div>
            <strong>دفاع، ضدروایت و response plan</strong>
            <p>این نما روی actionهای عملیاتی، ضدروایت‌های کوتاه و مسیرهای مهار amplification تمرکز می‌کند.</p>
          </div>
        </div>
        <div class="cognitive-defense-grid">
          ${model.defensePlans.map((plan) => this.renderDefenseCard(plan)).join('')}
        </div>
      </section>
    `;
  }

  private renderEvidenceItem(item: CognitiveEvidenceItem): string {
    return `
      <article class="cognitive-evidence-item tone-${escapeHtml(item.severity)}">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.source)}</span>
        <p>${escapeHtml(item.detail)}</p>
      </article>
    `;
  }

  private render(): void {
    if (!this.hasLiveContext() || !this.model) {
      this.renderEmpty();
      return;
    }

    const model = this.model;
    const currentView = this.view;
    const currentSection = currentView === 'graph'
      ? this.renderGraphView(model)
      : currentView === 'heatmap'
        ? this.renderHeatmapView(model)
        : this.renderDefenseView(model);
    const watchlist = uniqueStrings(model.watchIndicators, 7);

    this.setContent(`
      <div class="cognitive-warfare-panel">
        <header class="cognitive-warfare-header">
          <div>
            <div class="cognitive-kicker">عرصه تشخیص و دفاع شناختی QADR110</div>
            <h4>رصد روایت، شبکه اثر و دفاع شناختی</h4>
            <p>${escapeHtml(model.summary)}</p>
          </div>
          <div class="cognitive-header-actions">
            <button type="button" class="cognitive-btn" data-cognitive-action="refresh">بازخوانی</button>
            <span class="cognitive-board-summary">${escapeHtml(model.boardSummary)}</span>
          </div>
        </header>

        <section class="cognitive-summary-grid">
          ${model.metrics.map((metric) => `
            <article class="cognitive-summary-card tone-${escapeHtml(metric.severity)}">
              <span>${escapeHtml(metric.label)}</span>
              <strong>${escapeHtml(metric.value)}</strong>
              <small>${escapeHtml(metric.note)}</small>
            </article>
          `).join('')}
        </section>

        <section class="cognitive-alert-strip">
          ${this.renderAlertList(model)}
        </section>

        <div class="cognitive-shell">
          <section class="cognitive-stage">
            <div class="cognitive-view-switch" role="tablist" aria-label="Cognitive Warfare Views">
              <button type="button" class="cognitive-view-btn ${currentView === 'graph' ? 'is-active' : ''}" data-cognitive-action="set-view" data-cognitive-view="graph" aria-pressed="${currentView === 'graph' ? 'true' : 'false'}">گراف و جریان</button>
              <button type="button" class="cognitive-view-btn ${currentView === 'heatmap' ? 'is-active' : ''}" data-cognitive-action="set-view" data-cognitive-view="heatmap" aria-pressed="${currentView === 'heatmap' ? 'true' : 'false'}">نقشه حرارتی و ناهنجاری</button>
              <button type="button" class="cognitive-view-btn ${currentView === 'defense' ? 'is-active' : ''}" data-cognitive-action="set-view" data-cognitive-view="defense" aria-pressed="${currentView === 'defense' ? 'true' : 'false'}">دفاع و پاسخ</button>
            </div>
            ${currentSection}
          </section>

          <aside class="cognitive-sidebar">
            <section class="cognitive-sidebar-card">
              <div class="cognitive-section-head">
                <div>
                  <strong>پشته شواهد</strong>
                  <p>مهم‌ترین شواهدی که این خروجی را تغذیه کرده‌اند.</p>
                </div>
              </div>
              <div class="cognitive-evidence-stack">
                ${model.evidenceStack.length > 0
                  ? model.evidenceStack.map((item) => this.renderEvidenceItem(item)).join('')
                  : '<div class="cognitive-inline-empty">شاهد برجسته‌ای ثبت نشده است.</div>'}
              </div>
            </section>

            <section class="cognitive-sidebar-card">
              <div class="cognitive-section-head">
                <div>
                  <strong>شاخص‌های پایش</strong>
                  <p>شاخص‌هایی که باید در چرخه بعدی پایش دوباره بررسی شوند.</p>
                </div>
              </div>
              <div class="cognitive-chip-row">
                ${watchlist.map((item) => `<span class="cognitive-chip">${escapeHtml(item)}</span>`).join('')}
              </div>
            </section>

            <section class="cognitive-sidebar-card">
              <div class="cognitive-section-head">
                <div>
                  <strong>نمای فوری دفاع</strong>
                  <p>خلاصه‌ای از ضدروایت‌ها و برنامه‌های پاسخ فوری.</p>
                </div>
              </div>
              <ul class="cognitive-inline-list">
                ${model.defensePlans.flatMap((plan) => plan.responsePlan.slice(0, 1)).slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
              </ul>
            </section>
          </aside>
        </div>
      </div>
    `);
  }
}
