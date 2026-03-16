import { Panel } from './Panel';
import { replaceChildren } from '@/utils/dom-utils';
import { escapeHtml } from '@/utils/sanitize';
import {
  ANALYSIS_EVENT_TYPES,
  dispatchOpenResilienceDashboard,
  AnalysisJobQueue,
  GEO_ANALYSIS_EVENT_TYPES,
  isDemoModeEnabled,
  type GeoAnalysisAssistantHandoffDetail,
  MAP_CONTEXT_EVENT,
  composePromptEntry,
  DEFAULT_PROMPT_CATALOG,
  DEFAULT_ASSISTANT_DOMAIN_MODE,
  describeMapContextForPrompt,
  getPromptEntriesForMode,
  type MapContextEnvelope,
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
import { describeAssistantRoute, exportAssistantThread, runPersianAssistant } from '@/services/intelligence-assistant';
import type { KnowledgeDocument } from '@/platform/retrieval';

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

function renderStructuredMessage(message: AssistantMessage): string {
  const structured = message.structured;
  if (!structured) {
    return `<p>${escapeHtml(message.content)}</p>`;
  }

  const sectionHtml = [structured.observedFacts, structured.analyticalInference, structured.uncertainties, structured.recommendations, structured.resilienceNarrative]
    .map((section) => `
      <section class="qadr-ai-section">
        <h4>${escapeHtml(section.title)}</h4>
        <p>${escapeHtml(section.narrative)}</p>
        <ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>
        <div class="qadr-ai-section-meta">سطح اطمینان: ${escapeHtml(section.confidence.band)} (${Math.round(section.confidence.score * 100)}%)</div>
      </section>
    `).join('');

  const scenariosHtml = structured.scenarios.length > 0 ? `
    <section class="qadr-ai-section">
      <h4>سناریوها</h4>
      <div class="qadr-ai-scenarios">
        ${structured.scenarios.map((scenario) => `
          <article class="qadr-ai-scenario-card">
            <strong>${escapeHtml(scenario.title)}</strong>
            <div>${escapeHtml(scenario.description)}</div>
            <div class="qadr-ai-scenario-meta">احتمال: ${escapeHtml(scenario.probability)} | بازه زمانی: ${escapeHtml(scenario.timeframe)}</div>
            <ul>${scenario.indicators.map((indicator) => `<li>${escapeHtml(indicator)}</li>`).join('')}</ul>
          </article>
        `).join('')}
      </div>
    </section>
  ` : '';

  const followUps = structured.followUpSuggestions.length > 0 ? `
    <div class="qadr-ai-followups">
      ${structured.followUpSuggestions.map((item) => `<button type="button" class="qadr-ai-followup-btn" data-followup="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join('')}
    </div>
  ` : '';

  return `
    <div class="qadr-ai-executive-summary">${escapeHtml(structured.executiveSummary)}</div>
    ${sectionHtml}
    ${scenariosHtml}
    ${followUps}
  `;
}

export class QadrAssistantPanel extends Panel {
  private state: AssistantWorkspaceState;
  private draftQuery = '';
  private draftMemory = '';
  private fullscreen = false;
  private statusLine = 'آماده برای تحلیل فارسی مبتنی بر OpenRouter';
  private activeJobId: string | null = null;
  private lastMapContext: MapContextEnvelope | null = null;
  private readonly analysisQueue: AnalysisJobQueue;
  private readonly mapContextHandler: EventListener;
  private readonly analysisEventHandler: EventListener;
  private readonly geoAnalysisHandoffHandler: EventListener;

  constructor() {
    super({ id: 'qadr-assistant', title: 'کارگاه هوشمند QADR110', className: 'panel-wide' });
    this.state = loadAssistantWorkspaceState();
    this.analysisQueue = new AnalysisJobQueue(document);

    if (this.state.threads.length === 0) {
      const initial = createAssistantThread(DEFAULT_ASSISTANT_DOMAIN_MODE, 'assistant', 'گفت‌وگوی اولیه');
      this.state = upsertAssistantThread(this.state, initial);
    }

    this.mapContextHandler = ((event: CustomEvent<MapContextEnvelope>) => {
      this.lastMapContext = event.detail;
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
      this.state = upsertAssistantThread(this.state, nextThread);
      this.statusLine = `handoff از کارگاه ژئو-تحلیل دریافت شد: ${detail.title}`;
      this.render();
    }) as EventListener;

    document.addEventListener(MAP_CONTEXT_EVENT, this.mapContextHandler);
    document.addEventListener(ANALYSIS_EVENT_TYPES.started, this.analysisEventHandler);
    document.addEventListener(ANALYSIS_EVENT_TYPES.completed, this.analysisEventHandler);
    document.addEventListener(ANALYSIS_EVENT_TYPES.failed, this.analysisEventHandler);
    document.addEventListener(ANALYSIS_EVENT_TYPES.minimized, this.analysisEventHandler);
    document.addEventListener(GEO_ANALYSIS_EVENT_TYPES.assistantHandoff, this.geoAnalysisHandoffHandler);

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

  private render(): void {
    const thread = this.activeThread;
    const currentMode = thread?.domainMode ?? DEFAULT_ASSISTANT_DOMAIN_MODE;
    const currentTask = thread?.taskClass ?? 'assistant';
    const promptEntries = getPromptEntriesForMode(currentMode, currentTask);
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
              ${this.activeJobId ? '<button type="button" class="qadr-ai-btn" data-action="minimize-job">اجرای پس‌زمینه</button>' : ''}
            </div>
          </header>

          <div class="qadr-ai-status-line">${escapeHtml(this.statusLine)}</div>

          <div class="qadr-ai-context-strip">
            <div>
              <strong>کانتکست نقشه:</strong>
              <span>${this.lastMapContext ? escapeHtml(describeMapContextForPrompt(this.lastMapContext)) : 'فعلاً انتخابی از نقشه ثبت نشده است.'}</span>
            </div>
          </div>

          <section class="qadr-ai-prompts">
            ${promptEntries.map((entry) => {
              const composed = composePromptEntry(entry, {
                query: this.draftQuery,
                domainMode: currentMode,
                taskClass: currentTask,
                mapContext: this.lastMapContext,
                pinnedEvidence: pinned,
                memoryNotes: this.state.memoryNotes,
              });

              return `
                <article class="qadr-ai-prompt-card">
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
            }).join('')}
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

          <section class="qadr-ai-conversation">
            ${thread && thread.messages.length > 0 ? thread.messages.map((message) => `
              <article class="qadr-ai-message ${message.role}">
                <header>
                  <strong>${message.role === 'user' ? 'تحلیلگر' : 'QADR110'}</strong>
                  <div class="qadr-ai-message-meta">
                    <span>${escapeHtml(message.createdAt)}</span>
                    ${message.provider ? `<span>${escapeHtml(message.provider)}${message.model ? ` / ${escapeHtml(message.model)}` : ''}</span>` : ''}
                    ${renderConfidenceBand(message)}
                  </div>
                </header>
                <div class="qadr-ai-message-body">
                  ${message.role === 'assistant' ? renderStructuredMessage(message) : `<p>${escapeHtml(message.content)}</p>`}
                </div>
              </article>
            `).join('') : '<div class="qadr-ai-empty-box">گفت‌وگو هنوز شروع نشده است.</div>'}
          </section>
        </section>

        <aside class="qadr-ai-evidence">
          <div class="qadr-ai-sidebar-header">
            <strong>خروجی</strong>
          </div>
          <div class="qadr-ai-export-actions">
            <button type="button" class="qadr-ai-btn" data-export="json" ${latestAssistant ? '' : 'disabled'}>JSON</button>
            <button type="button" class="qadr-ai-btn" data-export="markdown" ${latestAssistant ? '' : 'disabled'}>Markdown</button>
            <button type="button" class="qadr-ai-btn" data-export="html" ${latestAssistant ? '' : 'disabled'}>HTML/PDF</button>
          </div>

          <div class="qadr-ai-sidebar-header">
            <strong>شواهد پین‌شده</strong>
          </div>
          <div class="qadr-ai-evidence-list">
            ${pinned.length > 0 ? pinned.map((item) => `
              <article class="qadr-ai-evidence-card pinned">
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.summary)}</p>
                <small>${escapeHtml(item.source.title)} | ${Math.round(item.score * 100)}%</small>
                <button type="button" class="qadr-ai-icon-btn" data-toggle-pin="${escapeHtml(item.id)}">برداشتن پین</button>
              </article>
            `).join('') : '<div class="qadr-ai-empty-box">شواهد pinned وجود ندارد.</div>'}
          </div>

          <div class="qadr-ai-sidebar-header">
            <strong>Evidenceهای اخیر</strong>
          </div>
          <div class="qadr-ai-evidence-list">
            ${evidence.length > 0 ? evidence.slice(0, 8).map((item) => `
              <article class="qadr-ai-evidence-card">
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.summary)}</p>
                <small>${escapeHtml(item.source.title)} | ${Math.round(item.score * 100)}% | ${escapeHtml(item.timeContext)}</small>
                <button type="button" class="qadr-ai-icon-btn" data-toggle-pin="${escapeHtml(item.id)}">${thread?.pinnedEvidenceIds.includes(item.id) ? 'برداشتن پین' : 'پین'}</button>
              </article>
            `).join('') : '<div class="qadr-ai-empty-box">هنوز کارت شاهدی ثبت نشده است.</div>'}
          </div>

          <div class="qadr-ai-sidebar-header">
            <strong>حافظه فضای کار</strong>
          </div>
          <textarea class="qadr-ai-memory-input" data-role="memory-input" placeholder="یادداشت تحلیلی، فرض مهم یا مشاهده کوتاه...">${escapeHtml(this.draftMemory)}</textarea>
          <div class="qadr-ai-memory-list">
            ${this.state.memoryNotes.length > 0 ? this.state.memoryNotes.slice(0, 6).map((note) => `
              <article class="qadr-ai-memory-card">
                <strong>${escapeHtml(note.title)}</strong>
                <p>${escapeHtml(note.content)}</p>
              </article>
            `).join('') : '<div class="qadr-ai-empty-box">یادداشتی ذخیره نشده است.</div>'}
          </div>

          <div class="qadr-ai-sidebar-header">
            <strong>اسناد بارگذاری‌شده</strong>
          </div>
          <div class="qadr-ai-memory-list">
            ${this.state.knowledgeDocuments.length > 0 ? this.state.knowledgeDocuments.slice(0, 6).map((document) => `
              <article class="qadr-ai-memory-card">
                <strong>${escapeHtml(document.title)}</strong>
                <p>${escapeHtml(document.summary)}</p>
              </article>
            `).join('') : '<div class="qadr-ai-empty-box">هنوز گزارشی ingest نشده است.</div>'}
          </div>
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

    root.querySelectorAll<HTMLElement>('[data-thread-id]').forEach((button) => {
      button.addEventListener('click', () => {
        this.state = setActiveAssistantThread(this.state, button.dataset.threadId || null);
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
          workflowId: nextThread.workflowId,
        }),
      });

      const updatedThread: AssistantConversationThread = {
        ...nextThread,
        updatedAt: response.message.createdAt,
        messages: [...nextThread.messages, response.message],
      };
      this.state = upsertAssistantThread(this.state, updatedThread);
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
