import type { KnowledgeChunk, KnowledgeDocument } from './contracts';
import { isDemoModeEnabled } from '../operations/demo-mode';

const BUILTIN_DOCUMENTS: KnowledgeDocument[] = [
  {
    id: 'qadr-architecture-overview',
    kind: 'project-doc',
    title: 'معماری موجود QADR110',
    summary: 'معماری panel-based با Vite/Tauri/web و تمرکز بر explainability و parity بین web/Tauri.',
    content: `
QADR110 بر پایه TypeScript، Vite و معماری پنل‌محور ساخته شده است. نقشه، پنل‌های تحلیلی، ingestion و intelligence APIها همه در همین کدپایه به‌صورت ماژولار قرار دارند.

اصل طراحی در این پروژه حفظ web/Tauri parity، شفافیت منشأ داده، و توسعه افزایشی است. هر قابلیت جدید باید روی همان پنل‌ها، contractها، eventها و سرویس‌های موجود سوار شود و نباید یک اپ موازی ایجاد کند.

در لایه AI، OpenRouter به‌عنوان gateway اصلی تعریف می‌شود اما fallbackهای محلی مانند Ollama، vLLM و browser inference باید حفظ شوند. همه خروجی‌های AI باید evidence-aware، قابل ممیزی و دارای provenance باشند.
    `.trim(),
    language: 'fa',
    sourceLabel: 'QADR110 Docs',
    sourceType: 'manual',
    updatedAt: '2026-03-16T00:00:00.000Z',
    tags: ['architecture', 'platform', 'policy'],
    provenance: {
      sourceIds: ['doc:qadr-architecture-overview'],
      evidenceIds: ['evidence:qadr-architecture-overview'],
    },
  },
  {
    id: 'qadr-defensive-guardrails',
    kind: 'glossary',
    title: 'چارچوب دفاعی و قانونی',
    summary: 'تمامی قابلیت‌های عملیاتی باید در چارچوب تصمیم‌یار دفاعی، قانونی و غیرتهاجمی باقی بمانند.',
    content: `
QADR110 صرفاً برای تصمیم‌سازی دفاعی، OSINT، تاب‌آوری و هشدار زودهنگام استفاده می‌شود. سامانه نباید راهنمای نفوذ، bypass، weaponization، kill-chain، target selection یا هر نوع اقدام تهاجمی ارائه دهد.

هر پاسخ باید میان واقعیت‌های مشاهده‌شده، استنباط تحلیلی، سناریوها، عدم‌قطعیت‌ها و توصیه‌های دفاعی تفکیک قائل شود. اگر درخواست کاربر به حوزه غیرقانونی یا تهاجمی نزدیک باشد، سامانه باید مودبانه رد کند و آن را به مسیر دفاعی، hardening، monitoring یا resilience بازگرداند.
    `.trim(),
    language: 'fa',
    sourceLabel: 'QADR110 Policy',
    sourceType: 'manual',
    updatedAt: '2026-03-16T00:00:00.000Z',
    tags: ['safety', 'lawful', 'defensive'],
    provenance: {
      sourceIds: ['doc:qadr-defensive-guardrails'],
      evidenceIds: ['evidence:qadr-defensive-guardrails'],
    },
  },
  {
    id: 'qadr-resilience-framework',
    kind: 'resilience-framework',
    title: 'چارچوب تاب‌آوری چندبعدی',
    summary: 'تاب‌آوری باید هم‌زمان در ابعاد اقتصادی، زیرساختی، اجتماعی، شناختی و حاکمیتی سنجیده شود.',
    content: `
تحلیل تاب‌آوری در QADR110 صرفاً با یک شاخص منفرد انجام نمی‌شود. ابعاد اصلی شامل اقتصاد و تجارت، انرژی و لجستیک، ارتباطات و زیرساخت، جامعه و سرمایه اجتماعی، روایت و میدان شناختی، و ظرفیت نهادی برای انطباق است.

هر روایت تاب‌آوری باید نشان دهد چه چیزی پایدار مانده، کجا شکنندگی تجمعی ایجاد شده، کدام گلوگاه‌ها نیاز به اقدام کوتاه‌مدت دارند و چه فرض‌هایی هنوز تایید نشده‌اند.
    `.trim(),
    language: 'fa',
    sourceLabel: 'QADR110 Resilience Pack',
    sourceType: 'manual',
    updatedAt: '2026-03-16T00:00:00.000Z',
    tags: ['resilience', 'framework', 'assessment'],
    provenance: {
      sourceIds: ['doc:qadr-resilience-framework'],
      evidenceIds: ['evidence:qadr-resilience-framework'],
    },
  },
  {
    id: 'qadr-map-context',
    kind: 'glossary',
    title: 'راهنمای context جغرافیایی',
    summary: 'کلیک روی نقطه، کشور، incident یا لایه روی نقشه باید به prompt تحلیلی پویا تبدیل شود.',
    content: `
Map context در QADR110 شامل نوع selection، مختصات، کشور، active layerها، incidentها و بازه زمانی است. این context باید در prompt تحلیلی تبدیل شود تا پاسخ AI از سطح کلی‌گویی به سطح جغرافیایی و زمانی مشخص برسد.

وقتی analyst روی یک نقطه، polygon، کشور یا incident کار می‌کند، assistant باید actorهای نزدیک، زیرساخت‌های حساس، سیگنال‌های همگرا و ریسک‌های منطقه‌ای را نسبت به همان context توضیح دهد.
    `.trim(),
    language: 'fa',
    sourceLabel: 'QADR110 Map Context',
    sourceType: 'manual',
    updatedAt: '2026-03-16T00:00:00.000Z',
    tags: ['map', 'geo-context', 'prompting'],
    provenance: {
      sourceIds: ['doc:qadr-map-context'],
      evidenceIds: ['evidence:qadr-map-context'],
    },
  },
  {
    id: 'qadr-osint-pack',
    kind: 'osint-summary',
    title: 'راهنمای گردش‌کار OSINT',
    summary: 'گردش‌کار OSINT باید منبع‌محور، قابل‌راستی‌آزمایی و چندمنبعی باشد.',
    content: `
در تحلیل OSINT، هر ادعا باید با زمان، منبع، نوع منبع، و سطح اطمینان ثبت شود. بهتر است ابتدا مشاهده‌ها از inference جدا شوند، سپس ناسازگاری‌ها مشخص شود و بعد سناریوها روی شواهد موجود بنا شوند.

هر بار که AI از retrieval استفاده می‌کند، باید evidence card داشته باشد: خلاصه، منبع، زمان بازیابی، برچسب confidence و provenance. نبود شواهد کافی باید صریحاً بیان شود.
    `.trim(),
    language: 'fa',
    sourceLabel: 'QADR110 OSINT Pack',
    sourceType: 'manual',
    updatedAt: '2026-03-16T00:00:00.000Z',
    tags: ['osint', 'evidence', 'workflow'],
    provenance: {
      sourceIds: ['doc:qadr-osint-pack'],
      evidenceIds: ['evidence:qadr-osint-pack'],
    },
  },
  {
    id: 'qadr-openrouter-routing',
    kind: 'project-doc',
    title: 'مبنای مسیردهی OpenRouter-first',
    summary: 'OpenRouter درگاه پیش‌فرض است و fallbackهای محلی/سلف‌هاستد باید حفظ شوند.',
    content: `
در این کدپایه، OpenRouter اولین انتخاب برای cloud LLM است. برای سناریوهای حساس یا disconnected، Ollama، vLLM و browser inference به‌عنوان fallback حفظ می‌شوند. مدل‌روتینگ باید بر اساس task class انجام شود: briefing، extraction، forecasting، resilience analysis، translation و structured JSON.

trace metadata، retry budget، cache namespace و provider route باید برای هر اجرای AI ثبت شوند تا explainability و auditability حفظ شود.
    `.trim(),
    language: 'fa',
    sourceLabel: 'QADR110 AI Routing',
    sourceType: 'manual',
    updatedAt: '2026-03-16T00:00:00.000Z',
    tags: ['openrouter', 'routing', 'ai'],
    provenance: {
      sourceIds: ['doc:qadr-openrouter-routing'],
      evidenceIds: ['evidence:qadr-openrouter-routing'],
    },
  },
];

const DEMO_DOCUMENTS: KnowledgeDocument[] = [
  {
    id: 'qadr-demo-mode-overview',
    kind: 'project-doc',
    title: 'حالت دمو QADR110 (نمونه داده)',
    summary: 'این اسناد برای نمایش آفلاین/بدون کانکتور ساخته شده‌اند و به‌عنوان داده واقعی تلقی نمی‌شوند.',
    content: `
این بسته برای حالت دمو طراحی شده است تا سامانه حتی بدون کلیدهای API یا کانکتورهای بیرونی قابل ارائه باشد.

ویژگی‌ها:
- اسناد و شواهد نمونه (synthetic) برای تست RAG و evidence cards
- سناریوها و playbookهای دفاعی نمونه
- خروجی‌های ساخت‌یافته (facts / inference / scenarios / uncertainty / recommendations)

محدودیت:
- این داده‌ها واقعیت بیرونی را نمایندگی نمی‌کنند و نباید مبنای تصمیم واقعی باشند.
    `.trim(),
    language: 'fa',
    sourceLabel: 'QADR110 Demo Pack',
    sourceType: 'dataset',
    updatedAt: '2026-03-16T00:00:00.000Z',
    tags: ['demo', 'synthetic', 'platform'],
    provenance: {
      sourceIds: ['demo:qadr-demo-mode-overview'],
      evidenceIds: ['demo:evidence:qadr-demo-mode-overview'],
    },
  },
  {
    id: 'qadr-demo-osint-sample-report',
    kind: 'osint-summary',
    title: 'نمونه گزارش OSINT (دمو)',
    summary: 'یک گزارش نمونه برای نمایش تفکیک مشاهده/استنباط/سناریو/عدم‌قطعیت.',
    content: `
گزارش نمونه OSINT (synthetic)

واقعیت‌های مشاهده‌شده (نمونه):
- چند سیگنال ژئوکد شده در نزدیکی یک گذرگاه مرزی ثبت شده است (نمونه).
- یک خبر محلی درباره اختلال کوتاه‌مدت در تردد گزارش شده است (نمونه).

استنباط تحلیلی (نمونه):
- هم‌زمانی اختلال تردد و افزایش اشاره‌های رسانه‌ای می‌تواند نشانه فشار لجستیکی باشد، اما شواهد کافی برای نتیجه‌گیری قطعی وجود ندارد.

عدم‌قطعیت‌ها:
- منبع مستقل دوم برای تایید خبر در این بسته وجود ندارد.
- داده‌های ترافیک زنده/دریایی/هوایی در دمو شبیه‌سازی می‌شوند.

پیشنهاد پایش:
- مقایسه با داده‌های رسمی/متناظر (در صورت فعال‌بودن کانکتورها)
- پایش روایت‌های متناقض و تغییرات زمانی سیگنال‌ها
    `.trim(),
    language: 'fa',
    sourceLabel: 'QADR110 Demo Pack',
    sourceType: 'dataset',
    updatedAt: '2026-03-16T00:00:00.000Z',
    tags: ['demo', 'synthetic', 'osint', 'evidence'],
    provenance: {
      sourceIds: ['demo:qadr-demo-osint-sample-report'],
      evidenceIds: ['demo:evidence:qadr-demo-osint-sample-report'],
    },
  },
  {
    id: 'qadr-demo-defensive-playbooks',
    kind: 'project-doc',
    title: 'نمونه playbookهای دفاعی (دمو)',
    summary: 'Playbookهای نمونه برای پایش تنش مرزی، اختلال مسیر، قطعی زیرساخت و جنگ روایت.',
    content: `
این playbookها نمونه هستند و فقط برای نمایش UX و ساختار تصمیم‌یار دفاعی استفاده می‌شوند.

1) پایش تنش مرزی
- trigger: افزایش رخدادهای مرزی، ازدحام، اختلال لجستیک
- indicators: تعداد سیگنال‌ها، تداوم زمانی، هم‌گرایی منابع
- تصمیم: افزایش cadence پایش، فعال‌کردن لایه‌های مرتبط، راستی‌آزمایی چندمنبعی

2) پایش اختلال هوایی/دریایی
- trigger: بسته‌شدن مسیر، NOTAM، قطع AIS، تاخیرهای شدید
- indicators: تعداد رخدادها، گلوگاه‌ها، مسیرهای جایگزین

3) هم‌بستگی قطعی زیرساخت
- trigger: قطعی اینترنت/برق/آب، حریق‌های صنعتی، outageهای هم‌زمان
- indicators: فاصله مکانی رخدادها، هم‌زمانی، وابستگی زنجیره‌ای

4) پایش جنگ روایت/اطلاعات نادرست
- trigger: موج هشتگ/روایت، ادعاهای بی‌منبع، تناقض منبع‌ها
- indicators: تکرار ادعا، تنوع منبع، شکاف راستی‌آزمایی
    `.trim(),
    language: 'fa',
    sourceLabel: 'QADR110 Demo Pack',
    sourceType: 'dataset',
    updatedAt: '2026-03-16T00:00:00.000Z',
    tags: ['demo', 'synthetic', 'playbook', 'defensive'],
    provenance: {
      sourceIds: ['demo:qadr-demo-defensive-playbooks'],
      evidenceIds: ['demo:evidence:qadr-demo-defensive-playbooks'],
    },
  },
];

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function getBuiltinKnowledgeDocuments(): KnowledgeDocument[] {
  const docs = isDemoModeEnabled()
    ? [...BUILTIN_DOCUMENTS, ...DEMO_DOCUMENTS]
    : BUILTIN_DOCUMENTS;
  return docs.map((document) => ({ ...document, tags: [...document.tags] }));
}

export function chunkKnowledgeDocument(
  document: KnowledgeDocument,
  maxChars = 700,
): KnowledgeChunk[] {
  const paragraphs = document.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: KnowledgeChunk[] = [];
  let buffer = '';
  let sequence = 0;

  const flush = () => {
    if (!buffer.trim()) return;
    sequence += 1;
    chunks.push({
      id: `${document.id}:chunk:${sequence}`,
      documentId: document.id,
      title: document.title,
      content: buffer.trim(),
      sourceLabel: document.sourceLabel,
      sourceUrl: document.sourceUrl,
      sourceType: document.sourceType,
      updatedAt: document.updatedAt,
      tags: [...document.tags],
      tokenEstimate: estimateTokens(buffer),
      sequence,
      provenance: document.provenance,
    });
    buffer = '';
  };

  for (const paragraph of paragraphs) {
    if ((buffer + '\n\n' + paragraph).trim().length > maxChars) {
      flush();
    }
    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  }

  flush();
  return chunks;
}
