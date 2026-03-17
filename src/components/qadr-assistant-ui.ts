import { marked } from 'marked';

import type {
  AssistantConversationThread,
  AssistantDomainMode,
  AssistantEvidenceCard,
  AssistantMessage,
  AssistantTraceMetadata,
} from '@/platform/ai/assistant-contracts';
import type { AiTaskClass } from '@/platform/ai/contracts';
import { escapeHtml } from '@/utils/sanitize';

export type AssistantWorkbenchMode = 'quick' | 'deep' | 'agent' | 'foresight';
export type AssistantInspectorTab = 'suggestions' | 'tools' | 'reasoning' | 'evidence';
export type AssistantSheetTab = 'report' | 'evidence' | 'context';

export interface AssistantTransparencySummary {
  providerLabel: string;
  modelLabel: string;
  policyLabel: string;
  routeLabel: string;
  durationLabel: string;
  cacheLabel: string;
  timeContextLabel: string;
  sessionReuseLabel: string;
  providerOrder: string[];
  openRouterOrder: string[];
  toolPlan: string[];
  nodes: string[];
  warnings: string[];
}

const MODE_TASK_MAP: Record<AssistantWorkbenchMode, AiTaskClass> = {
  quick: 'assistant',
  deep: 'report-generation',
  agent: 'scenario-analysis',
  foresight: 'report-generation',
};

const ROUTE_LABELS: Record<string, string> = {
  'fast-local': 'محلی سریع',
  'reasoning-local': 'محلی استدلالی',
  'cloud-escalation': 'تصعید ابری',
  'browser-fallback': 'جایگزین مرورگر',
  'tool-grounded': 'عامل ابزارمحور',
};

const META_RELATIONSHIP_LABELS: Record<string, string> = {
  amplifying: 'تقویت‌کننده',
  suppressing: 'مهارکننده',
  competing: 'رقابتی',
  converging: 'همگرا',
};

const NODE_LABELS: Record<string, string> = {
  planning: 'برنامه‌ریزی',
  'tool-selection': 'انتخاب ابزار',
  execution: 'اجرا',
  reflection: 'بازبینی',
  'retry-escalation': 'بازاجرا / تصعید',
  event: 'رویداد',
  reaction: 'واکنش',
  escalation: 'تشدید',
  outcome: 'برآیند',
};

const TOOL_LABELS: Record<string, string> = {
  web_search: 'جست‌وجوی وب',
  openrouter_call: 'OpenRouter',
  map_context: 'کانتکست نقشه',
  osint_fetch: 'واکشی OSINT',
  scenario_engine: 'موتور سناریو',
  strategic_foresight: 'پیش‌نگری راهبردی',
  run_war_room: 'اتاق چندعاملی',
  detect_black_swans: 'موتور قوی سیاه',
  meta_scenario_engine: 'متا-سناریو',
  scenario_simulation: 'شبیه‌ساز سناریو',
  prompt_optimizer: 'بهینه‌سازی پرامپت',
  summarize_context: 'خلاصه‌سازی زمینه',
};

function formatDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt || !completedAt) return 'نامشخص';
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) {
    return 'نامشخص';
  }
  const durationMs = completed - started;
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function toHtml(markdown: string): string {
  const parsed = marked.parse(escapeHtml(markdown), {
    gfm: true,
    breaks: true,
  });
  return typeof parsed === 'string' ? parsed : '';
}

function renderJson(content: string): string | null {
  try {
    const parsed = JSON.parse(content);
    return `
      <div class="qadr-ai-json-block">
        <div class="qadr-ai-json-label">JSON ساخت‌یافته</div>
        <pre><code>${escapeHtml(JSON.stringify(parsed, null, 2))}</code></pre>
      </div>
    `;
  } catch {
    return null;
  }
}

function renderSection(title: string, narrative: string, bullets: string[], scoreLabel: string): string {
  return `
    <section class="qadr-ai-section">
      <h4>${escapeHtml(title)}</h4>
      <div class="qadr-ai-richtext">${renderAssistantRichText(narrative)}</div>
      <ul>${bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>
      <div class="qadr-ai-section-meta">${escapeHtml(scoreLabel)}</div>
    </section>
  `;
}

function renderDecisionSupportSummary(message: AssistantMessage): string {
  const decisionSupport = message.structured?.decisionSupport;
  if (!decisionSupport) return '';

  return `
    <article class="qadr-ai-preview-card qadr-ai-decision-preview">
      <strong>تصمیم‌یار</strong>
      <p>${escapeHtml(
        decisionSupport.actionable_insights[0]
          ?? decisionSupport.executive_summary
          ?? 'خروجی تصمیم‌یار برای این پاسخ ثبت شده است.',
      )}</p>
    </article>
  `;
}

function renderMetaScenarioSummary(message: AssistantMessage): string {
  const metaScenario = message.structured?.metaScenario;
  if (!metaScenario) return '';

  return `
    <article class="qadr-ai-preview-card qadr-ai-meta-preview">
      <strong>متا-سناریو</strong>
      <p>${escapeHtml(
        metaScenario.higher_order_insights[0]
          ?? metaScenario.executive_summary
          ?? 'خروجی متا-سناریو برای این پاسخ ثبت شده است.',
      )}</p>
    </article>
  `;
}

function renderWarRoomSummary(message: AssistantMessage): string {
  const warRoom = message.structured?.warRoom;
  if (!warRoom) return '';

  return `
    <article class="qadr-ai-preview-card qadr-ai-warroom-preview">
      <strong>اتاق چندعاملی</strong>
      <p>${escapeHtml(
        warRoom.executive_summary
          || warRoom.final_synthesis
          || 'خروجی مناظره چندعاملی برای این پاسخ ثبت شده است.',
      )}</p>
    </article>
  `;
}

function renderDecisionSupport(decisionSupport: NonNullable<AssistantMessage['structured']>['decisionSupport']): string {
  if (!decisionSupport) return '';

  const scenarioSupportHtml = decisionSupport.scenario_support.length > 0 ? `
    <div class="qadr-ai-scenarios">
      ${decisionSupport.scenario_support.map((item) => `
        <article class="qadr-ai-scenario-card qadr-ai-decision-card">
          <strong>${escapeHtml(item.scenario_title)}</strong>
          <div class="qadr-ai-scenario-meta">
            احتمال: ${escapeHtml(item.probability)}
            ${item.impact_level ? ` | اثر: ${escapeHtml(item.impact_level)}` : ''}
          </div>
          ${item.recommended_actions.length ? `
            <div class="qadr-ai-scenario-block">
              <span>اقدام‌های پیشنهادی</span>
              <ul>${item.recommended_actions.map((action) => `<li><strong>${escapeHtml(action.label)}</strong><div>${escapeHtml(action.rationale)}</div></li>`).join('')}</ul>
            </div>
          ` : ''}
          ${item.tradeoffs.length ? `
            <div class="qadr-ai-scenario-block">
              <span>Trade-offها</span>
              <ul>${item.tradeoffs.map((tradeoff) => `<li><strong>${escapeHtml(tradeoff.label)}</strong><div>هزینه: ${escapeHtml(tradeoff.cost)}</div><div>فایده: ${escapeHtml(tradeoff.benefit)}</div></li>`).join('')}</ul>
            </div>
          ` : ''}
        </article>
      `).join('')}
    </div>
  ` : '';

  const actorModelsHtml = decisionSupport.actor_models.length > 0 ? `
    <div class="qadr-ai-mini-grid qadr-ai-actor-grid">
      ${decisionSupport.actor_models.map((actor) => `
        <article class="qadr-ai-mini-card qadr-ai-actor-card">
          <strong>${escapeHtml(actor.actor)}</strong>
          <span>${escapeHtml(actor.role)}</span>
          <p>${escapeHtml(actor.intent)}</p>
          ${actor.likely_behaviors.length ? `<ul>${actor.likely_behaviors.map((behavior) => `<li>${escapeHtml(behavior)}</li>`).join('')}</ul>` : ''}
        </article>
      `).join('')}
    </div>
  ` : '';

  return `
    <section class="qadr-ai-section">
      <h4>تصمیم‌یار سناریو</h4>
      <p class="qadr-ai-executive-summary">${escapeHtml(decisionSupport.executive_summary)}</p>
      ${decisionSupport.actionable_insights.length ? `
        <div class="qadr-ai-scenario-block">
          <span>اقدام‌های اجرایی</span>
          <div class="qadr-ai-followups">
            ${decisionSupport.actionable_insights.map((item) => `<span class="qadr-ai-simulation-pill">${escapeHtml(item)}</span>`).join('')}
          </div>
        </div>
      ` : ''}
      ${decisionSupport.strategic_insights.length ? `
        <div class="qadr-ai-scenario-block">
          <span>بینش‌های راهبردی</span>
          <ul>${decisionSupport.strategic_insights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </div>
      ` : ''}
      ${decisionSupport.leverage_points.length ? `
        <div class="qadr-ai-scenario-block">
          <span>نقاط اهرمی</span>
          <ul>${decisionSupport.leverage_points.map((item) => `<li><strong>${escapeHtml(item.title)}</strong>: ${escapeHtml(item.why)}</li>`).join('')}</ul>
        </div>
      ` : ''}
      ${decisionSupport.critical_uncertainties.length ? `
        <div class="qadr-ai-scenario-block">
          <span>عدم‌قطعیت‌های بحرانی</span>
          <ul>${decisionSupport.critical_uncertainties.map((item) => `<li><strong>${escapeHtml(item.title)}</strong>: ${escapeHtml(item.why)}</li>`).join('')}</ul>
        </div>
      ` : ''}
      ${scenarioSupportHtml}
      ${actorModelsHtml}
    </section>
  `;
}

function renderMetaScenario(metaScenario: NonNullable<AssistantMessage['structured']>['metaScenario']): string {
  if (!metaScenario) return '';

  const metaScenariosHtml = metaScenario.meta_scenarios.length > 0 ? `
    <div class="qadr-ai-scenarios">
      ${metaScenario.meta_scenarios.map((item) => `
        <article class="qadr-ai-scenario-card qadr-ai-meta-card">
          <strong>${escapeHtml(item.title)}</strong>
          <div class="qadr-ai-scenario-meta">
            رابطه: ${escapeHtml(localizeMetaRelationship(item.relationship_type))}
            | احتمال ترکیبی: ${escapeHtml(item.combined_probability)}
            | اثر: ${escapeHtml(item.impact_level)}
          </div>
          <p>${escapeHtml(item.summary)}</p>
          ${item.critical_dependencies.length ? `<div class="qadr-ai-scenario-block"><span>وابستگی‌های بحرانی</span><ul>${item.critical_dependencies.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul></div>` : ''}
          ${item.trigger_indicators.length ? `<div class="qadr-ai-scenario-block"><span>شاخص‌های فعال‌ساز</span><ul>${item.trigger_indicators.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul></div>` : ''}
        </article>
      `).join('')}
    </div>
  ` : '';

  const conflictsHtml = metaScenario.scenario_conflicts.length > 0 ? `
    <div class="qadr-ai-scenario-block">
      <span>Scenario War / Conflict</span>
      <ul>${metaScenario.scenario_conflicts.map((item) => `<li><strong>${escapeHtml(item.left_scenario_id)}</strong> در برابر <strong>${escapeHtml(item.right_scenario_id)}</strong>: ${escapeHtml(item.summary)}</li>`).join('')}</ul>
    </div>
  ` : '';

  const blackSwanHtml = metaScenario.black_swan_candidates.length > 0 ? `
    <div class="qadr-ai-scenarios">
      ${metaScenario.black_swan_candidates.map((item) => `
        <article class="qadr-ai-scenario-card qadr-ai-black-swan-card">
          <strong>${escapeHtml(item.title)}</strong>
          <div class="qadr-ai-scenario-meta">
            احتمال: ${escapeHtml(item.probability)} | اثر: ${escapeHtml(item.impact_level)} | عدم‌قطعیت: ${escapeHtml(item.uncertainty_level)}
            ${typeof item.severity_score === 'number' ? ` | شدت: ${Math.round(item.severity_score * 100)}%` : ''}
          </div>
          <p>${escapeHtml(item.why_it_matters)}</p>
          ${(item.low_probability_reason || item.high_impact_reason) ? `<div class="qadr-ai-scenario-block"><span>چرایی</span><ul>${[item.low_probability_reason ? `<li><strong>کم‌احتمال:</strong> ${escapeHtml(item.low_probability_reason)}</li>` : '', item.high_impact_reason ? `<li><strong>پراثر:</strong> ${escapeHtml(item.high_impact_reason)}</li>` : ''].join('')}</ul></div>` : ''}
          ${item.broken_assumptions.length ? `<div class="qadr-ai-scenario-block"><span>فرض‌های شکسته</span><ul>${item.broken_assumptions.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul></div>` : ''}
          ${item.affected_domains.length ? `<div class="qadr-ai-scenario-block"><span>دامنه‌های متاثر</span><ul>${item.affected_domains.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul></div>` : ''}
          ${item.regime_shift_indicators.length ? `<div class="qadr-ai-scenario-block"><span>شاخص‌های regime shift</span><ul>${item.regime_shift_indicators.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul></div>` : ''}
          ${item.leading_indicators.length ? `<div class="qadr-ai-scenario-block"><span>شاخص‌های پیش‌نگر</span><ul>${item.leading_indicators.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul></div>` : ''}
          ${(item.confidence_note || item.uncertainty_note) ? `<div class="qadr-ai-scenario-block"><span>یادداشت تحلیلی</span><ul>${item.confidence_note ? `<li><strong>Confidence:</strong> ${escapeHtml(item.confidence_note)}</li>` : ''}${item.uncertainty_note ? `<li><strong>Uncertainty:</strong> ${escapeHtml(item.uncertainty_note)}</li>` : ''}</ul></div>` : ''}
        </article>
      `).join('')}
    </div>
  ` : '';

  return `
    <section class="qadr-ai-section">
      <h4>متا-سناریو و قوی سیاه</h4>
      <p class="qadr-ai-executive-summary">${escapeHtml(metaScenario.executive_summary)}</p>
      ${metaScenario.higher_order_insights.length ? `
        <div class="qadr-ai-scenario-block">
          <span>بینش‌های مرتبه‌دوم</span>
          <ul>${metaScenario.higher_order_insights.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </div>
      ` : ''}
      ${metaScenariosHtml}
      ${conflictsHtml}
      ${blackSwanHtml}
    </section>
  `;
}

function renderWarRoom(warRoom: NonNullable<AssistantMessage['structured']>['warRoom']): string {
  if (!warRoom) return '';
  const scenarioRankingItems = warRoom.scenario_ranking ?? [];
  const scenarioAdjustmentItems = warRoom.scenario_adjustments ?? [];
  const updatedWatchpoints = warRoom.updated_watchpoints ?? [];
  const recommendedWatchpoints = warRoom.recommended_watchpoints ?? [];
  const executiveRecommendations = warRoom.executive_recommendations ?? [];

  const agentCards = warRoom.agents.length > 0 ? `
    <div class="qadr-ai-scenarios qadr-ai-warroom-agents">
      ${warRoom.agents.map((agent) => `
        <article class="qadr-ai-scenario-card qadr-ai-warroom-agent-card">
          <strong>${escapeHtml(agent.role)}</strong>
          <div class="qadr-ai-scenario-meta">
            <span>${escapeHtml(agent.label)}</span>
            <span>اطمینان ${Math.round(agent.confidence_score * 100)}%</span>
          </div>
          <p>${escapeHtml(agent.revised_position || agent.position)}</p>
          ${agent.supporting_points.length ? `<div class="qadr-ai-scenario-block"><span>نکات کلیدی</span><ul>${agent.supporting_points.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}
          ${agent.watchpoints.length ? `<div class="qadr-ai-followups">${agent.watchpoints.slice(0, 4).map((item) => `<span class="qadr-ai-simulation-pill">${escapeHtml(item)}</span>`).join('')}</div>` : ''}
          ${agent.critiques.length ? `<div class="qadr-ai-scenario-block"><span>Challengeها</span><ul>${agent.critiques.slice(0, 2).map((critique) => `<li>${escapeHtml(critique.summary)}</li>`).join('')}</ul></div>` : ''}
        </article>
      `).join('')}
    </div>
  ` : '';

  const rounds = warRoom.rounds.length > 0 ? `
    <div class="qadr-ai-scenario-block">
      <span>دورهای مناظره</span>
      <div class="qadr-ai-warroom-rounds">
        ${warRoom.rounds.map((round) => `
          <article class="qadr-ai-mini-card qadr-ai-warroom-round-card">
            <strong>${escapeHtml(round.title)}</strong>
            <span>${escapeHtml(round.summary)}</span>
            <ul>${round.entries.slice(0, 4).map((entry) => `<li><strong>${escapeHtml(entry.label)}</strong>: ${escapeHtml(entry.content)}</li>`).join('')}</ul>
          </article>
        `).join('')}
      </div>
    </div>
  ` : '';

  const disagreements = warRoom.disagreements.length > 0 ? `
      <div class="qadr-ai-scenario-block">
        <span>اختلاف‌ها</span>
        <ul>${warRoom.disagreements.map((item) => `<li><strong>${escapeHtml(item.title)}</strong>: ${escapeHtml(item.summary)}</li>`).join('')}</ul>
      </div>
    ` : '';

  const scenarioRanking = scenarioRankingItems.length > 0 ? `
      <div class="qadr-ai-scenario-block">
        <span>رتبه‌بندی بازبینی‌شده سناریوها</span>
        <div class="qadr-ai-warroom-rounds">
          ${scenarioRankingItems.map((item) => `
            <article class="qadr-ai-mini-card qadr-ai-warroom-round-card">
              <strong>${escapeHtml(item.title)}</strong>
              <span>رتبه پایه ${item.baseline_rank} → رتبه بازبینی ${item.revised_rank} | ${escapeHtml(item.stance)}</span>
              <p>${escapeHtml(item.summary)}</p>
              ${item.watchpoints.length ? `<div class="qadr-ai-followups">${item.watchpoints.slice(0, 3).map((watchpoint) => `<span class="qadr-ai-simulation-pill">${escapeHtml(watchpoint)}</span>`).join('')}</div>` : ''}
            </article>
          `).join('')}
        </div>
      </div>
    ` : '';

  const scenarioAdjustments = scenarioAdjustmentItems.length > 0 ? `
      <div class="qadr-ai-scenario-block">
        <span>اصلاح‌های ناشی از disagreement</span>
        <ul>${scenarioAdjustmentItems.map((item) => `<li><strong>${escapeHtml(item.title)}</strong> (${escapeHtml(item.adjustment_type)}): ${escapeHtml(item.rationale)}</li>`).join('')}</ul>
      </div>
    ` : '';

  const scenarioFocus = warRoom.scenario_focus?.scenario_shift_summary ? `
      <div class="qadr-ai-scenario-block">
        <span>کانون تغییر سناریویی</span>
        <p>${escapeHtml(warRoom.scenario_focus.scenario_shift_summary)}</p>
      </div>
    ` : '';

  const convergences = warRoom.convergences.length > 0 ? `
    <div class="qadr-ai-scenario-block">
      <span>همگرایی‌ها</span>
      <ul>${warRoom.convergences.map((item) => `<li><strong>${escapeHtml(item.title)}</strong>: ${escapeHtml(item.summary)}</li>`).join('')}</ul>
    </div>
  ` : '';

  const transcript = warRoom.debate_transcript.length > 0 ? `
    <div class="qadr-ai-scenario-block">
      <span>رونوشت مناظره</span>
      <div class="qadr-ai-warroom-rounds">
        ${warRoom.debate_transcript.slice(0, 8).map((entry) => `
          <article class="qadr-ai-mini-card qadr-ai-warroom-round-card">
            <strong>${escapeHtml(entry.label)} / ${escapeHtml(entry.round_stage)}</strong>
            <span>${escapeHtml(entry.prompt_excerpt.slice(0, 120))}</span>
            <p>${escapeHtml(entry.response)}</p>
          </article>
        `).join('')}
      </div>
    </div>
  ` : '';

  const matrix = warRoom.disagreement_matrix.length > 0 ? `
    <div class="qadr-ai-scenario-block">
      <span>ماتریس اختلاف</span>
      <div class="qadr-ai-warroom-rounds">
        ${warRoom.disagreement_matrix.slice(0, 4).map((row) => `
          <article class="qadr-ai-mini-card qadr-ai-warroom-round-card">
            <strong>${escapeHtml(row.label)}</strong>
            <ul>${row.cells.slice(0, 3).map((cell) => `<li><strong>${escapeHtml(cell.target_agent_id)}</strong>: ${Math.round(cell.disagreement_score * 100)}% | ${escapeHtml(cell.summary)}</li>`).join('')}</ul>
          </article>
        `).join('')}
      </div>
    </div>
  ` : '';

  return `
    <section class="qadr-ai-section">
      <h4>اتاق چندعاملی</h4>
      <p class="qadr-ai-executive-summary">${escapeHtml(warRoom.executive_summary)}</p>
      <div class="qadr-ai-followups">
        <span class="qadr-ai-simulation-pill">کانون: ${escapeHtml(warRoom.anchor_label)}</span>
        <span class="qadr-ai-simulation-pill">مد: ${escapeHtml(warRoom.mode === 'deep' ? 'عمیق' : 'سریع')}</span>
        <span class="qadr-ai-simulation-pill">دورها: ${warRoom.round_count}</span>
        <span class="qadr-ai-simulation-pill">عامل‌ها: ${warRoom.agents.length}</span>
      </div>
      ${agentCards}
        ${rounds}
        ${transcript}
        ${matrix}
        ${convergences}
        ${disagreements}
        ${scenarioFocus}
        ${scenarioRanking}
        ${scenarioAdjustments}
        <div class="qadr-ai-scenario-block">
          <span>کنترل کیفیت</span>
          <ul>
            <li>تکراری شدن بحث: ${escapeHtml(warRoom.quality_controls.repetitive_debate ? 'بله' : 'خیر')}</li>
            <li>اتفاق‌نظر سطحی: ${escapeHtml(warRoom.quality_controls.shallow_agreement ? 'بله' : 'خیر')}</li>
          <li>ریسک هم‌صدایی: ${escapeHtml(warRoom.quality_controls.voice_collapse_risk)}</li>
          <li>نسبت disagreementهای evidence-backed: ${Math.round(warRoom.quality_controls.evidence_backed_disagreement_ratio * 100)}%</li>
        </ul>
      </div>
      ${warRoom.unresolved_uncertainties.length ? `<div class="qadr-ai-scenario-block"><span>عدم‌قطعیت‌های حل‌نشده</span><ul>${warRoom.unresolved_uncertainties.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}
        ${updatedWatchpoints.length ? `<div class="qadr-ai-scenario-block"><span>Watchpointهای به‌روزشده</span><div class="qadr-ai-followups">${updatedWatchpoints.map((item) => `<span class="qadr-ai-simulation-pill">${escapeHtml(item)}</span>`).join('')}</div></div>` : recommendedWatchpoints.length ? `<div class="qadr-ai-scenario-block"><span>Watchpointهای پیشنهادی</span><div class="qadr-ai-followups">${recommendedWatchpoints.map((item) => `<span class="qadr-ai-simulation-pill">${escapeHtml(item)}</span>`).join('')}</div></div>` : ''}
        ${executiveRecommendations.length ? `<div class="qadr-ai-scenario-block"><span>توصیه‌های اجرایی</span><ul>${executiveRecommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}
        <div class="qadr-ai-scenario-block">
          <span>جمع‌بندی نهایی</span>
          <p>${escapeHtml(warRoom.final_synthesis)}</p>
        </div>
      </section>
  `;
}

function traceFor(message: AssistantMessage | null | undefined): AssistantTraceMetadata | undefined {
  return message?.trace;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

export function defaultTaskForWorkbenchMode(mode: AssistantWorkbenchMode): AiTaskClass {
  return MODE_TASK_MAP[mode];
}

export function deriveAssistantWorkbenchMode(taskClass?: AiTaskClass, domainMode?: AssistantDomainMode): AssistantWorkbenchMode {
  if (domainMode === 'strategic-foresight') return 'foresight';
  if (!taskClass) return 'quick';
  if (taskClass === 'assistant' || taskClass === 'briefing' || taskClass === 'summarization' || taskClass === 'translation') {
    return 'quick';
  }
  if (taskClass === 'report-generation' || taskClass === 'forecasting' || taskClass === 'resilience-analysis' || taskClass === 'country-brief') {
    return 'deep';
  }
  return 'agent';
}

export function localizeWorkbenchMode(mode: AssistantWorkbenchMode): string {
  switch (mode) {
    case 'quick':
      return 'پاسخ سریع';
    case 'deep':
      return 'تحلیل عمیق';
    case 'agent':
      return 'اجرای عامل';
    case 'foresight':
      return 'پیش‌نگری راهبردی';
    default:
      return 'پاسخ سریع';
  }
}

export function localizeNodeName(node: string): string {
  return NODE_LABELS[node] ?? node;
}

export function localizeToolName(tool: string): string {
  return TOOL_LABELS[tool] ?? tool;
}

export function localizeRouteName(route?: string): string {
  if (!route) return 'مسیر مستقیم';
  return ROUTE_LABELS[route] ?? route;
}

function localizeMetaRelationship(value: string): string {
  return META_RELATIONSHIP_LABELS[value] ?? value;
}

export function renderAssistantRichText(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return '<p class="qadr-ai-empty-copy">محتوایی برای نمایش وجود ندارد.</p>';
  }
  return renderJson(trimmed) ?? toHtml(trimmed);
}

export function renderAssistantConversationPreview(message: AssistantMessage): string {
  const structured = message.structured;
  if (!structured) {
    return `<div class="qadr-ai-richtext">${renderAssistantRichText(message.content)}</div>`;
  }

  const scenarioPreview = structured.scenarios.length > 0 ? `
    <div class="qadr-ai-mini-grid">
      ${structured.scenarios.slice(0, 3).map((scenario) => `
        <article class="qadr-ai-mini-card">
          <strong>${escapeHtml(scenario.title)}</strong>
          <span>${escapeHtml(scenario.timeframe)}</span>
          <p>${escapeHtml(scenario.description)}</p>
        </article>
      `).join('')}
    </div>
  ` : '';

  const followUps = structured.followUpSuggestions.length > 0 ? `
    <div class="qadr-ai-followups">
      ${structured.followUpSuggestions.slice(0, 4).map((item) => `<button type="button" class="qadr-ai-followup-btn" data-followup="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join('')}
    </div>
  ` : '';

  return `
    <div class="qadr-ai-report-kicker">گزارش لایه اول</div>
    <h3 class="qadr-ai-message-title">${escapeHtml(structured.reportTitle)}</h3>
    <div class="qadr-ai-executive-summary">${escapeHtml(structured.executiveSummary)}</div>
    <div class="qadr-ai-preview-grid">
      <article class="qadr-ai-preview-card">
        <strong>${escapeHtml(structured.observedFacts.title)}</strong>
        <p>${escapeHtml(structured.observedFacts.bullets.slice(0, 2).join(' | '))}</p>
      </article>
      <article class="qadr-ai-preview-card">
        <strong>${escapeHtml(structured.analyticalInference.title)}</strong>
        <p>${escapeHtml(structured.analyticalInference.bullets.slice(0, 2).join(' | '))}</p>
      </article>
      <article class="qadr-ai-preview-card">
        <strong>${escapeHtml(structured.uncertainties.title)}</strong>
        <p>${escapeHtml(structured.uncertainties.bullets.slice(0, 2).join(' | '))}</p>
      </article>
      <article class="qadr-ai-preview-card">
        <strong>${escapeHtml(structured.recommendations.title)}</strong>
        <p>${escapeHtml(structured.recommendations.bullets.slice(0, 2).join(' | '))}</p>
      </article>
      ${renderMetaScenarioSummary(message)}
      ${renderWarRoomSummary(message)}
      ${renderDecisionSupportSummary(message)}
    </div>
    ${scenarioPreview}
    ${followUps}
  `;
}

export function renderAssistantStructuredMessage(message: AssistantMessage): string {
  const structured = message.structured;
  if (!structured) {
    return `<div class="qadr-ai-richtext">${renderAssistantRichText(message.content)}</div>`;
  }
  const simulation = structured.simulation;
  const warRoomHtml = renderWarRoom(structured.warRoom);
  const metaScenarioHtml = renderMetaScenario(structured.metaScenario);
  const decisionSupportHtml = renderDecisionSupport(structured.decisionSupport);

  const simulationHtml = simulation ? `
    <section class="qadr-ai-section">
      <h4>شبیه‌سازی تعاملی</h4>
      <div class="qadr-ai-simulation-header">
        <strong>${escapeHtml(simulation.title)}</strong>
        <span>${escapeHtml(simulation.mode === 'deep' ? 'مد عمیق' : 'مد سریع')}</span>
      </div>
      <p class="qadr-ai-simulation-summary">${escapeHtml(simulation.compare_summary)}</p>
      <div class="qadr-ai-followups">
        ${simulation.controls_summary.map((item) => `<span class="qadr-ai-simulation-pill">${escapeHtml(item)}</span>`).join('')}
      </div>
      <div class="qadr-ai-simulation-branches">
        ${simulation.branches.map((branch) => `
          <article class="qadr-ai-simulation-branch">
            <div class="qadr-ai-scenario-meta">
              <strong>${escapeHtml(branch.title)}</strong>
              <span>احتمال ${Math.round(branch.probability_score * 100)}%</span>
              <span>اثر ${escapeHtml(branch.impact_level)}</span>
            </div>
            <p>${escapeHtml(branch.description)}</p>
            <div class="qadr-ai-scenario-block">
              <span>ریسک‌های محلی / سرریزها</span>
              <ul>${[...branch.local_risks.slice(0, 2), ...branch.regional_spillovers.slice(0, 2)].map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
            </div>
            <div class="qadr-ai-scenario-block">
              <span>گام‌ها</span>
              <ol class="qadr-ai-causal-chain">
                ${branch.steps.map((step) => `<li><strong>${escapeHtml(localizeNodeName(step.stage))}</strong>: ${escapeHtml(step.summary)}</li>`).join('')}
              </ol>
            </div>
            <div class="qadr-ai-followups">
              ${branch.tool_plan.map((tool) => `<span class="qadr-ai-simulation-pill">${escapeHtml(localizeToolName(tool))}</span>`).join('')}
            </div>
          </article>
        `).join('')}
      </div>
      <div class="qadr-ai-simulation-graph">
        ${simulation.graph.edges.slice(0, 12).map((edge) => `
          <div class="qadr-ai-simulation-edge">
            <span>${escapeHtml(simulation.graph.nodes.find((node) => node.id === edge.from)?.label || edge.from)}</span>
            <strong>${escapeHtml(edge.label || 'ارتباط')}</strong>
            <span>${escapeHtml(simulation.graph.nodes.find((node) => node.id === edge.to)?.label || edge.to)}</span>
          </div>
        `).join('')}
      </div>
    </section>
  ` : '';

  const scenariosHtml = structured.scenarios.length > 0 ? `
    <section class="qadr-ai-section">
      <h4>سناریوها</h4>
      <div class="qadr-ai-scenarios">
        ${structured.scenarios.map((scenario) => `
          <article class="qadr-ai-scenario-card">
            <strong>${escapeHtml(scenario.title)}</strong>
            <div>${escapeHtml(scenario.description)}</div>
            <div class="qadr-ai-scenario-meta">
              احتمال: ${escapeHtml(scenario.probability)}
              ${scenario.impact_level ? ` | اثر: ${escapeHtml(scenario.impact_level)}` : ''}
              | افق: ${escapeHtml(scenario.time_horizon || scenario.timeframe)}
            </div>
            ${scenario.drivers?.length ? `<div class="qadr-ai-scenario-block"><span>محرک‌ها</span><ul>${scenario.drivers.map((driver) => `<li>${escapeHtml(driver)}</li>`).join('')}</ul></div>` : ''}
            <div class="qadr-ai-scenario-block">
              <span>شاخص‌های پایش</span>
              <ul>${(scenario.indicators_to_watch ?? scenario.indicators).map((indicator) => `<li>${escapeHtml(indicator)}</li>`).join('')}</ul>
            </div>
            ${scenario.causal_chain?.length ? `
              <div class="qadr-ai-scenario-block">
                <span>زنجیره علّی</span>
                <ol class="qadr-ai-causal-chain">
                  ${scenario.causal_chain.map((step) => `<li><strong>${escapeHtml(localizeNodeName(step.stage))}</strong>: ${escapeHtml(step.summary)}</li>`).join('')}
                </ol>
              </div>
            ` : ''}
            ${scenario.mitigation_options?.length ? `<div class="qadr-ai-scenario-block"><span>گزینه‌های کاهش اثر</span><ul>${scenario.mitigation_options.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>` : ''}
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
    <div class="qadr-ai-report-sheet-header">
      <div class="qadr-ai-report-kicker">برگه گزارش</div>
      <h3>${escapeHtml(structured.reportTitle)}</h3>
      <p>${escapeHtml(structured.executiveSummary)}</p>
    </div>
    ${renderSection(
      structured.observedFacts.title,
      structured.observedFacts.narrative,
      structured.observedFacts.bullets,
      `سطح اطمینان: ${structured.observedFacts.confidence.band} (${Math.round(structured.observedFacts.confidence.score * 100)}%)`,
    )}
    ${renderSection(
      structured.analyticalInference.title,
      structured.analyticalInference.narrative,
      structured.analyticalInference.bullets,
      `سطح اطمینان: ${structured.analyticalInference.confidence.band} (${Math.round(structured.analyticalInference.confidence.score * 100)}%)`,
    )}
    ${simulationHtml}
    ${scenariosHtml}
    ${warRoomHtml}
    ${metaScenarioHtml}
    ${decisionSupportHtml}
    ${renderSection(
      structured.uncertainties.title,
      structured.uncertainties.narrative,
      structured.uncertainties.bullets,
      `سطح اطمینان: ${structured.uncertainties.confidence.band} (${Math.round(structured.uncertainties.confidence.score * 100)}%)`,
    )}
    ${renderSection(
      structured.recommendations.title,
      structured.recommendations.narrative,
      structured.recommendations.bullets,
      `سطح اطمینان: ${structured.recommendations.confidence.band} (${Math.round(structured.recommendations.confidence.score * 100)}%)`,
    )}
    ${renderSection(
      structured.resilienceNarrative.title,
      structured.resilienceNarrative.narrative,
      structured.resilienceNarrative.bullets,
      `سطح اطمینان: ${structured.resilienceNarrative.confidence.band} (${Math.round(structured.resilienceNarrative.confidence.score * 100)}%)`,
    )}
    ${followUps}
  `;
}

export function selectAssistantMessage(
  thread: AssistantConversationThread | null,
  selectedMessageId: string | null,
): AssistantMessage | null {
  if (!thread) return null;
  if (selectedMessageId) {
    const exact = thread.messages.find((message) => message.id === selectedMessageId && message.role === 'assistant');
    if (exact) return exact;
  }
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const candidate = thread.messages[index];
    if (candidate?.role === 'assistant') return candidate;
  }
  return null;
}

export function collectFollowUpSuggestions(message: AssistantMessage | null, evidence: AssistantEvidenceCard[]): string[] {
  const structuredSuggestions = message?.structured?.followUpSuggestions ?? [];
  const evidenceSuggestions = evidence.slice(0, 3).map((item) => `برای شاهد «${item.title}» تحلیل عمیق‌تری انجام بده.`);
  return uniqueStrings([...structuredSuggestions, ...evidenceSuggestions]).slice(0, 8);
}

export function buildAssistantTransparencySummary(message: AssistantMessage | null): AssistantTransparencySummary | null {
  if (!message) return null;
  const trace = traceFor(message);
  return {
    providerLabel: message.provider ?? trace?.selectedProvider ?? 'نامشخص',
    modelLabel: message.model ?? trace?.selectedModel ?? 'نامشخص',
    policyLabel: trace?.policyLabel ?? 'بدون policy',
    routeLabel: localizeRouteName(trace?.orchestratorRoute),
    durationLabel: formatDuration(trace?.startedAt, trace?.completedAt),
    cacheLabel: trace?.cached ? 'پاسخ cache شده' : 'اجرای تازه',
    timeContextLabel: trace?.timeContext ?? message.createdAt,
    sessionReuseLabel: trace?.sessionReuseCount ? `${trace.sessionReuseCount} بار reuse` : 'reuse ثبت نشده',
    providerOrder: trace?.providerOrder ? [...trace.providerOrder] : [],
    openRouterOrder: trace?.openRouterProviderOrder ? [...trace.openRouterProviderOrder] : [],
    toolPlan: (trace?.toolPlan ?? []).map((tool) => localizeToolName(tool)),
    nodes: (trace?.orchestratorNodes ?? []).map((node) => localizeNodeName(node)),
    warnings: trace?.warnings ? [...trace.warnings] : [],
  };
}
