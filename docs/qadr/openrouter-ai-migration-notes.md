# OpenRouter AI Migration Notes

## دامنه تغییر

این migration لایه AI موجود را گسترش می‌دهد و آن را به یک fabric فارسی، evidence-aware و OpenRouter-first تبدیل می‌کند؛ بدون شکستن معماری فعلی QADR110.

## تغییرات اصلی

### 1. دستیار

- پنل سبک قبلی به workbench فارسی ارتقا پیدا کرد.
- threadها، workflowها، memory noteها و knowledge documentها در `localStorage` نگه‌داری می‌شوند.
- خروجی‌ها حالا باید structured و evidence-aware باشند.

### 2. Backend

- endpoint جدید:
  - `/api/intelligence/v1/assistant`
- orchestration روی:
  - policy task-based
  - retrieval server-side
  - safety guardrails
  - schema validation
  - deterministic fallback

### 3. Routing

- OpenRouter مسیر پیش‌فرض cloud است.
- fallbackها:
  - `Ollama`
  - `vLLM`
  - `Groq`
  - `browser`

### 4. Retrieval

- `BrowserVectorKnowledgeAdapter` برای تجربه local-first
- adapterهای optional:
  - `Weaviate`
  - `Chroma`

### 5. Prompting

- promptها از literalهای پراکنده به registry تایپ‌شده منتقل شدند.
- map context، memory و pinned evidence به prompt composition تزریق می‌شوند.

## env جدید یا مهم‌ترشده

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `OPENROUTER_API_URL`
- `OLLAMA_API_URL`
- `OLLAMA_API_KEY`
- `OLLAMA_MODEL`
- `VLLM_API_URL`
- `VLLM_API_KEY`
- `VLLM_MODEL`
- `WEAVIATE_URL`
- `WEAVIATE_API_KEY`
- `WEAVIATE_COLLECTION`
- `CHROMA_URL`
- `CHROMA_QUERY_URL`
- `CHROMA_COLLECTION`
- `CHROMA_API_KEY`

## regression checks

بعد از هر تغییر روی این لایه این‌ها را اجرا کن:

```bash
npm run typecheck:all
npx tsx --test tests/assistant-schema.test.mts tests/assistant-safety.test.mts tests/query-normalization.test.mts tests/prompt-catalog.test.mts tests/openrouter-policy.test.mts tests/analysis-job-queue.test.mts
npx vite build
```

## نکات migration برای Agent بعدی

- اگر connector واقعی برای یک پلتفرم proprietary نداری، فقط abstraction یا compatibility note اضافه کن.
- اگر task جدید AI اضافه می‌کنی، اول policy و contract آن را در `src/platform/ai` تعریف کن.
- اگر output schema را تغییر می‌دهی، تست `assistant-schema` و fixture ساخت‌یافته را هم به‌روز کن.
- اگر retrieval backend جدید اضافه می‌کنی، graceful degradation بدون env را نگه دار.
