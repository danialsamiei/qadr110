# مرور جامع معماری QADR110

## خلاصه اجرایی

سامانه **QADR110** (World Monitor) یک پلتفرم OSINT پیشرفته برای رصد لحظه‌ای رویدادهای ژئوپلیتیک، نظامی، اقتصادی و زیرساختی است. این سامانه با معماری **Proto-First**، محاسبات **Browser-First**، و سیستم **Multi-Variant** طراحی شده و از بیش از ۴۰ منبع داده مستقل تغذیه می‌کند.

### نقاط قوت کلیدی

- معماری Proto-First با تولید خودکار کد (drift صفر بین فرانت و بک)
- Bootstrap Hydration: ۳۸ دیتاست در ۲ درخواست موازی
- Graceful Degradation: عملکرد بدون هیچ API key
- Three-Tier Caching با stale-on-error
- Vanilla TypeScript بدون overhead فریمورک

### حوزه‌های بهبود اصلی

- جایگزینی احراز هویت پایه با SSO/JWT (بحرانی)
- شکستن فایل‌های بزرگ (DeckGLMap: 220KB, data-loader: 112KB)
- اضافه کردن تست واحد (unit test) با Vitest
- بهبود مانیتورینگ و observability

---

## نمودارهای معماری

### توپولوژی لایه‌ای سیستم

```text
┌──────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  ┌────────────────┐  │
│  │ DeckGL   │  │ Globe.gl │  │  50+ Panel    │  │ Web Workers    │  │
│  │ Map      │  │ 3D Globe │  │  Components   │  │ (ML/NLP/ONNX)  │  │
│  └────┬─────┘  └────┬─────┘  └──────┬────────┘  └───────┬────────┘  │
│       └──────────────┴───────────────┴───────────────────┘           │
│                              │                                       │
│  ┌───────────────────────────┴────────────────────────────────────┐  │
│  │               App.ts (Core Application Class)                 │  │
│  │  ┌──────────────┬──────────────┬─────────────┬─────────────┐  │  │
│  │  │ PanelLayout  │ DataLoader   │ EventHandler│ Refresh     │  │  │
│  │  │ Manager      │ Manager      │ Manager     │ Scheduler   │  │  │
│  │  └──────────────┴──────────────┴─────────────┴─────────────┘  │  │
│  └───────────────────────────┬────────────────────────────────────┘  │
│                              │                                       │
│  ┌───────────────────────────┴────────────────────────────────────┐  │
│  │            120+ Services (Analysis, Synthesis, Fetch)          │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │  │
│  │  │ country-    │  │ military-   │  │ threat-     │   ...     │  │
│  │  │ instability │  │ surge       │  │ classifier  │           │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘           │  │
│  └───────────────────────────┬────────────────────────────────────┘  │
│                              │ RPC (Sebuf Proto-generated)           │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────────┐
│                         EDGE LAYER (Vercel)                          │
│                                                                      │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐  ┌─────────────────┐   │
│  │  CORS    │─→│  Rate     │─→│  API Key  │─→│ Gateway Router  │   │
│  │  Filter  │  │  Limiter  │  │  Validator│  │  (24 domains)   │   │
│  └──────────┘  └───────────┘  └───────────┘  └────────┬────────┘   │
│                                                        │             │
│  ┌───────────────┐  ┌──────────────────────┐           │             │
│  │  Bootstrap    │  │  Middleware          │           │             │
│  │  (fast/slow)  │  │  (bot filter, OG)   │           │             │
│  └───────────────┘  └──────────────────────┘           │             │
└────────────────────────────────────────────────────────┼─────────────┘
                                                         │
┌────────────────────────────────────────────────────────┼─────────────┐
│                         CACHE LAYER                    │              │
│                                                        │              │
│  ┌───────────────────┐  ┌───────────────────┐          │              │
│  │  Upstash Redis    │  │  In-Memory Cache  │          │              │
│  │  (distributed)    │  │  (inflight dedup) │          │              │
│  │  3-tier TTL:      │  │  negative sentinel│          │              │
│  │   fast=5min       │  │  cache stampede   │          │              │
│  │   medium=10min    │  │  prevention       │          │              │
│  │   slow=30min      │  │                   │          │              │
│  │   static=2hr      │  │                   │          │              │
│  │   daily=24hr      │  │                   │          │              │
│  └───────────────────┘  └───────────────────┘          │              │
└────────────────────────────────────────────────────────┼──────────────┘
                                                         │
┌────────────────────────────────────────────────────────┼──────────────┐
│                    UPSTREAM DATA SOURCES                │              │
│                                                        │              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────┐  │              │
│  │ ACLED   │  │ GDELT   │  │ USGS    │  │ Finnhub  │  │   ...40+ API │
│  │ UCDP    │  │ AIS     │  │ ADSB-Ex │  │ FRED     │  │              │
│  │ HAPI    │  │ NASA    │  │ FAA     │  │ EIA      │  │              │
│  └─────────┘  └─────────┘  └─────────┘  └──────────┘  │              │
└────────────────────────────────────────────────────────┴──────────────┘
```

### جریان داده (Data Pipeline)

```text
  Ingest              Normalize            Analyze             Score              Render
┌──────────┐       ┌───────────┐        ┌───────────┐      ┌──────────┐       ┌──────────┐
│ RSS/API  │──────→│  Dedup    │───────→│  Cluster  │─────→│  CII     │──────→│  Panels  │
│ GDELT    │       │  Geocode  │        │  Classify │      │  Surge   │       │  Map     │
│ AIS/ADSB │       │  Normalize│        │  Correlate│      │  Risk    │       │  Globe   │
│ Telegram │       │  Tag      │        │  Converge │      │  Baseline│       │  Alerts  │
└──────────┘       └───────────┘        └───────────┘      └──────────┘       └──────────┘
      ↑                                       ↑                                     │
      │              ┌───────────┐            │                                     │
      └──────────────│ SmartPoll │────────────┘                                     │
                     │ Loop      │←─────────────────────────────────────────────────┘
                     └───────────┘  (Adaptive refresh: backoff, visibility-aware)
```

### توپولوژی استقرار (Deployment Topology)

```text
┌──────────────────────────────────────────────────────────────────────┐
│                       DEPLOYMENT TARGETS                             │
│                                                                      │
│  ┌──────────────────┐  ┌────────────────┐  ┌──────────────────────┐  │
│  │   Vercel CDN     │  │    Docker      │  │   Tauri Desktop      │  │
│  │                  │  │                │  │                      │  │
│  │  ┌────────────┐  │  │  ┌──────────┐  │  │  ┌────────────────┐ │  │
│  │  │ Static     │  │  │  │ Nginx    │  │  │  │ WebView        │ │  │
│  │  │ Assets     │  │  │  │ Reverse  │  │  │  │ (WKWebView/    │ │  │
│  │  └────────────┘  │  │  │ Proxy    │  │  │  │  WebKitGTK)    │ │  │
│  │  ┌────────────┐  │  │  └──────────┘  │  │  └───────┬────────┘ │  │
│  │  │ Edge Fns   │  │  │  ┌──────────┐  │  │          │          │  │
│  │  │ (24 domain)│  │  │  │ API      │  │  │  ┌───────┴────────┐ │  │
│  │  └────────────┘  │  │  │ Upstream │  │  │  │ Sidecar        │ │  │
│  │  ┌────────────┐  │  │  └──────────┘  │  │  │ (Node.js API)  │ │  │
│  │  │ Middleware │  │  │               │  │  │ + LRU Cache    │ │  │
│  │  └────────────┘  │  │               │  │  └────────────────┘ │  │
│  └──────────────────┘  └────────────────┘  └──────────────────────┘  │
│                                                                      │
│  Variants: full | tech | finance | happy | commodity                 │
│  CI/CD: GitHub Actions (typecheck, lint, Docker publish, Tauri test) │
└──────────────────────────────────────────────────────────────────────┘
```

### نمودار اجزای داخلی App.ts

```text
                            ┌──────────────┐
                            │   App.ts     │
                            │  (35KB)      │
                            └──────┬───────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
   ┌────────┴────────┐   ┌────────┴────────┐   ┌────────┴────────┐
   │ PanelLayout     │   │  DataLoader     │   │ EventHandler    │
   │ Manager (60KB)  │   │  Manager(112KB) │   │ Manager (45KB)  │
   │                 │   │                 │   │                 │
   │ - Panel grid    │   │ - 24 domain     │   │ - DOM events    │
   │ - Lifecycle     │   │   loaders       │   │ - Keyboard      │
   │ - Drag/resize   │   │ - Bootstrap     │   │ - Storage sync  │
   │ - Visibility    │   │   hydration     │   │ - Idle detect   │
   └─────────────────┘   │ - RPC dispatch  │   │ - Visibility    │
                         └─────────────────┘   └─────────────────┘
            │                      │                      │
   ┌────────┴────────┐   ┌────────┴────────┐   ┌────────┴────────┐
   │ CountryIntel    │   │  Search         │   │ Refresh         │
   │ Manager (44KB)  │   │  Manager(21KB)  │   │ Scheduler       │
   │                 │   │                 │   │                 │
   │ - Country brief │   │ - Full-text idx │   │ - SmartPollLoop │
   │ - Deep dive     │   │ - News search   │   │ - Interval mgmt│
   │ - Risk scoring  │   │ - Filter/sort   │   │ - Tab-aware     │
   └─────────────────┘   └─────────────────┘   └─────────────────┘
```

### نمودار ۲۴ دامنه سرویس (Proto/RPC)

```text
┌────────────────────────────────────────────────────────────────┐
│                    24 SERVICE DOMAINS                          │
│                                                                │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │ aviation   │  │ climate    │  │ conflict   │              │
│  │ 6 RPCs     │  │ 1 RPC      │  │ 4 RPCs     │              │
│  └────────────┘  └────────────┘  └────────────┘              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │ cyber      │  │ displacement│ │ economic   │              │
│  │ 1 RPC      │  │ 2 RPCs     │  │ 9 RPCs     │              │
│  └────────────┘  └────────────┘  └────────────┘              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │ infra      │  │ intelligence│ │ maritime   │              │
│  │ 4 RPCs     │  │ 5 RPCs     │  │ 2 RPCs     │              │
│  └────────────┘  └────────────┘  └────────────┘              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │ market     │  │ military   │  │ news       │              │
│  │ 7 RPCs     │  │ 4 RPCs     │  │ 2 RPCs     │              │
│  └────────────┘  └────────────┘  └────────────┘              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │ prediction │  │ research   │  │ seismology │              │
│  │ 1 RPC      │  │ 3 RPCs     │  │ 1 RPC      │              │
│  └────────────┘  └────────────┘  └────────────┘              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │ supply-    │  │ trade      │  │ unrest     │              │
│  │ chain 3RPC │  │ 4 RPCs     │  │ 1 RPC      │              │
│  └────────────┘  └────────────┘  └────────────┘              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│  │ wildfire   │  │ giving     │  │ positive-  │              │
│  │ 1 RPC      │  │ 3 RPCs     │  │ events 2RPC│              │
│  └────────────┘  └────────────┘  └────────────┘              │
└────────────────────────────────────────────────────────────────┘
```

---

## تحلیل نقاط قوت معماری

### ۱. Proto-First API Contracts

تمام ۲۴ دامنه سرویس از طریق فایل‌های `.proto` تعریف شده‌اند. کد TypeScript
کلاینت و سرور به صورت خودکار تولید می‌شود. این رویکرد:

- drift بین فرانت‌اند و بک‌اند را حذف می‌کند
- اعتبارسنجی فیلدها (`buf.validate`) به صورت خودکار تولید می‌شود
- تغییرات ناسازگار در CI با `buf breaking` شناسایی می‌شوند

**فایل‌های کلیدی**: `proto/worldmonitor/*/v1/service.proto`, `Makefile`

### ۲. Bootstrap Hydration

در لحظه بارگذاری صفحه، ۳۸ دیتاست در ۲ درخواست موازی از Redis pipeline
پری‌فچ می‌شوند:

- **Fast tier** (`s-maxage=1200`): زلزله، بازار، پیش‌بینی، هشدارهای پرواز
- **Slow tier** (`s-maxage=7200`): نرخ‌های BIS، آب‌وهوا، تهدیدات سایبری

نتیجه: کاهش ۲-۴ ثانیه‌ای first-meaningful-paint.

**فایل کلیدی**: `api/bootstrap.js`, `src/services/bootstrap.ts`

### ۳. SmartPollLoop — پولینگ تطبیقی

- **Exponential backoff**: ضریب ۲× در شکست‌های متوالی، حداکثر ۴× بازه پایه
- **Hidden-tab throttle**: ضریب ۵× هنگام مخفی بودن تب
- **Circuit breaker**: توقف کامل بعد از `maxAttempts` شکست
- **Reason tagging**: هر poll دارای `SmartPollReason` (`interval`, `resume`, `manual`, `startup`)

### ۴. Graceful Degradation

- سیستم بدون هیچ API key راه‌اندازی می‌شود
- هر منبع داده مستقلاً fail می‌کند بدون تأثیر بر بقیه
- ML سمت مرورگر بدون سرور کار می‌کند
- لایه‌های استاتیک نقشه، مدل‌های ML آفلاین عمل می‌کنند

### ۵. Multi-Signal Correlation

هیچ منبع تکی به تنهایی هشدار بحرانی ایجاد نمی‌کند. Focal points نیاز به
همگرایی در چند بعد دارند:

- اخبار + فعالیت نظامی + بازارها + اعتراضات → قبل از تشدید به وضعیت بحرانی

### ۶. Vanilla TypeScript — بدون Framework

- بدون virtual DOM، بدون framework runtime
- پوسته اپلیکیشن کمتر از runtime React حجم دارد
- کنترل مستقیم DOM با event delegation
- وابستگی فقط به استانداردهای مرورگر (Web Workers, IndexedDB, Intersection Observer)

### ۷. سیستم Multi-Variant

یک codebase → ۵ اپلیکیشن متفاوت:

| Variant | دامنه | تمرکز |
|---------|-------|-------|
| full | worldmonitor.app | ژئوپلیتیک و نظامی |
| tech | tech.worldmonitor.app | فناوری و هوش مصنوعی |
| finance | finance.worldmonitor.app | بازارها و اقتصاد |
| happy | happy.worldmonitor.app | اخبار مثبت |
| commodity | — | کالاها و مواد اولیه |

### ۸. Three-Tier Caching

```text
In-Memory (inflight dedup) → Upstash Redis (distributed) → Upstream API
         ↓ miss                     ↓ miss                    ↓ fetch
    coalesce concurrent       versioned keys              circuit breaker
    requests                  negative sentinel           stale-on-error
```

- **Cache stampede prevention**: اولین درخواست Promise ایجاد می‌کند، بقیه await می‌کنند
- **Negative caching**: شکست‌ها ۵ دقیقه cache می‌شوند (جلوگیری از thundering herd)
- **ETag + 304**: هش FNV-1a برای جلوگیری از ارسال مجدد داده بدون تغییر

---

## حوزه‌های بهبود و پیشنهادات

### ۱. سازمان‌دهی کد (Code Organization)

#### مشکل: فایل‌های بسیار بزرگ

| فایل | حجم | مسئولیت |
|------|------|---------|
| `src/components/DeckGLMap.ts` | 220KB | رندر نقشه و ۴۹ لایه |
| `src/components/GlobeMap.ts` | 121KB | کره سه‌بعدی |
| `src/app/data-loader.ts` | 112KB | بارگذاری داده ۲۴ دامنه |
| `src/components/LiveNewsPanel.ts` | 65KB | پنل اخبار زنده |
| `src/app/panel-layout.ts` | 60KB | چیدمان و چرخه‌حیات پنل‌ها |
| `src/app/event-handlers.ts` | 45KB | مدیریت رویدادها |
| `src/app/country-intel.ts` | 44KB | اطلاعات کشوری |

#### پیشنهاد

1. **شکستن `data-loader.ts`** به domain-specific loaders:

   ```text
   src/app/loaders/
   ├── conflict-loader.ts
   ├── market-loader.ts
   ├── military-loader.ts
   ├── aviation-loader.ts
   ├── infrastructure-loader.ts
   └── ... (per domain)
   ```

2. **شکستن `DeckGLMap.ts`** به layer-specific modules:

   ```text
   src/components/map-layers/
   ├── conflict-layer.ts
   ├── vessel-layer.ts
   ├── flight-layer.ts
   ├── protest-layer.ts
   ├── earthquake-layer.ts
   └── tooltip-renderer.ts
   ```

3. **استخراج tooltip/popup logic** از Map components به فایل‌های مجزا

### ۲. بهبود عملکرد (Performance)

#### ۲.۱ Code Splitting

لود تنبل (lazy) برای پنل‌هایی که کاربر هنوز باز نکرده. Vite از dynamic
`import()` پشتیبانی می‌کند:

```typescript
// Before: همه پنل‌ها در bundle اصلی
import { AviationPanel } from './components/AviationPanel';

// After: لود در صورت نیاز
const { AviationPanel } = await import('./components/AviationPanel');
```

#### ۲.۲ Web Worker Offloading

انتقال محاسبات سنگین به Web Worker اختصاصی (فراتر از ML worker فعلی):

- News clustering (Jaccard similarity)
- Country Instability Index (CII) محاسبه
- Military surge detection
- Geo-convergence analysis

#### ۲.۳ Bundle Analysis

اضافه کردن `rollup-plugin-visualizer` به `vite.config.ts` برای شناسایی
وابستگی‌های سنگین و فرصت‌های بهینه‌سازی.

#### ۲.۴ Tree-Shaking

بررسی و حذف barrel exports (`index.ts`) غیرضروری که مانع tree-shaking
مؤثر می‌شوند.

### ۳. تست‌پذیری (Testing)

#### وضعیت فعلی

| نوع تست | ابزار | پوشش |
|---------|-------|------|
| E2E | Playwright | ۱۰ spec file |
| Data validation | tsx | محدود |
| Sidecar | tsx | ۷ تست |
| Unit test | — | **وجود ندارد** |
| Integration test | — | **وجود ندارد** |

#### پیشنهاد

1. **Vitest برای تست واحد**: سرویس‌های تحلیلی خالص (pure functions) کاندیدای
   ایده‌آل هستند:
   - `analysis-core.ts` — الگوریتم‌های clustering
   - `country-instability.ts` — محاسبه CII
   - `military-surge.ts` — تشخیص تشدید
   - `trending-keywords.ts` — تشخیص trending

2. **API Handler Tests**: تست مستقیم handler‌های Sebuf بدون Edge Function runtime

3. **Coverage Reporting**: اضافه کردن `--coverage` به CI pipeline

4. **Contract Tests**: تست Proto-generated clients در برابر mock server

### ۴. مقیاس‌پذیری (Scalability)

#### ۴.۱ Event Bus مرکزی

وضعیت فعلی: `CustomEvent` پراکنده (`wm:breaking-news`, `wm:deduct-context`, `theme-changed`).

پیشنهاد: معرفی یک typed event bus مرکزی:

```typescript
// Typed event bus
type AppEvents = {
  'breaking-news': { headline: string; severity: string };
  'data-refreshed': { domain: string; count: number };
  'theme-changed': { theme: 'light' | 'dark' };
};

const bus = createEventBus<AppEvents>();
bus.on('breaking-news', (data) => { /* typed */ });
bus.emit('breaking-news', { headline: '...', severity: 'critical' });
```

#### ۴.۲ State Management

وضعیت فعلی: `AppContext` monolithic با ۲۰+ فیلد مشترک.

پیشنهاد: تفکیک state به domain-specific stores:

```text
stores/
├── market-store.ts      (latestMarkets, predictions)
├── intelligence-store.ts (allNews, clusters, freshness)
├── military-store.ts    (flights, vessels, surges)
├── map-store.ts         (layers, viewport, markers)
└── ui-store.ts          (panels, settings, theme)
```

#### ۴.۳ Worker Pool

استفاده از pool چند Worker برای موازی‌سازی تحلیل‌های سنگین بجای
یک ML worker تکی.

### ۵. امنیت (Security Hardening)

#### وضعیت فعلی — نقاط قوت

- Content-Security-Policy سختگیرانه
- Rate limiting (600 req/60s global + endpoint-specific)
- CORS origin allowlist
- API key isolation (سرور-ساید)
- Bot filtering (۴۰+ user-agent مسدود)
- IPC origin validation در Tauri

#### نقاط ضعف و پیشنهادات

1. **احراز هویت پایه** — `Hojjat/Mojtaba` hardcoded در `src/main.ts`. این
   یک **ریسک بحرانی** است:
   - پیشنهاد: مهاجرت به JWT + OAuth2 provider (مثل Auth0, Clerk, یا self-hosted Keycloak)
   - حداقل: انتقال credentials به environment variable و هش کردن

2. **API Key Rotation** — مکانیزم چرخش خودکار API key‌ها در نسخه Desktop.
   فعلاً توکن‌ها ثابت هستند.

3. **Audit Logging** — ثبت درخواست‌های حساس (AI analysis, data export) با
   timestamp, IP, user-agent برای ممیزی

4. **Subresource Integrity (SRI)** — اضافه کردن integrity hash به
   اسکریپت‌های خارجی

### ۶. تجربه توسعه‌دهنده (Developer Experience)

#### پیشنهادات

1. **Component Catalog**: ایجاد صفحه dev-only برای مشاهده و تست ایزوله
   هر پنل بدون نیاز به بارگذاری کل داشبورد

2. **Dev Dashboard**: پنل debug داخلی (فعال با `QA_DEBUG_MODE`) برای:
   - وضعیت cache hits/misses
   - data freshness هر منبع
   - circuit breaker states
   - inflight requests

3. **Hot Module Replacement**: بهبود HMR برای فایل‌های بزرگ. فایل‌های
   ۲۲۰KB+ باعث کندی rebuild می‌شوند — شکستن آن‌ها HMR را هم بهبود می‌دهد

4. **مستندسازی خودکار**: تولید API docs از Proto files (OpenAPI 3.1.0 قبلاً
   موجود است — لینک آن در README)

### ۷. مانیتورینگ و Observability

#### وضعیت فعلی

| ابزار | نقش |
|-------|-----|
| Sentry | Error tracking |
| `console.*` | Logging |
| `X-Cache` header | Cache debugging |
| Intelligence Gap Tracker | Data source health |

#### پیشنهادات

1. **Structured Logging**: جایگزینی `console.*` با logger ساختاریافته
   دارای سطوح (`debug`, `info`, `warn`, `error`) و context خودکار
   (`[domain]`, `[handler]`, `[cache]`)

2. **Performance Metrics**: ارسال به Sentry Performance:
   - Bootstrap hydration time
   - First-data-paint per panel
   - Core Web Vitals (LCP, FID, CLS)
   - RPC latency per domain

3. **Data Source Health**: توسعه Intelligence Gap Tracker فعلی به
   داشبورد جامع‌تر با:
   - نمودار uptime/downtime هر منبع
   - هشدار خودکار برای منابع بحرانی (`requiredForRisk`)
   - نمایش cache hit rate

4. **Alerting**: هشدار خودکار (Telegram/Bale bot) هنگام:
   - Down شدن GDELT یا RSS (منابع بحرانی)
   - افزایش error rate بالای آستانه
   - Cache miss rate بالا

### ۸. بدهی معماری و ریسک‌ها (Architectural Debt)

#### ۸.۱ سیستم دوگانه Legacy و Proto-First

۳۸ endpoint قدیمی `api/*.js` در کنار ۲۴ دامنه Sebuf وجود دارند. این دوگانگی:

- نگهداری را پیچیده می‌کند (دو الگوی مختلف error handling, caching, CORS)
- تست‌نویسی را دشوار می‌کند
- پیشنهاد: برنامه مهاجرت تدریجی endpoint‌های legacy به Proto-First

#### ۸.۲ وابستگی تکی به Redis

Upstash Redis تنها نقطه شکست (SPOF) هم برای cache و هم برای seed pipeline است:

- پیشنهاد: fallback به in-memory cache با file persistence در صورت قطع Redis
- بررسی Redis Cluster برای high availability

#### ۸.۳ عدم وجود دیتابیس دائمی

تمام state در Redis (ephemeral) یا IndexedDB (کلاینت‌ساید) ذخیره می‌شود:

- تحلیل‌های تاریخی و روند بلندمدت نیازمند persistent storage هستند
- پیشنهاد: بررسی ClickHouse یا TimescaleDB برای داده‌های سری زمانی

#### ۸.۴ Railway Seed Pipeline

۲۷ اسکریپت seed با استراتژی dual-key (domain + bootstrap) داده‌ها را
از منابع بالادست جمع‌آوری و در Redis ذخیره می‌کنند:

- بازه‌ها: از ۵ دقیقه (زلزله، بازار) تا ۳۰ دقیقه (جابجایی جمعیت)
- in-flight deduplication از اجرای همزمان جلوگیری می‌کند
- شکست‌ها cache موجود را خراب نمی‌کنند
- پیشنهاد: اضافه کردن pub/sub برای invalidation آنی بجای بازه‌های ثابت

---

## اولویت‌بندی پیشنهادات

| اولویت | پیشنهاد | تأثیر | پیچیدگی | ملاحظات |
|--------|---------|-------|---------|---------|
| بحرانی | جایگزینی basic auth با SSO/JWT | امنیت | متوسط | credentials در سورس‌کد hardcode شده |
| بالا | شکستن فایل‌های بزرگ | نگهداری + DX | متوسط | DeckGLMap, data-loader, GlobeMap |
| بالا | اضافه کردن unit tests (Vitest) | کیفیت | کم | شروع از pure function services |
| بالا | مهاجرت endpoint‌های legacy به Proto-First | یکپارچگی | بالا | ۳۸ endpoint قدیمی |
| متوسط | Structured logging | عیب‌یابی | کم | جایگزینی console.* |
| متوسط | Bundle analysis + code splitting | عملکرد | کم | rollup-plugin-visualizer |
| متوسط | Performance metrics (Sentry) | عیب‌یابی | کم | Core Web Vitals + custom |
| متوسط | Redis fallback/HA | تاب‌آوری | متوسط | حذف SPOF |
| کم | Event bus مرکزی | مقیاس‌پذیری | متوسط | typed CustomEvent wrapper |
| کم | Worker pool | عملکرد | بالا | موازی‌سازی تحلیل‌ها |
| کم | Component catalog | DX | متوسط | dev-only page |
| کم | Persistent storage (ClickHouse) | تحلیل تاریخی | بالا | داده‌های سری زمانی |

---

## آمار کلی پروژه

| متریک | مقدار |
|--------|-------|
| فایل‌های TypeScript/JS در src/ | ۳۷۶ |
| دایرکتوری‌های API handler | ۴۱ |
| فایل‌های Proto | ۱۴۴ |
| دامنه‌های سرویس RPC | ۲۴ |
| کامپوننت‌های UI (پنل) | ۵۰+ |
| سرویس‌های بک‌اند | ۱۲۰+ |
| منابع داده (RSS feeds) | ۳۰+ |
| زبان‌های پشتیبانی‌شده (i18n) | ۱۴ |
| وابستگی‌های npm (production) | ۲۳ |
| وابستگی‌های npm (development) | ۱۳ |
| حجم src/ | 8.6MB |
| حجم public/ | 6.2MB |

---

## نتیجه‌گیری

QADR110 یک پلتفرم اطلاعاتی production-grade با معماری بالغ و تصمیمات طراحی
هوشمندانه است. نقاط قوت اصلی آن در Proto-First APIs، Bootstrap Hydration، و
Graceful Degradation است. مهم‌ترین حوزه‌های بهبود شامل ارتقای احراز هویت،
شکستن فایل‌های بزرگ، و اضافه کردن تست واحد می‌شود. پیشنهادات این سند به
ترتیب اولویت ارائه شده‌اند تا تیم توسعه بتواند به صورت مرحله‌ای آن‌ها را
پیاده‌سازی کند.
