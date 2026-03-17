# QADR110 Branding Migration Report

## Renamed identifiers

- Runtime package/app ids:
  - `package.json` name: `world-monitor` -> `qadr110`
  - `src-tauri/Cargo.toml` package: `world-monitor` -> `qadr110`
  - `src-tauri/tauri.conf.json` binary: `world-monitor` -> `qadr110`
  - `src-tauri/tauri.conf.json` identifier: `app.worldmonitor.desktop` -> `dev.alefba.qadr110.desktop`
- Storage and cache namespaces:
  - `worldmonitor-*` / `wm-*` localStorage keys -> `qadr110-*`
  - recent search history: `worldmonitor_recent_searches` -> `qadr110_recent_searches`
  - IndexedDB names:
    - `worldmonitor_db` -> `qadr110_db`
    - `worldmonitor_persistent_cache` -> `qadr110_persistent_cache`
    - `worldmonitor_vector_store` -> `qadr110_vector_store`
  - Local cache prefix:
    - `worldmonitor-persistent-cache:` -> `qadr110-persistent-cache:`
- Desktop secret/key identifiers:
  - keyring service: `world-monitor` -> `qadr110`
  - canonical license secret: `WORLDMONITOR_API_KEY` -> `QADR110_API_KEY`
  - canonical cloud header: `X-WorldMonitor-Key` -> `X-QADR110-Key`
- Sidecar and desktop shell defaults:
  - cloud fallback origin: `https://worldmonitor.app` -> `https://qadr.alefba.dev`
  - sidecar remote API base: `https://api.worldmonitor.app` -> `https://api.qadr.alefba.dev`
  - Tauri variant identifiers:
    - `app.worldmonitor.finance.desktop` -> `dev.alefba.qadr110.finance.desktop`
    - `app.worldmonitor.tech.desktop` -> `dev.alefba.qadr110.tech.desktop`
- Share/export surfaces:
  - story watermark/footer: `WORLDMONITOR.APP` -> `QADR110`
  - story share filenames and social text moved to QADR110 branding
  - outbound UTM source: `worldmonitor` -> `qadr110`
- UI shell/session keys:
  - theme, variant, settings-open, updater-dismiss, panel spans, map settings, AI flow settings, alert settings, watchlist, world clock, trending config all moved to `qadr110-*`
- Panel/state migration:
  - analysis hub panel key: `world-monitoring-hub` -> `qadr-monitoring-hub`

## Migration logic

- `src/utils/qadr-branding.ts` is the central migration layer.
- On first run it copies legacy `worldmonitor-*` and `wm-*` localStorage entries into canonical `qadr110-*` keys and writes `qadr110-storage-migrated-v1`.
- Early-read paths still have fallback reads for legacy values where import order matters:
  - `config/variant.ts`
  - `theme-manager.ts`
  - `font-settings.ts`
  - inline HTML shell scripts
- Desktop secrets migrate in `src-tauri/src/main.rs`:
  - read current `qadr110` vault first
  - fall back to legacy `world-monitor` vault/service
  - normalize `WORLDMONITOR_API_KEY` into `QADR110_API_KEY`
  - persist back into the new vault
- IndexedDB migration runs lazily on open:
  - baseline/snapshot DB copies legacy data into `qadr110_db`
  - persistent cache copies legacy entries into `qadr110_persistent_cache`
  - vector retrieval cache copies legacy embeddings into `qadr110_vector_store`
- API compatibility remains backward-compatible:
  - server accepts `X-QADR110-Key`
  - legacy `X-WorldMonitor-Key` remains accepted temporarily for older clients

## Risk points

- Inline shell scripts in `index.html` are CSP-hash protected; hashes were updated in the same pass. Any future inline edit must also update CSP hashes.
- Panel-id migration for `world-monitoring-hub` is applied only to saved panel settings/order state; older exported settings files still rely on import-time normalization.
- IndexedDB migration relies on `indexedDB.databases()` availability. If a host WebView disables that API, the app still runs, but legacy DB copy may not occur automatically.
- Sidecar cloud fallback now assumes the canonical hosted surface is `qadr.alefba.dev` / `api.qadr.alefba.dev`. Environments pinned to old hosted domains must override `LOCAL_API_REMOTE_BASE`.
- The API layer keeps temporary legacy header compatibility. Removing it later requires coordinated rollout across desktop/web clients.

## Follow-up cleanup

- Remove legacy header support (`X-WorldMonitor-Key`) after all deployed clients are on QADR110 identifiers.
- Remove legacy localStorage/import prefixes from `settings-persistence.ts` after one or two release cycles.
- Audit non-runtime/internal namespaces still carrying historic names in docs, generated code, and old asset filenames if full repo-wide branding parity is required.
