# OpenRouter-First AI Fabric

این سند لایه‌ی AI جدید QADR110 را توضیح می‌دهد؛ لایه‌ای که روی معماری فعلی panel/service/event سوار شده و جایگزین greenfield app نشده است.

## هدف

- OpenRouter به‌عنوان درگاه اصلی تمام عملیات cloud LLM
- حفظ fallbackهای محلی یا self-hosted مثل `Ollama`، `vLLM` و `browser inference`
- دستیار فارسی، evidence-aware، map-aware و قابل‌ممیزی
- تفکیک اجباری `واقعیت‌های مشاهده‌شده`، `استنباط تحلیلی`، `سناریوها`، `عدم‌قطعیت‌ها` و `توصیه‌های دفاعی`

## اجزای اصلی

- `src/platform/ai/contracts.ts`
  - policy و routing contractهای task-based
- `src/platform/ai/policy.ts`
  - policyهای OpenRouter-first برای `briefing`, `extraction`, `forecasting`, `scenario-building`, `resilience-analysis`, `translation`, `structured-json`
- `src/platform/ai/router.ts`
  - trace metadata و route summary مشترک بین client/server
- `src/platform/ai/assistant-contracts.ts`
  - contractهای thread, message, evidence card, structured output, memory, workflow
- `src/platform/ai/assistant-schema.ts`
  - JSON schema و coercion امن برای خروجی مدل
- `src/platform/ai/assistant-safety.ts`
  - redirection/refusal برای offensive cyber, intrusion, kinetic-targeting, weaponization
- `src/platform/retrieval/*`
  - ingestion, chunking, query normalization و adapterهای Weaviate/Chroma/browser-vector
- `server/worldmonitor/intelligence/v1/assistant.ts`
  - orchestration backend برای دستیار فارسی
- `docs/qadr/local-first-ai-orchestrator.md`
  - جزئیات graph جدید local-first، session memory و ابزارهای grounding
- `src/components/QadrAssistantPanel.ts`
  - workbench فارسی با thread, workflow, evidence, memory, export و map context

## جریان اجرا

1. تحلیلگر در `QadrAssistantPanel` یک thread یا workflow را باز می‌کند.
2. state محلی از `assistant-workspace.ts` بارگذاری می‌شود.
3. query، memory noteها، pinned evidence و map context به `runPersianAssistant()` داده می‌شوند.
4. `BrowserVectorKnowledgeAdapter` اسناد built-in و user-provided را ingest/search می‌کند.
5. payload به `/api/intelligence/v1/assistant` ارسال می‌شود.
6. backend روی همان query retrieval تکمیلی lexical/Weaviate/Chroma را اجرا می‌کند.
7. safety guardrail درخواست را ارزیابی می‌کند.
8. بر اساس `AiTaskClass`، policy مناسب و OpenRouter provider metadata انتخاب می‌شود.
9. پاسخ مدل فقط در صورت JSON معتبر پذیرفته می‌شود؛ در غیر این صورت fallback قطعی retrieval-first برگردانده می‌شود.
10. خروجی نهایی با evidence cards، trace metadata، confidence و time context به UI بازمی‌گردد.

## task routing

- `briefing`
  - OpenRouter strategic-default
- `extraction`
  - OpenRouter edge-compact + structured output + response healing
- `forecasting`
  - OpenRouter strategic-default با timeout بیشتر
- `scenario-building`
  - OpenRouter strategic-default
- `resilience-analysis`
  - OpenRouter strategic-default
- `translation`
  - OpenRouter edge-compact
- `structured-json`
  - OpenRouter edge-compact + schema enforcement

اگر OpenRouter در دسترس نباشد:

- `Ollama`
- `vLLM`
- `Groq`
- `browser`

به‌ترتیب policy انتخاب می‌شوند.

## Retrieval و Knowledge Packs

retrieval فعلی این منابع را پشتیبانی می‌کند:

- built-in docs و guardrail packهای خود پروژه
- user reportهای بارگذاری‌شده از UI
- memory noteهای تحلیلی workspace
- vector backendهای open-source از طریق abstraction:
  - `Weaviate`
  - `Chroma`
  - `browser-vector`

محدودیت مهم:

- برای backendهای proprietary فقط abstraction یا compatibility note داده می‌شود؛ integration بومی ادعا نمی‌شود مگر connector واقعی در repo موجود باشد.

## Analyst UX

`QadrAssistantPanel` اکنون این قابلیت‌ها را دارد:

- threadهای ماندگار
- workflowهای ذخیره‌شده
- domain modeهای تخصصی
- map-aware prompt packs
- evidence sidebar و pin/unpin
- workspace memory
- export به `JSON`, `Markdown`, `HTML/PDF-friendly`
- background execution با analysis queue
- compact/fullscreen mode

## Safety و Explainability

هر پاسخ ساخت‌یافته باید این اجزا را داشته باشد:

- observed facts
- analytical inference
- scenarios
- uncertainties
- recommendations
- resilience narrative

همراه با:

- evidence cards
- provenance
- confidence
- time context
- trace metadata

## ارزیابی و تست

تست‌های فعلی این فاز:

- `tests/assistant-schema.test.mts`
- `tests/assistant-safety.test.mts`
- `tests/query-normalization.test.mts`
- `tests/prompt-catalog.test.mts`
- `tests/openrouter-policy.test.mts`
- `tests/analysis-job-queue.test.mts`

fixtureها:

- `tests/fixtures/assistant-eval-cases.json`
- `tests/fixtures/assistant-structured-sample.json`

## محدودیت‌های فعلی

- provider layer از streaming پشتیبانی می‌کند، اما UI هنوز پاسخ stream را به‌صورت incremental render نمی‌کند؛ endpoint فعلی پاسخ نهایی JSON برمی‌گرداند.
- persistence فعلی workspace در `localStorage` است و هنوز server-side memory store ندارد.
- retrieval server-side برای Weaviate/Chroma فقط وقتی env معتبر تنظیم شده باشد فعال می‌شود.
