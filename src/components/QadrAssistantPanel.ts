import { Panel } from './Panel';
import { replaceChildren } from '@/utils/dom-utils';
import { escapeHtml } from '@/utils/sanitize';
import {
  ANALYSIS_EVENT_TYPES,
  dispatchMapAwareAiInsightUpdated,
  dispatchOpenResilienceDashboard,
  AnalysisJobQueue,
  GEO_ANALYSIS_EVENT_TYPES,
  isDemoModeEnabled,
  type GeoAnalysisAssistantHandoffDetail,
  MAP_CONTEXT_EVENT,
  PROMPT_INTELLIGENCE_EVENT_TYPES,
  composePromptEntry,
  DEFAULT_PROMPT_CATALOG,
  DEFAULT_ASSISTANT_DOMAIN_MODE,
  describeMapContextForPrompt,
  getPromptEntriesForMode,
  type MapContextEnvelope,
  type PromptSuggestionRunDetail,
} from '@/platform';
import {
  ASSISTANT_DOMAIN_MODE_OPTIONS,
  type AssistantConversationThread,
  type AssistantDomainMode,
  type AssistantEvidenceCard,
  type AssistantMessage,
} from '@/platform/ai/assistant-contracts';
import type { AiTaskClass } from '@/platform/ai/contracts';
import { createWorkflowFromContext, createAssistantMemoryNote, createAssistantThread, loadAssistantWorkspaceState, removeAssistantThread, saveAssistantWorkspaceState, setActiveAssistantThread, setAssistantCompactMode, upsertAssistantMemoryNote, upsertAssistantThread, upsertAssistantWorkflow, upsertKnowledgeDocument, type AssistantWorkspaceState } from '@/services/assistant-workspace';
import {
  appendAssistantIntent,
  appendAssistantMapInteraction,
  appendReusableInsight,
  normalizeAssistantSessionContext,
} from '@/services/ai-orchestrator/session';
import { describeAssistantRoute, exportAssistantThread, runPersianAssistant } from '@/services/intelligence-assistant';
import type { KnowledgeDocument } from '@/platform/retrieval';
import {
  buildAssistantTransparencySummary,
  collectFollowUpSuggestions,
  defaultTaskForWorkbenchMode,
  deriveAssistantWorkbenchMode,
  localizeWorkbenchMode,
  renderAssistantConversationPreview,
  renderAssistantRichText,
  renderAssistantStructuredMessage,
  selectAssistantMessage,
  type AssistantInspectorTab,
  type AssistantSheetTab,
  type AssistantWorkbenchMode,
} from './qadr-assistant-ui';

const TASK_OPTIONS: Array<{ id: AiTaskClass; label: string }> = [
  { id: 'assistant', label: 'چت راهبردی' },
  { id: 'briefing', label: 'بریـف' },
  { id: 'report-generation', label: 'گزارش' },
  { id: 'scenario-analysis', label: 'تحلیل سناریو' },
  { id: 'scenario-building', label: 'سناریوسازی' },
  { id: 'forecasting', label: 'پیش‌بینی' },
  { id: 'resilience-analysis', label: 'تاب‌آوری' },
  { id: 'structured-json', label: 'JSON ساخت‌یافته' },
  { id: 'extraction', label: 'استخراج' },
];

const DEMO_ASSISTANT_SEED_KEY = 'qadr110-demo-assistant-seeded-v1';

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatThreadTitle(thread: AssistantConversationThread): string {
  return thread.title || 'گفت‌وگو';
}

function latestAssistantMessage(thread: AssistantConversationThread | null): AssistantMessage | null {
  if (!thread) return null;
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const candidate = thread.messages[index];
    if (candidate?.role === 'assistant') return candidate;
  }
  return null;
}

function allEvidenceCards(thread: AssistantConversationThread | null): AssistantEvidenceCard[] {
  if (!thread) return [];
  return thread.messages.flatMap((message) => message.evidenceCards ?? []);
}

function pinnedEvidenceCards(thread: AssistantConversationThread | null): AssistantEvidenceCard[] {
  if (!thread) return [];
  const pinned = new Set(thread.pinnedEvidenceIds);
  return allEvidenceCards(thread).filter((item) => pinned.has(item.id));
}

function renderConfidenceBand(message: AssistantMessage): string {
  if (!message.confidenceBand) return '';
  return `<span class="qadr-ai-confidence">${escapeHtml(message.confidenceBand)}</span>`;
}

export class QadrAssistantPanel extends Panel {
  private state: AssistantWorkspaceState;
  private draftQuery = '';
  private draftMemory = '';
  private fullscreen = false;
  private statusLine = 'آماده برای تحلیل فارسی مبتنی بر OpenRouter';
  private activeJobId: string | null = null;
  private lastMapContext: MapContextEnvelope | null = null;
  private activeInspectorTab: AssistantInspectorTab = 'suggestions';
  private activeSheetTab: AssistantSheetTab = 'report';
  private selectedMessageId: string | null = null;
  private showReasoning = false;
  private readonly analysisQueue: AnalysisJobQueue;
  private readonly mapContextHandler: EventListener;
  private readonly analysisEventHandler: EventListener;
  private readonly geoAnalysisHandoffHandler: EventListener;
  private readonly promptSuggestionHandler: EventListener;

  constructor() {
    super({ id: 'qadr-assistant', title: 'کارگاه هوشمند QADR110', className: 'panel-wide' });
    this.state = loadAssistantWorkspaceState();
    this.analysisQueue = new AnalysisJobQueue(document);

    if (this.state.threads.length === 0) {
      const initial = createAssistantThread(DEFAULT_ASSISTANT_DOMAIN_MODE, 'assistant', 'گفت‌وگوی اولیه');
      this.state = upsertAssistantThread(this.state, initial);
    }
    this.selectedMessageId = latestAssistantMessage(this.activeThread)?.id ?? null;

    this.mapContextHandler = ((event: CustomEvent<MapContextEnvelope>) => {
      this.lastMapContext = event.detail;
      const thread = this.activeThread;
      if (thread) {
        thread.sessionContext = appendAssistantMapInteraction(
          normalizeAssistantSessionContext(thread.sessionContext, thread.id),
          event.detail,
          event.detail.createdAt,
        );
        thread.updatedAt = new Date().toISOString();
        this.state = upsertAssistantThread(this.state, thread);
      }
      this.statusLine = `کانتکست نقشه دریافت شد: ${describeMapContextForPrompt(event.detail).slice(0, 96)}`;
      this.render();
    }) as EventListener;

    this.analysisEventHandler = ((event: CustomEvent<{ jobId: string; title: string; error?: string; reason?: string }>) => {
      const { type } = event;
      if (type === ANALYSIS_EVENT_TYPES.started) {
        this.statusLine = `تحلیل در حال اجرا: ${event.detail.title}`;
      } else if (type === ANALYSIS_EVENT_TYPES.completed) {
        this.statusLine = `تحلیل تکمیل شد: ${event.detail.title}`;
        if (this.activeJobId === event.detail.jobId) this.activeJobId = null;
      } else if (type === ANALYSIS_EVENT_TYPES.failed) {
        this.statusLine = `خطا در تحلیل: ${event.detail.error || event.detail.title}`;
        if (this.activeJobId === event.detail.jobId) this.activeJobId = null;
      } else if (type === ANALYSIS_EVENT_TYPES.minimized) {
        this.statusLine = `تحلیل در پس‌زمینه ادامه دارد: ${event.detail.reason || event.detail.title}`;
      }
      this.render();
    }) as EventListener;

    this.geoAnalysisHandoffHandler = ((event: CustomEvent<GeoAnalysisAssistantHandoffDetail>) => {
      const detail = event.detail;
      const nextThread = createAssistantThread(detail.domainMode, detail.taskClass, `ادامه: ${detail.title.slice(0, 36)}`);
      if (detail.evidenceCards.length > 0) {
        const seedMessage: AssistantMessage = {
          id: createId('msg'),
          role: 'assistant',
          createdAt: new Date().toISOString(),
          content: 'شواهد اولیه از تحلیل نقشه به این رشته منتقل شد.',
          domainMode: detail.domainMode,
          taskClass: detail.taskClass,
          evidenceCards: detail.evidenceCards,
          confidenceBand: 'medium',
        };
        nextThread.messages = [seedMessage];
      }
      this.lastMapContext = detail.mapContext;
      this.draftQuery = detail.query;
      nextThread.sessionContext = appendAssistantMapInteraction(
        normalizeAssistantSessionContext(nextThread.sessionContext, nextThread.id),
        detail.mapContext,
        detail.mapContext.createdAt,
      );
      this.state = upsertAssistantThread(this.state, nextThread);
      this.selectedMessageId = nextThread.messages[0]?.id ?? null;
      this.activeSheetTab = nextThread.messages.length > 0 ? 'evidence' : 'report';
      this.statusLine = `handoff از کارگاه ژئو-تحلیل دریافت شد: ${detail.title}`;
      this.render();
    }) as EventListener;

    this.promptSuggestionHandler = ((event: CustomEvent<PromptSuggestionRunDetail>) => {
      const detail = event.detail;
      const active = this.activeThread;
      const shouldCreateThread = !active || active.messages.length > 0;
      const nextThread = shouldCreateThread
        ? createAssistantThread(detail.suggestion.domainMode, detail.suggestion.taskClass, detail.suggestion.label.slice(0, 48))
        : { ...active };

      nextThread.domainMode = detail.suggestion.domainMode;
      nextThread.taskClass = detail.suggestion.taskClass;
      nextThread.updatedAt = new Date().toISOString();

      this.lastMapContext = detail.mapContext ?? this.lastMapContext;
      nextThread.sessionContext = appendAssistantMapInteraction(
        normalizeAssistantSessionContext(nextThread.sessionContext, nextThread.id),
        this.lastMapContext,
        this.lastMapContext?.createdAt || nextThread.updatedAt,
      );

      this.state = upsertAssistantThread(this.state, nextThread);
      this.selectedMessageId = latestAssistantMessage(nextThread)?.id ?? null;
      this.draftQuery = detail.suggestion.query;
      this.statusLine = `پیشنهاد هوشمند آماده شد: ${detail.suggestion.label}`;
      this.render();

      if (detail.autoSubmit) {
        void this.submitCurrentQuery(detail.suggestion.id, detail.suggestion.promptText);
      }
    }) as EventListener;

    document.addEventListener(MAP_CONTEXT_EVENT, this.mapContextHandler);
    document.addEventListener(ANALYSIS_EVENT_TYPES.started, this.analysisEventHandler);
    document.addEventListener(ANALYSIS_EVENT_TYPES.completed, this.analysisEventHandler);
    document.addEventListener(ANALYSIS_EVENT_TYPES.failed, this.analysisEventHandler);
    document.addEventListener(ANALYSIS_EVENT_TYPES.minimized, this.analysisEventHandler);
    document.addEventListener(GEO_ANALYSIS_EVENT_TYPES.assistantHandoff, this.geoAnalysisHandoffHandler);
    document.addEventListener(PROMPT_INTELLIGENCE_EVENT_TYPES.run, this.promptSuggestionHandler);

    if (isDemoModeEnabled()) {
      this.statusLine = 'دمو فعال است: پاسخ‌های AI به‌صورت fixture و بدون نیاز به کلیدهای بیرونی تولید می‌شوند.';
      void this.seedDemoIfEmpty();
    }

    this.render();
  }

  private hasDemoSeeded(): boolean {
    try {
      return localStorage.getItem(DEMO_ASSISTANT_SEED_KEY) === '1';
    } catch {
      return false;
    }
  }

  private markDemoSeeded(): void {
    try {
      localStorage.setItem(DEMO_ASSISTANT_SEED_KEY, '1');
    } catch {
      // ignore storage errors
    }
  }

  private async seedDemoIfEmpty(): Promise<void> {
    if (this.hasDemoSeeded()) return;
    const thread = this.activeThread;
    if (!thread) return;
    if (thread.messages.length > 0) return;
    this.markDemoSeeded();
    this.draftQuery = 'یک نمونه brief/OSINT فارسی برای معرفی قابلیت‌های QADR110 تولید کن. واقعیت، استنباط، سناریو، عدم‌قطعیت و اولویت‌های پایش را جدا کن.';
    await this.submitCurrentQuery();
  }

  private async seedDemoNow(): Promise<void> {
    const demoThread = createAssistantThread(DEFAULT_ASSISTANT_DOMAIN_MODE, 'assistant', 'دمو: گفت‌وگوی نمونه');
    this.state = upsertAssistantThread(this.state, demoThread);
    this.draftQuery = 'یک تحلیل نمونه فارسی برای یک نقطه فرضی ارائه بده: OSINT digest، اثر بر تاب‌آوری، ۳ سناریو کوتاه‌مدت و ۵ اقدام پیشنهادی برای پایش بعدی.';
    this.statusLine = 'در حال اجرای نمونه دمو...';
    this.render();
    await this.submitCurrentQuery();
  }

  public override destroy(): void {
    document.removeEventListener(MAP_CONTEXT_EVENT, this.mapContextHandler);
    document.removeEventListener(ANALYSIS_EVENT_TYPES.started, this.analysisEventHandler);
    document.removeEventListener(ANALYSIS_EVENT_TYPES.completed, this.analysisEventHandler);
    document.removeEventListener(ANALYSIS_EVENT_TYPES.failed, this.analysisEventHandler);
    document.removeEventListener(ANALYSIS_EVENT_TYPES.minimized, this.analysisEventHandler);
    document.removeEventListener(GEO_ANALYSIS_EVENT_TYPES.assistantHandoff, this.geoAnalysisHandoffHandler);
    document.removeEventListener(PROMPT_INTELLIGENCE_EVENT_TYPES.run, this.promptSuggestionHandler);
    super.destroy();
  }

  private get activeThread(): AssistantConversationThread | null {
    return this.state.threads.find((thread) => thread.id === this.state.activeThreadId) ?? this.state.threads[0] ?? null;
  }

  private persistState(): void {
    saveAssistantWorkspaceState(this.state);
  }

  private resolveResiliencePrimaryCountry(): string | undefined {
    const selection = this.lastMapContext?.selection;
    if (!selection) return undefined;
    if (selection.kind === 'country') return selection.countryCode;
    if (selection.kind === 'point') return selection.countryCode;
    return undefined;
  }

  private setWorkbenchMode(mode: AssistantWorkbenchMode): void {
    const thread = this.activeThread;
    if (!thread) return;
    thread.taskClass = defaultTaskForWorkbenchMode(mode);
    if (mode === 'foresight') {
      thread.domainMode = 'strategic-foresight';
    } else if (thread.domainMode === 'strategic-foresight') {
      thread.domainMode = mode === 'quick'
        ? 'security-brief'
        : mode === 'deep'
          ? 'predictive-analysis'
          : 'scenario-planning';
    }
    thread.updatedAt = new Date().toISOString();
    this.state = upsertAssistantThread(this.state, thread);
    this.statusLine = `حالت دستیار روی «${localizeWorkbenchMode(mode)}» قرار گرفت.`;
    this.render();
  }

  private renderModeSwitch(activeMode: AssistantWorkbenchMode): string {
    return `
      <div class="qadr-ai-mode-switch" role="tablist" aria-label="حالت‌های اجرا">
        ${(['quick', 'deep', 'agent', 'foresight'] as AssistantWorkbenchMode[]).map((mode) => `
          <button
            type="button"
            class="qadr-ai-mode-btn ${mode === activeMode ? 'active' : ''}"
            data-ai-mode="${mode}"
          >${escapeHtml(localizeWorkbenchMode(mode))}</button>
        `).join('')}
      </div>
    `;
  }

  private renderPromptLibrary(
    currentMode: AssistantDomainMode,
    currentTask: AiTaskClass,
    promptEntries: ReturnType<typeof getPromptEntriesForMode>,
    pinned: AssistantEvidenceCard[],
  ): string {
    return promptEntries.map((entry) => {
      const composed = composePromptEntry(entry, {
        query: this.draftQuery,
        domainMode: currentMode,
        taskClass: currentTask,
        mapContext: this.lastMapContext,
        pinnedEvidence: pinned,
        memoryNotes: this.state.memoryNotes,
      });

      return `
        <article class="qadr-ai-prompt-card qadr-ai-inspector-card">
          <h4>${escapeHtml(entry.title)}</h4>
          <p>${escapeHtml(entry.summary)}</p>
          <div class="qadr-ai-prompt-actions">
            ${entry.actions.map((action) => `
              <button
                type="button"
                class="qadr-ai-btn"
                data-prompt-action="${escapeHtml(action.id)}"
                data-prompt-id="${escapeHtml(entry.id)}"
                data-prompt-value="${encodeURIComponent(composed)}"
              >${escapeHtml(action.label)}</button>
            `).join('')}
          </div>
        </article>
      `;
    }).join('');
  }

  private renderConversationMessage(message: AssistantMessage, selectedMessage: AssistantMessage | null): string {
    const isSelected = selectedMessage?.id === message.id;
    const transparency = buildAssistantTransparencySummary(message);
    const bodyHtml = message.role === 'assistant'
      ? renderAssistantConversationPreview(message)
      : `<div class="qadr-ai-richtext">${renderAssistantRichText(message.content)}</div>`;
    const modelBadge = message.provider
      ? `<span class="qadr-ai-pill subtle">${escapeHtml(message.provider)}${message.model ? ` / ${escapeHtml(message.model)}` : ''}</span>`
      : '';
    const routeBadge = transparency ? `<span class="qadr-ai-pill subtle">${escapeHtml(transparency.routeLabel)}</span>` : '';
    const toolBadge = transparency && transparency.toolPlan.length > 0
      ? `<span class="qadr-ai-pill subtle">ابزارها: ${transparency.toolPlan.length}</span>`
      : '';
    const warningBadge = transparency && transparency.warnings.length > 0
      ? `<span class="qadr-ai-pill warn">${transparency.warnings.length} هشدار</span>`
      : '';
    const actions = message.role === 'assistant' ? `
      <div class="qadr-ai-message-actions">
        <button type="button" class="qadr-ai-btn" data-select-message="${escapeHtml(message.id)}" data-open-sheet="report">برگه گزارش</button>
        <button type="button" class="qadr-ai-btn" data-select-message="${escapeHtml(message.id)}" data-open-sheet="evidence">شواهد</button>
        <button type="button" class="qadr-ai-btn" data-select-message="${escapeHtml(message.id)}" data-select-inspector="tools">شفافیت</button>
      </div>
    ` : '';

    return `
      <article class="qadr-ai-message ${message.role} ${isSelected ? 'selected' : ''}" data-message-id="${escapeHtml(message.id)}">
        <header>
          <div class="qadr-ai-message-heading">
            <strong>${message.role === 'user' ? 'تحلیلگر' : 'QADR110'}</strong>
        ${message.role === 'assistant' ? `<span class="qadr-ai-pill">${escapeHtml(localizeWorkbenchMode(deriveAssistantWorkbenchMode(message.taskClass, message.domainMode)))}</span>` : ''}
          </div>
          <div class="qadr-ai-message-meta">
            <span>${escapeHtml(message.createdAt)}</span>
            ${modelBadge}
            ${routeBadge}
            ${toolBadge}
            ${warningBadge}
            ${renderConfidenceBand(message)}
          </div>
        </header>
        ${actions}
        <div class="qadr-ai-message-body">
          ${bodyHtml}
        </div>
      </article>
    `;
  }

  private renderSheetContent(
    thread: AssistantConversationThread | null,
    selectedMessage: AssistantMessage | null,
    pinned: AssistantEvidenceCard[],
  ): string {
    if (!selectedMessage) {
      return '<div class="qadr-ai-empty-box">هنوز گزارشی برای drill-down انتخاب نشده است.</div>';
    }

    if (this.activeSheetTab === 'evidence') {
      const selectedEvidence = selectedMessage.evidenceCards ?? [];
      return `
        <div class="qadr-ai-sheet-section">
          <div class="qadr-ai-sheet-grid">
            ${selectedEvidence.length > 0 ? selectedEvidence.map((item) => `
              <article class="qadr-ai-evidence-card">
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.summary)}</p>
                <small>${escapeHtml(item.source.title)} | ${Math.round(item.score * 100)}% | ${escapeHtml(item.timeContext)}</small>
                <button type="button" class="qadr-ai-icon-btn" data-toggle-pin="${escapeHtml(item.id)}">${thread?.pinnedEvidenceIds.includes(item.id) ? 'برداشتن پین' : 'پین'}</button>
              </article>
            `).join('') : '<div class="qadr-ai-empty-box">در این پاسخ کارت شاهدی ثبت نشده است.</div>'}
          </div>
          ${pinned.length > 0 ? `
            <div class="qadr-ai-sheet-subtitle">شواهد پین‌شده</div>
            <div class="qadr-ai-sheet-grid">
              ${pinned.map((item) => `
                <article class="qadr-ai-evidence-card pinned">
                  <strong>${escapeHtml(item.title)}</strong>
                  <p>${escapeHtml(item.summary)}</p>
                  <small>${escapeHtml(item.source.title)} | ${Math.round(item.score * 100)}%</small>
                </article>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }

    if (this.activeSheetTab === 'context') {
      const intentCount = thread?.sessionContext?.intentHistory.length ?? 0;
      const mapCount = thread?.sessionContext?.mapInteractions.length ?? 0;
      const insightCount = thread?.sessionContext?.reusableInsights.length ?? 0;
      return `
        <div class="qadr-ai-context-grid">
          <article class="qadr-ai-sheet-card">
            <strong>کانتکست نقشه</strong>
            <p>${this.lastMapContext ? escapeHtml(describeMapContextForPrompt(this.lastMapContext)) : 'فعلاً انتخابی از نقشه ثبت نشده است.'}</p>
          </article>
          <article class="qadr-ai-sheet-card">
            <strong>حافظه جلسه</strong>
            <ul>
              <li>Intentها: ${intentCount}</li>
              <li>تعاملات نقشه: ${mapCount}</li>
              <li>Insightهای reuse شده: ${insightCount}</li>
            </ul>
          </article>
          <article class="qadr-ai-sheet-card">
            <strong>یادداشت‌ها</strong>
            ${this.state.memoryNotes.length > 0 ? `<ul>${this.state.memoryNotes.slice(0, 4).map((note) => `<li>${escapeHtml(note.title)}</li>`).join('')}</ul>` : '<p>یادداشتی ذخیره نشده است.</p>'}
          </article>
          <article class="qadr-ai-sheet-card">
            <strong>اسناد بارگذاری‌شده</strong>
            ${this.state.knowledgeDocuments.length > 0 ? `<ul>${this.state.knowledgeDocuments.slice(0, 4).map((document) => `<li>${escapeHtml(document.title)}</li>`).join('')}</ul>` : '<p>هنوز گزارشی ingest نشده است.</p>'}
          </article>
        </div>
      `;
    }

    const transparency = buildAssistantTransparencySummary(selectedMessage);
    return `
      <div class="qadr-ai-report-meta">
        <span class="qadr-ai-pill">${escapeHtml(transparency?.providerLabel ?? 'نامشخص')}</span>
        <span class="qadr-ai-pill">${escapeHtml(transparency?.modelLabel ?? 'نامشخص')}</span>
        <span class="qadr-ai-pill subtle">${escapeHtml(transparency?.policyLabel ?? 'بدون policy')}</span>
        <span class="qadr-ai-pill subtle">${escapeHtml(transparency?.cacheLabel ?? 'بدون cache')}</span>
        <span class="qadr-ai-pill subtle">${escapeHtml(transparency?.durationLabel ?? 'نامشخص')}</span>
      </div>
      <div class="qadr-ai-report-body">
        ${renderAssistantStructuredMessage(selectedMessage)}
      </div>
    `;
  }

  private renderInspectorContent(
    currentMode: AssistantDomainMode,
    currentTask: AiTaskClass,
    promptEntries: ReturnType<typeof getPromptEntriesForMode>,
    selectedMessage: AssistantMessage | null,
    evidence: AssistantEvidenceCard[],
    pinned: AssistantEvidenceCard[],
  ): string {
    const liveSuggestions = collectFollowUpSuggestions(selectedMessage, pinned.length > 0 ? pinned : evidence);
    const transparency = buildAssistantTransparencySummary(selectedMessage);

    if (this.activeInspectorTab === 'tools') {
      if (!transparency) {
        return '<div class="qadr-ai-empty-box">برای این بخش هنوز trace یا اطلاعات مدل ثبت نشده است.</div>';
      }
      return `
        <div class="qadr-ai-inspector-stack">
          <article class="qadr-ai-inspector-card">
            <strong>مدل و مسیر</strong>
            <div class="qadr-ai-kv-list">
              <span>Provider</span><strong>${escapeHtml(transparency.providerLabel)}</strong>
              <span>Model</span><strong>${escapeHtml(transparency.modelLabel)}</strong>
              <span>Policy</span><strong>${escapeHtml(transparency.policyLabel)}</strong>
              <span>Route</span><strong>${escapeHtml(transparency.routeLabel)}</strong>
              <span>Duration</span><strong>${escapeHtml(transparency.durationLabel)}</strong>
            </div>
          </article>
          <article class="qadr-ai-inspector-card">
            <strong>ابزارهای استفاده‌شده</strong>
            ${transparency.toolPlan.length > 0 ? `<div class="qadr-ai-chip-row">${transparency.toolPlan.map((tool) => `<span class="qadr-ai-pill subtle">${escapeHtml(tool)}</span>`).join('')}</div>` : '<p>در این پاسخ ابزار صریحی ثبت نشده است.</p>'}
          </article>
          <article class="qadr-ai-inspector-card">
            <strong>ترتیب providerها</strong>
            ${transparency.providerOrder.length > 0 ? `<p>${escapeHtml(transparency.providerOrder.join(' → '))}</p>` : '<p>ترتیب provider ثبت نشده است.</p>'}
            ${transparency.openRouterOrder.length > 0 ? `<small>${escapeHtml(`OpenRouter: ${transparency.openRouterOrder.join(' → ')}`)}</small>` : ''}
          </article>
        </div>
      `;
    }

    if (this.activeInspectorTab === 'reasoning') {
      if (!this.showReasoning) {
        return `
          <div class="qadr-ai-empty-box">
            نمایش reasoning steps خاموش است.
            <div class="qadr-ai-followups">
              <button type="button" class="qadr-ai-btn" data-action="toggle-reasoning">نمایش reasoning</button>
            </div>
          </div>
        `;
      }
      if (!transparency || transparency.nodes.length === 0) {
        return '<div class="qadr-ai-empty-box">برای این پاسخ گره‌های orchestrator ثبت نشده است.</div>';
      }
      return `
        <div class="qadr-ai-inspector-stack">
          <article class="qadr-ai-inspector-card">
            <strong>مراحل استدلال</strong>
            <ol class="qadr-ai-reasoning-list">
              ${transparency.nodes.map((node) => `<li>${escapeHtml(node)}</li>`).join('')}
            </ol>
          </article>
          <article class="qadr-ai-inspector-card">
            <strong>هشدارها و guardrailها</strong>
            ${transparency.warnings.length > 0 ? `<ul>${transparency.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : '<p>هشدار ثبت نشده است.</p>'}
            <small>${escapeHtml(transparency.sessionReuseLabel)}</small>
          </article>
        </div>
      `;
    }

    if (this.activeInspectorTab === 'evidence') {
      return `
        <div class="qadr-ai-inspector-stack">
          <article class="qadr-ai-inspector-card">
            <strong>شواهد پین‌شده</strong>
            ${pinned.length > 0 ? pinned.map((item) => `
              <article class="qadr-ai-evidence-card pinned">
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.summary)}</p>
                <small>${escapeHtml(item.source.title)} | ${Math.round(item.score * 100)}%</small>
              </article>
            `).join('') : '<div class="qadr-ai-empty-box">شاهد پین‌شده وجود ندارد.</div>'}
          </article>
          <article class="qadr-ai-inspector-card">
            <strong>Evidenceهای اخیر</strong>
            ${evidence.length > 0 ? evidence.slice(0, 6).map((item) => `
              <article class="qadr-ai-evidence-card">
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.summary)}</p>
                <small>${escapeHtml(item.source.title)} | ${Math.round(item.score * 100)}% | ${escapeHtml(item.timeContext)}</small>
              </article>
            `).join('') : '<div class="qadr-ai-empty-box">هنوز کارت شاهدی ثبت نشده است.</div>'}
          </article>
        </div>
      `;
    }

    return `
      <div class="qadr-ai-inspector-stack">
        ${liveSuggestions.length > 0 ? `
          <article class="qadr-ai-inspector-card">
            <strong>پیشنهادهای زنده</strong>
            <p>این پیشنهادها از context پاسخ فعلی، شواهد پین‌شده و تاریخچه جلسه ساخته شده‌اند.</p>
            <div class="qadr-ai-followups">
              ${liveSuggestions.map((item) => `<button type="button" class="qadr-ai-followup-btn" data-followup="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join('')}
            </div>
          </article>
        ` : ''}
        <article class="qadr-ai-inspector-card">
          <strong>کتابخانه پرامپت</strong>
          <p>پرامپت‌ها بر اساس mode فعلی، حافظه workspace و کانتکست نقشه compose می‌شوند.</p>
        </article>
        ${this.renderPromptLibrary(currentMode, currentTask, promptEntries, pinned)}
      </div>
    `;
  }

  private render(): void {
    const thread = this.activeThread;
    const currentMode = thread?.domainMode ?? DEFAULT_ASSISTANT_DOMAIN_MODE;
    const currentTask = thread?.taskClass ?? 'assistant';
    const promptEntries = getPromptEntriesForMode(currentMode, currentTask);
    const activeMode = deriveAssistantWorkbenchMode(currentTask, currentMode);
    const selectedMessage = selectAssistantMessage(thread, this.selectedMessageId);
    this.selectedMessageId = selectedMessage?.id ?? null;
    const latestAssistant = latestAssistantMessage(thread);
    const evidence = allEvidenceCards(thread);
    const pinned = pinnedEvidenceCards(thread);
    const routeSummary = describeAssistantRoute(currentTask);
    const demoEnabled = isDemoModeEnabled();

    this.element.classList.toggle('qadr-ai-compact', this.state.compactMode);
    this.element.classList.toggle('qadr-ai-fullscreen', this.fullscreen);

    const root = document.createElement('div');
    root.className = 'qadr-ai-workbench';
    root.innerHTML = `
      <div class="qadr-ai-shell">
        <aside class="qadr-ai-sidebar">
          <div class="qadr-ai-sidebar-header">
            <strong>گفت‌وگوها</strong>
            <button type="button" class="qadr-ai-btn" data-action="new-thread">جدید</button>
          </div>
          <div class="qadr-ai-thread-list">
            ${this.state.threads.map((item) => `
              <article class="qadr-ai-thread-card ${thread?.id === item.id ? 'active' : ''}">
                <button type="button" class="qadr-ai-thread-btn" data-thread-id="${escapeHtml(item.id)}">
                  <span>${escapeHtml(formatThreadTitle(item))}</span>
                  <small>${escapeHtml(item.domainMode)}</small>
                </button>
                <button type="button" class="qadr-ai-icon-btn" data-delete-thread="${escapeHtml(item.id)}">×</button>
              </article>
            `).join('')}
          </div>
          <div class="qadr-ai-sidebar-header">
            <strong>گردش‌کارهای ذخیره‌شده</strong>
          </div>
          <div class="qadr-ai-workflow-list">
            ${this.state.workflows.length > 0 ? this.state.workflows.map((workflow) => `
              <button type="button" class="qadr-ai-workflow-btn" data-workflow-id="${escapeHtml(workflow.id)}">
                <strong>${escapeHtml(workflow.name)}</strong>
                <span>${escapeHtml(workflow.description)}</span>
              </button>
            `).join('') : '<div class="qadr-ai-empty-box">هنوز گردش‌کاری ذخیره نشده است.</div>'}
          </div>
        </aside>

        <section class="qadr-ai-main">
          <header class="qadr-ai-toolbar">
            <div class="qadr-ai-toolbar-primary">
              <div class="qadr-ai-toolbar-group">
                <label>حوزه تحلیل</label>
                <select data-role="mode-select">
                  ${ASSISTANT_DOMAIN_MODE_OPTIONS.map((option) => `<option value="${escapeHtml(option.id)}" ${option.id === currentMode ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
                </select>
              </div>
              <div class="qadr-ai-toolbar-group">
                <label>نوع اجرا</label>
                <select data-role="task-select">
                  ${TASK_OPTIONS.map((option) => `<option value="${escapeHtml(option.id)}" ${option.id === currentTask ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
                </select>
              </div>
              <div class="qadr-ai-toolbar-group qadr-ai-toolbar-group-wide">
                <label>حالت دستیار</label>
                ${this.renderModeSwitch(activeMode)}
              </div>
            </div>
            <div class="qadr-ai-route">
              <strong>مسیر مدل</strong>
              <span>${escapeHtml(routeSummary)}</span>
            </div>
            <div class="qadr-ai-toolbar-actions">
              ${demoEnabled ? '<span class="qadr-ai-demo-pill">دمو</span>' : ''}
              ${demoEnabled ? '<button type="button" class="qadr-ai-btn" data-action="seed-demo">نمونه دمو</button>' : ''}
              <button type="button" class="qadr-ai-btn" data-action="open-resilience">داشبورد تاب‌آوری</button>
              <button type="button" class="qadr-ai-btn" data-action="toggle-compact">${this.state.compactMode ? 'حالت کامل' : 'حالت فشرده'}</button>
              <button type="button" class="qadr-ai-btn" data-action="toggle-fullscreen">${this.fullscreen ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}</button>
              <button type="button" class="qadr-ai-btn" data-action="toggle-reasoning">${this.showReasoning ? 'پنهان‌کردن reasoning' : 'نمایش reasoning'}</button>
              ${this.activeJobId ? '<button type="button" class="qadr-ai-btn" data-action="minimize-job">اجرای پس‌زمینه</button>' : ''}
            </div>
          </header>

          <nav class="qadr-ai-breadcrumbs" aria-label="مسیر ناوبری">
            <span class="qadr-ai-breadcrumb">کارگاه هوشمند</span>
            <span class="qadr-ai-breadcrumb-sep">/</span>
            <span class="qadr-ai-breadcrumb">${thread ? escapeHtml(formatThreadTitle(thread)) : 'رشته فعال'}</span>
            <span class="qadr-ai-breadcrumb-sep">/</span>
            <span class="qadr-ai-breadcrumb current">${escapeHtml(selectedMessage?.structured?.reportTitle || selectedMessage?.content.slice(0, 42) || 'بدون گزارش فعال')}</span>
          </nav>

          <div class="qadr-ai-status-line">${escapeHtml(this.statusLine)}</div>

          <div class="qadr-ai-context-strip">
            <div>
              <strong>کانتکست نقشه:</strong>
              <span>${this.lastMapContext ? escapeHtml(describeMapContextForPrompt(this.lastMapContext)) : 'فعلاً انتخابی از نقشه ثبت نشده است.'}</span>
            </div>
          </div>

          <section class="qadr-ai-conversation-stage">
            <section class="qadr-ai-conversation">
              ${thread && thread.messages.length > 0
                ? thread.messages.map((message) => this.renderConversationMessage(message, selectedMessage)).join('')
                : '<div class="qadr-ai-empty-box">گفت‌وگو هنوز شروع نشده است.</div>'}
            </section>

            <section class="qadr-ai-sheet-stack">
              <div class="qadr-ai-sheet-stack-header">
                <div class="qadr-ai-sheet-tabs">
                  <button type="button" class="qadr-ai-sheet-tab ${this.activeSheetTab === 'report' ? 'active' : ''}" data-sheet-tab="report">برگه گزارش</button>
                  <button type="button" class="qadr-ai-sheet-tab ${this.activeSheetTab === 'evidence' ? 'active' : ''}" data-sheet-tab="evidence">ضمیمه شواهد</button>
                  <button type="button" class="qadr-ai-sheet-tab ${this.activeSheetTab === 'context' ? 'active' : ''}" data-sheet-tab="context">زمینه و حافظه</button>
                </div>
                <div class="qadr-ai-export-actions">
                  <button type="button" class="qadr-ai-btn" data-export="json" ${latestAssistant ? '' : 'disabled'}>JSON</button>
                  <button type="button" class="qadr-ai-btn" data-export="markdown" ${latestAssistant ? '' : 'disabled'}>Markdown</button>
                  <button type="button" class="qadr-ai-btn" data-export="html" ${latestAssistant ? '' : 'disabled'}>HTML/PDF</button>
                </div>
              </div>
              <div class="qadr-ai-sheet-body">
                ${this.renderSheetContent(thread, selectedMessage, pinned)}
              </div>
            </section>
          </section>

          <section class="qadr-ai-composer">
            <textarea
              class="qadr-ai-query"
              data-role="query-input"
              placeholder="پرسش تحلیلی، درخواست گزارش، سناریو یا تحلیل مبتنی بر نقشه را به فارسی وارد کن..."
            >${escapeHtml(this.draftQuery)}</textarea>
            <div class="qadr-ai-composer-actions">
              <button type="button" class="qadr-ai-btn primary" data-action="send-query">اجرای تحلیل</button>
              <button type="button" class="qadr-ai-btn" data-action="save-memory">ذخیره یادداشت</button>
              <button type="button" class="qadr-ai-btn" data-action="upload-doc">افزودن گزارش</button>
              <input type="file" data-role="doc-input" accept=".txt,.md,.json" style="display:none" />
            </div>
          </section>
        </section>

        <aside class="qadr-ai-evidence qadr-ai-inspector">
          <div class="qadr-ai-sidebar-header">
            <strong>بازرس عامل</strong>
            <span class="qadr-ai-pill subtle">${escapeHtml(localizeWorkbenchMode(activeMode))}</span>
          </div>
          <div class="qadr-ai-inspector-tabs">
            <button type="button" class="qadr-ai-inspector-tab ${this.activeInspectorTab === 'suggestions' ? 'active' : ''}" data-inspector-tab="suggestions">پیشنهادها</button>
            <button type="button" class="qadr-ai-inspector-tab ${this.activeInspectorTab === 'tools' ? 'active' : ''}" data-inspector-tab="tools">ابزارها</button>
            <button type="button" class="qadr-ai-inspector-tab ${this.activeInspectorTab === 'reasoning' ? 'active' : ''}" data-inspector-tab="reasoning">Reasoning</button>
            <button type="button" class="qadr-ai-inspector-tab ${this.activeInspectorTab === 'evidence' ? 'active' : ''}" data-inspector-tab="evidence">شواهد</button>
          </div>
          <div class="qadr-ai-inspector-body">
            ${this.renderInspectorContent(currentMode, currentTask, promptEntries, selectedMessage, evidence, pinned)}
          </div>
          <div class="qadr-ai-sidebar-header">
            <strong>حافظه فضای کار</strong>
          </div>
          <textarea class="qadr-ai-memory-input" data-role="memory-input" placeholder="یادداشت تحلیلی، فرض مهم یا مشاهده کوتاه...">${escapeHtml(this.draftMemory)}</textarea>
        </aside>
      </div>
    `;

    replaceChildren(this.content, root);
    this.persistState();
    this.bindEvents(root);
    this.setCount(this.state.threads.length);
  }

  private bindEvents(root: HTMLElement): void {
    const queryInput = root.querySelector<HTMLTextAreaElement>('[data-role="query-input"]');
    const memoryInput = root.querySelector<HTMLTextAreaElement>('[data-role="memory-input"]');
    const fileInput = root.querySelector<HTMLInputElement>('[data-role="doc-input"]');
    const modeSelect = root.querySelector<HTMLSelectElement>('[data-role="mode-select"]');
    const taskSelect = root.querySelector<HTMLSelectElement>('[data-role="task-select"]');

    queryInput?.addEventListener('input', () => {
      this.draftQuery = queryInput.value;
    });

    memoryInput?.addEventListener('input', () => {
      this.draftMemory = memoryInput.value;
    });

    modeSelect?.addEventListener('change', () => {
      const thread = this.activeThread;
      if (!thread) return;
      thread.domainMode = modeSelect.value as AssistantDomainMode;
      thread.updatedAt = new Date().toISOString();
      this.state = upsertAssistantThread(this.state, thread);
      this.render();
    });

    taskSelect?.addEventListener('change', () => {
      const thread = this.activeThread;
      if (!thread) return;
      thread.taskClass = taskSelect.value as AiTaskClass;
      thread.updatedAt = new Date().toISOString();
      this.state = upsertAssistantThread(this.state, thread);
      this.render();
    });

    root.querySelectorAll<HTMLElement>('[data-ai-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.aiMode as AssistantWorkbenchMode | undefined;
        if (!mode) return;
        this.setWorkbenchMode(mode);
      });
    });

    root.querySelectorAll<HTMLElement>('[data-inspector-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.inspectorTab as AssistantInspectorTab | undefined;
        if (!tab) return;
        this.activeInspectorTab = tab;
        this.render();
      });
    });

    root.querySelectorAll<HTMLElement>('[data-sheet-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.sheetTab as AssistantSheetTab | undefined;
        if (!tab) return;
        this.activeSheetTab = tab;
        this.render();
      });
    });

    root.querySelectorAll<HTMLElement>('[data-select-message]').forEach((button) => {
      button.addEventListener('click', () => {
        const messageId = button.dataset.selectMessage;
        if (!messageId) return;
        this.selectedMessageId = messageId;
        const requestedSheet = button.dataset.openSheet as AssistantSheetTab | undefined;
        const requestedInspector = button.dataset.selectInspector as AssistantInspectorTab | undefined;
        if (requestedSheet) this.activeSheetTab = requestedSheet;
        if (requestedInspector) this.activeInspectorTab = requestedInspector;
        this.render();
      });
    });

    root.querySelectorAll<HTMLElement>('[data-thread-id]').forEach((button) => {
      button.addEventListener('click', () => {
        this.state = setActiveAssistantThread(this.state, button.dataset.threadId || null);
        this.selectedMessageId = latestAssistantMessage(this.activeThread)?.id ?? null;
        this.activeSheetTab = 'report';
        this.render();
      });
    });

    root.querySelectorAll<HTMLElement>('[data-delete-thread]').forEach((button) => {
      button.addEventListener('click', () => {
        const threadId = button.dataset.deleteThread;
        if (!threadId) return;
        this.state = removeAssistantThread(this.state, threadId);
        if (this.state.threads.length === 0) {
          this.state = upsertAssistantThread(this.state, createAssistantThread(DEFAULT_ASSISTANT_DOMAIN_MODE, 'assistant', 'گفت‌وگوی جدید'));
        }
        this.selectedMessageId = latestAssistantMessage(this.activeThread)?.id ?? null;
        this.render();
      });
    });

    root.querySelectorAll<HTMLElement>('[data-workflow-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const workflow = this.state.workflows.find((item) => item.id === button.dataset.workflowId);
        const thread = this.activeThread;
        if (!workflow || !thread) return;
        thread.domainMode = workflow.domainMode;
        thread.taskClass = workflow.taskClass;
        thread.workflowId = workflow.id;
        thread.updatedAt = new Date().toISOString();
        this.state = upsertAssistantThread(this.state, thread);
        this.draftQuery = workflow.promptOverride || this.draftQuery;
        this.statusLine = `گردش‌کار بارگذاری شد: ${workflow.name}`;
        this.selectedMessageId = latestAssistantMessage(thread)?.id ?? null;
        this.render();
      });
    });

    root.querySelectorAll<HTMLElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const action = button.dataset.action;
        if (action === 'new-thread') {
          const next = createAssistantThread(DEFAULT_ASSISTANT_DOMAIN_MODE, 'assistant', 'گفت‌وگوی جدید');
          this.state = upsertAssistantThread(this.state, next);
          this.draftQuery = '';
          this.selectedMessageId = null;
          this.activeSheetTab = 'report';
          this.render();
          return;
        }
        if (action === 'seed-demo') {
          await this.seedDemoNow();
          return;
        }
        if (action === 'toggle-compact') {
          this.state = setAssistantCompactMode(this.state, !this.state.compactMode);
          this.render();
          return;
        }
        if (action === 'open-resilience') {
          dispatchOpenResilienceDashboard(document, {
            source: 'assistant',
            primaryCountryCode: this.resolveResiliencePrimaryCountry(),
            focusTab: 'dashboard',
            title: 'داشبورد تاب‌آوری از کارگاه هوشمند',
            promptText: this.draftQuery.trim() || undefined,
            mapContextId: this.lastMapContext?.id,
          });
          this.statusLine = 'داشبورد تاب‌آوری باز شد.';
          this.render();
          return;
        }
        if (action === 'toggle-fullscreen') {
          this.fullscreen = !this.fullscreen;
          this.render();
          return;
        }
        if (action === 'toggle-reasoning') {
          this.showReasoning = !this.showReasoning;
          if (this.showReasoning) {
            this.activeInspectorTab = 'reasoning';
          }
          this.render();
          return;
        }
        if (action === 'minimize-job') {
          if (this.activeJobId) {
            this.analysisQueue.minimize(this.activeJobId, 'assistant-background');
          }
          return;
        }
        if (action === 'send-query') {
          await this.submitCurrentQuery();
          return;
        }
        if (action === 'save-memory') {
          this.saveMemoryFromDraft();
          return;
        }
        if (action === 'upload-doc') {
          fileInput?.click();
        }
      });
    });

    root.querySelectorAll<HTMLElement>('[data-prompt-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const promptValue = decodeURIComponent(button.dataset.promptValue || '');
        const action = button.dataset.promptAction;
        const promptId = button.dataset.promptId || '';
        const thread = this.activeThread;
        if (!thread) return;

        if (action === 'copy') {
          await navigator.clipboard.writeText(promptValue).catch(() => {});
          this.statusLine = 'پرامپت در کلیپ‌بورد کپی شد.';
          this.render();
          return;
        }

        if (action === 'save-workflow') {
          const entry = DEFAULT_PROMPT_CATALOG.entries.find((candidate) => candidate.id === promptId);
          if (!entry) return;
          const workflow = createWorkflowFromContext({
            name: entry.title,
            description: entry.summary,
            promptId: entry.id,
            domainMode: thread.domainMode,
            taskClass: thread.taskClass,
            promptOverride: promptValue,
          });
          this.state = upsertAssistantWorkflow(this.state, workflow);
          this.statusLine = `گردش‌کار ذخیره شد: ${workflow.name}`;
          this.render();
          return;
        }

        if (action === 'deduct') {
          document.dispatchEvent(new CustomEvent('wm:deduct-context', {
            detail: {
              query: this.draftQuery || promptValue,
              geoContext: this.lastMapContext ? describeMapContextForPrompt(this.lastMapContext) : '',
              autoSubmit: false,
            },
          }));
          this.statusLine = 'پرامپت به پنل استنتاج ارسال شد.';
          this.render();
          return;
        }

        if (action === 'open-resilience') {
          dispatchOpenResilienceDashboard(document, {
            source: 'dynamic-prompt',
            primaryCountryCode: this.resolveResiliencePrimaryCountry(),
            focusTab: promptId === 'report-generator' ? 'report' : 'dashboard',
            reportType: promptId === 'country-comparison-brief' ? 'comparative-country' : promptId === 'report-generator' ? 'national-brief' : 'national-brief',
            title: DEFAULT_PROMPT_CATALOG.entries.find((item) => item.id === promptId)?.title || 'داشبورد تاب‌آوری',
            promptText: promptValue,
            mapContextId: this.lastMapContext?.id,
          });
          this.statusLine = 'درخواست به داشبورد تاب‌آوری ارسال شد.';
          this.render();
          return;
        }

        this.draftQuery = this.draftQuery || DEFAULT_PROMPT_CATALOG.entries.find((item) => item.id === promptId)?.title || '';
        await this.submitCurrentQuery(promptId, promptValue);
      });
    });

    root.querySelectorAll<HTMLElement>('[data-followup]').forEach((button) => {
      button.addEventListener('click', async () => {
        this.draftQuery = button.dataset.followup || '';
        this.render();
      });
    });

    root.querySelectorAll<HTMLElement>('[data-toggle-pin]').forEach((button) => {
      button.addEventListener('click', () => {
        const thread = this.activeThread;
        const evidenceId = button.dataset.togglePin;
        if (!thread || !evidenceId) return;
        if (thread.pinnedEvidenceIds.includes(evidenceId)) {
          thread.pinnedEvidenceIds = thread.pinnedEvidenceIds.filter((item) => item !== evidenceId);
        } else {
          thread.pinnedEvidenceIds = [...thread.pinnedEvidenceIds, evidenceId];
        }
        thread.updatedAt = new Date().toISOString();
        this.state = upsertAssistantThread(this.state, thread);
        this.render();
      });
    });

    root.querySelectorAll<HTMLElement>('[data-export]').forEach((button) => {
      button.addEventListener('click', () => {
        const thread = this.activeThread;
        const message = latestAssistantMessage(thread);
        const format = button.dataset.export as 'json' | 'markdown' | 'html';
        if (!thread || !message) return;
        exportAssistantThread(thread, message, format);
      });
    });

    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const text = await file.text();
      const documentRecord: KnowledgeDocument = {
        id: createId('doc'),
        kind: 'user-report',
        title: file.name,
        summary: text.slice(0, 180),
        content: text,
        language: /[\u0600-\u06ff]/.test(text) ? 'fa' : 'mixed',
        sourceLabel: file.name,
        sourceType: 'manual',
        updatedAt: new Date().toISOString(),
        tags: ['user-upload'],
        provenance: {
          sourceIds: [file.name],
          evidenceIds: [file.name],
        },
      };
      this.state = upsertKnowledgeDocument(this.state, documentRecord);
      this.statusLine = `گزارش ingest شد: ${file.name}`;
      this.render();
    });
  }

  private saveMemoryFromDraft(): void {
    const trimmed = this.draftMemory.trim() || this.draftQuery.trim();
    if (!trimmed) return;
    const note = createAssistantMemoryNote(trimmed.slice(0, 64), trimmed, ['workspace']);
    this.state = upsertAssistantMemoryNote(this.state, note);
    this.draftMemory = '';
    this.statusLine = 'یادداشت به حافظه workspace اضافه شد.';
    this.render();
  }

  private async submitCurrentQuery(promptId?: string, promptText?: string): Promise<void> {
    const thread = this.activeThread;
    const query = this.draftQuery.trim();
    if (!thread || !query) return;

    const now = new Date().toISOString();
    const userMessage: AssistantMessage = {
      id: createId('msg'),
      role: 'user',
      createdAt: now,
      content: query,
      domainMode: thread.domainMode,
      taskClass: thread.taskClass,
    };

    const nextThread: AssistantConversationThread = {
      ...thread,
      title: thread.messages.length === 0 ? query.slice(0, 48) : thread.title,
      updatedAt: now,
      messages: [...thread.messages, userMessage],
    };
    nextThread.sessionContext = appendAssistantIntent(
      normalizeAssistantSessionContext(nextThread.sessionContext || thread.sessionContext, nextThread.id),
      {
        query,
        taskClass: nextThread.taskClass,
        domainMode: nextThread.domainMode,
        messages: nextThread.messages.map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        })),
        mapContext: this.lastMapContext,
        createdAt: now,
      },
    );
    nextThread.sessionContext = appendAssistantMapInteraction(
      nextThread.sessionContext,
      this.lastMapContext,
      this.lastMapContext?.createdAt || now,
    );

    this.state = upsertAssistantThread(this.state, nextThread);
    this.statusLine = 'در حال اجرای تحلیل...';
    this.draftQuery = '';
    this.render();

    const pinned = pinnedEvidenceCards(nextThread);
    const jobId = `assistant-${Date.now()}`;
    this.activeJobId = jobId;

    try {
      const response = await this.analysisQueue.enqueue({
        id: jobId,
        kind: 'assistant',
        title: query.slice(0, 80),
        promptId,
        mapContextId: this.lastMapContext?.id,
        run: async () => runPersianAssistant({
          conversationId: nextThread.id,
          domainMode: nextThread.domainMode,
          taskClass: nextThread.taskClass,
          query,
          promptId,
          promptText,
          messages: nextThread.messages.map((message) => ({
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
          })),
          pinnedEvidence: pinned,
          memoryNotes: this.state.memoryNotes,
          knowledgeDocuments: this.state.knowledgeDocuments,
          mapContext: this.lastMapContext,
          sessionContext: nextThread.sessionContext,
          workflowId: nextThread.workflowId,
        }),
      });

      const assistantMessage: AssistantMessage = {
        ...response.message,
        provider: response.provider,
        model: response.model,
        evidenceCards: response.evidenceCards,
        trace: response.trace,
      };
      const updatedThread: AssistantConversationThread = {
        ...nextThread,
        updatedAt: assistantMessage.createdAt,
        messages: [...nextThread.messages, assistantMessage],
      };
      updatedThread.sessionContext = appendReusableInsight(
        normalizeAssistantSessionContext(updatedThread.sessionContext || nextThread.sessionContext, updatedThread.id),
        assistantMessage,
        query,
      );
      this.state = upsertAssistantThread(this.state, updatedThread);
      this.selectedMessageId = assistantMessage.id;
      this.activeSheetTab = 'report';
      if (this.lastMapContext) {
        dispatchMapAwareAiInsightUpdated(document, {
          mapContextId: this.lastMapContext.id,
          mapContextCacheKey: this.lastMapContext.cacheKey,
          title: query.slice(0, 80),
          summary: assistantMessage.structured?.executiveSummary || assistantMessage.content,
          evidenceTitles: (response.evidenceCards ?? []).slice(0, 4).map((card) => card.title),
          followUpSuggestions: response.followUpSuggestions.slice(0, 5),
          confidenceBand: assistantMessage.confidenceBand,
          updatedAt: assistantMessage.createdAt,
        });
      }
      this.statusLine = response.status === 'refused'
        ? 'درخواست با guardrail دفاعی/قانونی بازگردانی شد.'
        : 'تحلیل فارسی آماده است.';
    } catch (error) {
      this.statusLine = `خطا در اجرای تحلیل: ${error instanceof Error ? error.message : 'unknown error'}`;
    } finally {
      this.activeJobId = null;
      this.persistState();
      this.render();
    }
  }
}
