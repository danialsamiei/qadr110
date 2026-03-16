# ADR 0003: OpenRouter-First Persian AI Fabric

## Status

Accepted

## Context

QADR110 قبلاً لایه AI پراکنده و سبک‌تری داشت که برای یک assistant راهبردی فارسی، evidence-aware و map-aware کافی نبود. در عین حال، کدپایه فعلی panel-based و web/Tauri parity نباید شکسته می‌شد.

## Decision

- OpenRouter درگاه اصلی cloud LLM است.
- fallbackهای محلی یا self-hosted حفظ می‌شوند.
- UI پیش‌فرض assistant فارسی و RTL باقی می‌ماند.
- outputها باید structured، evidence-aware و audit-friendly باشند.
- هر integration بیرونی با connector واقعی یا abstraction vendor-neutral ارائه می‌شود؛ ادعای integration بومی بدون connector مجاز نیست.

## Consequences

### Positive

- task routing شفاف و قابل‌ممیزی می‌شود.
- safety و fallback در یک orchestration یکپارچه جمع می‌شوند.
- retrieval و memory بدون ساخت app موازی توسعه می‌یابند.
- panel assistant می‌تواند روی همان event/state contractهای فعلی رشد کند.

### Negative

- endpoint فعلی هنوز stream UI incremental ندارد.
- persistence workspace هنوز local-first است و server memory shared ندارد.
- کیفیت retrieval بیرونی به تنظیم صحیح Weaviate/Chroma بستگی دارد.
