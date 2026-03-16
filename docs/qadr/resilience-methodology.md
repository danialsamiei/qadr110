# موتور تاب‌آوری QADR110

این سند روش فعلی موتور تاب‌آوری QADR110 را توضیح می‌دهد. هدف آن ساخت یک امتیاز explainable، evidence-aware و audit-friendly است؛ نه یک شاخص black-box با دقت ظاهری.

## دامنه کشورها

مجموعه پایه فعلی شامل این کشورهاست:

- ایران
- عراق
- ترکیه
- ارمنستان
- آذربایجان
- ترکمنستان
- افغانستان
- پاکستان
- اسرائیل
- ایالات متحده
- روسیه
- چین
- برزیل
- هند
- ژاپن

برای ایران، baseline comparison set به‌صورت پیش‌فرض همه همسایه‌های زمینی را شامل می‌شود.

## ابعاد تاب‌آوری

نسخه فعلی ۱۴ بعد دارد:

1. کلان‌اقتصادی و مالیه عمومی
2. ارزی و تراز خارجی
3. تجاری و تحریمی
4. انرژی
5. غذا و آب
6. زیرساخت
7. لجستیک و زنجیره تامین
8. انسجام اجتماعی
9. حکمرانی و نهادی
10. اطلاعاتی و شناختی
11. سایبری و دیجیتال
12. سلامت و خدمات عمومی
13. محیط‌زیستی و اقلیمی
14. مرزی و امنیتی

وزن‌ها ثابت و شفاف‌اند و در [data.ts](/C:/Users/never/Documents/CodeX/_tmp_qadr110/src/services/resilience/data.ts) تعریف شده‌اند.

## مدل داده

پیاده‌سازی canonical در این مسیرهاست:

- [types.ts](/C:/Users/never/Documents/CodeX/_tmp_qadr110/src/services/resilience/types.ts)
- [data.ts](/C:/Users/never/Documents/CodeX/_tmp_qadr110/src/services/resilience/data.ts)
- [engine.ts](/C:/Users/never/Documents/CodeX/_tmp_qadr110/src/services/resilience/engine.ts)
- [reporting.ts](/C:/Users/never/Documents/CodeX/_tmp_qadr110/src/services/resilience/reporting.ts)

هر snapshot کشور شامل این‌هاست:

- dimension scoreها با methodology، coverage، freshness و uncertainty
- composite score
- تاریخچه ۱۲ماهه
- stress matrix
- spillover linkها
- source summary
- اخطارهای missing/stale coverage

## منابع داده

نسخه فعلی دو connector فعال دارد:

1. `sample-baseline`
   این منبع synthetic است و فقط برای baseline comparability استفاده می‌شود.
2. `internal-signals`
   این منبع از سیگنال‌های نرمال‌شده داخلی QADR110 مثل CII، اعتراض‌ها، اختلال‌ها، aviation disruption، AIS disruption و تهدیدات سایبری استفاده می‌کند.

قاعده مهم:

- داده synthetic پنهان نمی‌شود.
- داده missing به نمره دقیق جعلی تبدیل نمی‌شود.
- سهم sample و سهم live جداگانه نشان داده می‌شوند.

## روش امتیازدهی

امتیاز هر بعد از ترکیب baseline نمونه و penalty/adjustmentهای شفاف روی سیگنال‌های داخلی ساخته می‌شود. این penaltyها deterministic هستند و در [engine.ts](/C:/Users/never/Documents/CodeX/_tmp_qadr110/src/services/resilience/engine.ts) قابل مشاهده‌اند.

قواعد کلیدی:

- امتیازها integer و clamp شده‌اند.
- uncertainty band برای هر بعد و شاخص کل نمایش داده می‌شود.
- freshness و coverage بخشی از metadata هستند، نه چیزی که پنهان شود.
- pressure live فقط اثر تعدیلی دارد؛ نه اینکه بدون provenance یک نمره جدید اختراع کند.

## سناریوها و stress test

چهار سناریوی پایه فعلی:

- شوک تحریمی و مالی
- تشدید مرزی و سرریز امنیتی
- اختلال انرژی و گلوگاه حمل
- فشار اقلیمی و تنش آب/غذا

هر سناریو:

- time horizon دارد
- stress by dimension دارد
- monitoring signal دارد
- روی هر کشور delta شفاف تولید می‌کند

## نمودارها و خروجی‌ها

داشبورد [NRCAnalyticsPanel.ts](/C:/Users/never/Documents/CodeX/_tmp_qadr110/src/components/NRCAnalyticsPanel.ts) این viewها را ارائه می‌کند:

- time-series
- radar
- ranked bars
- heatmap
- comparison table
- slope view
- spillover network
- stress matrix

گزارش‌ها در [reporting.ts](/C:/Users/never/Documents/CodeX/_tmp_qadr110/src/services/resilience/reporting.ts) تولید می‌شوند و سه export دارند:

- JSON
- Markdown
- HTML مناسب برای PDF-friendly rendering

## AI narration

روایت AI فقط روی داده ساخت‌یافته سوار می‌شود و در [ai.ts](/C:/Users/never/Documents/CodeX/_tmp_qadr110/src/services/resilience/ai.ts) پیاده‌سازی شده است.

محدودیت فعلی:

- AI حق تولید عدد جدید ندارد.
- narrative باید از report و evidence cardها تغذیه شود.
- citation جعلی یا نسبت‌دادن بدون evidence مجاز نیست.

## نقاط اتصال

تحلیل تاب‌آوری از این مسیرها launch می‌شود:

- country page
- map context menu
- assistant panel
- scenario workbench
- dynamic prompt actions

event contract مربوطه در [resilience.ts](/C:/Users/never/Documents/CodeX/_tmp_qadr110/src/platform/operations/resilience.ts) تعریف شده است.

## محدودیت‌های فعلی

- baseline عمومی هنوز seeded/sample است و باید به تدریج با connectorهای public-indicator واقعی تکمیل شود.
- history فعلی comparative/synthetic trend است، نه series رسمی time-stamped از همه کشورها.
- score باید به‌عنوان decision-support خوانده شود، نه رتبه قطعی و نهایی.
