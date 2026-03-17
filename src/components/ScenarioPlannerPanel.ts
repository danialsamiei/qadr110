import { Panel } from './Panel';
import { runScenarioEngine, type ScenarioDefinition, type ScenarioEngineOutput } from '@/services/scenario-engine';
import {
  createDefaultScenarioSimulationControls,
  runScenarioSimulation,
  type ScenarioSimulationControls,
  type ScenarioSimulationOutput,
} from '@/ai/scenario-simulation';
import {
  buildScenarioGraph,
  simulateScenarioWar,
  type ScenarioGraphOutput,
  type ScenarioWarResult,
} from '@/ai/scenario-graph';
import {
  buildMetaScenarioSuggestionContext,
  generateMetaScenarioSuggestions,
  groupMetaScenarioSuggestions,
  type MetaScenarioSuggestionItem,
} from '@/ai/meta-scenario-suggestions';
import { runMetaScenarioEngine, type MetaScenarioEngineOutput } from '@/ai/meta-scenario-engine';
import type { AssistantSimulationMode } from '@/platform/ai/assistant-contracts';
import {
  buildScenarioSuggestionContext,
  generateScenarioSuggestions,
  type ScenarioSuggestionItem,
} from '@/services/ScenarioSuggestionEngine';
import { renderScenarioConflictGraph } from './scenario-graph-view';
import { escapeHtml } from '@/utils/sanitize';
import {
  dispatchGeoAnalysisAssistantHandoff,
  dispatchOpenResilienceDashboard,
  GEO_ANALYSIS_EVENT_TYPES,
  type GeoAnalysisScenarioHandoffDetail,
} from '@/platform';
import {
  SCENARIO_INTELLIGENCE_EVENT_TYPES,
  type ScenarioIntelligenceDriftDetail,
} from '@/platform/operations/scenario-intelligence';
import { scenarioIntelligenceStore } from '@/services/scenario-intelligence';
import type { ScenarioEngineComparison, ScenarioEngineState } from '@/ai/scenario-engine';

export class ScenarioPlannerPanel extends Panel {
  private onScenarioComputed?: (output: ScenarioEngineOutput, defs: Record<'baseline' | 'optimistic' | 'pessimistic', ScenarioDefinition>) => void;
  private readonly geoScenarioHandler: EventListener;
  private readonly driftHandler: EventListener;
  private latestDefinitions: Record<'baseline' | 'optimistic' | 'pessimistic', ScenarioDefinition> | null = null;
  private latestLiveState: ScenarioEngineState | null = null;
  private latestDrift: ScenarioIntelligenceDriftDetail | null = null;
  private latestSimulation: ScenarioSimulationOutput | null = null;
  private latestSuggestions: ScenarioSuggestionItem[] = [];
  private latestMetaSuggestions: MetaScenarioSuggestionItem[] = [];
  private latestMetaOutput: MetaScenarioEngineOutput | null = null;
  private simulationMode: AssistantSimulationMode = 'fast';
  private simulationControls: ScenarioSimulationControls = createDefaultScenarioSimulationControls();
  private simulationEventDraft = '';
  private selectedSimulationBranchId: string | null = null;
  private selectedGraphScenarioId: string | null = null;
  private latestScenarioGraph: ScenarioGraphOutput | null = null;
  private latestScenarioWar: ScenarioWarResult | null = null;
  private unsubscribeScenarioState: (() => void) | null = null;

  constructor() {
    super({
      id: 'scenario-planner',
      title: 'سناریوپرداز',
      className: 'panel-wide',
    });
    this.geoScenarioHandler = ((event: CustomEvent<GeoAnalysisScenarioHandoffDetail>) => {
      this.applyGeoScenarioSeed(event.detail);
    }) as EventListener;
    this.driftHandler = ((event: CustomEvent<ScenarioIntelligenceDriftDetail>) => {
      this.latestDrift = event.detail;
      this.renderLiveSection();
      this.computeAndRender();
    }) as EventListener;
    document.addEventListener(GEO_ANALYSIS_EVENT_TYPES.scenarioHandoff, this.geoScenarioHandler);
    document.addEventListener(SCENARIO_INTELLIGENCE_EVENT_TYPES.driftDetected, this.driftHandler);
    this.latestLiveState = scenarioIntelligenceStore.getState();
    this.unsubscribeScenarioState = scenarioIntelligenceStore.subscribe((state) => {
      this.latestLiveState = state;
      if (!state?.drift?.length) {
        this.latestDrift = null;
      }
      this.renderLiveSection();
      this.computeAndRender();
    });
    this.render();
    this.bindEvents();
    this.computeAndRender();
  }

  public override destroy(): void {
    document.removeEventListener(GEO_ANALYSIS_EVENT_TYPES.scenarioHandoff, this.geoScenarioHandler);
    document.removeEventListener(SCENARIO_INTELLIGENCE_EVENT_TYPES.driftDetected, this.driftHandler);
    this.unsubscribeScenarioState?.();
    this.unsubscribeScenarioState = null;
    super.destroy();
  }

  public setScenarioComputedHandler(handler: (output: ScenarioEngineOutput, defs: Record<'baseline' | 'optimistic' | 'pessimistic', ScenarioDefinition>) => void): void {
    this.onScenarioComputed = handler;
  }

  public applyGeoScenarioSeed(detail: GeoAnalysisScenarioHandoffDetail): void {
    const baselineEvent = this.content.querySelector<HTMLTextAreaElement>('[data-scenario-id="event-baseline"]');
    const optimisticEvent = this.content.querySelector<HTMLTextAreaElement>('[data-scenario-id="event-optimistic"]');
    const pessimisticEvent = this.content.querySelector<HTMLTextAreaElement>('[data-scenario-id="event-pessimistic"]');
    const actors = this.content.querySelectorAll<HTMLInputElement>('[data-scenario-id^="actors-"]');
    const constraints = this.content.querySelectorAll<HTMLInputElement>('[data-scenario-id^="constraints-"]');
    const durations = this.content.querySelectorAll<HTMLInputElement>('[data-scenario-id^="duration-"]');

    if (baselineEvent) baselineEvent.value = detail.event;
    if (optimisticEvent) optimisticEvent.value = `${detail.event} با مسیر کنترل‌شده‌تر`;
    if (pessimisticEvent) pessimisticEvent.value = `${detail.event} با اثرات سرریز شدیدتر`;
    this.simulationEventDraft = detail.event;
    actors.forEach((input) => {
      input.value = detail.actors.join(', ');
    });
    constraints.forEach((input) => {
      input.value = detail.constraints.join(', ');
    });
    durations.forEach((input, index) => {
      const multiplier = index === 1 ? 0.8 : index === 2 ? 1.4 : 1;
      input.value = String(Math.max(3, Math.round(detail.durationDays * multiplier)));
    });
    this.computeAndRender();
  }

  private bindEvents(): void {
    this.content.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'open-resilience-stress') {
        if (!this.latestDefinitions) return;
        dispatchOpenResilienceDashboard(document, {
          source: 'scenario-workbench',
          primaryCountryCode: 'IR',
          focusTab: 'stress',
          reportType: 'scenario-forecast',
          title: 'تنش‌سنجی تاب‌آوری از سناریوپرداز',
          scenario: {
            title: this.latestDefinitions.baseline.name,
            event: this.latestDefinitions.baseline.event,
            durationDays: this.latestDefinitions.baseline.durationDays,
            actors: this.latestDefinitions.baseline.actors,
            constraints: this.latestDefinitions.baseline.constraints,
          },
        });
        return;
      }
      if (action === 'set-simulation-mode') {
        this.simulationMode = target.dataset.mode === 'deep' ? 'deep' : 'fast';
        this.computeAndRender();
        return;
      }
      if (action === 'select-simulation-branch') {
        this.selectedSimulationBranchId = target.dataset.branchId || null;
        this.renderSimulationSection();
        return;
      }
      if (action === 'apply-scenario-suggestion') {
        const suggestion = this.latestSuggestions.find((item) => item.id === target.dataset.suggestionId);
        if (!suggestion) return;
        this.simulationEventDraft = suggestion.query;
        this.simulationMode = suggestion.modeHint;
        this.simulationControls = {
          ...this.simulationControls,
          probabilityBias: suggestion.probabilityBiasHint,
          intensity: suggestion.intensityHint,
        };
        this.selectedSimulationBranchId = null;
        this.computeAndRender();
        return;
      }
      if (action === 'apply-meta-scenario-suggestion') {
        const suggestion = this.latestMetaSuggestions.find((item) => item.id === target.dataset.suggestionId);
        const mapContext = this.latestLiveState?.inputSnapshot.mapContext ?? null;
        if (!suggestion || !mapContext) return;
        dispatchGeoAnalysisAssistantHandoff(document, {
          resultId: `meta-suggestion:${suggestion.id}`,
          title: suggestion.label,
          query: suggestion.promptText,
          domainMode: suggestion.domainMode,
          taskClass: suggestion.taskClass,
          mapContext,
          evidenceCards: [],
        });
        return;
      }
      if (action === 'select-graph-node') {
        this.selectedGraphScenarioId = target.dataset.nodeId || null;
        this.renderLiveSection();
        return;
      }
      if (action === 'load-graph-scenario-into-simulation') {
        const nodeId = target.dataset.nodeId || this.selectedGraphScenarioId;
        const node = this.latestScenarioGraph?.nodes.find((item) => item.id === nodeId);
        if (!node) return;
        this.simulationEventDraft = `اگر ${node.title} در ${this.latestScenarioGraph?.anchorLabel || 'این محدوده'} غالب شود`;
        this.simulationMode = node.blackSwanScore >= 0.56 || node.contestedness >= 0.5 ? 'deep' : 'fast';
        this.simulationControls = {
          ...this.simulationControls,
          probabilityBias: Math.max(-0.3, Math.min(0.3, (node.dominance - node.fragility) * 0.25)),
          intensity: Math.max(0.35, Math.min(0.95, 0.42 + (node.impactScore * 0.4))),
        };
        this.computeAndRender();
      }
    });
    this.content.addEventListener('input', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.classList.contains('scenario-input')) {
        this.computeAndRender();
        return;
      }
      if (target instanceof HTMLTextAreaElement && target.dataset.simulationField === 'event') {
        this.simulationEventDraft = target.value.trim();
        this.computeAndRender();
        return;
      }
      if (target instanceof HTMLInputElement && target.dataset.simulationSlider) {
        const field = target.dataset.simulationSlider;
        const numeric = Number.parseFloat(target.value);
        if (field === 'probabilityBias') {
          this.simulationControls = {
            ...this.simulationControls,
            probabilityBias: Number.isFinite(numeric) ? numeric / 100 : 0,
          };
        } else if (field === 'intensity') {
          this.simulationControls = {
            ...this.simulationControls,
            intensity: Number.isFinite(numeric) ? numeric / 100 : this.simulationControls.intensity,
          };
        }
        this.computeAndRender();
        return;
      }
      if (target instanceof HTMLInputElement && target.dataset.simulationToggle) {
        const toggle = target.dataset.simulationToggle;
        if (toggle === 'coordination' || toggle === 'escalationBias' || toggle === 'marketSensitivity' || toggle === 'informationDisorder') {
          this.simulationControls = {
            ...this.simulationControls,
            actorBehavior: {
              ...this.simulationControls.actorBehavior,
              [toggle]: target.checked,
            },
          };
        } else if (toggle === 'logisticsFragility' || toggle === 'sanctionsPressure' || toggle === 'diplomaticBackchannel' || toggle === 'cyberPressure') {
          this.simulationControls = {
            ...this.simulationControls,
            constraints: {
              ...this.simulationControls.constraints,
              [toggle]: target.checked,
            },
          };
        }
        this.computeAndRender();
        return;
      }
      this.computeAndRender();
    });
  }

  private getInputValue(id: string, fallback: string): string {
    const input = this.content.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-scenario-id="${id}"]`);
    return input?.value?.trim() || fallback;
  }

  private parseList(value: string): string[] {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }

  private toScenario(suffix: 'baseline' | 'optimistic' | 'pessimistic', defaults: { name: string; severity: ScenarioDefinition['severity']; durationDays: number }): ScenarioDefinition {
    const event = this.getInputValue(`event-${suffix}`, 'اختلال در مسیرهای دریایی منطقه‌ای');
    const actors = this.parseList(this.getInputValue(`actors-${suffix}`, 'ایران, امریکا, اتحادیه اروپا'));
    const constraints = this.parseList(this.getInputValue(`constraints-${suffix}`, 'تحریم, محدودیت بیمه, محدودیت بندری'));
    const durationDays = Number.parseInt(this.getInputValue(`duration-${suffix}`, String(defaults.durationDays)), 10);

    return {
      name: defaults.name,
      event,
      severity: defaults.severity,
      durationDays: Number.isFinite(durationDays) ? Math.max(1, durationDays) : defaults.durationDays,
      actors,
      constraints,
    };
  }

  private simulationEvent(defs: Record<'baseline' | 'optimistic' | 'pessimistic', ScenarioDefinition>): string {
    return this.simulationEventDraft.trim() || defs.baseline.event;
  }

  private localizeSimulationTool(tool: string): string {
    switch (tool) {
      case 'map_context':
        return 'کانتکست نقشه';
      case 'osint_fetch':
        return 'واکشی OSINT';
      case 'web_search':
        return 'جست‌وجوی وب';
      case 'scenario_engine':
        return 'موتور سناریو';
      case 'scenario_simulation':
        return 'شبیه‌ساز سناریو';
      case 'summarize_context':
        return 'خلاصه‌سازی زمینه';
      case 'prompt_optimizer':
        return 'بهینه‌سازی پرامپت';
      case 'openrouter_call':
        return 'OpenRouter';
      default:
        return tool;
    }
  }

  private buildSimulation(defs: Record<'baseline' | 'optimistic' | 'pessimistic', ScenarioDefinition>): ScenarioSimulationOutput {
    const liveInput = this.latestLiveState?.inputSnapshot;
    const event = this.simulationEvent(defs);
    return runScenarioSimulation({
      hypotheticalEvent: event,
      trigger: event,
      query: event,
      mode: this.simulationMode,
      controls: this.simulationControls,
      mapContext: liveInput?.mapContext ?? null,
      localContextPackets: [
        ...(liveInput?.localContextPackets ?? []),
        ...(this.latestLiveState?.contextPackets ?? []),
      ],
      sessionContext: liveInput?.sessionContext ?? null,
      timeContext: this.latestLiveState?.updatedAt ?? new Date().toISOString(),
      availableTools: ['map_context', 'osint_fetch', 'web_search', 'scenario_engine', 'summarize_context', 'prompt_optimizer', 'openrouter_call'],
    });
  }

  private computeAndRender(): void {
    const defs = {
      baseline: this.toScenario('baseline', { name: 'پایه', severity: 'moderate', durationDays: 14 }),
      optimistic: this.toScenario('optimistic', { name: 'خوش‌بینانه', severity: 'low', durationDays: 10 }),
      pessimistic: this.toScenario('pessimistic', { name: 'بدبینانه', severity: 'severe', durationDays: 24 }),
    };

    const baselineOutput = runScenarioEngine(defs.baseline);
    const optimisticOutput = runScenarioEngine(defs.optimistic);
    const pessimisticOutput = runScenarioEngine(defs.pessimistic);

    const html = this.renderOutput(baselineOutput, optimisticOutput, pessimisticOutput);
    const outputEl = this.content.querySelector<HTMLElement>('.scenario-results');
    if (outputEl) {
      outputEl.innerHTML = html;
    }
    this.renderLiveSection();
    this.latestSimulation = this.buildSimulation(defs);
    if (!this.selectedSimulationBranchId || !this.latestSimulation.branches.some((branch) => branch.id === this.selectedSimulationBranchId)) {
      this.selectedSimulationBranchId = this.latestSimulation.branches[0]?.id ?? null;
    }
    const suggestionContext = buildScenarioSuggestionContext({
      state: this.latestLiveState ?? this.latestSimulation.baseState,
      focusQuery: this.simulationEvent(defs),
    });
    this.latestSuggestions = suggestionContext ? generateScenarioSuggestions(suggestionContext) : [];
    this.renderSimulationSection();

    const mergedCountryRisk = baselineOutput.countryRiskIndex.map((country) => {
      const optimisticMatch = optimisticOutput.countryRiskIndex.find((c) => c.code === country.code);
      const pessimisticMatch = pessimisticOutput.countryRiskIndex.find((c) => c.code === country.code);
      return {
        ...country,
        optimistic: optimisticMatch?.optimistic ?? country.optimistic,
        pessimistic: pessimisticMatch?.pessimistic ?? country.pessimistic,
      };
    });

    this.onScenarioComputed?.({ ...baselineOutput, countryRiskIndex: mergedCountryRisk }, defs);
    this.latestDefinitions = defs;
  }

  private render(): void {
    this.setContent(`
      <div class="scenario-planner">
        <section class="scenario-live"></section>
        <section class="scenario-simulation"></section>
        ${this.renderScenarioInputs('baseline', 'سناریوی پایه', 'moderate', 14)}
        ${this.renderScenarioInputs('optimistic', 'سناریوی خوش‌بینانه', 'low', 10)}
        ${this.renderScenarioInputs('pessimistic', 'سناریوی بدبینانه', 'severe', 24)}
        <div class="scenario-results"></div>
      </div>
    `);
  }

  private renderScenarioInputs(
    suffix: 'baseline' | 'optimistic' | 'pessimistic',
    title: string,
    severity: string,
    durationDays: number,
  ): string {
    return `
      <section class="scenario-block">
        <h4>${escapeHtml(title)}</h4>
        <label>رویداد</label>
        <textarea class="scenario-input" data-scenario-id="event-${suffix}">اختلال در تنگه راهبردی و شوک زنجیره تأمین</textarea>
        <div class="scenario-row">
          <div>
            <label>شدت</label>
            <input class="scenario-input" data-scenario-id="severity-${suffix}" value="${escapeHtml(severity)}" disabled />
          </div>
          <div>
            <label>مدت (روز)</label>
            <input class="scenario-input" data-scenario-id="duration-${suffix}" type="number" min="1" value="${durationDays}" />
          </div>
        </div>
        <label>بازیگران (کاما جدا)</label>
        <input class="scenario-input" data-scenario-id="actors-${suffix}" value="ایران, امریکا, چین, اتحادیه اروپا" />
        <label>محدودیت‌ها (کاما جدا)</label>
        <input class="scenario-input" data-scenario-id="constraints-${suffix}" value="تحریم, محدودیت بیمه, ریسک اعتباری, تاخیر بندری" />
      </section>
    `;
  }

  private renderSimulationSection(): void {
    const container = this.content.querySelector<HTMLElement>('.scenario-simulation');
    if (!container) return;
    container.innerHTML = this.renderSimulationWorkbench();
  }

  private renderSimulationWorkbench(): string {
    const simulation = this.latestSimulation;
    const selectedBranch = simulation?.branches.find((branch) => branch.id === this.selectedSimulationBranchId)
      ?? simulation?.branches[0]
      ?? null;
    const suggestions = this.latestSuggestions;
    const eventValue = this.simulationEventDraft || this.latestDefinitions?.baseline.event || 'اگر در این محدوده اختلال راهبردی رخ دهد';
    const probabilityBias = Math.round(this.simulationControls.probabilityBias * 100);
    const intensity = Math.round(this.simulationControls.intensity * 100);

    if (!simulation || !selectedBranch) {
      return `
        <section class="scenario-simulation-board">
          <header class="scenario-simulation-header">
            <div>
              <div class="scenario-live-kicker">Interactive Scenario Simulation</div>
              <h4>شبیه‌ساز تعاملی</h4>
              <p>trigger فرضی را تعریف کنید تا شاخه‌های آینده، decision tree و مسیر ابزارها ساخته شوند.</p>
            </div>
          </header>
        </section>
      `;
    }

    const graphRows = simulation.graph.edges.slice(0, 12).map((edge) => {
      const from = simulation.graph.nodes.find((node) => node.id === edge.from)?.label || edge.from;
      const to = simulation.graph.nodes.find((node) => node.id === edge.to)?.label || edge.to;
      return `
        <div class="scenario-simulation-graph-row">
          <span>${escapeHtml(from)}</span>
          <strong>${escapeHtml(edge.label || 'ارتباط')}</strong>
          <span>${escapeHtml(to)}</span>
        </div>
      `;
    }).join('');

    return `
      <section class="scenario-simulation-board">
        <header class="scenario-simulation-header">
          <div>
            <div class="scenario-live-kicker">Interactive Scenario Simulation</div>
            <h4>${escapeHtml(simulation.title)}</h4>
            <p>کانون: ${escapeHtml(simulation.anchorLabel)} | مقایسه: ${escapeHtml(simulation.compareSummary)}</p>
          </div>
          <div class="scenario-live-stats">
            <span>شاخه‌ها: ${simulation.branches.length}</span>
            <span>مد: ${escapeHtml(this.simulationMode === 'deep' ? 'عمیق' : 'سریع')}</span>
            <span>ابزارها: ${selectedBranch.tool_plan.length}</span>
          </div>
        </header>

        <section class="scenario-simulation-controls">
          <div class="scenario-simulation-event">
            <label>رویداد فرضی</label>
            <textarea data-simulation-field="event">${escapeHtml(eventValue)}</textarea>
          </div>
          <div class="scenario-simulation-mode">
            <button type="button" class="scenario-mode-btn ${this.simulationMode === 'fast' ? 'active' : ''}" data-action="set-simulation-mode" data-mode="fast">سریع</button>
            <button type="button" class="scenario-mode-btn ${this.simulationMode === 'deep' ? 'active' : ''}" data-action="set-simulation-mode" data-mode="deep">عمیق</button>
          </div>
          <div class="scenario-simulation-slider-grid">
            <label>
              <span>بایاس احتمال: ${probabilityBias}%</span>
              <input type="range" min="-30" max="30" step="5" value="${probabilityBias}" data-simulation-slider="probabilityBias" />
            </label>
            <label>
              <span>شدت: ${intensity}%</span>
              <input type="range" min="20" max="100" step="5" value="${intensity}" data-simulation-slider="intensity" />
            </label>
          </div>
          <div class="scenario-simulation-toggle-grid">
            ${this.renderSimulationToggle('coordination', 'هماهنگی بازیگران', this.simulationControls.actorBehavior.coordination)}
            ${this.renderSimulationToggle('escalationBias', 'تمایل به تشدید', this.simulationControls.actorBehavior.escalationBias)}
            ${this.renderSimulationToggle('marketSensitivity', 'حساسیت بازار', this.simulationControls.actorBehavior.marketSensitivity)}
            ${this.renderSimulationToggle('informationDisorder', 'اختلال روایی', this.simulationControls.actorBehavior.informationDisorder)}
            ${this.renderSimulationToggle('logisticsFragility', 'شکنندگی لجستیکی', this.simulationControls.constraints.logisticsFragility)}
            ${this.renderSimulationToggle('sanctionsPressure', 'فشار تحریمی', this.simulationControls.constraints.sanctionsPressure)}
            ${this.renderSimulationToggle('diplomaticBackchannel', 'کانال دیپلماتیک', this.simulationControls.constraints.diplomaticBackchannel)}
            ${this.renderSimulationToggle('cyberPressure', 'فشار سایبری', this.simulationControls.constraints.cyberPressure)}
          </div>
        </section>

        <section class="scenario-simulation-summary">
          ${simulation.controlsSummary.map((item) => `<span class="scenario-simulation-pill">${escapeHtml(item)}</span>`).join('')}
        </section>

        <section class="scenario-suggestion-panel">
          <div class="scenario-output-toolbar">
            <div>
              <strong>سناریوهای پیشنهادی</strong>
              <p class="scenario-live-empty">بر اساس context نقشه، سیگنال‌های اخیر و intent جاری، این what-ifها الان ارزش بررسی دارند.</p>
            </div>
            <span class="scenario-live-badge flat">${suggestions.length} پیشنهاد</span>
          </div>
          <div class="scenario-suggestion-grid">
            ${suggestions.map((suggestion) => `
              <article class="scenario-suggestion-card">
                <div class="scenario-live-card-head">
                  <strong>${escapeHtml(suggestion.label)}</strong>
                  <span class="scenario-live-badge ${suggestion.modeHint === 'deep' ? 'up' : 'flat'}">${escapeHtml(suggestion.modeHint === 'deep' ? 'عمیق' : 'سریع')}</span>
                </div>
                <p>${escapeHtml(suggestion.query)}</p>
                <div class="scenario-live-block">
                  <span>چرا مهم است</span>
                  <div class="scenario-live-empty">${escapeHtml(suggestion.why)}</div>
                </div>
                <div class="scenario-live-block">
                  <span>اثر بالقوه</span>
                  <div class="scenario-live-empty">${escapeHtml(suggestion.potentialImpact)}</div>
                </div>
                <div class="scenario-live-metrics">
                  <span>امتیاز: ${suggestion.score}</span>
                  <span>Signal: ${suggestion.scoreBreakdown.signals}</span>
                  <span>Intent: ${suggestion.scoreBreakdown.intent}</span>
                </div>
                <button type="button" class="scenario-suggestion-apply" data-action="apply-scenario-suggestion" data-suggestion-id="${escapeHtml(suggestion.id)}">بارگذاری در شبیه‌ساز</button>
              </article>
            `).join('')}
          </div>
        </section>

        <section class="scenario-simulation-branches">
          <div class="scenario-simulation-branch-tabs">
            ${simulation.branches.map((branch) => `
              <button type="button" class="scenario-branch-chip ${branch.id === selectedBranch.id ? 'active' : ''}" data-action="select-simulation-branch" data-branch-id="${escapeHtml(branch.id)}">
                <strong>${escapeHtml(branch.title)}</strong>
                <small>${Math.round(branch.probability_score * 100)}% | ${escapeHtml(branch.impact_level)}</small>
              </button>
            `).join('')}
          </div>

          <div class="scenario-simulation-detail">
            <article class="scenario-simulation-card">
              <div class="scenario-live-card-head">
                <strong>${escapeHtml(selectedBranch.title)}</strong>
                <span class="scenario-live-badge ${selectedBranch.probability_score >= 0.65 ? 'up' : selectedBranch.probability_score <= 0.35 ? 'down' : 'flat'}">
                  ${Math.round(selectedBranch.probability_score * 100)}%
                </span>
              </div>
              <p>${escapeHtml(selectedBranch.description)}</p>
              <div class="scenario-live-metrics">
                <span>اثر: ${escapeHtml(selectedBranch.impact_level)}</span>
                <span>افق: ${escapeHtml(selectedBranch.time_horizon)}</span>
                <span>ابهام: ${escapeHtml(selectedBranch.uncertainty_level)}</span>
              </div>
              <div class="scenario-live-block">
                <span>ریسک‌های محلی</span>
                <ul>${selectedBranch.local_risks.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
              </div>
              <div class="scenario-live-block">
                <span>سرریز منطقه‌ای / جهانی</span>
                <ul>${[...selectedBranch.regional_spillovers, ...selectedBranch.global_ripple_effects].slice(0, 6).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
              </div>
              <div class="scenario-simulation-tool-row">
                ${selectedBranch.tool_plan.map((tool) => `<span class="scenario-simulation-pill">${escapeHtml(this.localizeSimulationTool(tool))}</span>`).join('')}
              </div>
            </article>

            <article class="scenario-simulation-card">
              <strong>درخت تصمیم / ۳ تا ۵ گام بعدی</strong>
              <div class="scenario-simulation-step-list">
                ${selectedBranch.steps.map((step) => `
                  <div class="scenario-simulation-step">
                    <div>
                      <strong>${escapeHtml(step.title)}</strong>
                      <span>${escapeHtml(step.stage === 'checkpoint' ? 'Checkpoint' : step.stage)}</span>
                    </div>
                    <p>${escapeHtml(step.summary)}</p>
                    <div class="scenario-live-metrics">
                      <span>Prob ${Math.round(step.probability_score * 100)}%</span>
                      <span>Impact ${Math.round(step.impact_score * 100)}%</span>
                      <span>Uncertainty ${escapeHtml(step.uncertainty_level)}</span>
                    </div>
                    <div class="scenario-simulation-tool-row">
                      ${step.tool_calls.map((tool) => `<span class="scenario-simulation-pill">${escapeHtml(this.localizeSimulationTool(tool))}</span>`).join('')}
                    </div>
                  </div>
                `).join('')}
              </div>
            </article>
          </div>
        </section>

        <section class="scenario-simulation-graph">
          <div>
            <strong>Scenario Graph</strong>
            <div class="scenario-simulation-graph-list">${graphRows}</div>
          </div>
        </section>
      </section>
    `;
  }

  private renderSimulationToggle(id: string, label: string, checked: boolean): string {
    return `
      <label class="scenario-simulation-toggle">
        <input type="checkbox" data-simulation-toggle="${escapeHtml(id)}" ${checked ? 'checked' : ''} />
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }

  private renderOutput(
    baselineOutput: ScenarioEngineOutput,
    optimisticOutput: ScenarioEngineOutput,
    pessimisticOutput: ScenarioEngineOutput,
  ): string {
    const sectorRows = [
      { label: 'انرژی', b: baselineOutput.energy.baseline, o: optimisticOutput.energy.optimistic, p: pessimisticOutput.energy.pessimistic },
      { label: 'کشتیرانی', b: baselineOutput.shipping.baseline, o: optimisticOutput.shipping.optimistic, p: pessimisticOutput.shipping.pessimistic },
      { label: 'بازارهای مالی', b: baselineOutput.financialMarkets.baseline, o: optimisticOutput.financialMarkets.optimistic, p: pessimisticOutput.financialMarkets.pessimistic },
    ];

    const countryRows = baselineOutput.countryRiskIndex.slice(0, 6).map((country) => `
      <tr>
        <td>${escapeHtml(country.name)}</td>
        <td>${country.baseline}</td>
        <td>${country.optimistic}</td>
        <td>${country.pessimistic}</td>
      </tr>
    `).join('');

    const bars = sectorRows.map((row) => `
      <div class="scenario-bar-row">
        <span>${escapeHtml(row.label)}</span>
        <div class="scenario-bar-track">
          <div class="scenario-bar baseline" style="width:${row.b}%"></div>
          <div class="scenario-bar optimistic" style="width:${row.o}%"></div>
          <div class="scenario-bar pessimistic" style="width:${row.p}%"></div>
        </div>
      </div>
    `).join('');

    return `
      <section class="scenario-output">
        <div class="scenario-output-toolbar">
          <h4>مقایسه اثرات زنجیره‌ای</h4>
          <button type="button" class="nrc-tab" data-action="open-resilience-stress">باز کردن در داشبورد تاب‌آوری</button>
        </div>
        <table class="scenario-table">
          <thead><tr><th>بخش</th><th>پایه</th><th>خوش‌بینانه</th><th>بدبینانه</th></tr></thead>
          <tbody>
            ${sectorRows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.b}</td><td>${row.o}</td><td>${row.p}</td></tr>`).join('')}
          </tbody>
        </table>
        <div class="scenario-bars">${bars}</div>
        <h4>شاخص ریسک کشورها</h4>
        <table class="scenario-table">
          <thead><tr><th>کشور</th><th>پایه</th><th>خوش‌بینانه</th><th>بدبینانه</th></tr></thead>
          <tbody>${countryRows}</tbody>
        </table>
      </section>
    `;
  }

  private renderLiveSection(): void {
    const container = this.content.querySelector<HTMLElement>('.scenario-live');
    if (!container) return;
    this.syncScenarioGraph();
    container.innerHTML = this.renderLiveState();
  }

  private syncScenarioGraph(): void {
    const state = this.latestLiveState;
    if (!state) {
      this.latestScenarioGraph = null;
      this.latestScenarioWar = null;
      this.latestMetaSuggestions = [];
      this.latestMetaOutput = null;
      this.selectedGraphScenarioId = null;
      return;
    }
    this.latestScenarioGraph = buildScenarioGraph(state);
    this.latestScenarioWar = simulateScenarioWar(this.latestScenarioGraph, state.signals);
    this.latestMetaOutput = runMetaScenarioEngine({
      trigger: state.trigger,
      query: this.simulationEventDraft || state.inputSnapshot.query || state.trigger,
      mapContext: state.inputSnapshot.mapContext ?? null,
      localContextPackets: [
        ...(state.inputSnapshot.localContextPackets ?? []),
        ...state.contextPackets,
      ],
      sessionContext: state.inputSnapshot.sessionContext ?? null,
      timeContext: state.updatedAt,
      baseScenarioOutput: state,
    });
    const metaSuggestionContext = buildMetaScenarioSuggestionContext({
      state,
      metaOutput: this.latestMetaOutput,
      graph: this.latestScenarioGraph,
      focusQuery: this.simulationEventDraft || state.inputSnapshot.query || state.trigger,
    });
    this.latestMetaSuggestions = metaSuggestionContext ? generateMetaScenarioSuggestions(metaSuggestionContext) : [];
    const availableIds = new Set(this.latestScenarioGraph.nodes.map((node) => node.id));
    if (!this.selectedGraphScenarioId || !availableIds.has(this.selectedGraphScenarioId)) {
      this.selectedGraphScenarioId = this.latestScenarioWar.battlefieldState[0]?.scenarioId
        ?? this.latestScenarioGraph.nodes[0]?.id
        ?? null;
    }
  }

  private renderLiveState(): string {
    const state = this.latestLiveState;
    if (!state) {
      return `
        <section class="scenario-live-board">
          <header class="scenario-live-header">
            <div>
              <h4>رصد زنده سناریو</h4>
              <p>پس از کلیک روی نقشه یا ورود سیگنال‌های جدید، احتمالات سناریوها اینجا به‌روزرسانی می‌شود.</p>
            </div>
          </header>
        </section>
      `;
    }

    const topScenarios = state.scenarios.slice(0, 4);
    const driftItems = (this.latestDrift?.drift?.length ? this.latestDrift.drift : state.drift).slice(0, 4);
    const compare = state.compare;
    const graph = this.latestScenarioGraph;
    const war = this.latestScenarioWar;
    const metaSuggestionGroups = groupMetaScenarioSuggestions(this.latestMetaSuggestions);
    const timelineRows = topScenarios.map((scenario) => {
      const points = state.timeline[scenario.id] ?? [];
      const maxProbability = Math.max(0.01, ...points.map((point) => point.probabilityScore));
      const bars = points.map((point) => `
        <span class="scenario-live-timeline-bar" style="height:${Math.max(10, Math.round((point.probabilityScore / maxProbability) * 100))}%"
          title="${escapeHtml(point.reason)} | ${Math.round(point.probabilityScore * 100)}%"></span>
      `).join('');
      return `
        <article class="scenario-live-timeline-row">
          <strong>${escapeHtml(scenario.title)}</strong>
          <div class="scenario-live-timeline-track">${bars || '<span class="scenario-live-timeline-empty">-</span>'}</div>
          <small>${Math.round((scenario.probability_score ?? 0) * 100)}% | اطمینان ${Math.round((scenario.confidence_score ?? 0) * 100)}%</small>
        </article>
      `;
    }).join('');

    return `
      <section class="scenario-live-board">
        <header class="scenario-live-header">
          <div>
            <div class="scenario-live-kicker">Live Scenario Engine</div>
            <h4>${escapeHtml(state.trigger)}</h4>
            <p>کانون تحلیل: ${escapeHtml(state.anchorLabel)} | آخرین به‌روزرسانی: ${escapeHtml(state.updatedAt)}</p>
          </div>
          <div class="scenario-live-stats">
            <span>سیگنال‌ها: ${state.signalFusion.signalCount}</span>
            <span>همگرایی: ${Math.round(state.signalFusion.agreement * 100)}%</span>
            <span>اعتماد داده: ${Math.round(state.dataRichness * 100)}%</span>
          </div>
        </header>

        ${driftItems.length > 0 ? `
          <section class="scenario-drift-banner">
            <strong>تغییرات تازه</strong>
            <div class="scenario-drift-list">
              ${driftItems.map((drift) => `
                <article class="scenario-drift-chip ${escapeHtml(drift.direction)}">
                  <span>${escapeHtml(drift.title)}</span>
                  <small>${escapeHtml(drift.direction)} | ${Math.round(drift.delta * 100)}%</small>
                </article>
              `).join('')}
            </div>
          </section>
        ` : ''}

        <div class="scenario-live-grid">
          ${topScenarios.map((scenario) => `
            <article class="scenario-live-card">
              <div class="scenario-live-card-head">
                <strong>${escapeHtml(scenario.title)}</strong>
                <span class="scenario-live-badge ${escapeHtml(scenario.trend_direction || 'flat')}">${escapeHtml(scenario.trend_direction || 'flat')}</span>
              </div>
              <p>${escapeHtml(scenario.description)}</p>
              <div class="scenario-live-metrics">
                <span>احتمال: ${Math.round((scenario.probability_score ?? 0) * 100)}%</span>
                <span>اثر: ${escapeHtml(scenario.impact_level)}</span>
                <span>اطمینان: ${Math.round((scenario.confidence_score ?? 0) * 100)}%</span>
                <span>افق: ${escapeHtml(scenario.time_horizon)}</span>
              </div>
              <div class="scenario-live-block">
                <span>محرک‌ها</span>
                <ul>${scenario.drivers.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
              </div>
              <div class="scenario-live-block">
                <span>شاخص‌های پایش</span>
                <ul>${scenario.indicators_to_watch.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
              </div>
            </article>
          `).join('')}
        </div>

        <section class="scenario-live-compare">
          <div>
            <strong>مقایسه سناریوهای برتر</strong>
            ${this.renderCompare(compare)}
          </div>
          <div>
            <strong>تکامل زمانی</strong>
            <div class="scenario-live-timeline">
              ${timelineRows}
            </div>
          </div>
        </section>

        ${metaSuggestionGroups.length > 0 ? `
          <section class="scenario-suggestion-panel">
            <div class="scenario-output-toolbar">
              <div>
                <strong>پیشنهادهای متا-سناریویی</strong>
                <p class="scenario-live-empty">این promptها برای reasoning مرتبه‌دوم، conflict tracking و Black Swan stress test ساخته شده‌اند.</p>
              </div>
              <span class="scenario-live-badge flat">${this.latestMetaSuggestions.length} پیشنهاد</span>
            </div>
            <div class="meta-scenario-suggestion-groups">
              ${metaSuggestionGroups.map((group) => `
                <section class="meta-scenario-suggestion-group">
                  <div class="scenario-live-card-head">
                    <strong>${escapeHtml(group.label)}</strong>
                    <span class="scenario-live-badge flat">${group.items.length}</span>
                  </div>
                  <div class="scenario-suggestion-grid">
                    ${group.items.map((suggestion) => `
                      <article class="scenario-suggestion-card meta-scenario-suggestion-card">
                        <div class="scenario-live-card-head">
                          <strong>${escapeHtml(suggestion.label)}</strong>
                          <span class="scenario-live-badge ${suggestion.category === 'black-swan' ? 'up' : suggestion.category === 'conflict' ? 'down' : 'flat'}">${escapeHtml(group.label)}</span>
                        </div>
                        <p>${escapeHtml(suggestion.promptText)}</p>
                        <div class="scenario-live-block">
                          <span>چرا مهم است</span>
                          <div class="scenario-live-empty">${escapeHtml(suggestion.whyItMatters)}</div>
                        </div>
                        <div class="scenario-live-block">
                          <span>ارزش تحلیلی</span>
                          <div class="scenario-live-empty">${escapeHtml(suggestion.expectedAnalyticValue)}</div>
                        </div>
                        <div class="scenario-live-metrics">
                          <span>امتیاز: ${suggestion.score}</span>
                          <span>Scenario: ${suggestion.scoreBreakdown.scenario}</span>
                          <span>Conflict: ${suggestion.scoreBreakdown.conflict}</span>
                          <span>Black Swan: ${suggestion.scoreBreakdown.blackSwan}</span>
                        </div>
                        <button type="button" class="scenario-suggestion-apply" data-action="apply-meta-scenario-suggestion" data-suggestion-id="${escapeHtml(suggestion.id)}">ارسال به دستیار</button>
                      </article>
                    `).join('')}
                  </div>
                </section>
              `).join('')}
            </div>
          </section>
        ` : ''}

        ${graph && war ? renderScenarioConflictGraph({
          graph,
          war,
          selectedScenarioId: this.selectedGraphScenarioId,
        }) : ''}
      </section>
    `;
  }

  private renderCompare(compare: ScenarioEngineComparison | null): string {
    if (!compare) {
      return '<p class="scenario-live-empty">برای مقایسه، دست‌کم دو سناریوی فعال لازم است.</p>';
    }
    return `
      <p>${escapeHtml(compare.summary)}</p>
      <div class="scenario-live-metrics">
        <span>Likelihood Δ: ${Math.round(compare.likelihoodDelta * 100)}%</span>
        <span>Impact Δ: ${Math.round(compare.impactDelta * 100)}%</span>
        <span>Confidence Δ: ${Math.round(compare.confidenceDelta * 100)}%</span>
        <span>Strategic Δ: ${Math.round(compare.strategicDelta * 100)}%</span>
      </div>
    `;
  }
}
