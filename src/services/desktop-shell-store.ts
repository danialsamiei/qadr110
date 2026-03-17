import {
  QADR_FONT_FAMILY_KEY,
  QADR_THEME_KEY,
  QADR_VARIANT_KEY,
} from '@/utils/qadr-branding';
import { isDesktopRuntime } from './runtime';

type StoreModule = typeof import('@tauri-apps/plugin-store');

interface StoreLike {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  save(): Promise<void>;
}

const STORE_PATH = 'desktop-shell-state.json';

export const DESKTOP_SHELL_STATE_KEYS = [
  QADR_THEME_KEY,
  QADR_FONT_FAMILY_KEY,
  QADR_VARIANT_KEY,
  'panel-order',
  'panel-order-bottom',
  'panel-order-bottom-set',
  'qadr110-panel-spans',
  'qadr110-panel-col-spans',
  'map-height',
  'map-pinned',
  'mobile-map-collapsed',
  'qadr110-panel-order-v1.9',
  'qadr110-tech-insights-top-v1',
  'qadr110-panel-prune-v1',
  'qadr110-layout-reset-v2.5',
] as const;

const MANAGED_KEY_SET = new Set<string>(DESKTOP_SHELL_STATE_KEYS);

let storePromise: Promise<StoreLike | null> | null = null;
let localStorageMirrorInstalled = false;
const pendingWrites = new Map<string, string | null>();
let flushPromise: Promise<void> | null = null;

export function isManagedDesktopShellKey(key: string): boolean {
  return MANAGED_KEY_SET.has(key);
}

export function resolveManagedDesktopShellValue(
  localValue: string | null,
  storeValue: string | undefined,
): { localValue: string | null; storeValue: string | undefined } {
  if (storeValue !== undefined) {
    return { localValue: storeValue, storeValue };
  }
  if (localValue !== null) {
    return { localValue, storeValue: localValue };
  }
  return { localValue: null, storeValue: undefined };
}

async function getDesktopShellStore(): Promise<StoreLike | null> {
  if (!isDesktopRuntime()) return null;
  if (!storePromise) {
    storePromise = import('@tauri-apps/plugin-store')
      .then((mod: StoreModule) => mod.Store.load(STORE_PATH, { autoSave: 250, defaults: {} }))
      .catch((error) => {
        console.warn('[desktop-shell-store] Plugin unavailable', error);
        return null;
      });
  }
  return storePromise;
}

async function flushPendingWrites(): Promise<void> {
  const store = await getDesktopShellStore();
  if (!store || pendingWrites.size === 0) return;

  const entries = Array.from(pendingWrites.entries());
  pendingWrites.clear();

  for (const [key, value] of entries) {
    if (value === null) {
      await store.delete(key);
    } else {
      await store.set(key, value);
    }
  }

  await store.save();
}

function scheduleStoreFlush(): void {
  if (flushPromise) return;
  flushPromise = Promise.resolve()
    .then(() => flushPendingWrites())
    .catch((error) => {
      console.warn('[desktop-shell-store] Failed to flush pending writes', error);
    })
    .finally(() => {
      flushPromise = null;
      if (pendingWrites.size > 0) {
        scheduleStoreFlush();
      }
    });
}

function enqueueStoreWrite(key: string, value: string | null): void {
  if (!isManagedDesktopShellKey(key)) return;
  pendingWrites.set(key, value);
  scheduleStoreFlush();
}

function installLocalStorageMirror(): void {
  if (localStorageMirrorInstalled || typeof window === 'undefined' || typeof Storage === 'undefined') return;

  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;

  Storage.prototype.setItem = function setManagedItem(key: string, value: string): void {
    originalSetItem.call(this, key, value);
    if (this === window.localStorage) {
      enqueueStoreWrite(key, value);
    }
  };

  Storage.prototype.removeItem = function removeManagedItem(key: string): void {
    originalRemoveItem.call(this, key);
    if (this === window.localStorage) {
      enqueueStoreWrite(key, null);
    }
  };

  localStorageMirrorInstalled = true;
}

export async function prepareDesktopShellState(): Promise<void> {
  if (!isDesktopRuntime() || typeof window === 'undefined') return;

  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return;
  }

  const store = await getDesktopShellStore();
  if (!store) return;

  let mutatedStore = false;

  for (const key of DESKTOP_SHELL_STATE_KEYS) {
    const localValue = storage.getItem(key);
    const storeValue = await store.get<string>(key);
    const resolved = resolveManagedDesktopShellValue(localValue, storeValue);

    if (resolved.localValue !== localValue) {
      if (resolved.localValue === null) {
        storage.removeItem(key);
      } else {
        storage.setItem(key, resolved.localValue);
      }
    }

    if (resolved.storeValue !== storeValue && resolved.storeValue !== undefined) {
      await store.set(key, resolved.storeValue);
      mutatedStore = true;
    }
  }

  if (mutatedStore) {
    await store.save();
  }

  installLocalStorageMirror();
}
