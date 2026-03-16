# AGENTS.md — QADR110

## 1) هویت محصول
- نام canonical: `QADR110`
- دامنه canonical: `https://qadr.alefba.dev`
- ریپوی canonical: `https://github.com/danialsamiei/qadr110`
- زبان پیش‌فرض UX: فارسی (`RTL`)
- کاربرد اصلی: OSINT، رصد ژئوپلیتیک، جنگ روایت، تاب‌آوری، DSS/ESS

## 2) خطوط قرمز
- راهکار نفوذ، دورزدن امنیت، دسترسی غیرمجاز، scraping خلاف قوانین یا bypass محدودیت ارائه‌دهنده‌ها ممنوع است.
- بخش‌های DarkWeb/DarkNet فقط برای رصد دفاعی، تحلیل تهدید قانونی و کاهش ریسک مجازند.
- هر تحلیل بحران/امنیتی باید explainable، audit-friendly و سازگار با حقوق بشر و حقوق بین‌الملل باشد.

## 3) وضعیت Production فعلی
- آدرس عمومی فعال: `https://qadr.alefba.dev`
- سرور عملیاتی فعلی: Ubuntu 24.04 روی `192.168.1.225`
- سرویس production:
  - `qadr110.service`
  - `cloudflared.service`
- اپ وب به صورت static از `dist/` و با `scripts/serve-dist.mjs` روی `0.0.0.0:3000` سرو می‌شود.
- Cloudflare Tunnel دامنه `qadr.alefba.dev` را به `localhost:3000` می‌فرستد.
- نکته مهم:
  - تنظیم ingress اصلی Tunnel در Cloudflare Dashboard منبع truth است.
  - بدون دلیل قوی، config محلی `cloudflared` را overwrite نکن.

## 4) وضعیت Build/Release که الان جواب می‌دهد
- برای sanity check سریع:
  - `npm run typecheck`
  - `npx vite build`
- اسکریپت `npm run build` علاوه بر app، blog را هم build می‌کند و به `rm/cp` وابسته است.
  - روی Linux/Unix مناسب است.
  - روی Windows ممکن است فقط به خاطر shell commandهای Unix-style fail شود، نه به خاطر کد app.
- روی host فعلی Ubuntu یک مورد `Segmentation fault` در `vite build` دیده شده است.
  - تا وقتی علتش برطرف نشده، مسیر release قابل اعتماد این است:
  1. build محلی `dist`
  2. upload `dist` به سرور
  3. restart `qadr110.service`
- env فعلی production frontend:
  - `VITE_VARIANT=full`
  - `VITE_WS_API_URL=https://api.worldmonitor.app`

## 5) معماری کد
- entry اصلی app:
  - `src/main.ts`
  - `src/App.ts`
- wiring layout / panel orchestration:
  - `src/app/panel-layout.ts`
  - `src/config/panels.ts`
- panelها:
  - `src/components/*.ts`
- data/service layer:
  - `src/services/*`
- foundation / interoperability layer:
  - `src/platform/*`
- sidecar / api / desktop:
  - `src-tauri/`
  - `api/`
  - `scripts/`

نکته:
- برای توسعه‌ی capability/connector/domain جدید، ابتدا `src/platform` را توسعه بده و بعد به panel/serviceهای موجود وصلش کن.

## 5.1) AI Fabric فعلی
- panel اصلی AI:
  - `src/components/QadrAssistantPanel.ts`
- client service:
  - `src/services/intelligence-assistant.ts`
  - `src/services/assistant-workspace.ts`
- contracts/policy:
  - `src/platform/ai/*`
- retrieval:
  - `src/platform/retrieval/*`
- backend orchestration:
  - `server/worldmonitor/intelligence/v1/assistant.ts`
  - `api/intelligence/v1/assistant.ts`

قاعده:
- cloud route پیش‌فرض همیشه OpenRouter است.
- اگر connector واقعی برای یک vendor proprietary نداری، فقط abstraction یا compatibility note اضافه کن.
- هر پاسخ AI باید structured، evidence-aware و قابل‌ممیزی بماند.
- اگر output schema را عوض کردی، تست‌ها و fixtureهای `tests/assistant-*` را هم به‌روزرسانی کن.

## 5.2) Interoperability Foundation
- ontology canonical:
  - `src/platform/domain/ontology.ts`
- adapter layer:
  - `src/platform/interoperability/*`
- graph/investigation:
  - `src/platform/investigation/*`
- Palantir-aware compatibility:
  - `src/platform/palantir/*`
- defensive workflow helpers:
  - `src/platform/workflows/*`

قاعده:
- اگر system proprietary است، فقط وقتی integration را native بنام که connector واقعی یا endpoint/credential واقعی داشته باشی.
- در غیر این صورت، از adapter/export/compatibility boundary استفاده کن و limitation را در docs ثبت کن.
- برای ingestion جدید، ابتدا به `IntelligenceOntologyBundle` normalize کن؛ بعد panel یا assistant را به آن وصل کن.
- برای vector/search backendهای بیرونی، نبود config نباید bridge را بشکند؛ فقط باید graceful degrade شود.

## 5.3) Resilience Analytics
- service canonical:
  - `src/services/resilience/*`
- legacy bridge:
  - `src/services/nrc-resilience.ts`
- UI:
  - `src/components/NRCPanel.ts`
  - `src/components/NRCAnalyticsPanel.ts`
- event contract:
  - `src/platform/operations/resilience.ts`

قاعده:
- داده sample را پنهان نکن؛ برچسب synthetic/sample باید باقی بماند.
- panel idهای `nrc-resilience` و `nrc-analytics` را بی‌دلیل عوض نکن.
- برای ایران، baseline compare set باید همه همسایه‌های زمینی را پوشش دهد.
- AI narration در این بخش فقط باید روی structured resilience data سوار شود، نه تولید آزاد عدد.

## 6) قاعده اضافه‌کردن قابلیت UI
برای هر panel یا capability جدید این ترتیب را رعایت کن:
1. فایل panel مستقل در `src/components`
2. ثبت/enable در `src/config/panels.ts`
3. wiring در `src/app/panel-layout.ts`
4. اگر به data تازه نیاز دارد:
   - service مشخص در `src/services`
   - feature gating
   - cache/error handling
5. اگر روی نقشه اثر دارد:
   - map layer یا focus behavior را صریح ثبت کن
6. در پایان:
   - `npm run typecheck`
   - ترجیحاً `npx vite build`

## 7) قاعده اضافه‌کردن datasource / API
- اولویت با منابع رایگان یا free tier است.
- هر datasource جدید باید:
  - legal/public باشد
  - source confidence و freshness مشخص داشته باشد
  - failure mode روشن داشته باشد
  - بدون key هم graceful degradation داشته باشد
- برای APIهای جدید:
  - endpoint جدا
  - cache control
  - timeout
  - retry محدود
  - no secret leakage to frontend

## 8) توصیه عملی برای air / maritime
- هوایی:
  - free-first: `OpenSky` + `FAA`
  - paid/fallback: `FlightAware AeroAPI`
- دریایی:
  - free-first: `AISStream` یا `AISHub`
  - paid/fallback: `MarineTraffic`
- اگر backend self-host شد، این دو domain باید از حالت third-party dependency خارج شوند:
  - flight intelligence
  - maritime/AIS intelligence

## 9) نکات مهمی که همین حالا در repo اعمال شده‌اند
- منوهای بالای analysis اکنون clickable هستند و panel/layer مربوطه را focus می‌کنند.
- پنل‌های زیر در layout فعال شده‌اند:
  - `media-pipelines`
  - `iran-media-matrix`
  - `infra-traffic-cyber`
  - `qadr-assistant`
  - `world-monitoring-hub`
  - `premium-benchmark`
  - `darkweb-defensive`
  - `regional-slices`
  - `maritime-traffic`
- پنل `maritime-traffic` جدید است و summary زنده از AIS / shipping / chokepoints / military vessels می‌دهد.

## 10) Definition of Done
- `npm run typecheck` پاس شود.
- در صورت تغییر frontend، `npx vite build` پاس شود.
- در صورت تغییر AI fabric:
  - `npm run typecheck:all`
  - `npx tsx --test tests/assistant-schema.test.mts tests/assistant-safety.test.mts tests/query-normalization.test.mts tests/prompt-catalog.test.mts tests/openrouter-policy.test.mts tests/analysis-job-queue.test.mts`
- در صورت تغییر interoperability / ontology:
  - `npm run typecheck:all`
  - `npx tsx --test tests/interoperability-registry.test.mts tests/interoperability-importers.test.mts tests/ontology-normalization.test.mts tests/investigation-workflows.test.mts tests/palantir-compatibility.test.mts`
- در صورت تغییر resilience:
  - `npm run typecheck`
  - `npx tsx --test tests/resilience-engine.test.mts tests/resilience-reporting.test.mts tests/nrc-resilience-bridge.test.mts`
  - ترجیحاً `npx vite build`
- اگر release production است:
  - `qadr110.service` بعد از restart `active` باشد.
  - `http://127.0.0.1:3000` باید `200 OK` بدهد.
  - `https://qadr.alefba.dev` باید `200 OK` بدهد.
- تغییر باید با هویت فارسی/RTL و مسیر QADR110 سازگار باشد.
- تغییر نباید خطوط قرمز امنیتی/حقوقی را نقض کند.

## 11) Backlog کوتاه‌مدت
1. self-host کردن backend به‌جای تکیه فعلی بر `api.worldmonitor.app`
2. stream incremental UI برای assistant روی همان route architecture
3. ریشه‌یابی crash سرور در `vite build`
4. تکمیل collectorهای واقعی برای:
   - Instagram
   - X
   - Aparat
   - Telewebion
5. تکمیل workflowهای DSS/ESS و BotOps
6. افزودن test coverage برای panelهای جدید و navigation بالا
7. تکمیل connectorهای واقعی برای TAXII transport، warehouse exchange و Foundry-like tenant APIs در صورت وجود credential معتبر

## 12) قاعده همکاری برای Agent بعدی
- قبل از هر تغییر production-sensitive، state فعلی service و tunnel را بخوان.
- روی tunnel config کورکورانه بازنویسی انجام نده.
- اگر build روی سرور fail شد ولی typecheck و build محلی سالم بود، deployment را با upload `dist` ادامه بده.
- اگر feature جدید panel-based است، از pattern موجود در `panel-layout.ts` و `config/panels.ts` خارج نشو.
