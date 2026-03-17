# Tauri Desktop Plugin Migration

## Summary

This pass keeps Tauri 2 as the desktop runtime and replaces the most fragile desktop-specific integrations with official plugins:

- `tauri-plugin-store` for desktop shell persistence
- `tauri-plugin-window-state` for restoring desktop window geometry
- `tauri-plugin-opener` for external URL handling
- `tauri-plugin-updater` initialized in a guarded path for future signed update flows

## What Migrated

Desktop-only workbench state is now mirrored into `desktop-shell-state.json` via `tauri-plugin-store`.

Managed keys:

- `qadr110-theme`
- `qadr110-font-family`
- `qadr110-variant`
- `panel-order`
- `panel-order-bottom`
- `panel-order-bottom-set`
- `qadr110-panel-spans`
- `qadr110-panel-col-spans`
- `map-height`
- `map-pinned`
- `mobile-map-collapsed`
- `qadr110-panel-order-v1.9`
- `qadr110-tech-insights-top-v1`
- `qadr110-panel-prune-v1`
- `qadr110-layout-reset-v2.5`

Migration behavior:

1. Legacy WorldMonitor keys still migrate into the current QADR110 keys first.
2. On desktop startup, plugin-store hydrates the managed keys back into `localStorage` before the app shell mounts.
3. If plugin-store is empty but `localStorage` has values, the current desktop state is copied into plugin-store.
4. Subsequent writes/removals of managed keys are mirrored to plugin-store automatically.

This keeps current synchronous business logic intact while moving canonical desktop persistence away from ad-hoc web storage.

## Window State

`main`, `settings`, and `live-channels` now use `tauri-plugin-window-state`.

- state restore runs during frontend bootstrap for each desktop window
- state save is triggered on `beforeunload` / `pagehide`
- the main window label is now explicitly `main` in all Tauri config variants

## External Links

The removed custom IPC command `open_url` is replaced by `tauri-plugin-opener` in the frontend.

Security policy kept from the old command:

- allow `https://*`
- allow `http://localhost*`
- allow `http://127.0.0.1*`
- reject other schemes and remote `http://` URLs

## Updater Strategy

`tauri-plugin-updater` is initialized, but the app still keeps the existing release-endpoint fallback because the repository does not yet contain a fully configured signed updater pipeline.

Current behavior:

- try official plugin-updater first
- if updater config/artifacts are unavailable, fall back to the existing API-driven release check
- if in-app install fails, fall back to opening the release/download URL

To complete the migration later, the build pipeline still needs:

- updater endpoint configuration
- public key distribution
- signed updater artifacts
- optional relaunch flow after install

## Rollback

If this migration needs to be rolled back:

1. remove the plugin packages from `package.json`
2. remove plugin initialization from `src-tauri/src/main.rs`
3. restore the old `open_url` command and frontend invocations
4. delete `src/services/desktop-shell-store.ts`, `src/services/desktop-window-state.ts`, and `src/services/desktop-opener.ts`
5. keep `localStorage` values; they remain compatible because the frontend still writes the same key names

## Known Caveats

- `plugin-updater` will not provide full in-app installs until signed updater artifacts are configured.
- `Cargo.lock` was not refreshed in this pass because the local Rust toolchain is unavailable in this environment.
- The desktop shell still reads from `localStorage` synchronously, but desktop persistence is now backed by the official store plugin for the scoped shell keys above.
