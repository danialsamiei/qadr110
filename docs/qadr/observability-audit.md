# Observability & Auditing — QADR110

این سند حداقل استانداردهای «قابل ممیزی بودن» را برای تحلیل‌ها و اجرای AI در QADR110 توضیح می‌دهد.

## لاگ عملیاتی درون‌برنامه‌ای

QADR110 یک لاگ سبک و محلی برای trace کردن چرخه‌ی تحلیل‌ها نگه می‌دارد:

- مسیر ذخیره‌سازی: `localStorage` با کلید `qadr110-ops-log`
- ظرفیت: حداکثر ۳۰۰ رکورد (Ring buffer)
- هدف: مشاهده‌ی سریع وضعیت jobها، رخدادهای fail/minimize/cancel و متادیتای اجرای AI

## چه چیزهایی لاگ می‌شود؟

- رویدادهای چرخه‌ی job:
  - `wm:analysis-started`
  - `wm:analysis-minimized`
  - `wm:analysis-completed`
  - `wm:analysis-failed`
  - `wm:analysis-cancelled`
- متادیتای AI (بدون ذخیره متن خام کاربر):
  - provider/model/traceId
  - task class و policy label
  - تعداد evidence cardها و تعداد قطعات کانتکست محلی
  - هشدارهای trace (مثل fallback یا demo mode)
  - `queryHash` برای گروه‌بندی بدون ذخیره پرسش خام

## عدم نشت اسرار

- کلیدها/توکن‌ها عمداً لاگ نمی‌شوند.
- یک لایه‌ی redaction در صورت ورود تصادفی مقادیر حساس، کلیدهایی مثل `apiKey`, `token`, `authorization`, `password`, `secret` را با `[REDACTED]` جایگزین می‌کند.

## پنل «پایش و ممیزی»

پنل `ops-audit` برای مرور سریع اجرا در UI اضافه شده است:

- نمایش وضعیت Demo Mode و امکان روشن/خاموش کردن آن (با reload)
- نمایش نمونه‌ای از آمادگی کانکتورها (بر پایه Runtime Feature Toggles)
- نمایش لاگ‌های اخیر با امکان export به JSON و پاکسازی لاگ

