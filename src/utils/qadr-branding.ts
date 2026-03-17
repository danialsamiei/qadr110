export interface BrandStorageLike {
  readonly length: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
}

export const APP_STORAGE_PREFIX = 'qadr110';
export const LEGACY_STORAGE_PREFIX = 'worldmonitor';

export const QADR_THEME_KEY = 'qadr110-theme';
export const QADR_FONT_FAMILY_KEY = 'qadr110-font-family';
export const QADR_VARIANT_KEY = 'qadr110-variant';
export const QADR_SETTINGS_OPEN_KEY = 'qadr110-settings-open';
export const QADR_SECRETS_UPDATED_KEY = 'qadr110-secrets-updated';
export const QADR_API_KEY = 'QADR110_API_KEY';
export const LEGACY_API_KEY = 'WORLDMONITOR_API_KEY';
export const QADR_API_HEADER = 'X-QADR110-Key';
export const LEGACY_API_HEADER = 'X-WorldMonitor-Key';
export const QADR_STORAGE_MIGRATION_MARKER = 'qadr110-storage-migrated-v1';

const EXACT_KEY_MIGRATIONS = new Map<string, string>([
  ['worldmonitor-theme', QADR_THEME_KEY],
  ['wm-font-family', QADR_FONT_FAMILY_KEY],
  ['worldmonitor-variant', QADR_VARIANT_KEY],
  ['wm-settings-open', QADR_SETTINGS_OPEN_KEY],
  ['wm-secrets-updated', QADR_SECRETS_UPDATED_KEY],
  ['worldmonitor-panels', 'qadr110-panels'],
  ['worldmonitor-monitors', 'qadr110-monitors'],
  ['worldmonitor-layers', 'qadr110-layers'],
  ['worldmonitor-disabled-feeds', 'qadr110-disabled-feeds'],
  ['worldmonitor-live-channels', 'qadr110-live-channels'],
  ['worldmonitor-map-mode', 'qadr110-map-mode'],
  ['worldmonitor-panel-spans', 'qadr110-panel-spans'],
  ['worldmonitor-panel-col-spans', 'qadr110-panel-col-spans'],
  ['worldmonitor-runtime-feature-toggles', 'qadr110-runtime-feature-toggles'],
  ['wm-breaking-alerts-v1', 'qadr110-breaking-alerts-v1'],
  ['wm-breaking-alerts-dedupe', 'qadr110-breaking-alerts-dedupe'],
  ['wm-globe-render-scale', 'qadr110-globe-render-scale'],
  ['wm-globe-texture', 'qadr110-globe-texture'],
  ['wm-globe-visual-preset', 'qadr110-globe-visual-preset'],
  ['wm-live-streams-always-on', 'qadr110-live-streams-always-on'],
  ['wm-market-watchlist-v1', 'qadr110-market-watchlist-v1'],
  ['wm-layer-warning-dismissed', 'qadr110-layer-warning-dismissed'],
  ['wm-map-provider', 'qadr110-map-provider'],
  ['worldmonitor-intel-findings', 'qadr110-intel-findings'],
  ['wm-alert-popup-enabled', 'qadr110-alert-popup-enabled'],
  ['wm-community-dismissed', 'qadr110-community-dismissed'],
  ['wm-pro-banner-dismissed', 'qadr110-pro-banner-dismissed'],
  ['worldmonitor-world-clock-cities', 'qadr110-world-clock-cities'],
  ['worldmonitor-trending-config-v1', 'qadr110-trending-config-v1'],
  ['worldmonitor_recent_searches', 'qadr110_recent_searches'],
  ['wm-debug-log', 'qadr110-debug-log'],
  ['worldmonitor-beta-mode', 'qadr110-beta-mode'],
  ['wm-sw-nuke', 'qadr110-sw-nuke'],
  ['wm-sw-nuked-v3', 'qadr110-sw-nuked-v3'],
]);

const PREFIX_KEY_MIGRATIONS: Array<[string, string]> = [
  ['wm-map-theme:', 'qadr110-map-theme:'],
  ['wm-update-dismissed-', 'qadr110-update-dismissed-'],
  ['wm-ai-flow-', 'qadr110-ai-flow-'],
  ['wm-chunk-reload:', 'qadr110-chunk-reload:'],
  ['worldmonitor-persistent-cache:', 'qadr110-persistent-cache:'],
  ['worldmonitor-panel-order-v', 'qadr110-panel-order-v'],
  ['worldmonitor-tech-insights-top-', 'qadr110-tech-insights-top-'],
  ['worldmonitor-panel-prune-', 'qadr110-panel-prune-'],
  ['worldmonitor-layout-reset-', 'qadr110-layout-reset-'],
  ['worldmonitor-sources-reduction-', 'qadr110-sources-reduction-'],
  ['worldmonitor-locale-boost-', 'qadr110-locale-boost-'],
];

function safeStorage(): BrandStorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getLegacyBrandKeys(primaryKey: string): string[] {
  const legacyKeys: string[] = [];

  for (const [legacyKey, nextKey] of EXACT_KEY_MIGRATIONS.entries()) {
    if (nextKey === primaryKey) legacyKeys.push(legacyKey);
  }

  for (const [legacyPrefix, nextPrefix] of PREFIX_KEY_MIGRATIONS) {
    if (primaryKey.startsWith(nextPrefix)) {
      legacyKeys.push(`${legacyPrefix}${primaryKey.slice(nextPrefix.length)}`);
    }
  }

  return legacyKeys;
}

export function readBrandStorageItem(
  primaryKey: string,
  legacyKeys: string[] = getLegacyBrandKeys(primaryKey),
  storage: BrandStorageLike | null = safeStorage(),
): string | null {
  if (!storage) return null;

  const primaryValue = storage.getItem(primaryKey);
  if (primaryValue !== null) return primaryValue;

  for (const legacyKey of legacyKeys) {
    const legacyValue = storage.getItem(legacyKey);
    if (legacyValue !== null) return legacyValue;
  }

  return null;
}

export function normalizeBrandStorageKey(key: string): string {
  const exact = EXACT_KEY_MIGRATIONS.get(key);
  if (exact) return exact;

  for (const [legacyPrefix, nextPrefix] of PREFIX_KEY_MIGRATIONS) {
    if (key.startsWith(legacyPrefix)) {
      return `${nextPrefix}${key.slice(legacyPrefix.length)}`;
    }
  }

  return key;
}

export function migrateLegacyBrandStorage(storage: BrandStorageLike | null = safeStorage()): void {
  if (!storage) return;
  if (storage.getItem(QADR_STORAGE_MIGRATION_MARKER) === 'done') return;

  const entries: Array<[string, string]> = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    const value = storage.getItem(key);
    if (value === null) continue;
    entries.push([key, value]);
  }

  for (const [legacyKey, value] of entries) {
    const nextKey = normalizeBrandStorageKey(legacyKey);
    if (nextKey !== legacyKey && storage.getItem(nextKey) === null) {
      storage.setItem(nextKey, value);
    }
  }

  storage.setItem(QADR_STORAGE_MIGRATION_MARKER, 'done');
}
