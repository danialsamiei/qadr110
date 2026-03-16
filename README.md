# QADR110

سامانه‌ی **QADR110** یک پلتفرم پیشرفته رصد، تحلیل و تصمیم‌سازی داده‌محور در حوزه OSINT، تنش‌های ژئوپلیتیک، تاب‌آوری ملی، جنگ روایت و مدیریت بحران است.

> دامنه عملیاتی پیشنهادی: `https://qadr.alefba.dev`

---

## هویت رسمی محصول

- نام محصول کاربرمحور: **QADR110**
- دامنه canonical: `https://qadr.alefba.dev`
- ریپوی canonical: `https://github.com/danialsamiei/qadr110`

## چارچوب استفاده ایمن و قانونی

این سامانه صرفاً برای تحلیل داده‌های عمومی، پژوهش علمی، کاهش ریسک و کمک به تصمیم‌سازی صلح‌محور طراحی شده است. هرگونه استفاده برای نفوذ، دورزدن کنترل ارائه‌دهنده‌ها، دسترسی غیرمجاز، یا اقدام عملیاتی غیرقانونی ممنوع است.

## قابلیت‌های کلیدی

- داشبورد لحظه‌ای رصد اخبار، رویدادها و سیگنال‌های ژئوپلیتیک
- تحلیل چندبعدی تاب‌آوری: ملی، اقتصادی، نظامی و شناختی
- داشبورد و گزارش‌ساز تاب‌آوری با ۱۴ بعد، stress test، spillover view و روایت فارسی مبتنی بر evidence
- رصد جنگ رسانه‌ای و روایت‌ها با تمرکز بر سوگیری، تناقض و استانداردهای دوگانه
- کارگاه هوشمند فارسی با thread، workflow، evidence card، memory و export
- کارگاه ژئو-تحلیل مبتنی بر نقشه با right-click، پیشنهادهای پویا، job chip و handoff به دستیار/سناریوپرداز
- پشتیبانی از زبان فارسی (RTL) به‌عنوان تجربه پیش‌فرض
- اتصال به منابع متعدد OSINT (رایگان و پولی) با معماری افزونه‌پذیر
- لایه interoperability و ontology نرمال‌شده برای ingest/export و graph workflows
- آماده اتصال به Telegram Bot و Bale Bot برای هشدار و گزارش

---

## ورود سامانه

در نسخه فعلی وب، یک **گیت ورود پایه** فعال است:

- نام کاربری: `Hojjat`
- رمز عبور: `Mojtaba`

> نکته امنیتی: این روش برای محیط عملیاتی کافی نیست. برای Production از SSO/Identity Provider و توکن‌های امن استفاده کنید.

---

## معماری پیشنهادی برای استقرار

### استقرار روی سرور Ubuntu + Cloudflared Tunnel

1. اجرای سرویس اصلی روی پورت داخلی (مثلاً `localhost:4173`)
2. تنظیم Cloudflared ingress برای `qadr.alefba.dev`
3. فعال‌سازی TLS/Zero Trust در داشبورد Cloudflare
4. مانیتورینگ با Grafana + Prometheus
5. ذخیره‌سازی شاخص‌ها/بردارها با Redis + Qdrant

نمونه ingress:

```yaml
ingress:
  - hostname: qadr.alefba.dev
    service: http://localhost:4173
  - service: http_status:404
```

---

## یکپارچه‌سازی AI

QADR110 برای تحلیل‌های پیشرفته قابلیت اتصال به چندین ارائه‌دهنده AI را دارد:

- OpenRouter (gateway اصلی و پیش‌فرض برای تمام cloud LLM workloadها)
- Ollama / vLLM (پردازش محلی)
- Groq (fallback ابری)
- مدل‌های vendorهای دیگر فقط از مسیر OpenRouter یا OpenAI-compatible abstraction قابل‌استفاده‌اند، نه به‌عنوان integration بومیِ مستقل

### AI Fabric فعلی

- policy task-based برای `briefing`, `extraction`, `forecasting`, `scenario-building`, `resilience-analysis`, `translation`, `structured-json`
- retrieval چندلایه با built-in knowledge packها، اسناد کاربر، memory noteها و connectorهای `Weaviate/Chroma`
- guardrail دفاعی/قانونی با refusal و redirect برای offensive cyber، intrusion، weaponization و kinetic targeting
- trace metadata، confidence، provenance و time context برای هر پاسخ
- endpoint اختصاصی دستیار: `/api/intelligence/v1/assistant`

### پیشنهاد عملی

- تعریف پروفایل تحلیل: `fast`, `deep`, `policy`, `crisis`
- تعریف fallback خودکار از Cloud به Local
- ثبت trace هر تحلیل برای ممیزی تصمیم

---

## ربات‌ها و هشدارها

### Telegram
- دریافت هشدارهای فوری
- ارسال خلاصه تحلیلی دوره‌ای
- دریافت فرمان‌های تحلیلی

### Bale.ai
- ارسال هشدار داخلی
- گزارش‌های ساخت‌یافته متنی/جدولی

---

## توسعه محلی

```bash
npm install
npm run dev
npm run typecheck
```

## Demo Mode (دمو)

برای اجرای دمو بدون کلیدهای بیرونی:

- در `.env.local` مقدار `VITE_DEMO_MODE=1` بگذارید، یا با `?demo=1` سامانه را باز کنید.

در حالت دمو:

- مسیر AI به‌صورت deterministic fixture اجرا می‌شود (بدون تماس شبکه برای تولید متن).
- بسته‌های دانش (knowledge packs) دمو فعال می‌شوند و خروجی‌ها صریحاً با برچسب `synthetic` مشخص می‌شوند.
- دکمه `نمونه دمو` در پنل دستیار و دکمه `بارگذاری نمونه دمو` در کارگاه ژئو-تحلیل برای تولید خروجی نمونه در دسترس است.

## تست‌های AI این فاز

```bash
npm run typecheck:all
npx tsx --test tests/assistant-schema.test.mts tests/assistant-safety.test.mts tests/query-normalization.test.mts tests/prompt-catalog.test.mts tests/openrouter-policy.test.mts tests/analysis-job-queue.test.mts tests/geo-analysis-workspace.test.mts
```

## تست‌های Interoperability این فاز

```bash
npx tsx --test tests/interoperability-registry.test.mts tests/interoperability-importers.test.mts tests/ontology-normalization.test.mts tests/investigation-workflows.test.mts tests/palantir-compatibility.test.mts
```

## تست‌های Resilience این فاز

```bash
npx tsx --test tests/resilience-engine.test.mts tests/resilience-reporting.test.mts tests/nrc-resilience-bridge.test.mts
```

## Change Log

- یادداشت انتشار این استقرار production: [docs/production-release-2026-03-16.md](./docs/production-release-2026-03-16.md)
- تاریخچه عمومی پروژه: [CHANGELOG.md](./CHANGELOG.md)
- داخل خود داشبورد هم یک پنل `Change Log / یادداشت انتشار` برای مرور سریع release notes اضافه شده است.

## Foundation Docs

- dossier بنیادین این pass: [docs/qadr/foundation-implementation-dossier.md](./docs/qadr/foundation-implementation-dossier.md)
- یادداشت‌های migration: [docs/qadr/foundation-migration-notes.md](./docs/qadr/foundation-migration-notes.md)
- سند AI fabric جدید: [docs/qadr/openrouter-ai-fabric.md](./docs/qadr/openrouter-ai-fabric.md)
- یادداشت migration لایه AI: [docs/qadr/openrouter-ai-migration-notes.md](./docs/qadr/openrouter-ai-migration-notes.md)
- سند foundation برای interoperability: [docs/qadr/interoperability-foundation.md](./docs/qadr/interoperability-foundation.md)
- ماتریس compatibility و محدودیت integration: [docs/qadr/interoperability-compatibility-matrix.md](./docs/qadr/interoperability-compatibility-matrix.md)
- یادداشت migration لایه interoperability: [docs/qadr/interoperability-migration-notes.md](./docs/qadr/interoperability-migration-notes.md)
- سند کارگاه ژئو-تحلیل نقشه‌محور: [docs/qadr/map-geo-analytic-workspace.md](./docs/qadr/map-geo-analytic-workspace.md)
- یادداشت migration لایه نقشه/ژئو-تحلیل: [docs/qadr/map-geo-analytic-migration-notes.md](./docs/qadr/map-geo-analytic-migration-notes.md)
- سند روش‌شناسی تاب‌آوری: [docs/qadr/resilience-methodology.md](./docs/qadr/resilience-methodology.md)
- یادداشت migration لایه تاب‌آوری: [docs/qadr/resilience-migration-notes.md](./docs/qadr/resilience-migration-notes.md)
- ADRها: [docs/qadr/adr/0001-interoperability-foundation.md](./docs/qadr/adr/0001-interoperability-foundation.md), [docs/qadr/adr/0002-openrouter-primary-routing.md](./docs/qadr/adr/0002-openrouter-primary-routing.md)

---

## نقشه راه توسعه

- موتور اصالت‌سنجی خبر و امتیاز اطمینان چندمنبعی
- تحلیل روند شبکه‌های اجتماعی (Instagram/Google/X/TikTok/Facebook)
- تحلیل گروه‌بندی‌های بین‌المللی (G8, NATO, BRICS, OPEC, NAM, EU, Global North/South)
- Workbooks / Notebooks / Repository-based reporting
- تصمیم‌یار سیاستی با سناریوهای خوش‌بینانه/پایه/بدبینانه

---

## مجوز

این پروژه تحت مجوز `AGPL-3.0` منتشر می‌شود.
