# گزارش مقایسه QADR110 با WorldMonitor و Palantir

> تاریخ تهیه: ۲۰۲۶-۰۳-۱۶
> نسخه QADR110: 2.6.1
> نسخه WorldMonitor: v2.5.23

---

## ۱. جدول مقایسه کامل QADR110 و WorldMonitor

| ویژگی | QADR110 | WorldMonitor |
|---|---|---|
| **هدف اصلی** | رصد OSINT + تاب‌آوری ملی + جنگ روایت + مدیریت بحران | رصد اطلاعاتی جهانی + اخبار + ردیابی نظامی/دریایی |
| **زبان پیش‌فرض** | فارسی (RTL) به‌عنوان تجربه پیش‌فرض | انگلیسی (پشتیبانی از ۲۱ زبان با RTL) |
| **فریم‌ورک UI** | Vanilla TypeScript + Preact | Vanilla TypeScript |
| **نقشه سه‌بعدی** | Globe.gl / Three.js | Globe.gl / Three.js |
| **نقشه تخت WebGL** | MapLibre GL + deck.gl | MapLibre GL + deck.gl |
| **لایه‌های نقشه** | ۴۵+ لایه داده | ۴۵ لایه داده |
| **تحلیل تاب‌آوری** | ۱۴ بعد + stress test + spillover + peer comparison + گزارش فارسی evidence-based | ندارد |
| **منوی راست‌کلیک نقشه** | ژئو-تحلیل پیشرفته با ۹-۱۲+ پیشنهاد هوشمند AI-driven | محدود / ساده |
| **کارگاه ژئو-تحلیل** | دارد (job queue, result pinning, handoff به دستیار/سناریوپرداز) | ندارد |
| **سازگاری Palantir** | لایه ontology mapping + Foundry boundary API + resource IDs + Conjure | ندارد |
| **کارگاه هوشمند فارسی** | دارد (thread, workflow, evidence card, memory, export) | ندارد |
| **تحلیل جنگ روایت** | دارد (سوگیری، تناقض، استانداردهای دوگانه، media pipeline) | محدود (RSS aggregation) |
| **شاخص بی‌ثباتی (CII)** | دارد | دارد (Country Instability Index 0-100) |
| **هوش مصنوعی** | OpenRouter (primary) + Ollama/vLLM (local) + Groq (fallback) با AI Fabric task-based | Ollama + Groq + OpenRouter + Transformers.js |
| **AI Fabric** | policy task-based: briefing, extraction, forecasting, scenario-building, resilience-analysis, translation, structured-json | ساده‌تر / بدون policy framework |
| **فیدهای RSS** | ۴۳۵+ فید در ۱۵ دسته‌بندی | ۴۳۵+ فید در ۱۵ دسته‌بندی |
| **ردیابی پروازهای نظامی** | دارد | دارد (با ۲۲۰+ پایگاه نظامی) |
| **ردیابی دریایی (AIS)** | دارد | دارد |
| **رصد اعتراضات** | دارد | دارد |
| **تهدیدات سایبری** | دارد (Darkweb Defensive Panel) | دارد (BGP anomaly detection) |
| **رصد زلزله/بلایا** | دارد | دارد |
| **بازار مالی** | دارد (ETF, stock analysis, backtest) | دارد (۹۲ بورس، ارز دیجیتال، کالا) |
| **تحلیل سناریو** | دارد (خوش‌بینانه/پایه/بدبینانه با trigger و spillover) | محدود |
| **سناریوپرداز** | دارد (ScenarioPlannerPanel) | ندارد |
| **ربات تلگرام** | آماده اتصال (telegram package) | ندارد (فقط Intel panel خواندنی) |
| **ربات بله (Bale.ai)** | آماده اتصال | ندارد |
| **Protocol Buffers** | دارد | دارد (۹۲ پروتو، ۲۲ سرویس) |
| **دسکتاپ** | Tauri 2 (Rust) | Tauri 2 (Rust) با Node.js sidecar |
| **PWA** | دارد | دارد |
| **استقرار** | Vercel + Cloudflare Tunnel + Docker | Vercel Edge Functions (60+) + Railway + Docker |
| **مانیتورینگ** | Grafana + Prometheus + Sentry | Sentry |
| **ذخیره‌سازی** | Redis (Upstash) + Qdrant (بردار) + Convex | Redis (Upstash) + Convex |
| **تست‌ها** | Unit + E2E + Palantir compatibility + Resilience + AI safety | Unit + E2E + Visual regression |
| **Interoperability** | لایه ontology نرمال‌شده + import/export + graph workflows | ندارد |
| **تحلیل منطقه خلیج فارس** | دارد (GulfEconomiesPanel, IranMediaMatrix) | عمومی |
| **تحلیل استراتژیک فارسی** | دارد (PersianStrategicPanel) | ندارد |
| **امنیت AI** | guardrail دفاعی/قانونی (refusal/redirect) | محدود |
| **knowledge packs** | دارد (built-in + user docs + memory notes + Weaviate/Chroma) | محدود |
| **ستاره GitHub** | در حال توسعه | ~۳۹.۳K ستاره |
| **مجوز** | AGPL-3.0 | AGPL-3.0 |
| **واریانت‌ها** | تک‌واریانت تخصصی | ۵ واریانت (world, tech, finance, commodity, happy) |

---

## ۲. ابزارهای Palantir در QADR110

### ۲.۱ وضعیت ابزارهای عمومی Palantir

ابزارهای عمومی Palantir در GitHub (۲۶۶ ریپو) عمدتا ابزارهای توسعه‌دهنده هستند:

| ابزار Palantir | نوع | وضعیت در QADR110 |
|---|---|---|
| Blueprint (React UI toolkit) | فریم‌ورک UI | استفاده نشده (QADR از Vanilla TS استفاده می‌کند) |
| TSLint | Linter | منسوخ‌شده / استفاده نشده |
| Plottable (D3 charts) | چارت | استفاده نشده (QADR از D3 مستقیم استفاده می‌کند) |
| Gotham Platform Python SDK | SDK | سازگاری غیرمستقیم از طریق لایه palantir/ |
| Foundry OSDK | SDK | سازگاری از طریق foundry-boundary.ts |

### ۲.۲ لایه سازگاری Palantir در QADR110

QADR110 لایه سازگاری اختصاصی با اکوسیستم Palantir Gotham/Foundry پیاده‌سازی کرده:

| فایل | عملکرد |
|---|---|
| `src/platform/palantir/ontology-mapping.ts` | نگاشت bundleهای ontology به ObjectTypes و RID سازگار با Foundry |
| `src/platform/palantir/foundry-boundary.ts` | کلاینت API سازگار با Foundry (GET/POST با Bearer token) |
| `src/platform/palantir/resource-ids.ts` | ساخت RIDهای Foundry-like برای اشیای QADR |
| `src/platform/palantir/conjure-boundary.ts` | سازگاری با لایه Conjure |
| `src/platform/palantir/python-sidecar.ts` | Sidecar پایتونی برای ارتباط با ابزارهای Palantir |
| `src/platform/interoperability/contracts.ts` | قراردادهای `PalantirCompatibilityEnvelope` |
| `src/platform/interoperability/adapters.ts` | آداپتورهای interoperability |
| `tests/palantir-compatibility.test.mts` | تست‌های سازگاری |

**قابلیت‌های کلیدی:**
- تبدیل ontology داخلی QADR به فرمت ObjectType/RID سازگار با Foundry
- امکان اتصال مستقیم به instance واقعی Foundry (در صورت تنظیم credentials)
- Envelope سازگاری با metadata و هشدارها
- تست خودکار سازگاری

### ۲.۳ مقایسه با Palantir Gotham/Foundry

| قابلیت Palantir | معادل در QADR110 |
|---|---|
| Ontology (Object Types, Links) | `IntelligenceOntologyBundle` با entities, events, documents, relationships |
| Resource Identifiers (RIDs) | `buildFoundryLikeRid()` - تولید RID سازگار |
| Geospatial Analysis | کارگاه ژئو-تحلیل + لایه‌های نقشه |
| Cross-domain correlation | `signalAggregator` + `buildGeoContextSnapshot` |
| Conjure APIs | `conjure-boundary.ts` |
| Python integration | `python-sidecar.ts` |
| Mission planning | `ScenarioPlannerPanel` |
| Risk scoring | CII + Resilience Engine (۱۴ بعد) |
| Data fusion | لایه interoperability + import/export |

---

## ۳. ارزیابی سطح توسعه‌یافتگی QADR110

### نقاط قوت QADR110 نسبت به WorldMonitor:

1. **تاب‌آوری چندبعدی**: تنها پلتفرم متن‌باز با ۱۴ بعد تاب‌آوری، stress test و spillover analysis
2. **کارگاه ژئو-تحلیل**: منوی راست‌کلیک هوشمند با AI-driven suggestions
3. **سازگاری Palantir**: لایه ontology و API boundary برای تعامل با اکوسیستم سازمانی
4. **تمرکز فارسی‌زبان**: تنها ابزار OSINT با تجربه فارسی first-class
5. **AI Fabric پیشرفته**: policy-based routing، guardrails، trace و provenance
6. **تحلیل جنگ روایت**: تشخیص سوگیری و استاندارد دوگانه

### نقاط قوت WorldMonitor نسبت به QADR110:

1. **جامعه کاربری**: ۳۹K+ ستاره، ۲M+ کاربر، ۶۶ مشارکت‌کننده
2. **واریانت‌های متعدد**: ۵ داشبورد تخصصی از یک codebase
3. **پوشش مالی گسترده‌تر**: ۹۲ بورس + crypto + کالا
4. **زبان‌ها**: ۲۱ زبان
5. **استقرار Edge**: ۶۰+ Edge Function
6. **مستندات عمومی**: بالغ‌تر

### مقایسه با Palantir Gotham/Foundry:

QADR110 یک **جایگزین متن‌باز سبک** برای بخشی از قابلیت‌های Palantir است، نه رقیب مستقیم:

| جنبه | Palantir | QADR110 |
|---|---|---|
| مقیاس | سازمانی (میلیاردها رکورد) | متوسط (RSS + API + local) |
| قیمت | صدها هزار تا میلیون‌ها دلار/سال | رایگان و متن‌باز |
| استقرار | On-premise / ابری خصوصی | وب + دسکتاپ + self-host |
| Ontology | کامل و بالغ | سازگاری پایه |
| AI/ML | مدل‌های اختصاصی + Model Studio | OpenRouter/Ollama/Groq |
| دسترسی | دولتی/سازمانی | عمومی |

---

## ۴. پیشنهادات بهبود

### ۴.۱ آیتم‌های جدید منوی راست‌کلیک نقشه (پیاده‌سازی شده)

آیتم‌های زیر به منوی راست‌کلیک نقشه اضافه شده‌اند:

| # | آیتم | دسته‌بندی | حالت |
|---|---|---|---|
| ۱ | تاب‌آوری نقطه‌ای | resilience | fast |
| ۲ | مقایسه تاب‌آوری نقطه با نقاط دیگر | resilience | long |
| ۳ | تاب‌آوری استان/منطقه/ایالت | resilience | long |
| ۴ | مقایسه مناطق/استان‌ها/ایالات | resilience | long |
| ۵ | مقایسه تاب‌آوری کشور با کشورهای دیگر | resilience | long |
| ۶ | ترندهای شبکه‌های اجتماعی و منابع OSINT | osint-news | long |
| ۷ | وضعیت جنگی (اقتصادی/نظامی/اجتماعی/فرهنگی) | security | long |
| ۸ | خروجی .md با ساعت جهانی/منطقه‌ای/ایرانی | data-quality | fast |
| ۹ | کانال‌های رادیویی/تلویزیونی اینترنتی | osint-news | fast |

### ۴.۲ پیشنهادات آینده

1. **اتصال مستقیم به APIهای شبکه‌های اجتماعی**: Twitter/X API، CrowdTangle (Meta)، Telegram Bot API
2. **موتور اصالت‌سنجی خبر**: cross-reference خودکار بین منابع
3. **تحلیل گروه‌بندی‌های بین‌المللی**: G8, NATO, BRICS, OPEC, EU
4. **Workbooks/Notebooks**: ذخیره و اشتراک‌گذاری تحلیل‌ها
5. **پشتیبانی از زبان‌های بیشتر**: عربی، ترکی، اردو
6. **داشبورد مقایسه زنده**: مقایسه همزمان چند نقطه/کشور در یک نما

---

## منابع

- [QADR110 GitHub](https://github.com/danialsamiei/qadr110)
- [WorldMonitor GitHub](https://github.com/koala73/worldmonitor)
- [Palantir GitHub](https://github.com/palantir)
- [Palantir Gotham](https://www.palantir.com/platforms/gotham/)
- [Palantir Foundry](https://www.palantir.com/platforms/foundry/)
- [Demystifying Palantir (Medium)](https://dashjoin.medium.com/demystifying-palantir-features-and-open-source-alternatives-ed3ed39432f9)
