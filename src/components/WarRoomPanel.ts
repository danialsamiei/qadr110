import { Panel } from './Panel';
import {
  listWarRoomAgents,
  runWarRoom,
  type WarRoomAgentId,
  type WarRoomOutput,
} from '@/ai/war-room';
import type { ScenarioEngineState } from '@/ai/scenario-engine';
import type {
  AssistantWarRoomAgent,
  AssistantWarRoomDisagreement,
  AssistantWarRoomRound,
} from '@/platform/ai/assistant-contracts';
import {
  buildWarRoomDeckTabs,
  buildWarRoomCognitiveLayer,
  buildWarRoomContextBanner,
  buildWarRoomCyberLayer,
  buildWarRoomDefenseLayer,
  buildWarRoomHeatTone,
  buildWarRoomShortcutHints,
  buildWarRoomSpecialViewNotes,
  buildWarRoomViewNarrative,
  cycleWarRoomFocusAgent,
  debatePresetToEngineMode,
  filterWarRoomAgentsByView,
  localizeWarRoomDebatePreset,
  localizeWarRoomDeckMode,
  localizeWarRoomViewMode,
  pickWarRoomFocusAgent,
  resolveWarRoomDrilldown,
  strongestObjection,
  type WarRoomDeckMode,
  type WarRoomDrilldownRef,
  type WarRoomDrilldownTarget,
  type WarRoomDebatePreset,
  type WarRoomLayerCard,
  type WarRoomViewMode,
} from '@/components/war-room-ui';
import { scenarioIntelligenceStore } from '@/services/scenario-intelligence';
import {
  loadAssistantWorkspaceState,
  subscribeAssistantWorkspaceChange,
} from '@/services/assistant-workspace';
import {
  dispatchGeoAnalysisAssistantHandoff,
  GEO_ANALYSIS_EVENT_TYPES,
  type GeoAnalysisScenarioHandoffDetail,
} from '@/platform';
import { escapeHtml } from '@/utils/sanitize';

const VIEW_MODES: WarRoomViewMode[] = ['overview', 'consensus', 'conflict', 'executive', 'red-team'];
const DEBATE_PRESETS: WarRoomDebatePreset[] = ['quick', 'deep', 'scenario-linked'];
type WarRoomLayerKey = 'cognitive' | 'cyber' | 'defense';
const DECK_MODES: WarRoomDeckMode[] = ['board', 'battlefield', 'timeline', 'evidence'];

function latestQuestionFromWorkspace(): string {
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

function uniqueStrings(values: Array<string | undefined>, maxItems = 8): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, maxItems);
}

function localizeProbabilityBand(band: 'low' | 'medium' | 'high'): string {
  switch (band) {
    case 'high':
      return 'بالا';
    case 'medium':
      return 'متوسط';
    default:
      return 'پایین';
  }
}

export class WarRoomPanel extends Panel {
  private scenarioState: ScenarioEngineState | null = null;
  private warRoom: WarRoomOutput | null = null;
  private questionDraft = '';
  private debatePreset: WarRoomDebatePreset = 'deep';
  private activeView: WarRoomViewMode = 'overview';
  private activeDeck: WarRoomDeckMode = 'board';
  private challengeIterations = 1;
  private selectedAgentId: string | null = null;
  private expandedRoundIds = new Set<string>();
  private excludedAgentIds = new Set<WarRoomAgentId>();
  private drilldownStack: WarRoomDrilldownRef[] = [];
  private shortcutsVisible = false;
  private unsubscribeScenario: (() => void) | null = null;
  private unsubscribeWorkspace: (() => void) | null = null;
  private readonly scenarioHandoffHandler: EventListener;

  constructor() {
    super({
      id: 'war-room',
      title: 'اتاق چندعاملی',
      className: 'panel-wide',
    });
    this.scenarioState = scenarioIntelligenceStore.getState();
    this.questionDraft = latestQuestionFromWorkspace();
    this.scenarioHandoffHandler = ((event: CustomEvent<GeoAnalysisScenarioHandoffDetail>) => {
      this.questionDraft = `در اتاق چندعاملی بررسی کن: ${event.detail.event}`;
      this.setDebatePreset('scenario-linked');
    }) as EventListener;
    this.unsubscribeScenario = scenarioIntelligenceStore.subscribe((state) => {
      this.scenarioState = state;
      this.compute();
      this.render();
    });
    this.unsubscribeWorkspace = subscribeAssistantWorkspaceChange(() => {
      if (!this.questionDraft.trim()) {
        this.questionDraft = latestQuestionFromWorkspace();
      }
      this.compute();
      this.render();
    });
    document.addEventListener(GEO_ANALYSIS_EVENT_TYPES.scenarioHandoff, this.scenarioHandoffHandler);
    this.bindEvents();
    this.compute();
    this.render();
  }

  public override destroy(): void {
    this.unsubscribeScenario?.();
    this.unsubscribeScenario = null;
    this.unsubscribeWorkspace?.();
    this.unsubscribeWorkspace = null;
    document.removeEventListener(GEO_ANALYSIS_EVENT_TYPES.scenarioHandoff, this.scenarioHandoffHandler);
    super.destroy();
  }

  private bindEvents(): void {
    this.content.addEventListener('input', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target instanceof HTMLTextAreaElement && target.dataset.warRoomField === 'question') {
        this.questionDraft = target.value;
        this.compute();
        this.render();
      }
    });

    this.content.addEventListener('change', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target instanceof HTMLSelectElement && target.dataset.warRoomField === 'challenge-iterations') {
        const nextValue = Number.parseInt(target.value, 10);
        this.challengeIterations = Number.isFinite(nextValue) ? Math.max(1, Math.min(3, nextValue)) : 1;
        if (this.debatePreset === 'quick' && this.challengeIterations > 1) {
          this.challengeIterations = 1;
        }
        this.compute();
        this.render();
      }
    });

    this.content.addEventListener('keydown', (event) => this.handleKeyboardShortcuts(event));

    this.content.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-war-room-action]');
      if (!target) return;
      const action = target.dataset.warRoomAction;
      if (action === 'rerun') {
        this.compute();
        this.render();
        return;
      }
      if (action === 'load-live-question') {
        this.questionDraft = latestQuestionFromWorkspace() || this.scenarioLinkedSeedQuestion() || this.questionDraft;
        this.compute();
        this.render();
        return;
      }
      if (action === 'toggle-agent') {
        const agentId = target.dataset.warRoomAgentId as WarRoomAgentId | undefined;
        if (!agentId) return;
        if (this.excludedAgentIds.has(agentId)) {
          this.excludedAgentIds.delete(agentId);
        } else {
          this.excludedAgentIds.add(agentId);
        }
        this.compute();
        this.render();
        return;
      }
      if (action === 'load-layer-question') {
        const layer = target.dataset.warRoomLayer as WarRoomLayerKey | undefined;
        if (!layer) return;
        this.questionDraft = this.layerQuestion(layer);
        this.activeView = layer === 'cognitive' ? 'conflict' : layer === 'defense' ? 'executive' : 'overview';
        this.activeDeck = layer === 'defense' ? 'evidence' : 'battlefield';
        this.compute();
        this.render();
        return;
      }
      if (action === 'open-in-assistant' && this.warRoom && this.scenarioState?.inputSnapshot.mapContext) {
        dispatchGeoAnalysisAssistantHandoff(document, {
          resultId: `war-room:${Date.now()}`,
          title: 'اتاق چندعاملی',
          query: this.warRoom.question,
          domainMode: 'scenario-planning',
          taskClass: 'scenario-analysis',
          mapContext: this.scenarioState.inputSnapshot.mapContext,
          evidenceCards: [],
        });
        return;
      }
      if (action === 'set-view') {
        const nextView = target.dataset.warRoomView as WarRoomViewMode | undefined;
        if (nextView && VIEW_MODES.includes(nextView)) {
          this.activeView = nextView;
          this.render();
        }
        return;
      }
      if (action === 'set-deck') {
        const nextDeck = target.dataset.warRoomDeck as WarRoomDeckMode | undefined;
        if (nextDeck && DECK_MODES.includes(nextDeck)) {
          this.activeDeck = nextDeck;
          this.render();
        }
        return;
      }
      if (action === 'set-preset') {
        const nextPreset = target.dataset.warRoomPreset as WarRoomDebatePreset | undefined;
        if (nextPreset && DEBATE_PRESETS.includes(nextPreset)) {
          this.setDebatePreset(nextPreset);
        }
        return;
      }
      if (action === 'toggle-round') {
        const roundId = target.dataset.warRoomRoundId;
        if (!roundId) return;
        if (this.expandedRoundIds.has(roundId)) {
          this.expandedRoundIds.delete(roundId);
        } else {
          this.expandedRoundIds.add(roundId);
        }
        this.render();
        return;
      }
      if (action === 'select-agent') {
        const agentId = target.dataset.warRoomAgentId;
        if (!agentId) return;
        this.selectedAgentId = agentId;
        this.render();
        return;
      }
      if (action === 'open-drilldown') {
        const kind = target.dataset.warRoomDrilldownKind as WarRoomDrilldownRef['kind'] | undefined;
        const id = target.dataset.warRoomDrilldownId;
        if (!kind || !id) return;
        this.openDrilldown({ kind, id });
        return;
      }
      if (action === 'close-drilldown') {
        this.closeDrilldown();
        return;
      }
      if (action === 'goto-crumb') {
        const crumbIndex = Number.parseInt(target.dataset.warRoomCrumbIndex ?? '-1', 10);
        if (Number.isFinite(crumbIndex)) {
          this.goToCrumb(crumbIndex);
        }
        return;
      }
      if (action === 'toggle-shortcuts') {
        this.shortcutsVisible = !this.shortcutsVisible;
        this.render();
        return;
      }
      if (action === 'seed-question') {
        const prompt = target.dataset.warRoomPrompt;
        if (!prompt) return;
        this.questionDraft = prompt;
        this.compute();
        this.render();
      }
    });
  }

  private shouldIgnoreKeyboardShortcuts(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) return false;
    return element instanceof HTMLInputElement
      || element instanceof HTMLTextAreaElement
      || element instanceof HTMLSelectElement
      || element.isContentEditable;
  }

  private handleKeyboardShortcuts(event: KeyboardEvent): void {
    if (this.shouldIgnoreKeyboardShortcuts(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === '?' || (event.shiftKey && key === '/')) {
      event.preventDefault();
      this.shortcutsVisible = !this.shortcutsVisible;
      this.render();
      return;
    }
    if (key === 'escape') {
      event.preventDefault();
      if (this.shortcutsVisible) {
        this.shortcutsVisible = false;
      } else if (this.drilldownStack.length > 0) {
        this.closeDrilldown();
        return;
      } else if (this.activeDeck !== 'board') {
        this.activeDeck = 'board';
      }
      this.render();
      return;
    }
    if (key >= '1' && key <= '5') {
      const nextView = VIEW_MODES[Number.parseInt(key, 10) - 1];
      if (nextView) {
        event.preventDefault();
        this.activeView = nextView;
        this.render();
      }
      return;
    }
    if (key === 'b' || key === 'g' || key === 't' || key === 'e') {
      event.preventDefault();
      this.activeDeck = key === 'g'
        ? 'battlefield'
        : key === 't'
          ? 'timeline'
          : key === 'e'
            ? 'evidence'
            : 'board';
      this.render();
      return;
    }
    if (key === 'j' || key === 'k') {
      if (!this.warRoom) return;
      event.preventDefault();
      const visibleAgents = filterWarRoomAgentsByView(this.warRoom, this.activeView);
      this.selectedAgentId = cycleWarRoomFocusAgent(visibleAgents, this.selectedAgentId, key === 'j' ? 1 : -1);
      this.render();
      return;
    }
    if (key === 'enter') {
      if (!this.warRoom || this.drilldownStack.length > 0) return;
      const focusAgent = pickWarRoomFocusAgent(this.warRoom, this.activeView, this.selectedAgentId);
      if (focusAgent) {
        event.preventDefault();
        this.openDrilldown({ kind: 'agent', id: focusAgent.id });
      }
    }
  }

  private currentDrilldown(): WarRoomDrilldownTarget | null {
    if (!this.warRoom || this.drilldownStack.length === 0) return null;
    const ref = this.drilldownStack[this.drilldownStack.length - 1]!;
    return resolveWarRoomDrilldown(this.warRoom, this.scenarioState, ref);
  }

  private openDrilldown(ref: WarRoomDrilldownRef): void {
    if (!this.warRoom) return;
    const target = resolveWarRoomDrilldown(this.warRoom, this.scenarioState, ref);
    if (!target) return;
    const existingIndex = this.drilldownStack.findIndex((item) => item.kind === ref.kind && item.id === ref.id);
    if (existingIndex >= 0) {
      this.drilldownStack = this.drilldownStack.slice(0, existingIndex + 1);
    } else {
      this.drilldownStack = [...this.drilldownStack, ref];
    }
    this.render();
  }

  private closeDrilldown(): void {
    if (this.drilldownStack.length === 0) return;
    this.drilldownStack = this.drilldownStack.slice(0, -1);
    this.render();
  }

  private goToCrumb(index: number): void {
    if (index < 0) {
      this.drilldownStack = [];
    } else {
      this.drilldownStack = this.drilldownStack.slice(0, index + 1);
    }
    this.render();
  }

  private setDebatePreset(preset: WarRoomDebatePreset): void {
    this.debatePreset = preset;
    if (preset === 'quick') {
      this.challengeIterations = 1;
    } else if (preset === 'scenario-linked' && !this.questionDraft.trim()) {
      this.questionDraft = this.scenarioLinkedSeedQuestion();
    }
    this.compute();
    this.render();
  }

  private scenarioLinkedSeedQuestion(): string {
    const topScenario = this.scenarioState?.scenarios[0];
    const anchor = this.scenarioState?.anchorLabel || 'این محدوده';
    if (topScenario) {
      return `برای ${anchor} مناظره سناریومحور بساز: اگر مسیر «${topScenario.title}» دچار شکست یا تشدید شود، کدام عامل‌ها واگرا می‌شوند؟`;
    }
    return `برای ${anchor} یک مناظره سناریومحور با تمرکز بر سیگنال‌های اخیر و watchpointهای فعال بساز.`;
  }

  private baseQuestion(): string {
    return this.questionDraft.trim()
      || this.scenarioState?.inputSnapshot.query?.trim()
      || this.scenarioState?.trigger
      || 'برای این محدوده یک مناظره چندعاملی و جمع‌بندی راهبردی بساز';
  }

  private effectiveQuestion(): string {
    const base = this.baseQuestion();
    if (this.debatePreset !== 'scenario-linked' || !this.scenarioState) {
      return base;
    }
    const anchor = this.scenarioState.anchorLabel || 'این محدوده';
    const topScenario = this.scenarioState.scenarios[0];
    if (!topScenario) {
      return `${base} سیگنال‌های اخیر، سوال‌های unresolved و ریسک‌های محلی ${anchor} را به مناظره وصل کن.`;
    }
    const watchpoints = topScenario.indicators_to_watch.slice(0, 3).join('، ');
    return `${base} سناریوی فعال «${topScenario.title}» در ${anchor} را مبنای مناظره قرار بده؛ watchpointهای ${watchpoints || 'اصلی'} و driftهای اخیر باید در challengeها لحاظ شوند.`;
  }

  private layerQuestion(layer: WarRoomLayerKey): string {
    const anchor = this.scenarioState?.anchorLabel || this.warRoom?.anchorLabel || 'این منطقه';
    const topScenario = this.scenarioState?.scenarios[0];
    const scenarioLabel = topScenario?.title ? `سناریوی «${topScenario.title}»` : 'سناریوی غالب';
    switch (layer) {
      case 'cognitive':
        return `در ${anchor} بررسی کن که تزریق روایت، drift احساسی و کمپین هماهنگ چگونه می‌توانند ${scenarioLabel} را تضعیف یا تشدید کنند.`;
      case 'cyber':
        return `برای ${anchor} آسیب‌پذیری‌های زیرساختی/سایبری، الگوهای اختلال و cascadeهای محتملِ مرتبط با ${scenarioLabel} را بازبینی کن.`;
      case 'defense':
        return `برای ${anchor} بر پایه ${scenarioLabel} یک counter-strategy و mitigation plan اولویت‌بندی‌شده با watchpointهای اجرایی بساز.`;
      default:
        return this.baseQuestion();
    }
  }

  private compute(): void {
    if (!this.scenarioState) {
      this.warRoom = null;
      return;
    }
    const question = this.effectiveQuestion();
    this.warRoom = runWarRoom({
      question,
      trigger: question,
      query: question,
      mapContext: this.scenarioState.inputSnapshot.mapContext ?? null,
      localContextPackets: [
        ...(this.scenarioState.inputSnapshot.localContextPackets ?? []),
        ...this.scenarioState.contextPackets,
      ],
      sessionContext: this.scenarioState.inputSnapshot.sessionContext ?? null,
      timeContext: this.scenarioState.updatedAt,
      baseScenarioOutput: this.scenarioState,
      mode: debatePresetToEngineMode(this.debatePreset),
      challengeIterations: this.challengeIterations,
      excludedAgentIds: [...this.excludedAgentIds],
    });

    if (!this.warRoom) return;

    const roundIds = new Set(this.warRoom.rounds.map((round) => round.id));
    if (this.expandedRoundIds.size === 0 && this.warRoom.rounds.length > 0) {
      this.expandedRoundIds.add(this.warRoom.rounds[0]!.id);
      this.expandedRoundIds.add(this.warRoom.rounds[this.warRoom.rounds.length - 1]!.id);
    } else {
      this.expandedRoundIds = new Set([...this.expandedRoundIds].filter((id) => roundIds.has(id)));
    }

    const visibleAgentIds = new Set(filterWarRoomAgentsByView(this.warRoom, this.activeView).map((agent) => agent.id));
    if (!this.selectedAgentId || !visibleAgentIds.has(this.selectedAgentId)) {
      this.selectedAgentId = pickWarRoomFocusAgent(this.warRoom, this.activeView, this.selectedAgentId)?.id ?? null;
    }

    if (this.drilldownStack.length > 0) {
      this.drilldownStack = this.drilldownStack.filter((ref) => Boolean(resolveWarRoomDrilldown(this.warRoom!, this.scenarioState, ref)));
    }
  }

  private renderEmpty(): void {
    this.setContent(`
      <div class="war-room-panel war-room-premium">
        <div class="war-room-empty">
          <strong>هنوز context زنده‌ای برای War Room ندارید</strong>
          <p>با کلیک روی نقشه، اجرای سناریو، یا ورود سوال تحلیلی در assistant، این پنل مناظره چندعاملی را روی همان زمینه اجرا می‌کند.</p>
        </div>
      </div>
    `);
  }

  private renderAgentCard(agent: AssistantWarRoomAgent, isSelected: boolean): string {
    return `
      <button
        type="button"
        class="war-room-agent-card ${isSelected ? 'is-selected' : ''}"
        data-war-room-action="select-agent"
        data-war-room-agent-id="${escapeHtml(agent.id)}"
        aria-pressed="${isSelected ? 'true' : 'false'}"
      >
        <div class="war-room-agent-head">
          <div>
            <strong>${escapeHtml(agent.role)}</strong>
            <div class="war-room-agent-label">${escapeHtml(agent.label)}</div>
          </div>
          <span class="war-room-agent-confidence">${Math.round(agent.confidence_score * 100)}%</span>
        </div>
        <p class="war-room-agent-stance">${escapeHtml(agent.revised_position || agent.position)}</p>
        <div class="war-room-chip-row">
          <span class="war-room-chip is-active">${escapeHtml(agent.confidence_note)}</span>
          ${agent.watchpoints.slice(0, 2).map((item) => `<span class="war-room-chip">${escapeHtml(item)}</span>`).join('')}
        </div>
        <dl class="war-room-agent-meta">
          <div>
            <dt>شواهد کلیدی</dt>
            <dd>${escapeHtml(agent.supporting_points.slice(0, 2).join(' | ') || 'هنوز مورد برجسته‌ای ثبت نشده است.')}</dd>
          </div>
          <div>
            <dt>قوی‌ترین اعتراض</dt>
            <dd>${escapeHtml(strongestObjection(agent))}</dd>
          </div>
        </dl>
      </button>
    `;
  }

  private renderFocusPanel(agent: AssistantWarRoomAgent | null): string {
    if (!agent) {
      return `
        <article class="war-room-focus-panel">
          <strong>عامل فعالی برای تمرکز وجود ندارد</strong>
          <p>نمای فعلی یا فیلتر عامل‌ها هیچ نماینده‌ای باقی نگذاشته است.</p>
        </article>
      `;
    }
    return `
      <article class="war-room-focus-panel">
        <div class="war-room-focus-header">
          <div>
            <div class="war-room-kicker">Agent Inspector</div>
            <strong>${escapeHtml(agent.role)}</strong>
            <div class="war-room-agent-label">${escapeHtml(agent.label)}</div>
          </div>
          <div class="war-room-focus-confidence">
            <span>${Math.round(agent.confidence_score * 100)}%</span>
            <small>${escapeHtml(agent.confidence_note)}</small>
          </div>
        </div>
        <p class="war-room-focus-summary">${escapeHtml(agent.revised_position || agent.position)}</p>
        <div class="war-room-command-inline">
          <button
            type="button"
            class="war-room-btn"
            data-war-room-action="open-drilldown"
            data-war-room-drilldown-kind="agent"
            data-war-room-drilldown-id="${escapeHtml(agent.id)}"
          >بازکردن گزارش عامل</button>
        </div>
        <div class="war-room-focus-grid">
          <section class="war-room-detail-card">
            <strong>شواهد و دلایل</strong>
            <ul>${agent.supporting_points.map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>شاهد برجسته‌ای ثبت نشده است.</li>'}</ul>
          </section>
          <section class="war-room-detail-card">
            <strong>اعتراض‌ها و challengeها</strong>
            <ul>${agent.critiques.map((item) => `<li><strong>${escapeHtml(item.target_agent_id)}</strong>: ${escapeHtml(item.summary)}</li>`).join('') || '<li>challenge خاصی ثبت نشده است.</li>'}</ul>
          </section>
          <section class="war-room-detail-card">
            <strong>فرض‌های فعلی</strong>
            <ul>${agent.assumptions.map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>فرض صریحی ثبت نشده است.</li>'}</ul>
          </section>
          <section class="war-room-detail-card">
            <strong>Watchpointهای پیشنهادی</strong>
            <div class="war-room-chip-row">${agent.watchpoints.map((item) => `<span class="war-room-chip">${escapeHtml(item)}</span>`).join('') || '<span class="war-room-chip">بدون watchpoint</span>'}</div>
          </section>
        </div>
      </article>
    `;
  }

  private renderRound(round: AssistantWarRoomRound, index: number): string {
    const expanded = this.expandedRoundIds.has(round.id);
    const markers = uniqueStrings(round.entries.flatMap((entry) => entry.markers));
    return `
      <article class="war-room-round-shell ${expanded ? 'is-expanded' : ''}">
        <button
          type="button"
          class="war-room-round-summary"
          data-war-room-action="toggle-round"
          data-war-room-round-id="${escapeHtml(round.id)}"
          aria-expanded="${expanded ? 'true' : 'false'}"
        >
          <div class="war-room-round-order">${index + 1}</div>
          <div class="war-room-round-body">
            <div class="war-room-round-head">
              <strong>${escapeHtml(round.title)}</strong>
              <span>${escapeHtml(round.summary)}</span>
            </div>
            <div class="war-room-chip-row">
              <span class="war-room-chip is-active">${escapeHtml(round.stage)}</span>
              <span class="war-room-chip">${round.entries.length} مداخله</span>
              ${markers.slice(0, 3).map((marker) => `<span class="war-room-chip marker-${escapeHtml(marker)}">${escapeHtml(marker)}</span>`).join('')}
            </div>
          </div>
        </button>
        <div class="war-room-command-inline war-room-round-actions">
          <button
            type="button"
            class="war-room-btn"
            data-war-room-action="open-drilldown"
            data-war-room-drilldown-kind="round"
            data-war-room-drilldown-id="${escapeHtml(round.id)}"
          >گزارش round</button>
        </div>
        ${expanded ? `
          <div class="war-room-round-panel">
            ${round.entries.map((entry) => `
              <article class="war-room-entry-card">
                <div class="war-room-entry-head">
                  <strong>${escapeHtml(entry.label)}</strong>
                  <div class="war-room-chip-row">
                    ${entry.markers.map((marker) => `<span class="war-room-chip marker-${escapeHtml(marker)}">${escapeHtml(marker)}</span>`).join('')}
                  </div>
                </div>
                <p>${escapeHtml(entry.content)}</p>
              </article>
            `).join('')}
          </div>
        ` : ''}
      </article>
    `;
  }

  private renderHeatmap(visibleAgents: AssistantWarRoomAgent[], focusAgent: AssistantWarRoomAgent | null): string {
    if (!this.warRoom) return '';
    const graphAgents = visibleAgents.length > 1 ? visibleAgents : this.warRoom.agents;
    const agentSet = new Set(graphAgents.map((agent) => agent.id));
    const rows = this.warRoom.disagreementMatrix.filter((row) => agentSet.has(row.agent_id));
    if (!rows.length || graphAgents.length < 2) {
      return `
        <article class="war-room-heatmap-panel">
          <div class="war-room-panel-head">
            <strong>نقشه حرارتی اختلاف</strong>
            <span>برای این نما، pair کافی برای مقایسه نداریم.</span>
          </div>
        </article>
      `;
    }

    return `
      <article class="war-room-heatmap-panel">
        <div class="war-room-panel-head">
          <strong>نقشه حرارتی اختلاف</strong>
          <span>شدت تعارض، challenge count و evidence-backed بودن بحث‌ها در این ماتریس ردیابی می‌شود.</span>
        </div>
        <div class="war-room-heatmap" style="grid-template-columns:minmax(120px, 170px) repeat(${graphAgents.length}, minmax(118px, 1fr));">
          <div class="war-room-heat-label is-corner"></div>
          ${graphAgents.map((agent) => `<div class="war-room-heat-label ${focusAgent?.id === agent.id ? 'is-focused' : ''}">${escapeHtml(agent.role)}</div>`).join('')}
          ${rows.map((row) => `
            <div class="war-room-heat-label ${focusAgent?.id === row.agent_id ? 'is-focused' : ''}">${escapeHtml(row.label)}</div>
            ${graphAgents.map((agent) => {
              if (agent.id === row.agent_id) {
                return '<div class="war-room-heat-cell tone-muted is-diagonal"><span>--</span></div>';
              }
              const cell = row.cells.find((candidate) => candidate.target_agent_id === agent.id);
              const score = cell?.disagreement_score ?? 0;
              const tone = buildWarRoomHeatTone(score);
              return `
                <button type="button" class="war-room-heat-cell tone-${tone}" title="${escapeHtml(cell?.summary || 'اختلاف برجسته‌ای ثبت نشده است.')}">
                  <strong>${Math.round(score * 100)}%</strong>
                  <span>${cell?.challenge_count ?? 0} challenge</span>
                  <small>${cell?.evidence_backed ? 'evidence-backed' : 'observational'}</small>
                </button>
              `;
            }).join('')}
          `).join('')}
        </div>
      </article>
    `;
  }

  private renderSpecialViewCards(visibleAgents: AssistantWarRoomAgent[]): string {
    if (!this.warRoom) return '';
    const notes = buildWarRoomSpecialViewNotes(this.warRoom, this.activeView);
    const narrative = buildWarRoomViewNarrative(this.warRoom, this.activeView);

    let primaryCards = '';
    if (this.activeView === 'consensus') {
      primaryCards = this.warRoom.convergences.length
        ? this.warRoom.convergences.map((item) => `
            <article class="war-room-detail-card">
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.summary)}</p>
              <div class="war-room-chip-row">${item.agent_ids.map((agentId) => `<span class="war-room-chip">${escapeHtml(agentId)}</span>`).join('')}</div>
            </article>
          `).join('')
        : '<article class="war-room-detail-card"><strong>اجماع محوری ثبت نشده است</strong><p>در این اجرا، عامل‌ها هنوز روی خط مشترک برجسته‌ای همگرا نشده‌اند.</p></article>';
    } else if (this.activeView === 'conflict' || this.activeView === 'red-team') {
      const items: AssistantWarRoomDisagreement[] = this.warRoom.disagreements.slice(0, this.activeView === 'red-team' ? 4 : 6);
      primaryCards = items.length
        ? items.map((item) => `
            <article class="war-room-detail-card">
              <strong>${escapeHtml(item.title)}</strong>
              <p>${escapeHtml(item.summary)}</p>
              <div class="war-room-chip-row">${item.agent_ids.map((agentId) => `<span class="war-room-chip">${escapeHtml(agentId)}</span>`).join('')}</div>
            </article>
          `).join('')
        : '<article class="war-room-detail-card"><strong>تعارض بحرانی ثبت نشده است</strong><p>در این اجرا چالش برجسته‌ای فراتر از اختلاف‌های سطحی دیده نمی‌شود.</p></article>';
    } else if (this.activeView === 'executive') {
      primaryCards = `
        <article class="war-room-detail-card">
          <strong>جمع‌بندی اجرایی</strong>
          <p>${escapeHtml(this.warRoom.executiveSummary)}</p>
        </article>
        <article class="war-room-detail-card">
          <strong>جمع‌بندی Moderator</strong>
          <p>${escapeHtml(this.warRoom.moderatorSummary)}</p>
        </article>
      `;
    } else {
      primaryCards = `
        <article class="war-room-detail-card">
          <strong>کیفیت مناظره</strong>
          <ul>
            <li>نسبت disagreement مستند: ${Math.round(this.warRoom.qualityControls.evidence_backed_disagreement_ratio * 100)}%</li>
            <li>ریسک هم‌صدایی: ${escapeHtml(localizeProbabilityBand(this.warRoom.qualityControls.voice_collapse_risk))}</li>
            <li>عامل‌های فعال: ${visibleAgents.length}</li>
          </ul>
        </article>
        <article class="war-room-detail-card">
          <strong>ابهام‌های حل‌نشده</strong>
          <ul>${this.warRoom.unresolvedUncertainties.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>ابهام کلیدی ثبت نشده است.</li>'}</ul>
        </article>
      `;
    }

    return `
      <section class="war-room-special-view">
        <div class="war-room-panel-head">
          <div>
            <strong>${escapeHtml(localizeWarRoomViewMode(this.activeView))}</strong>
            <p>${escapeHtml(narrative)}</p>
          </div>
        </div>
        <div class="war-room-note-strip">
          ${notes.map((item) => `<span class="war-room-note-pill">${escapeHtml(item)}</span>`).join('')}
        </div>
        <div class="war-room-focus-grid">
          ${primaryCards}
        </div>
      </section>
    `;
  }

  private renderScenarioBattlefield(): string {
    if (!this.warRoom) return '';
    return `
      <section class="war-room-special-view war-room-scenario-battlefield">
        <div class="war-room-panel-head">
          <div>
            <strong>نبرد سناریوها</strong>
            <p>${escapeHtml(this.warRoom.scenarioFocus.scenario_shift_summary || 'War Room هنوز تغییر معناداری در battlefield سناریوها ثبت نکرده است.')}</p>
          </div>
        </div>
        <div class="war-room-focus-grid">
          ${this.warRoom.scenarioRanking.slice(0, 4).map((item) => `
            <article class="war-room-detail-card war-room-drilldown-card">
              <strong>${escapeHtml(item.title)}</strong>
              <p>رتبه پایه ${item.baseline_rank} → رتبه بازبینی ${item.revised_rank} | وضعیت: ${escapeHtml(item.stance)}</p>
              <p>${escapeHtml(item.summary)}</p>
              ${item.watchpoints.length ? `<div class="war-room-chip-row">${item.watchpoints.slice(0, 3).map((watchpoint) => `<span class="war-room-chip">${escapeHtml(watchpoint)}</span>`).join('')}</div>` : ''}
              <div class="war-room-command-inline">
                <button
                  type="button"
                  class="war-room-btn"
                  data-war-room-action="open-drilldown"
                  data-war-room-drilldown-kind="scenario"
                  data-war-room-drilldown-id="${escapeHtml(item.scenario_id)}"
                >drill-down سناریو</button>
              </div>
            </article>
          `).join('')}
        </div>
        ${this.warRoom.scenarioAdjustments.length ? `
          <div class="war-room-detail-card">
            <strong>اصلاح‌های ناشی از disagreement</strong>
            <ul>${this.warRoom.scenarioAdjustments.map((item) => `<li><strong>${escapeHtml(item.title)}</strong> (${escapeHtml(item.adjustment_type)}): ${escapeHtml(item.rationale)}</li>`).join('')}</ul>
          </div>
        ` : ''}
      </section>
    `;
  }

  private renderLayerCard(card: WarRoomLayerCard): string {
    return `
      <article class="war-room-layer-card tone-${escapeHtml(card.tone)}">
        <div class="war-room-layer-card-head">
          <strong>${escapeHtml(card.title)}</strong>
          <span class="war-room-layer-metric">${escapeHtml(card.metric)}</span>
        </div>
        <p>${escapeHtml(card.summary)}</p>
        <ul class="war-room-inline-list">
          ${card.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>سیگنال مکملی برای این کارت در دسترس نیست.</li>'}
        </ul>
      </article>
    `;
  }

  private renderOperationalLayers(): string {
    if (!this.warRoom || !this.scenarioState) return '';
    const cognitive = buildWarRoomCognitiveLayer(this.warRoom, this.scenarioState);
    const cyber = buildWarRoomCyberLayer(this.warRoom, this.scenarioState);
    const defense = buildWarRoomDefenseLayer(this.warRoom, this.scenarioState);

    return `
      <section class="war-room-operational-grid">
        <article class="war-room-layer-panel war-room-layer-panel-cognitive">
          <div class="war-room-panel-head">
            <div>
              <strong>لایه جنگ شناختی</strong>
              <p>${escapeHtml(cognitive.summary)}</p>
            </div>
            <button type="button" class="war-room-btn" data-war-room-action="load-layer-question" data-war-room-layer="cognitive">بارگذاری در سوال</button>
          </div>
          <div class="war-room-layer-card-grid">
            ${cognitive.cards.map((card) => this.renderLayerCard(card)).join('')}
          </div>
          <div class="war-room-propagation-shell">
            <div class="war-room-propagation-graph">
              ${cognitive.nodes.map((node, index) => `
                <div class="war-room-propagation-segment">
                  <div class="war-room-propagation-node tone-${escapeHtml(node.tone)}">
                    <strong>${escapeHtml(node.label)}</strong>
                    <span>${escapeHtml(node.detail)}</span>
                  </div>
                  ${index < cognitive.edges.length ? `
                    <div class="war-room-propagation-arrow tone-${escapeHtml(cognitive.edges[index]!.tone)}">
                      <span>←</span>
                      <small>${escapeHtml(cognitive.edges[index]!.label)}</small>
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
            <div class="war-room-influence-vectors">
              ${cognitive.vectors.map((vector) => `
                <div class="war-room-vector-row tone-${escapeHtml(vector.tone)}">
                  <div class="war-room-vector-head">
                    <strong>${escapeHtml(vector.label)}</strong>
                    <span>${Math.round(vector.magnitude * 100)}%</span>
                  </div>
                  <div class="war-room-vector-bar">
                    <span class="war-room-vector-fill tone-${escapeHtml(vector.tone)}" style="width:${Math.max(8, Math.round(vector.magnitude * 100))}%"></span>
                  </div>
                  <p>${escapeHtml(vector.summary)}</p>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="war-room-layer-footer">
            <div class="war-room-chip-row">
              ${cognitive.watchpoints.map((item) => `<span class="war-room-chip">${escapeHtml(item)}</span>`).join('')}
            </div>
            <ul class="war-room-inline-list">
              ${cognitive.actions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
          </div>
        </article>

        <article class="war-room-layer-panel war-room-layer-panel-cyber">
          <div class="war-room-panel-head">
            <div>
              <strong>لایه سایبر و زیرساخت</strong>
              <p>${escapeHtml(cyber.summary)}</p>
            </div>
            <button type="button" class="war-room-btn" data-war-room-action="load-layer-question" data-war-room-layer="cyber">بارگذاری در سوال</button>
          </div>
          <div class="war-room-layer-card-grid">
            ${cyber.cards.map((card) => this.renderLayerCard(card)).join('')}
          </div>
          <div class="war-room-layer-footer">
            <div class="war-room-chip-row">
              ${cyber.watchpoints.map((item) => `<span class="war-room-chip">${escapeHtml(item)}</span>`).join('')}
            </div>
            <ul class="war-room-inline-list">
              ${cyber.actions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
          </div>
        </article>

        <article class="war-room-layer-panel war-room-layer-panel-defense">
          <div class="war-room-panel-head">
            <div>
              <strong>لایه دفاع و مهار</strong>
              <p>${escapeHtml(defense.summary)}</p>
            </div>
            <button type="button" class="war-room-btn" data-war-room-action="load-layer-question" data-war-room-layer="defense">بارگذاری در سوال</button>
          </div>
          <div class="war-room-layer-card-grid">
            ${defense.cards.map((card) => this.renderLayerCard(card)).join('')}
          </div>
          <div class="war-room-layer-footer">
            <div class="war-room-chip-row">
              ${defense.watchpoints.map((item) => `<span class="war-room-chip">${escapeHtml(item)}</span>`).join('')}
            </div>
            <ul class="war-room-inline-list">
              ${defense.actions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
          </div>
        </article>
      </section>
    `;
  }

  private renderTimelineDeck(): string {
    if (!this.warRoom) return '';
    return `
      <section class="war-room-sheet-stack">
        <section class="war-room-timeline-panel">
          <div class="war-room-panel-head">
            <div>
              <strong>خط زمانی مناظره</strong>
              <p>هر round را باز کنید تا assessment، critique، revision و synthesis به‌صورت لایه‌ای دیده شود.</p>
            </div>
            <span class="war-room-chip is-active">${this.warRoom.roundCount} round</span>
          </div>
          <div class="war-room-timeline">
            ${this.warRoom.rounds.map((round, index) => this.renderRound(round, index)).join('')}
          </div>
        </section>
        <section class="war-room-sheet-panel">
          <div class="war-room-panel-head">
            <div>
              <strong>Transcript فشرده</strong>
              <p>آخرین مداخلاتِ replay-ready برای مرور سریع و drill-down عمیق‌تر.</p>
            </div>
          </div>
          <div class="war-room-transcript-stack">
            ${this.warRoom.debateTranscript.slice(0, 8).map((entry) => `
              <article class="war-room-transcript-card">
                <div class="war-room-entry-head">
                  <strong>${escapeHtml(entry.label)}</strong>
                  <div class="war-room-chip-row">
                    <span class="war-room-chip is-active">${escapeHtml(entry.round_stage)}</span>
                    ${entry.markers.map((marker) => `<span class="war-room-chip marker-${escapeHtml(marker)}">${escapeHtml(marker)}</span>`).join('')}
                  </div>
                </div>
                <p>${escapeHtml(entry.response)}</p>
                <div class="war-room-inline-meta">
                  <span>${escapeHtml(entry.prompt_excerpt)}</span>
                  <button
                    type="button"
                    class="war-room-btn"
                    data-war-room-action="open-drilldown"
                    data-war-room-drilldown-kind="round"
                    data-war-room-drilldown-id="${escapeHtml(entry.round_id)}"
                  >بازکردن round</button>
                </div>
              </article>
            `).join('')}
          </div>
        </section>
      </section>
    `;
  }

  private renderEvidenceDeck(): string {
    if (!this.warRoom) return '';
    const evidencePackets = this.warRoom.contextPackets.slice(0, 6);
    return `
      <section class="war-room-sheet-stack">
        <section class="war-room-sheet-panel">
          <div class="war-room-panel-head">
            <div>
              <strong>Evidence Stack</strong>
              <p>بسته‌های شواهد، provenance و پیوند آن‌ها با دورهای مناظره و watchpointها.</p>
            </div>
          </div>
          <div class="war-room-evidence-stack">
            ${evidencePackets.map((packet) => `
              <article class="war-room-evidence-card">
                <div class="war-room-entry-head">
                  <strong>${escapeHtml(packet.title)}</strong>
                  <span class="war-room-agent-confidence">${Math.round(packet.score * 100)}%</span>
                </div>
                <p>${escapeHtml(packet.summary)}</p>
                <div class="war-room-chip-row">
                  <span class="war-room-chip is-active">${escapeHtml(packet.sourceLabel)}</span>
                  ${packet.tags.slice(0, 3).map((tag) => `<span class="war-room-chip">${escapeHtml(tag)}</span>`).join('')}
                </div>
                <div class="war-room-inline-meta">
                  <span>${escapeHtml(packet.updatedAt)}</span>
                  <button
                    type="button"
                    class="war-room-btn"
                    data-war-room-action="open-drilldown"
                    data-war-room-drilldown-kind="evidence"
                    data-war-room-drilldown-id="${escapeHtml(packet.id)}"
                  >بازکردن مدرک</button>
                </div>
              </article>
            `).join('') || '<article class="war-room-evidence-card"><strong>مدرک فعالی در دسترس نیست</strong><p>برای این اجرا، packet مستقیمی ثبت نشده است.</p></article>'}
          </div>
        </section>
        <section class="war-room-sheet-panel">
          <div class="war-room-panel-head">
            <div>
              <strong>State Trace و watch indicators</strong>
              <p>گذر state machine، enforcement و شاخص‌های پایش که باید نزدیک نگه داشته شوند.</p>
            </div>
          </div>
          <ol class="war-room-trace-list">
            ${this.warRoom.replayTrace.map((item) => `
              <li>
                <strong>${escapeHtml(item.from_stage)}</strong>
                <span>→</span>
                <strong>${escapeHtml(item.to_stage)}</strong>
                <p>${escapeHtml(item.summary)}</p>
              </li>
            `).join('')}
          </ol>
          <div class="war-room-chip-row">
            ${(this.warRoom.updatedWatchpoints.length > 0 ? this.warRoom.updatedWatchpoints : this.warRoom.recommendedWatchpoints)
              .map((item) => `<span class="war-room-chip">${escapeHtml(item)}</span>`).join('')}
          </div>
        </section>
      </section>
    `;
  }

  private renderBoardDeck(visibleAgents: AssistantWarRoomAgent[], focusAgent: AssistantWarRoomAgent | null): string {
    return `
      <section class="war-room-sheet-stack">
        ${this.renderSpecialViewCards(visibleAgents)}
        <section class="war-room-sheet-panel">
          ${this.renderFocusPanel(focusAgent)}
        </section>
      </section>
    `;
  }

  private renderBattlefieldDeck(visibleAgents: AssistantWarRoomAgent[], focusAgent: AssistantWarRoomAgent | null): string {
    return `
      <section class="war-room-sheet-stack">
        ${this.renderScenarioBattlefield()}
        ${this.renderHeatmap(visibleAgents, focusAgent)}
        ${this.renderOperationalLayers()}
      </section>
    `;
  }

  private renderActiveDeck(visibleAgents: AssistantWarRoomAgent[], focusAgent: AssistantWarRoomAgent | null): string {
    switch (this.activeDeck) {
      case 'battlefield':
        return this.renderBattlefieldDeck(visibleAgents, focusAgent);
      case 'timeline':
        return this.renderTimelineDeck();
      case 'evidence':
        return this.renderEvidenceDeck();
      default:
        return this.renderBoardDeck(visibleAgents, focusAgent);
    }
  }

  private renderBreadcrumbs(currentDrilldown: WarRoomDrilldownTarget | null): string {
    const deckLabel = localizeWarRoomDeckMode(this.activeDeck);
    const crumbs = this.drilldownStack
      .map((ref) => resolveWarRoomDrilldown(this.warRoom!, this.scenarioState, ref))
      .filter((item): item is WarRoomDrilldownTarget => Boolean(item));

    return `
      <nav class="war-room-breadcrumbs" aria-label="War Room breadcrumbs">
        <button type="button" class="war-room-breadcrumb ${this.drilldownStack.length === 0 ? 'is-active' : ''}" data-war-room-action="goto-crumb" data-war-room-crumb-index="-1">War Room</button>
        <span class="war-room-breadcrumb-sep">/</span>
        <span class="war-room-breadcrumb is-static">${escapeHtml(deckLabel)}</span>
        ${crumbs.map((crumb, index) => `
          <span class="war-room-breadcrumb-sep">/</span>
          <button
            type="button"
            class="war-room-breadcrumb ${index === crumbs.length - 1 ? 'is-active' : ''}"
            data-war-room-action="goto-crumb"
            data-war-room-crumb-index="${index}"
          >${escapeHtml(crumb.title)}</button>
        `).join('')}
        ${currentDrilldown ? `<span class="war-room-breadcrumb-status">${escapeHtml(currentDrilldown.subtitle)}</span>` : ''}
      </nav>
    `;
  }

  private renderShortcutOverlay(): string {
    const hints = buildWarRoomShortcutHints();
    return `
      <section class="war-room-shortcuts-overlay" aria-label="راهنمای میانبرهای War Room">
        <div class="war-room-panel-head">
          <div>
            <strong>میانبرهای War Room</strong>
            <p>برای حرکت سریع بین viewها، deckها و گزارش‌های لایه‌ای از این کلیدها استفاده کنید.</p>
          </div>
          <button type="button" class="war-room-btn" data-war-room-action="toggle-shortcuts">بستن</button>
        </div>
        <div class="war-room-shortcuts-grid">
          ${hints.map((hint) => `
            <article class="war-room-shortcut-card">
              <strong>${escapeHtml(hint.label)}</strong>
              <span class="war-room-agent-confidence">${escapeHtml(hint.keys)}</span>
              <p>${escapeHtml(hint.description)}</p>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  private renderDrilldownSheet(target: WarRoomDrilldownTarget): string {
    return `
      <section class="war-room-spotlight-sheet" aria-label="${escapeHtml(target.title)}">
        <div class="war-room-spotlight-head">
          <div>
            <div class="war-room-kicker">Report within report</div>
            <strong>${escapeHtml(target.title)}</strong>
            <p>${escapeHtml(target.subtitle)}</p>
          </div>
          <div class="war-room-command-inline">
            <button
              type="button"
              class="war-room-btn"
              data-war-room-action="seed-question"
              data-war-room-prompt="${escapeHtml(target.prompt)}"
            >بارگذاری در سوال</button>
            <button type="button" class="war-room-btn" data-war-room-action="close-drilldown">بستن</button>
          </div>
        </div>
        <p class="war-room-spotlight-summary">${escapeHtml(target.summary)}</p>
        <div class="war-room-chip-row">
          ${target.chips.map((chip) => `<span class="war-room-chip">${escapeHtml(chip)}</span>`).join('')}
        </div>
        <div class="war-room-spotlight-grid">
          ${target.sections.map((section) => `
            <article class="war-room-detail-card">
              <strong>${escapeHtml(section.title)}</strong>
              <ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>موردی ثبت نشده است.</li>'}</ul>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  private render(): void {
    if (!this.scenarioState || !this.warRoom) {
      this.renderEmpty();
      return;
    }

    const visibleAgents = filterWarRoomAgentsByView(this.warRoom, this.activeView);
    const focusAgent = pickWarRoomFocusAgent(this.warRoom, this.activeView, this.selectedAgentId);
    const deckTabs = buildWarRoomDeckTabs(this.warRoom, this.scenarioState);
    const topScenarios = this.scenarioState.scenarios.slice(0, 3);
    const contextBanner = buildWarRoomContextBanner(this.warRoom, this.debatePreset);
    const qualityAlerts = uniqueStrings([
      ...this.warRoom.qualityControls.alerts,
      ...this.warRoom.qualityControls.enforcement_notes,
    ], 5);
    const activeDrilldown = this.currentDrilldown();

    this.setContent(`
      <div class="war-room-panel war-room-premium" tabindex="0">
        <header class="war-room-header">
          <div>
            <div class="war-room-kicker">QADR110 Multi-Agent War Room</div>
            <h4>${escapeHtml(this.warRoom.anchorLabel)}</h4>
            <p>مناظره به‌روز شده در ${escapeHtml(this.scenarioState.updatedAt)} با ${this.warRoom.agents.length} عامل فعال و ${this.warRoom.roundCount} دور.</p>
          </div>
          <div class="war-room-actions">
            <button type="button" class="war-room-btn" data-war-room-action="load-live-question">بارگذاری سوال زنده</button>
            <button type="button" class="war-room-btn" data-war-room-action="rerun">اجرای دوباره</button>
            <button type="button" class="war-room-btn" data-war-room-action="toggle-shortcuts">میانبرها</button>
            <button type="button" class="war-room-btn accent" data-war-room-action="open-in-assistant">بازکردن در دستیار</button>
          </div>
        </header>

        <section class="war-room-context-banner">
          <div>
            <strong>${escapeHtml(localizeWarRoomDebatePreset(this.debatePreset))}</strong>
            <p>${escapeHtml(contextBanner)}</p>
          </div>
          <div class="war-room-chip-row">
            ${topScenarios.map((scenario) => `<span class="war-room-chip is-active">${escapeHtml(scenario.title)}</span>`).join('')}
            <span class="war-room-chip">${this.scenarioState.drift.length} drift</span>
            <span class="war-room-chip">${this.scenarioState.signals.length} signal</span>
          </div>
        </section>

        <section class="war-room-command-strip">
          <div class="war-room-deck-tabs" role="tablist" aria-label="War Room decks">
            ${deckTabs.map((deck) => `
              <button
                type="button"
                class="war-room-deck-tab ${this.activeDeck === deck.id ? 'is-active' : ''}"
                data-war-room-action="set-deck"
                data-war-room-deck="${escapeHtml(deck.id)}"
                aria-pressed="${this.activeDeck === deck.id ? 'true' : 'false'}"
              >
                <strong>${escapeHtml(deck.label)}</strong>
                <small>${escapeHtml(deck.summary)}</small>
                <span>${escapeHtml(deck.countLabel)}</span>
              </button>
            `).join('')}
          </div>
          <div class="war-room-command-meta">
            <span class="war-room-note-pill">1-5 view</span>
            <span class="war-room-note-pill">B/G/T/E deck</span>
            <span class="war-room-note-pill">J/K عامل</span>
            <span class="war-room-note-pill">Enter drill-down</span>
          </div>
        </section>

        ${this.renderBreadcrumbs(activeDrilldown)}

        <div class="war-room-shell">
          <section class="war-room-stage">
            <section class="war-room-hero">
              <div class="war-room-panel-head">
                <div>
                  <strong>صحنه مناظره و جمع‌بندی</strong>
                  <p>${escapeHtml(buildWarRoomViewNarrative(this.warRoom, this.activeView))}</p>
                </div>
              </div>

              <div class="war-room-view-switch" role="tablist" aria-label="War Room Views">
                ${VIEW_MODES.map((view) => `
                  <button
                    type="button"
                    class="war-room-view-btn ${this.activeView === view ? 'is-active' : ''}"
                    data-war-room-action="set-view"
                    data-war-room-view="${escapeHtml(view)}"
                    aria-pressed="${this.activeView === view ? 'true' : 'false'}"
                  >
                    ${escapeHtml(localizeWarRoomViewMode(view))}
                  </button>
                `).join('')}
              </div>

              <div class="war-room-summary-grid war-room-summary-grid-premium">
                <article class="war-room-summary-card">
                  <span>عامل‌های در صحنه</span>
                  <strong>${visibleAgents.length}</strong>
                </article>
                <article class="war-room-summary-card">
                  <span>شدت disagreement</span>
                  <strong>${Math.round(this.warRoom.scoring.disagreementDensity * 100)}%</strong>
                </article>
                <article class="war-room-summary-card">
                  <span>چگالی اجماع</span>
                  <strong>${Math.round(this.warRoom.scoring.agreementDensity * 100)}%</strong>
                </article>
                <article class="war-room-summary-card">
                  <span>پوشش سیگنال</span>
                  <strong>${Math.round(this.warRoom.scoring.signalCoverage * 100)}%</strong>
                </article>
              </div>

              <section class="war-room-agent-board">
                ${visibleAgents.map((agent) => this.renderAgentCard(agent, focusAgent?.id === agent.id)).join('')}
              </section>

              ${this.renderActiveDeck(visibleAgents, focusAgent)}
            </section>

            ${activeDrilldown ? this.renderDrilldownSheet(activeDrilldown) : ''}
            ${this.shortcutsVisible ? this.renderShortcutOverlay() : ''}
          </section>

          <aside class="war-room-sidebar">
            <section class="war-room-sidebar-card">
              <div class="war-room-panel-head">
                <div>
                  <strong>کنترل تحلیل‌گر</strong>
                  <p>عمق مناظره، ترکیب عامل‌ها و مسیر scenario-linked از اینجا کنترل می‌شود.</p>
                </div>
              </div>
              <label class="war-room-question">
                <span>سوال مشترک War Room</span>
                <textarea data-war-room-field="question">${escapeHtml(this.baseQuestion())}</textarea>
              </label>
              <div class="war-room-preset-grid">
                ${DEBATE_PRESETS.map((preset) => `
                  <button
                    type="button"
                    class="war-room-preset-btn ${this.debatePreset === preset ? 'is-active' : ''}"
                    data-war-room-action="set-preset"
                    data-war-room-preset="${escapeHtml(preset)}"
                    aria-pressed="${this.debatePreset === preset ? 'true' : 'false'}"
                  >
                    <strong>${escapeHtml(localizeWarRoomDebatePreset(preset))}</strong>
                    <small>${escapeHtml(preset === 'scenario-linked'
                      ? 'وابسته به سناریوی فعال و driftها'
                      : preset === 'quick'
                        ? 'فشرده، decisive و کم‌دور'
                        : 'چنددور، trace کامل و replay-ready')}</small>
                  </button>
                `).join('')}
              </div>
              <label class="war-room-rounds">
                <span>عمق challenge</span>
                <select data-war-room-field="challenge-iterations">
                  <option value="1" ${this.challengeIterations === 1 ? 'selected' : ''}>۱ تکرار</option>
                  <option value="2" ${(this.challengeIterations === 2 && this.debatePreset !== 'quick') ? 'selected' : ''}>۲ تکرار</option>
                  <option value="3" ${(this.challengeIterations === 3 && this.debatePreset !== 'quick') ? 'selected' : ''}>۳ تکرار</option>
                </select>
              </label>
              <div class="war-room-agent-toggles">
                ${listWarRoomAgents().map((agent) => {
                  const excluded = this.excludedAgentIds.has(agent.id);
                  const active = this.warRoom?.activeAgentIds.includes(agent.id) ?? !excluded;
                  return `
                    <button
                      type="button"
                      class="war-room-chip ${active ? 'is-active' : 'is-muted'}"
                      data-war-room-action="toggle-agent"
                      data-war-room-agent-id="${escapeHtml(agent.id)}"
                      aria-pressed="${active ? 'true' : 'false'}"
                    >
                      ${escapeHtml(agent.role)}
                    </button>
                  `;
                }).join('')}
              </div>
            </section>

            <section class="war-room-sidebar-card">
              <div class="war-room-panel-head">
                <div>
                  <strong>نمای نهایی</strong>
                  <p>نسخه board-ready برای مرور سریع تصمیم‌گیر.</p>
                </div>
              </div>
              <article class="war-room-synthesis-card">
                <strong>جمع‌بندی اجرایی</strong>
                <p>${escapeHtml(this.warRoom.executiveSummary)}</p>
                <div class="war-room-command-inline">
                  <button
                    type="button"
                    class="war-room-btn"
                    data-war-room-action="open-drilldown"
                    data-war-room-drilldown-kind="executive"
                    data-war-room-drilldown-id="executive-summary"
                  >گزارش اجرایی</button>
                </div>
              </article>
              <article class="war-room-synthesis-card">
                <strong>سنتز نهایی</strong>
                <p>${escapeHtml(this.warRoom.finalSynthesis)}</p>
              </article>
            </section>

            <section class="war-room-sidebar-card">
              <div class="war-room-panel-head">
                <div>
                  <strong>Watchpointها و کیفیت</strong>
                  <p>شاخص‌های پایش بعدی و کنترل‌های کیفیت خروجی.</p>
                </div>
              </div>
              <div class="war-room-chip-row">
                ${(this.warRoom.updatedWatchpoints.length > 0 ? this.warRoom.updatedWatchpoints : this.warRoom.recommendedWatchpoints).map((item) => `<span class="war-room-chip">${escapeHtml(item)}</span>`).join('')}
              </div>
              <ul class="war-room-inline-list">
                <li>تکراری شدن بحث: ${escapeHtml(this.warRoom.qualityControls.repetitive_debate ? 'بله' : 'خیر')}</li>
                <li>اتفاق‌نظر سطحی: ${escapeHtml(this.warRoom.qualityControls.shallow_agreement ? 'بله' : 'خیر')}</li>
                <li>ریسک هم‌صدایی: ${escapeHtml(localizeProbabilityBand(this.warRoom.qualityControls.voice_collapse_risk))}</li>
              </ul>
              ${this.warRoom.executiveRecommendations.length ? `<ul class="war-room-inline-list">${this.warRoom.executiveRecommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
              ${qualityAlerts.length ? `<div class="war-room-note-strip">${qualityAlerts.map((item) => `<span class="war-room-note-pill">${escapeHtml(item)}</span>`).join('')}</div>` : ''}
            </section>

            <section class="war-room-sidebar-card">
              <div class="war-room-panel-head">
                <div>
                  <strong>Evidence Stack</strong>
                  <p>مدارک سریع برای jump به report-within-report و trace تصمیم‌پذیر.</p>
                </div>
              </div>
              <div class="war-room-evidence-stack">
                ${this.warRoom.contextPackets.slice(0, 4).map((packet) => `
                  <article class="war-room-evidence-card">
                    <div class="war-room-entry-head">
                      <strong>${escapeHtml(packet.title)}</strong>
                      <span class="war-room-agent-confidence">${Math.round(packet.score * 100)}%</span>
                    </div>
                    <p>${escapeHtml(packet.summary)}</p>
                    <div class="war-room-inline-meta">
                      <span>${escapeHtml(packet.sourceLabel)}</span>
                      <button
                        type="button"
                        class="war-room-btn"
                        data-war-room-action="open-drilldown"
                        data-war-room-drilldown-kind="evidence"
                        data-war-room-drilldown-id="${escapeHtml(packet.id)}"
                      >بازکردن</button>
                    </div>
                  </article>
                `).join('')}
              </div>
              <div class="war-room-command-inline">
                <button type="button" class="war-room-btn" data-war-room-action="set-deck" data-war-room-deck="evidence">رفتن به Evidence Stack</button>
                <button type="button" class="war-room-btn" data-war-room-action="set-deck" data-war-room-deck="timeline">رفتن به Timeline</button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    `);
  }
}
