# Migration Notes — Resilience Engine

این pass لایه قدیمی NRC را حذف نکرده است؛ آن را روی یک engine جدید و شفاف‌تر bridge کرده است.

## چه چیزهایی حفظ شد

- panel id قدیمی `nrc-resilience`
- panel id قدیمی `nrc-analytics`
- exportهای عمومی [nrc-resilience.ts](/C:/Users/never/Documents/CodeX/_tmp_qadr110/src/services/nrc-resilience.ts)
  - `calculateNRC`
  - `getNRCScore`
  - `getNRCHistory`
  - `getTopResilientCountries`
  - `getMostVulnerableCountries`
  - `getRegionalAverages`

این یعنی consumerهای قدیمی هنوز می‌توانند روی contract قبلی کار کنند.

## چه چیزهایی جدید شد

- مدل canonical جدید در `src/services/resilience/*`
- ontology ۱۴بعدی به‌جای مدل قدیمی ۶دامنه‌ای
- dashboard فارسی با comparison, stress, report, methodology tab
- Persian report generator
- AI narration grounded on structured resilience data
- launch contract جدید برای dashboard در [resilience.ts](/C:/Users/never/Documents/CodeX/_tmp_qadr110/src/platform/operations/resilience.ts)

## نگاشت backward-compatible

bridge قدیمی NRC این تبدیل را انجام می‌دهد:

- `economic` ← `macroFiscal + currencyExternal + tradeSanctions`
- `social` ← `socialCohesion + foodWater + healthPublicService`
- `governance` ← `governanceInstitutional + informationCognitive + borderSecurity`
- `health` ← `healthPublicService`
- `infrastructure` ← `infrastructure + logisticsSupply + energy + cyberDigital`
- `cognitiveSocial` ← `informationCognitive + socialCohesion + cyberDigital`

## تغییرات UI

- `NRCAnalyticsPanel` حالا داشبورد اصلی resilience است.
- برای ایران، compare set پیش‌فرض شامل همه همسایه‌های زمینی است.
- exportهای `JSON`, `Markdown`, `HTML` مستقیم از UI در دسترس‌اند.

## محدودیت migration

- اگر جایی روی labelهای انگلیسی قدیمی تکیه کرده باشد، باید به خروجی فارسی جدید تطبیق داده شود.
- sourceهای sample اکنون صریحاً sample/نمونه نشان داده می‌شوند.
- report summary دیگر raw band codeهای انگلیسی را به کاربر نشان نمی‌دهد.

## مسیر توسعه بعدی

1. افزودن connectorهای public-indicator واقعی
2. persistence برای report archive و versioned snapshots
3. اتصال chart narration به streaming UI
4. افزودن export server-side برای PDF نهایی
