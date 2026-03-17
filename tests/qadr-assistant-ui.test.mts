import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AssistantMessage } from '../src/platform/ai/assistant-contracts.ts';
import {
  buildAssistantTransparencySummary,
  defaultTaskForWorkbenchMode,
  deriveAssistantWorkbenchMode,
  renderAssistantRichText,
  renderAssistantStructuredMessage,
} from '../src/components/qadr-assistant-ui.ts';

function makeMessage(): AssistantMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    createdAt: '2026-03-17T07:30:00.000Z',
    content: '## گزارش\n\n```json\n{\"hello\":\"world\"}\n```',
    taskClass: 'scenario-analysis',
    provider: 'ollama',
    model: 'devstral:24b',
    traceId: 'trace-1',
    trace: {
      traceId: 'trace-1',
      taskClass: 'scenario-analysis',
      policyLabel: 'local-first-agent',
      providerOrder: ['ollama', 'openrouter'],
      selectedProvider: 'ollama',
      selectedModel: 'devstral:24b',
      startedAt: '2026-03-17T07:30:00.000Z',
      completedAt: '2026-03-17T07:30:03.200Z',
      cached: false,
      timeContext: '2026-03-17T07:30:03.200Z',
      warnings: ['نیاز به راستی‌آزمایی ثانویه'],
      orchestratorRoute: 'tool-grounded',
      orchestratorNodes: ['planning', 'tool-selection', 'execution', 'reflection'],
      toolPlan: ['map_context', 'web_search'],
      sessionReuseCount: 2,
    },
  };
}

describe('qadr assistant ui helpers', () => {
  it('maps workbench modes to task classes and back', () => {
    assert.equal(defaultTaskForWorkbenchMode('quick'), 'assistant');
    assert.equal(defaultTaskForWorkbenchMode('deep'), 'report-generation');
    assert.equal(defaultTaskForWorkbenchMode('agent'), 'scenario-analysis');
    assert.equal(defaultTaskForWorkbenchMode('foresight'), 'report-generation');

    assert.equal(deriveAssistantWorkbenchMode('assistant'), 'quick');
    assert.equal(deriveAssistantWorkbenchMode('report-generation'), 'deep');
    assert.equal(deriveAssistantWorkbenchMode('scenario-analysis'), 'agent');
    assert.equal(deriveAssistantWorkbenchMode('report-generation', 'strategic-foresight'), 'foresight');
  });

  it('renders markdown/code safely and preserves structured code blocks', () => {
    const html = renderAssistantRichText('## عنوان\n\nکد:\n```ts\nconst x = 1;\n```');

    assert.match(html, /<h2>عنوان<\/h2>/);
    assert.match(html, /<pre><code class="language-ts">const x = 1;/);
    assert.doesNotMatch(html, /<script>/);
  });

  it('builds localized transparency summaries from trace metadata', () => {
    const summary = buildAssistantTransparencySummary(makeMessage());

    assert.ok(summary);
    assert.equal(summary?.providerLabel, 'ollama');
    assert.equal(summary?.modelLabel, 'devstral:24b');
    assert.equal(summary?.routeLabel, 'عامل ابزارمحور');
    assert.deepEqual(summary?.toolPlan, ['کانتکست نقشه', 'جست‌وجوی وب']);
    assert.deepEqual(summary?.nodes, ['برنامه‌ریزی', 'انتخاب ابزار', 'اجرا', 'بازبینی']);
    assert.equal(summary?.sessionReuseLabel, '2 بار reuse');
  });

  it('renders decision-support sections for structured scenario outputs', () => {
    const message: AssistantMessage = {
      ...makeMessage(),
      content: 'structured',
      structured: {
        reportTitle: 'تصمیم‌یار هرمز',
        executiveSummary: 'سه سناریوی کلیدی برای هرمز بررسی شد.',
        observedFacts: {
          title: 'واقعیت‌های مشاهده‌شده',
          narrative: 'واقعیت پایه',
          bullets: ['سیگنال‌های حمل‌ونقل', 'فشار انرژی'],
          confidence: { band: 'medium', score: 0.62, uncertainty: 0.38, rationale: 'test' },
        },
        analyticalInference: {
          title: 'استنباط تحلیلی',
          narrative: 'برداشت تحلیلی',
          bullets: ['اثر چنددامنه‌ای'],
          confidence: { band: 'medium', score: 0.6, uncertainty: 0.4, rationale: 'test' },
        },
        scenarios: [{
          title: 'شوک صادرات',
          probability: 'high',
          timeframe: '72 ساعت',
          description: 'اختلال صادرات انرژی',
          indicators: ['قیمت نفت'],
          confidence: { band: 'medium', score: 0.58, uncertainty: 0.42, rationale: 'test' },
        }],
        metaScenario: {
          executive_summary: 'لایه متا-سناریو نشان می‌دهد چند آینده در حال رقابت هستند.',
          higher_order_insights: ['سناریوی غالب باید در کنار قوی سیاه پایش شود.'],
          meta_scenarios: [{
            id: 'meta-1',
            title: 'جنگ سناریویی انرژی',
            source_scenarios: ['scenario-a', 'scenario-b'],
            relationship_type: 'competing',
            summary: 'دو آینده برای plausibility رقابت می‌کنند.',
            combined_probability: 'medium',
            impact_level: 'high',
            uncertainty_level: 'medium',
            critical_dependencies: ['بیمه حمل'],
            trigger_indicators: ['قیمت نفت'],
            watchpoints: ['ترافیک دریایی'],
            strategic_implications: ['تغییر winner محتمل است.'],
            recommended_actions: ['شاخص‌های winner را پایش کن.'],
          }],
          scenario_conflicts: [{
            id: 'conflict-1',
            left_scenario_id: 'scenario-a',
            right_scenario_id: 'scenario-b',
            relationship_type: 'competing',
            interaction_strength: 0.68,
            direction: 'toward:scenario-a',
            summary: 'دو سناریو برای plausibility رقابت می‌کنند.',
            probability_redistribution: { 'scenario-a': 0.58, 'scenario-b': 0.42 },
            decisive_indicators: ['قیمت نفت'],
          }],
          black_swan_candidates: [{
            id: 'black-1',
            title: 'قوی سیاه انرژی',
            summary: 'یک failure غیرخطی می‌تواند رژیم تحلیل را عوض کند.',
            probability: 'low',
            impact_level: 'critical',
            uncertainty_level: 'high',
            why_it_matters: 'فرض‌های پایه را می‌شکند.',
            low_probability_reason: 'سیگنال‌ها هنوز sparse و متعارض هستند.',
            high_impact_reason: 'در صورت وقوع، ranking سناریوها را بازچینی می‌کند.',
            broken_assumptions: ['ثبات حمل'],
            affected_domains: ['اقتصاد', 'زیرساخت'],
            weak_signals: ['شایعه انسداد'],
            contradictory_evidence: ['پیام آرام‌ساز'],
            regime_shift_indicators: ['اختلال مخابراتی'],
            leading_indicators: ['افزایش ریسک بیمه'],
            watchpoints: ['ترافیک دریایی'],
            recommended_actions: ['watchlist جدا بساز'],
            confidence_note: 'شواهد هنوز کامل نیستند.',
            uncertainty_note: 'رفتار بازیگران کلیدی می‌تواند مسیر را عوض کند.',
          }],
        },
        warRoom: {
          question: 'اگر تنگه هرمز دچار اختلال شود چه می‌شود؟',
          anchor_label: 'تنگه هرمز',
          mode: 'deep',
          active_agent_ids: ['strategic-analyst', 'economic-analyst'],
          excluded_agent_ids: [],
          round_count: 4,
          agents: [{
            id: 'strategic-analyst',
            role: 'تحلیل‌گر راهبردی',
            label: 'Strategic Analyst',
            role_prompt: 'prompt',
            position: 'سناریوی غالب هنوز حول شوک انرژی و spillover منطقه‌ای می‌چرخد.',
            revised_position: 'پس از challenge، باید watchpointهای انرژی و حمل‌ونقل نزدیک‌تر پایش شوند.',
            confidence_score: 0.68,
            confidence_note: 'test',
            supporting_points: ['فشار انرژی', 'اختلال حمل‌ونقل'],
            watchpoints: ['قیمت نفت', 'ترافیک دریایی'],
            assumptions: ['بازار کاملا قفل نمی‌شود'],
            critiques: [{
              target_agent_id: 'economic-analyst',
              summary: 'تحلیل اقتصادی timing spillover را دست‌کم گرفته است.',
              marker: 'challenge',
            }],
          }],
          rounds: [{
            id: 'round-1',
            title: 'دور ۱: ارزیابی مستقل',
            stage: 'assessment',
            summary: 'عامل‌ها ارزیابی اولیه را ثبت می‌کنند.',
            entries: [{
              agent_id: 'strategic-analyst',
              label: 'Strategic Analyst',
              content: 'سناریوی غالب همچنان انرژی‌محور است.',
              target_agent_ids: [],
              markers: ['support'],
            }],
          }],
          debate_transcript: [{
            id: 'transcript-1',
            round_id: 'round-1',
            round_stage: 'assessment',
            round_index: 1,
            agent_id: 'strategic-analyst',
            label: 'Strategic Analyst',
            prompt_excerpt: 'assessment prompt',
            response: 'سناریوی غالب همچنان انرژی‌محور است.',
            target_agent_ids: [],
            markers: ['support'],
            evidence_basis: ['قیمت نفت', 'ترافیک دریایی'],
            quality_flags: ['evidence-backed'],
          }],
          replay_trace: [{
            id: 'transition-1',
            from_stage: 'initialized',
            to_stage: 'assessment',
            round_id: 'round-1',
            round_index: 1,
            summary: 'دور assessment آغاز شد.',
            timestamp: '2026-03-17T07:31:00.000Z',
          }],
          disagreement_matrix: [{
            agent_id: 'strategic-analyst',
            label: 'Strategic Analyst',
            cells: [{
              target_agent_id: 'economic-analyst',
              disagreement_score: 0.64,
              challenge_count: 1,
              evidence_backed: true,
              summary: 'زمان‌بندی spillover هنوز محل اختلاف است.',
            }],
          }],
          quality_controls: {
            repetitive_debate: false,
            shallow_agreement: false,
            voice_collapse_risk: 'medium',
            evidence_backed_disagreement_ratio: 0.75,
            alerts: ['چند disagreement هنوز باید با داده تازه resolve شوند.'],
            enforcement_notes: ['Moderator باید clarification request تازه بدهد.'],
          },
          disagreements: [{
            id: 'disagreement-1',
            title: 'اختلاف راهبردی',
            summary: 'زمان‌بندی spillover هنوز محل اختلاف است.',
            agent_ids: ['strategic-analyst', 'economic-analyst'],
            severity: 'high',
          }],
          convergences: [{
            id: 'convergence-1',
            title: 'همگرایی بر سر قیمت نفت',
            summary: 'عامل‌ها قیمت نفت را decisive می‌دانند.',
            agent_ids: ['strategic-analyst', 'economic-analyst', 'executive-synthesizer'],
          }],
          unresolved_uncertainties: ['رفتار بازیگران دریایی هنوز مبهم است.'],
          moderator_summary: 'Moderator اختلاف اصلی را روی timing spillover می‌بیند.',
          executive_summary: 'جمع‌بندی اجرایی: watchpointهای انرژی و حمل‌ونقل باید نزدیک پایش شوند.',
          final_synthesis: 'اگر سناریوی اصلی سست شود، جایگزین انرژی‌محور با سرعت بالا فعال می‌شود.',
          recommended_watchpoints: ['قیمت نفت', 'ترافیک دریایی', 'بیمه حمل'],
        },
        decisionSupport: {
          executive_summary: 'نیاز به مهار فوری شوک و پایش عدم‌قطعیت‌های کلیدی وجود دارد.',
          actionable_insights: ['افزایش cadence پایش', 'بازبینی گلوگاه‌های لجستیکی'],
          strategic_insights: ['سناریوی غالب باید hedge شود.'],
          leverage_points: [{ title: 'پایش قیمت نفت', why: 'سریع‌ترین شاخص تغییر مسیر سناریو است.' }],
          critical_uncertainties: [{ title: 'رفتار بازیگران منطقه‌ای', why: 'می‌تواند ranking سناریوها را تغییر دهد.', indicators: ['تحرک دریایی'] }],
          actor_models: [{ actor: 'بازیگر انرژی', role: 'بازیگر اقتصادی / زنجیره تامین', intent: 'حفظ throughput', likely_behaviors: ['تنوع‌بخشی مسیر'], constraints: ['بیمه'] }],
          scenario_support: [{
            scenario_title: 'شوک صادرات',
            probability: 'high',
            impact_level: 'critical',
            recommended_actions: [{ label: 'اقدام فوری: افزایش پایش', rationale: 'برای کاهش تاخیر تصمیم', timeframe: 'immediate' }],
            mitigation_strategies: ['پایش لجستیکی'],
            tradeoffs: [{ label: 'افزایش آماده‌سازی', cost: 'بار منابع', benefit: 'کاهش غافلگیری', short_term: 'فشار کوتاه‌مدت', long_term: 'تاب‌آوری بیشتر' }],
          }],
        },
        uncertainties: {
          title: 'عدم‌قطعیت‌ها',
          narrative: 'ابهام‌ها',
          bullets: ['رفتار بازیگران'],
          confidence: { band: 'medium', score: 0.55, uncertainty: 0.45, rationale: 'test' },
        },
        recommendations: {
          title: 'توصیه‌ها',
          narrative: 'توصیه‌های دفاعی',
          bullets: ['افزایش پوشش داده'],
          confidence: { band: 'medium', score: 0.59, uncertainty: 0.41, rationale: 'test' },
        },
        resilienceNarrative: {
          title: 'روایت تاب‌آوری',
          narrative: 'تاب‌آوری به throughput وابسته است.',
          bullets: ['لجستیک', 'اطلاعات'],
          confidence: { band: 'medium', score: 0.57, uncertainty: 0.43, rationale: 'test' },
        },
        followUpSuggestions: ['اثر اقتصادی را کمی‌سازی کن'],
      },
    };

    const html = renderAssistantStructuredMessage(message);

    assert.match(html, /تصمیم‌یار سناریو/);
    assert.match(html, /اتاق چندعاملی/);
    assert.match(html, /تحلیل‌گر راهبردی/);
    assert.match(html, /اختلاف راهبردی/);
    assert.match(html, /ماتریس اختلاف/);
    assert.match(html, /کنترل کیفیت/);
    assert.match(html, /متا-سناریو و قوی سیاه/);
    assert.match(html, /افزایش cadence پایش/);
    assert.match(html, /Trade-offها/);
    assert.match(html, /بازیگر انرژی/);
    assert.match(html, /قوی سیاه انرژی/);
  });
});
