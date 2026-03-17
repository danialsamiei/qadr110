# Black Swan Engine

## هدف
این موتور futures کم‌احتمال اما پراثر را از روی weak signalها، evidenceهای متعارض، structural breakها و stress test فرض‌های baseline استخراج می‌کند.

## ورودی‌ها
- `trigger`, `query`
- `mapContext`
- `localContextPackets`
- `sessionContext`
- `baseScenarioOutput`

## منطق امتیازدهی
- `weakSignalPressure`: فشار سیگنال‌های sparse و کم‌اعتماد
- `contradictionPressure`: شدت evidenceهای متعارض
- `structuralBreakPressure`: نشانه‌های shutdown / closure / collapse / regime shift
- `blindSpotPressure`: ریسک پوشش ناکافی baseline
- `baselineCoverage`: غنای داده و پوشش سناریوهای پایه

شدت هر candidate از ترکیب محافظه‌کارانه‌ی این عوامل با `impact_score`, `uncertainty_level` و فاصله از احتمال baseline به‌دست می‌آید.

## خروجی
- `candidates[]`
- `watchlist[]`
- `assumptionStressTests[]`
- `structuredOutput`
- `contextPackets[]`

## نمونه فشرده
```json
{
  "title": "قوی سیاه پیرامون «تشدید امنیتی منطقه‌ای»",
  "low_probability_reason": "سیگنال‌های پشتیبان sparse و تا حدی متناقض‌اند.",
  "high_impact_reason": "اثر هم‌زمان ژئوپلیتیکی، اقتصادی و زیرساختی دارد.",
  "monitoring_status": "rising"
}
```

## caveat
- این موتور explainable و heuristic است، نه مدل احتمالاتی رسمی.
- برآوردهای severity عمدا محافظه‌کارانه‌اند.
- هر candidate باید با watchlist و evidence trail دوباره راستی‌آزمایی شود.
