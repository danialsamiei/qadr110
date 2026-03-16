import type { AssistantDomainMode, AssistantEvidenceCard, AssistantMemoryNote } from '../ai/assistant-contracts';
import type { AiTaskClass } from '../ai/contracts';
import { describeMapContextForPrompt, type MapContextEnvelope } from './map-context';

export interface PromptCatalogAction {
  id: 'copy' | 'deduct' | 'run-assistant' | 'save-workflow' | 'open-resilience';
  label: string;
}

export type PromptTemplateKind =
  | 'system'
  | 'analytic-template'
  | 'geo-context'
  | 'report-generation'
  | 'scenario'
  | 'resilience'
  | 'country-comparison';

export interface PromptCompositionInput {
  query?: string;
  domainMode: AssistantDomainMode;
  taskClass: AiTaskClass;
  mapContext?: MapContextEnvelope | null;
  pinnedEvidence?: AssistantEvidenceCard[];
  memoryNotes?: AssistantMemoryNote[];
}

export interface PromptCatalogEntry {
  id: string;
  kind: PromptTemplateKind;
  title: string;
  summary: string;
  basePrompt: string;
  tags: string[];
  domainModes: AssistantDomainMode[];
  taskClasses: AiTaskClass[];
  actions: PromptCatalogAction[];
}

export interface PromptCatalog {
  version: string;
  defaultLanguage: 'fa';
  entries: PromptCatalogEntry[];
}

function composeContextSuffix(input: PromptCompositionInput): string {
  const parts: string[] = [];

  if (input.query) {
    parts.push(`پرسش تحلیلی: ${input.query}`);
  }

  if (input.mapContext) {
    parts.push(`کانتکست نقشه:\n${describeMapContextForPrompt(input.mapContext)}`);
  }

  if (input.pinnedEvidence?.length) {
    const evidenceLines = input.pinnedEvidence.slice(0, 4).map((item, index) =>
      `${index + 1}. ${item.title} | ${item.source.publisher || item.source.title || item.source.id} | ${item.summary}`);
    parts.push(`شواهد پین‌شده:\n${evidenceLines.join('\n')}`);
  }

  if (input.memoryNotes?.length) {
    const noteLines = input.memoryNotes.slice(0, 3).map((note, index) =>
      `${index + 1}. ${note.title}: ${note.content}`);
    parts.push(`حافظه فضای کار:\n${noteLines.join('\n')}`);
  }

  return parts.length > 0 ? `\n\n${parts.join('\n\n')}` : '';
}

export function composePromptEntry(entry: PromptCatalogEntry, input: PromptCompositionInput): string {
  return `${entry.basePrompt}${composeContextSuffix(input)}`.trim();
}

export function getPromptEntriesForMode(mode: AssistantDomainMode, taskClass?: AiTaskClass): PromptCatalogEntry[] {
  return DEFAULT_PROMPT_CATALOG.entries.filter((entry) =>
    entry.domainModes.includes(mode)
    && (!taskClass || entry.taskClasses.includes(taskClass)));
}

export const DEFAULT_PROMPT_CATALOG: PromptCatalog = {
  version: '2026-03-16-openrouter-fa',
  defaultLanguage: 'fa',
  entries: [
    {
      id: 'osint-digest-core',
      kind: 'analytic-template',
      title: 'هضم چندمنبعی OSINT',
      summary: 'برای جمع‌بندی وضعیت با تفکیک واقعیت، inference، سناریو و uncertainty.',
      basePrompt: 'با تکیه بر retrieval و سیگنال‌های اخیر، یک هضم OSINT فارسی بساز که بخش‌های «واقعیت‌های مشاهده‌شده»، «استنباط تحلیلی»، «سناریوها»، «عدم‌قطعیت‌ها» و «توصیه‌های دفاعی» را جدا کند. هر ادعا باید به evidence cardهای موجود ارجاع ضمنی داشته باشد و سطح اطمینان شفاف اعلام شود.',
      tags: ['osint', 'digest', 'evidence'],
      domainModes: ['osint-digest', 'security-brief', 'predictive-analysis'],
      taskClasses: ['assistant', 'briefing', 'summarization'],
      actions: [
        { id: 'run-assistant', label: 'اجرای تحلیل' },
        { id: 'copy', label: 'کپی پرامپت' },
        { id: 'save-workflow', label: 'ذخیره workflow' },
      ],
    },
    {
      id: 'geo-defense-context',
      kind: 'geo-context',
      title: 'تحلیل ژئوکانتکست دفاعی',
      summary: 'برای تبدیل context انتخاب‌شده روی نقشه به تحلیل جغرافیایی-دفاعی.',
      basePrompt: 'بر مبنای context جغرافیایی انتخاب‌شده، actorهای مرتبط، زیرساخت‌های حساس، سیگنال‌های همگرا، ریسک‌های پیرامونی و سه سناریوی دفاعی محتمل را توضیح بده. صریحاً بگو کدام بخش مشاهده است و کدام بخش inference.',
      tags: ['geo', 'map', 'defensive'],
      domainModes: ['infrastructure-risk', 'border-dynamics', 'military-monitoring-defensive'],
      taskClasses: ['assistant', 'deduction', 'scenario-analysis', 'scenario-building'],
      actions: [
        { id: 'run-assistant', label: 'تحلیل روی نقشه' },
        { id: 'copy', label: 'کپی پرامپت' },
        { id: 'deduct', label: 'ارسال به deduction' },
      ],
    },
    {
      id: 'resilience-narrative',
      kind: 'resilience',
      title: 'روایت تاب‌آوری',
      summary: 'برای تولید narrative تاب‌آوری با ابعاد اقتصادی، اجتماعی، شناختی و زیرساختی.',
      basePrompt: 'برای کشور یا موضوع هدف، روایت تاب‌آوری چندبعدی ارائه بده: اقتصاد، زیرساخت، جامعه، میدان شناختی و حاکمیت. نقاط اتکا، شکنندگی تجمعی، گلوگاه‌های فوری و توصیه‌های کوتاه‌مدت دفاعی را توضیح بده.',
      tags: ['resilience', 'economy', 'society'],
      domainModes: ['economic-resilience', 'social-resilience', 'infrastructure-risk'],
      taskClasses: ['assistant', 'resilience-analysis', 'report-generation'],
      actions: [
        { id: 'run-assistant', label: 'ساخت روایت' },
        { id: 'open-resilience', label: 'باز کردن داشبورد' },
        { id: 'copy', label: 'کپی پرامپت' },
        { id: 'save-workflow', label: 'ذخیره workflow' },
      ],
    },
    {
      id: 'country-comparison-brief',
      kind: 'country-comparison',
      title: 'مقایسه دو کشور',
      summary: 'برای مقایسه دو کشور از منظر تاب‌آوری، فشار تحریم، یا پویایی مرزی.',
      basePrompt: 'دو کشور منتخب را از منظر ریسک، تاب‌آوری، روایت رسانه‌ای، زیرساخت‌های حساس و سناریوهای ۳۰ روزه مقایسه کن. خروجی را با جدول مقایسه، جمع‌بندی تحلیلی و توصیه‌های دفاعی تکمیل کن.',
      tags: ['comparison', 'country', 'brief'],
      domainModes: ['economic-resilience', 'border-dynamics', 'sanctions-impact', 'security-brief'],
      taskClasses: ['assistant', 'briefing', 'report-generation'],
      actions: [
        { id: 'run-assistant', label: 'مقایسه کشورها' },
        { id: 'open-resilience', label: 'داشبورد مقایسه' },
        { id: 'copy', label: 'کپی پرامپت' },
      ],
    },
    {
      id: 'misinformation-red-flag',
      kind: 'analytic-template',
      title: 'پرچم قرمز اطلاعات نادرست',
      summary: 'برای استخراج شکاف‌های راستی‌آزمایی و claims مشکوک.',
      basePrompt: 'ادعاهای غالب را از retrieval استخراج کن، claimهایی را که شواهد کافی ندارند علامت‌گذاری کن، منبع‌های متناقض را برجسته کن و شکاف‌های راستی‌آزمایی را به فارسی توضیح بده. از citation جعلی یا نسبت‌دادن بدون evidence خودداری کن.',
      tags: ['misinformation', 'claims', 'verification'],
      domainModes: ['misinformation-analysis', 'cultural-cognitive-analysis', 'osint-digest'],
      taskClasses: ['assistant', 'extraction', 'structured-json'],
      actions: [
        { id: 'run-assistant', label: 'تحلیل ادعاها' },
        { id: 'copy', label: 'کپی پرامپت' },
      ],
    },
    {
      id: 'scenario-playbook',
      kind: 'scenario',
      title: 'سناریونویسی راهبردی',
      summary: 'برای baseline/optimistic/pessimistic با علائم راهنما و uncertainty.',
      basePrompt: 'سه سناریوی پایه، خوش‌بینانه و بدبینانه طراحی کن. برای هر سناریو احتمال، بازه زمانی، triggerها، indicators و اثرات ثانویه را بنویس. عدم‌قطعیت‌های کلیدی و توصیه‌های دفاعی مجزا باشند.',
      tags: ['scenario', 'forecast', 'playbook'],
      domainModes: ['scenario-planning', 'predictive-analysis', 'security-brief'],
      taskClasses: ['assistant', 'scenario-building', 'scenario-analysis', 'forecasting'],
      actions: [
        { id: 'run-assistant', label: 'ساخت سناریو' },
        { id: 'copy', label: 'کپی پرامپت' },
        { id: 'save-workflow', label: 'ذخیره workflow' },
      ],
    },
    {
      id: 'report-generator',
      kind: 'report-generation',
      title: 'گزارش نهایی مدیریتی',
      summary: 'برای خروجی report-friendly با executive summary و annex شواهد.',
      basePrompt: 'یک گزارش مدیریتی فارسی بساز که شامل عنوان، executive summary، واقعیت‌های مشاهده‌شده، تحلیل، سناریوها، توصیه‌های دفاعی و annex شواهد باشد. متن باید برای export به Markdown و HTML مناسب باشد.',
      tags: ['report', 'export', 'executive'],
      domainModes: ['security-brief', 'economic-resilience', 'infrastructure-risk', 'scenario-planning'],
      taskClasses: ['assistant', 'report-generation', 'briefing'],
      actions: [
        { id: 'run-assistant', label: 'تولید گزارش' },
        { id: 'open-resilience', label: 'گزارش در داشبورد' },
        { id: 'copy', label: 'کپی پرامپت' },
      ],
    },
  ],
};
