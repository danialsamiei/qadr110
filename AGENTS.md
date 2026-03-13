# AGENT.md — QADR110

## 1) هدف سامانه
QADR110 یک سامانه رصد و تحلیل چندمنظوره برای:
- World Monitor
- World Medias Monitor
- World Conflicts Monitor
- World Cognitive War Monitor
- World National & Universal Resilience Monitor

با رویکرد DSS/ESS است.

---

## 2) اصول کاری برای توسعه‌دهنده/Agent
1. دامنه اصلی و canonical فقط: `qadr.alefba.dev`
2. ریپوی اصلی فقط: `danialsamiei/qadr110`
3. زبان پیش‌فرض UX: فارسی (RTL)
4. هر قابلیت جدید باید تا حد ممکن:
   - قابل ممیزی (Audit-friendly)
   - قابل توضیح (Explainable)
   - قابل استقرار نیمه‌بلادرنگ (Near realtime)
   باشد.

---

## 3) خطوط قرمز امنیتی و حقوقی
- ارائه راهکار نفوذ، دورزدن امنیت، یا دسترسی غیرمجاز ممنوع است.
- بخش‌های DarkWeb/DarkNet صرفاً برای رصد دفاعی، کاهش ریسک، و تحلیل تهدید قانونی مجازند.
- هر نوع تحلیل بحران/امنیتی باید با ملاحظات حقوق بشر و حقوق بین‌الملل همسو باشد.

---

## 4) معماری پیشنهادی پایپلاین
### 4.1 Ingest
- Telegram channels/groups (public/legal)
- X/Twitter pages
- Instagram public pages
- Web news/RSS
- GDELT / NetBlocks / Google Trends

### 4.2 Normalize
- نرمال‌سازی زبان، زمان، موجودیت‌ها
- رفع تکرار
- برچسب‌گذاری منبع و گرایش رسانه‌ای

### 4.3 Analyze
- روایت/سوگیری/تناقض
- ریسک/تنش/تاب‌آوری
- همگرایی چندمنبعی

### 4.4 Score
- Reliability score
- Narrative polarity
- Escalation score
- Confidence score

### 4.5 Decide (DSS/ESS)
- هشدار
- سناریوسازی
- گزارش تصمیم‌یار

---

## 5) استاندارد توسعه
- TypeScript-first
- ماژولار و قابل تست
- برای UI جدید، پنل مستقل + ثبت در `config/panels.ts` + wiring در `panel-layout.ts`
- برای هر ورودی جدید API، endpoint جدا + CORS امن + cache control

---

## 6) اولویت‌های توسعه فعلی
1. تکمیل پایپلاین رسانه‌ای ایران/اسرائیل
2. بهبود تحلیل چندمنبعی روایت
3. اتصال Workflowها به BotOps (Telegram/Bale)
4. ارتقای داشبورد شهری/استانی و برش منطقه‌ای

---

## 7) تعریف Done
- Typecheck موفق
- UI قابل مشاهده
- سند راهبری/عملیاتی به‌روز
- عدم نقض امنیت/قوانین
