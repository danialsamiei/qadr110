# QADR110 Upstream Parity Audit

Date: 2026-03-17

## Scope

This audit tracks practical runtime parity work between:

- upstream: `koala73/worldmonitor`
- target: `danialsamiei/qadr110`

The goal is not a blind overwrite. QADR-specific Persian, assistant, predict, resilience, scenario, and workbench additions are preserved. Only parity-critical runtime behavior is aligned where intended.

## Branch / Divergence Snapshot

- target HEAD before this pass: `9ac3dbcd`
- divergence vs `upstream/main`: `231` behind upstream, `55` ahead locally

This confirms QADR is no longer a shallow fork. Parity work must be selective and adapter-based.

## Parity-Critical Problems Confirmed

### 1. Workbench layout collapse on live web

Root cause:

- QADR switched the document to Persian-first RTL globally.
- the analytical workbench grid still assumed LTR placement.
- the narrow command rail consumed the wide grid column and the main canvas was crushed to ~148px.

Observed on live before fix:

- command rail took the wide column
- main map/canvas collapsed
- evidence drawer collapsed

Status: fixed

Files:

- [C:\Users\never\Documents\CodeX\_tmp_qadr110\index.html](C:\Users\never\Documents\CodeX\_tmp_qadr110\index.html)
- [C:\Users\never\Documents\CodeX\_tmp_qadr110\src\services\i18n.ts](C:\Users\never\Documents\CodeX\_tmp_qadr110\src\services\i18n.ts)
- [C:\Users\never\Documents\CodeX\_tmp_qadr110\src\styles\main.css](C:\Users\never\Documents\CodeX\_tmp_qadr110\src\styles\main.css)
- [C:\Users\never\Documents\CodeX\_tmp_qadr110\src\styles\rtl-overrides.css](C:\Users\never\Documents\CodeX\_tmp_qadr110\src\styles\rtl-overrides.css)

### 2. Web API redirect pointed at an incomplete Cloudflare worker

Root cause:

- web runtime redirected `/api/*` requests to `https://api.alefba.dev`
- the worker deployment did not expose most v1 routes used by the dashboard
- live panels fell back to empty or indefinite loading

Status: fixed for the main web origin path

Files:

- [C:\Users\never\Documents\CodeX\_tmp_qadr110\src\services\runtime.ts](C:\Users\never\Documents\CodeX\_tmp_qadr110\src\services\runtime.ts)

### 3. Self-hosted `serve-dist` origin could not dispatch dynamic serverless routes

Root cause:

- static origin serving only hard-mapped API files
- many Vercel-style RPC handlers such as `[rpc].ts` were never reached
- the app received HTML or method errors instead of JSON

Status: fixed

Files:

- [C:\Users\never\Documents\CodeX\_tmp_qadr110\scripts\serve-dist.mjs](C:\Users\never\Documents\CodeX\_tmp_qadr110\scripts\serve-dist.mjs)

### 4. GDELT route naming mismatch

Root cause:

- old camelCase route references remained in parts of the app
- canonical route in the current server stack is kebab-case

Status: fixed with compatibility alias

Files:

- [C:\Users\never\Documents\CodeX\_tmp_qadr110\src\services\media-pipelines.ts](C:\Users\never\Documents\CodeX\_tmp_qadr110\src\services\media-pipelines.ts)
- [C:\Users\never\Documents\CodeX\_tmp_qadr110\src\services\realtime-fusion.ts](C:\Users\never\Documents\CodeX\_tmp_qadr110\src\services\realtime-fusion.ts)
- [C:\Users\never\Documents\CodeX\_tmp_qadr110\api\intelligence\v1\search-gdelt-documents.ts](C:\Users\never\Documents\CodeX\_tmp_qadr110\api\intelligence\v1\search-gdelt-documents.ts)
- [C:\Users\never\Documents\CodeX\_tmp_qadr110\api\intelligence\v1\searchGdeltDocuments.ts](C:\Users\never\Documents\CodeX\_tmp_qadr110\api\intelligence\v1\searchGdeltDocuments.ts)

### 5. Self-hosted Google Trends / NetBlocks analytical endpoints were Node-incompatible

Root cause:

- handlers used `DOMParser`
- self-hosted production runs on Node, not edge runtime DOM APIs
- these routes returned synthetic 502 failures even when upstream feeds were reachable

Status: fixed in this pass

Files:

- [C:\Users\never\Documents\CodeX\_tmp_qadr110\api\_rss-parser.js](C:\Users\never\Documents\CodeX\_tmp_qadr110\api\_rss-parser.js)
- [C:\Users\never\Documents\CodeX\_tmp_qadr110\api\google-trends.js](C:\Users\never\Documents\CodeX\_tmp_qadr110\api\google-trends.js)
- [C:\Users\never\Documents\CodeX\_tmp_qadr110\api\netblocks.js](C:\Users\never\Documents\CodeX\_tmp_qadr110\api\netblocks.js)

### 6. Persian locale bundle was not reliably emitted in production

Root cause:

- locale loading used `i18nMeta.glob` indirection
- Vite transforms canonical `import.meta.glob`, not arbitrary aliases
- production could fail to discover `fa.json` and fall back to English

Status: fixed in this pass

Files:

- [C:\Users\never\Documents\CodeX\_tmp_qadr110\src\services\i18n.ts](C:\Users\never\Documents\CodeX\_tmp_qadr110\src\services\i18n.ts)

## Upstream Fix Branches Reviewed

The following upstream branches were identified as directly relevant to parity hardening and deployment behavior:

- `upstream/fix/csp-inline-hash`
- `upstream/fix/gateway-no-cache-unavailable`
- `upstream/fix/gdelt-gold-standard`
- `upstream/fix/remove-dead-feed-domains`
- `upstream/fix/usni-fleet-cloudflare`
- `upstream/fix/usni-fleet-to-relay`
- `upstream/fix/military-opensky-direct-fallback`
- `upstream/fix/aviation-vercel-direct-calls`
- `upstream/fix/warm-ping-origin`

Not all are safe to cherry-pick directly because QADR has diverged structurally. Relevant logic is ported selectively.

## Current Runtime Feature Inventory

### Working on live after parity repairs

- workbench shell layout
- map canvas rendering
- GDELT document search
- macro signals
- ETF flows
- stablecoin markets
- gulf quotes
- temporal anomalies
- chokepoint status
- shipping rates
- risk scores
- theater posture
- airport ops summary
- USNI fleet report
- humanitarian summary batch
- FRED series batch

### Working but intentionally degraded when upstream/source is unavailable

- Google Trends analytical feed
- NetBlocks analytical feed

These now return structured offline payloads rather than synthetic 502 crashes.

### Still blocked by missing production runtime secrets or sidecars

- AIS snapshot
- Telegram feed
- Polymarket relay path
- GPS jam seeded cache path
- military flights seeded cache path
- OREF alerts

Required but currently absent on production `qadr110.service`:

- `WS_RELAY_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- Telegram runtime envs (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION`, `TELEGRAM_ADMIN_CHAT_ID`)

## Production Inspection Evidence

Observed on the server:

- no `EnvironmentFiles` configured for `qadr110.service`
- service environment only contains `PATH` and `NODE_ENV=production`
- no `WS_RELAY_URL`
- no `UPSTASH_REDIS_*`
- no Telegram env vars

This means remaining relay-backed parity gaps are external runtime blockers, not unresolved code routing bugs.

## Tests Added or Strengthened

- [C:\Users\never\Documents\CodeX\_tmp_qadr110\api\_rss-parser.test.mjs](C:\Users\never\Documents\CodeX\_tmp_qadr110\api\_rss-parser.test.mjs)
- [C:\Users\never\Documents\CodeX\_tmp_qadr110\tests\i18n-bundle-regression.test.mjs](C:\Users\never\Documents\CodeX\_tmp_qadr110\tests\i18n-bundle-regression.test.mjs)

## Remaining Work After This Audit

1. Commit and deploy the latest parity patch set.
2. Re-run live Playwright comparison against:
   - `https://www.worldmonitor.app/`
   - `https://qadr.alefba.dev/`
3. Verify whether the CSP inline-script warning is a real app issue or a browser/environment injection artifact.
4. If relay/Redis secrets become available, configure:
   - relay-backed feed endpoints
   - seeded cache endpoints
   - Telegram bot and MTProto path

## Conclusion

QADR is now materially closer to practical runtime parity on the major dashboard path:

- the main dashboard is visible again
- core API routes used by the public dashboard now resolve correctly on self-hosted origin
- several false-negative failures were eliminated

The remaining parity gaps are dominated by missing production secrets and sidecar processes, not by the earlier layout and routing defects.
