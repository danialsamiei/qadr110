import { Panel } from './Panel';
import { runStrategicForesight, type StrategicForesightOutput } from '@/ai/strategic-foresight';
import type { ScenarioEngineState } from '@/ai/scenario-engine';
import type { BlackSwanEngineState } from '@/ai/black-swan-engine';
import type { AssistantContextPacket, AssistantSessionContext } from '@/platform/ai/assistant-contracts';
import type { MapContextEnvelope } from '@/platform/operations/map-context';
import { MAP_CONTEXT_EVENT, dispatchGeoAnalysisAssistantHandoff, GEO_ANALYSIS_EVENT_TYPES, type GeoAnalysisScenarioHandoffDetail } from '@/platform';
import { scenarioIntelligenceStore } from '@/services/scenario-intelligence';
import { blackSwanIntelligenceStore } from '@/services/black-swan-intelligence';
import { loadAssistantWorkspaceState, subscribeAssistantWorkspaceChange } from '@/services/assistant-workspace';
import { escapeHtml } from '@/utils/sanitize';

type ForesightView = 'summary' | 'futures' | 'black-swan' | 'debate' | 'board';

function latestWorkspaceQuestion(): string {
  const workspace = loadAssistantWorkspaceState();
  const thread = workspace.threads.find((item) => item.id === workspace.activeThreadId)
    ?? workspace.threads[0]
    ?? null;
  const recentUserMessage = thread?.messages
    .slice()
    .reverse()
    .find((message) => message.role === 'user' && message.content.trim());
  return recentUserMessage?.content?.trim()
    || thread?.sessionContext?.activeIntentSummary
    || thread?.sessionContext?.intentHistory?.[thread.sessionContext.intentHistory.length - 1]?.query
    || '';
}

function activeSessionContext(): AssistantSessionContext | null {
  const workspace = loadAssistantWorkspaceState();
  const thread = workspace.threads.find((item) => item.id === workspace.activeThreadId)
    ?? workspace.threads[0]
    ?? null;
  return thread?.sessionContext ?? null;
}

function dedupePackets(packets: AssistantContextPacket[]): AssistantContextPacket[] {
  const seen = new Set<string>();
  return packets.filter((packet) => {
    const key = `${packet.id}|${packet.sourceUrl || ''}|${packet.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function labelFromMapContext(mapContext: MapContextEnvelope | null): string {
  const selection = mapContext?.selection;
  if (!selection) return 'این محدوده';
  if (selection.kind === 'country') return selection.countryName;
  if (selection.kind === 'point') return selection.label || selection.countryName || 'این نقطه';
  if (selection.kind === 'polygon') return selection.label || 'این محدوده';
  if (selection.kind === 'layer') return selection.layerLabel || selection.layerId;
  return selection.label;
}

export class StrategicForesightPanel extends Panel {
  private scenarioState: ScenarioEngineState | null = null;
  private blackSwanState: BlackSwanEngineState | null = null;
  private foresight: StrategicForesightOutput | null = null;
  private questionDraft = '';
  private includeWarRoom = true;
  private autoRefresh = true;
  private debateMode: 'fast' | 'deep' = 'deep';
  private activeView: ForesightView = 'summary';
  private lastMapContext: MapContextEnvelope | null = null;
  private unsubscribeScenario: (() => void) | null = null;
  private unsubscribeBlackSwan: (() => void) | null = null;
  private unsubscribeWorkspace: (() => void) | null = null;
  private readonly mapContextHandler: EventListener;
  private readonly scenarioHandoffHandler: EventListener;

  constructor() {
    super({
      id: 'strategic-foresight',
      title: 'کارگاه پیش‌نگری راهبردی',
      className: 'panel-wide',
    });
    this.scenarioState = scenarioIntelligenceStore.getState();
    this.blackSwanState = blackSwanIntelligenceStore.getState();
    this.lastMapContext = this.scenarioState?.inputSnapshot.mapContext ?? null;
    this.questionDraft = latestWorkspaceQuestion();
    this.mapContextHandler = ((event: CustomEvent<MapContextEnvelope>) => {
      this.lastMapContext = event.detail;
      if (this.autoRefresh) {
        this.compute();
        this.render();
      }
    }) as EventListener;
    this.scenarioHandoffHandler = ((event: CustomEvent<GeoAnalysisScenarioHandoffDetail>) => {
      this.questionDraft = `برای ${event.detail.event} یک جمع‌بندی پیش‌نگری راهبردی بساز.`;
      this.activeView = 'summary';
      this.compute();
      this.render();
    }) as EventListener;
    this.unsubscribeScenario = scenarioIntelligenceStore.subscribe((state) => {
      this.scenarioState = state;
      this.lastMapContext = state?.inputSnapshot.mapContext ?? this.lastMapContext;
      if (this.autoRefresh) {
        this.compute();
        this.render();
      }
    });
    this.unsubscribeBlackSwan = blackSwanIntelligenceStore.subscribe((state) => {
      this.blackSwanState = state;
      if (this.autoRefresh) {
        this.compute();
        this.render();
      }
    });
    this.unsubscribeWorkspace = subscribeAssistantWorkspaceChange(() => {
      if (!this.questionDraft.trim()) {
        this.questionDraft = latestWorkspaceQuestion();
      }
      if (this.autoRefresh) {
        this.compute();
        this.render();
      }
    });
    document.addEventListener(MAP_CONTEXT_EVENT, this.mapContextHandler);
    document.addEventListener(GEO_ANALYSIS_EVENT_TYPES.scenarioHandoff, this.scenarioHandoffHandler);
    this.bindEvents();
    this.compute();
    this.render();
  }

  public override destroy(): void {
    this.unsubscribeScenario?.();
    this.unsubscribeBlackSwan?.();
    this.unsubscribeWorkspace?.();
    this.unsubscribeScenario = null;
    this.unsubscribeBlackSwan = null;
    this.unsubscribeWorkspace = null;
    document.removeEventListener(MAP_CONTEXT_EVENT, this.mapContextHandler);
    document.removeEventListener(GEO_ANALYSIS_EVENT_TYPES.scenarioHandoff, this.scenarioHandoffHandler);
    super.destroy();
  }

  private bindEvents(): void {
    this.content.addEventListener('input', (event) => {
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLTextAreaElement && target.dataset.foresightField === 'question') {
        this.questionDraft = target.value;
      }
    });
    this.content.addEventListener('change', (event) => {
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLSelectElement && target.dataset.foresightField === 'mode') {
        this.debateMode = target.value === 'fast' ? 'fast' : 'deep';
      }
    });
    this.content.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-foresight-action]');
      if (!target) return;
      const action = target.dataset.foresightAction;
      if (action === 'rerun') {
        this.compute();
        this.render();
        return;
      }
      if (action === 'load-workspace-question') {
        this.questionDraft = latestWorkspaceQuestion() || this.questionDraft;
        this.compute();
        this.render();
        return;
      }
      if (action === 'toggle-war-room') {
        this.includeWarRoom = !this.includeWarRoom;
        this.compute();
        this.render();
        return;
      }
      if (action === 'toggle-auto-refresh') {
        this.autoRefresh = !this.autoRefresh;
        this.render();
        return;
      }
      if (action === 'set-view') {
        const nextView = target.dataset.foresightView as ForesightView | undefined;
        if (nextView) {
          this.activeView = nextView;
          this.render();
        }
        return;
      }
      if (action === 'open-in-assistant' && this.foresight && this.resolveMapContext()) {
        dispatchGeoAnalysisAssistantHandoff(document, {
          resultId: `foresight:${Date.now()}`,
          title: 'پیش‌نگری راهبردی',
          query: this.currentQuestion(),
          domainMode: 'strategic-foresight',
          taskClass: 'report-generation',
          mapContext: this.resolveMapContext()!,
          evidenceCards: [],
        });
        return;
      }
      if (action === 'run-next-prompt' && this.resolveMapContext()) {
        const prompt = target.dataset.foresightPrompt?.trim();
        if (!prompt) return;
        dispatchGeoAnalysisAssistantHandoff(document, {
          resultId: `foresight-prompt:${Date.now()}`,
          title: 'پرامپت بعدی پیش‌نگری',
          query: prompt,
          domainMode: 'strategic-foresight',
          taskClass: 'report-generation',
          mapContext: this.resolveMapContext()!,
          evidenceCards: [],
        });
      }
    });
  }

  private currentQuestion(): string {
    const mapContext = this.resolveMapContext();
    return this.questionDraft.trim()
      || latestWorkspaceQuestion()
      || (mapContext?.selection.kind === 'country'
        ? `برای ${mapContext.selection.countryName || 'این کشور'} یک جمع‌بندی پیش‌نگری راهبردی بساز.`
        : 'برای این محدوده یک جمع‌بندی پیش‌نگری راهبردی بساز.');
  }

  private resolveMapContext(): MapContextEnvelope | null {
    return this.scenarioState?.inputSnapshot.mapContext ?? this.lastMapContext ?? null;
  }

  private compute(): void {
    const mapContext = this.resolveMapContext();
    if (!mapContext) {
      this.foresight = null;
      return;
    }
    const question = this.currentQuestion();
    const localContextPackets = dedupePackets([
      ...(this.scenarioState?.inputSnapshot.localContextPackets ?? []),
      ...(this.scenarioState?.contextPackets ?? []),
      ...(this.blackSwanState?.contextPackets ?? []),
    ]);

    this.foresight = runStrategicForesight({
      question,
      trigger: question,
      query: question,
      mapContext,
      localContextPackets,
      sessionContext: this.scenarioState?.inputSnapshot.sessionContext ?? activeSessionContext(),
      timeContext: new Date().toISOString(),
      includeWarRoom: this.includeWarRoom,
      warRoomMode: this.debateMode,
      baseScenarioOutput: this.scenarioState,
      blackSwanOutput: this.blackSwanState,
    });
  }

  private renderEmpty(): void {
    this.setContent(`
      <div class="strategic-foresight-panel">
        <div class="strategic-foresight-empty">
          <strong>هنوز کانتکست کافی برای پیش‌نگری راهبردی وجود ندارد</strong>
          <p>روی نقشه کلیک کن یا یک محدوده را انتخاب کن تا سناریو، متا‌سناریو، قوی‌سیاه و debate چندعاملی در یک synthesis یکپارچه اجرا شوند.</p>
        </div>
      </div>
    `);
  }

  private renderSummaryView(): string {
    if (!this.foresight) return '';
    return `
      <section class="strategic-foresight-section">
        <h4>جمع‌بندی اجرایی</h4>
        <p class="strategic-foresight-executive">${escapeHtml(this.foresight.executiveSummary)}</p>
        <div class="strategic-foresight-board-list">
          ${this.foresight.boardSummary.map((item) => `<div class="strategic-foresight-board-item">${escapeHtml(item)}</div>`).join('')}
        </div>
        <div class="strategic-foresight-card-grid">
          ${this.foresight.dominantScenarios.map((scenario) => `
            <article class="strategic-foresight-card">
              <strong>${escapeHtml(scenario.title)}</strong>
              <div class="strategic-foresight-card-meta">
                <span>احتمال ${escapeHtml(scenario.probability)}</span>
                <span>اثر ${escapeHtml(scenario.impact_level)}</span>
                <span>بازه ${escapeHtml(scenario.time_horizon)}</span>
              </div>
              <p>${escapeHtml(scenario.description)}</p>
              <div class="strategic-foresight-chip-row">
                ${scenario.indicators_to_watch.slice(0, 4).map((item) => `<span class="strategic-foresight-chip">${escapeHtml(item)}</span>`).join('')}
              </div>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  private renderFuturesView(): string {
    if (!this.foresight) return '';
    return `
      <section class="strategic-foresight-section">
        <h4>آینده‌های رقیب</h4>
        <div class="strategic-foresight-card-grid">
          ${this.foresight.competingFutures.map((future) => `
            <article class="strategic-foresight-card">
              <strong>${escapeHtml(future.title)}</strong>
              <div class="strategic-foresight-card-meta">
                <span>${escapeHtml(future.type)}</span>
              </div>
              <p>${escapeHtml(future.summary)}</p>
              <div class="strategic-foresight-mini-note">${escapeHtml(future.whyItMatters)}</div>
              <div class="strategic-foresight-chip-row">
                ${future.watchpoints.map((item) => `<span class="strategic-foresight-chip">${escapeHtml(item)}</span>`).join('')}
              </div>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  private renderBlackSwanView(): string {
    if (!this.foresight) return '';
    return `
      <section class="strategic-foresight-section">
        <h4>قوی‌سیاه و watch indicatorها</h4>
        <div class="strategic-foresight-card-grid">
          ${this.foresight.blackSwanCandidates.map((candidate) => `
            <article class="strategic-foresight-card strategic-foresight-card-warning">
              <strong>${escapeHtml(candidate.title)}</strong>
              <div class="strategic-foresight-card-meta">
                <span>اثر ${escapeHtml(candidate.impact_level)}</span>
                <span>عدم‌قطعیت ${escapeHtml(candidate.uncertainty_level)}</span>
              </div>
              <p>${escapeHtml(candidate.why_it_matters)}</p>
              <div class="strategic-foresight-mini-note">${escapeHtml(candidate.low_probability_reason)}</div>
            </article>
          `).join('')}
        </div>
        <div class="strategic-foresight-chip-row strategic-foresight-chip-row-wide">
          ${this.foresight.watchIndicators.map((item) => `<span class="strategic-foresight-chip">${escapeHtml(item)}</span>`).join('')}
        </div>
      </section>
    `;
  }

  private renderDebateView(): string {
    if (!this.foresight) return '';
    if (!this.foresight.warRoomOutput) {
      return `
        <section class="strategic-foresight-section">
          <h4>مناظره چندعاملی</h4>
          <p class="strategic-foresight-empty-copy">در این اجرا War Room فعال نشده است. برای اجرای debate، toggle مربوطه را روشن کن.</p>
        </section>
      `;
    }
    return `
      <section class="strategic-foresight-section">
        <h4>خلاصه debate</h4>
        <div class="strategic-foresight-board-list">
          ${this.foresight.debateHighlights.map((item) => `<div class="strategic-foresight-board-item">${escapeHtml(item)}</div>`).join('')}
        </div>
        <div class="strategic-foresight-mini-note">${escapeHtml(this.foresight.warRoomOutput.scenarioFocus.scenario_shift_summary)}</div>
        <div class="strategic-foresight-card-grid">
          ${this.foresight.warRoomOutput.scenarioRanking.slice(0, 4).map((item) => `
            <article class="strategic-foresight-card">
              <strong>${escapeHtml(item.title)}</strong>
              <div class="strategic-foresight-card-meta">
                <span>رتبه ${item.baseline_rank} → ${item.revised_rank}</span>
                <span>${escapeHtml(item.stance)}</span>
              </div>
              <p>${escapeHtml(item.summary)}</p>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  private renderBoardView(): string {
    if (!this.foresight) return '';
    return `
      <section class="strategic-foresight-section">
        <h4>خروجی هیئت‌محور</h4>
        <div class="strategic-foresight-board-list strategic-foresight-board-list-emphasis">
          ${this.foresight.boardSummary.map((item) => `<div class="strategic-foresight-board-item">${escapeHtml(item)}</div>`).join('')}
        </div>
        <div class="strategic-foresight-card-grid">
          <article class="strategic-foresight-card">
            <strong>سیگنال‌های پایش</strong>
            <div class="strategic-foresight-chip-row">${this.foresight.watchIndicators.slice(0, 8).map((item) => `<span class="strategic-foresight-chip">${escapeHtml(item)}</span>`).join('')}</div>
          </article>
          <article class="strategic-foresight-card">
            <strong>پرامپت‌های بعدی</strong>
            <div class="strategic-foresight-followups">
              ${this.foresight.recommendedNextPrompts.map((item) => `
                <button type="button" class="strategic-foresight-followup-btn" data-foresight-action="run-next-prompt" data-foresight-prompt="${escapeHtml(item)}">${escapeHtml(item)}</button>
              `).join('')}
            </div>
          </article>
        </div>
      </section>
    `;
  }

  private renderActiveView(): string {
    switch (this.activeView) {
      case 'futures':
        return this.renderFuturesView();
      case 'black-swan':
        return this.renderBlackSwanView();
      case 'debate':
        return this.renderDebateView();
      case 'board':
        return this.renderBoardView();
      default:
        return this.renderSummaryView();
    }
  }

  private render(): void {
    if (!this.foresight && !this.resolveMapContext()) {
      this.renderEmpty();
      return;
    }
    const question = this.currentQuestion();
    const anchorLabel = this.foresight?.anchorLabel || labelFromMapContext(this.resolveMapContext());

    this.setContent(`
      <div class="strategic-foresight-panel">
        <div class="strategic-foresight-toolbar">
          <div class="strategic-foresight-toolbar-meta">
            <strong>${escapeHtml(anchorLabel)}</strong>
            <span>War Room: ${this.includeWarRoom ? 'روشن' : 'خاموش'}</span>
            <span>Auto refresh: ${this.autoRefresh ? 'روشن' : 'خاموش'}</span>
          </div>
          <div class="strategic-foresight-toolbar-actions">
            <button type="button" data-foresight-action="load-workspace-question">بارگذاری از گفت‌وگو</button>
            <button type="button" data-foresight-action="toggle-war-room">${this.includeWarRoom ? 'خاموش‌کردن War Room' : 'روشن‌کردن War Room'}</button>
            <button type="button" data-foresight-action="toggle-auto-refresh">${this.autoRefresh ? 'توقف auto refresh' : 'فعال‌سازی auto refresh'}</button>
            <button type="button" data-foresight-action="rerun">اجرای مجدد</button>
            <button type="button" data-foresight-action="open-in-assistant">بازکردن در Assistant</button>
          </div>
        </div>

        <div class="strategic-foresight-controls">
          <label class="strategic-foresight-input-group">
            <span>پرسش foresight</span>
            <textarea data-foresight-field="question" rows="3" placeholder="مثال: برای این منطقه یک synthesis پیش‌نگری راهبردی بساز.">${escapeHtml(question)}</textarea>
          </label>
          <label class="strategic-foresight-input-group strategic-foresight-input-group-compact">
            <span>عمق debate</span>
            <select data-foresight-field="mode">
              <option value="deep" ${this.debateMode === 'deep' ? 'selected' : ''}>عمیق</option>
              <option value="fast" ${this.debateMode === 'fast' ? 'selected' : ''}>سریع</option>
            </select>
          </label>
        </div>

        <div class="strategic-foresight-view-switch" role="tablist" aria-label="نماهای پیش‌نگری">
          ${([
            ['summary', 'خلاصه'],
            ['futures', 'آینده‌های رقیب'],
            ['black-swan', 'قوی‌سیاه'],
            ['debate', 'مناظره'],
            ['board', 'خروجی هیئت'],
          ] as Array<[ForesightView, string]>).map(([view, label]) => `
            <button type="button" class="strategic-foresight-view-btn ${this.activeView === view ? 'active' : ''}" data-foresight-action="set-view" data-foresight-view="${view}">${label}</button>
          `).join('')}
        </div>

        ${this.foresight ? `
          <div class="strategic-foresight-summary-grid">
            <article class="strategic-foresight-summary-card">
              <span>سناریوی غالب</span>
              <strong>${escapeHtml(this.foresight.dominantScenarios[0]?.title || 'نامشخص')}</strong>
            </article>
            <article class="strategic-foresight-summary-card">
              <span>Future رقیب</span>
              <strong>${escapeHtml(this.foresight.competingFutures[0]?.title || 'نامشخص')}</strong>
            </article>
            <article class="strategic-foresight-summary-card">
              <span>قوی‌سیاه فعال</span>
              <strong>${escapeHtml(this.foresight.blackSwanCandidates[0]?.title || 'ندارد')}</strong>
            </article>
            <article class="strategic-foresight-summary-card">
              <span>Watchpointها</span>
              <strong>${this.foresight.watchIndicators.length}</strong>
            </article>
          </div>
        ` : ''}

        ${this.renderActiveView()}
      </div>
    `);
  }
}
