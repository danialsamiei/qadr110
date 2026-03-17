import { isDesktopRuntime } from './runtime';
import { invokeTauri } from './tauri-bridge';
import { isStorageQuotaExceeded, isQuotaError, markStorageQuotaExceeded } from '@/utils';
import { APP_STORAGE_PREFIX, LEGACY_STORAGE_PREFIX } from '@/utils/qadr-branding';

type CacheEnvelope<T> = {
  key: string;
  updatedAt: number;
  data: T;
};

const CACHE_PREFIX = `${APP_STORAGE_PREFIX}-persistent-cache:`;
const LEGACY_CACHE_PREFIX = `${LEGACY_STORAGE_PREFIX}-persistent-cache:`;
const CACHE_DB_NAME = `${APP_STORAGE_PREFIX}_persistent_cache`;
const LEGACY_CACHE_DB_NAME = `${LEGACY_STORAGE_PREFIX}_persistent_cache`;
const CACHE_DB_VERSION = 1;
const CACHE_STORE = 'entries';

let cacheDbPromise: Promise<IDBDatabase> | null = null;
let cacheMigrationPromise: Promise<void> | null = null;

function isIndexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function getCacheDb(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }

  if (cacheDbPromise) return cacheDbPromise;

  cacheDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error('Failed to open cache IndexedDB'));

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onclose = () => { cacheDbPromise = null; };
      void migrateLegacyCacheDatabaseIfNeeded(db)
        .catch((error) => {
          console.warn('[persistent-cache] Legacy IndexedDB migration failed', error);
        })
        .finally(() => resolve(db));
    };
  });

  return cacheDbPromise;
}

async function listCacheDatabaseNames(): Promise<string[]> {
  const indexedDbWithListing = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> };
  if (typeof indexedDbWithListing.databases !== 'function') return [];
  const entries = await indexedDbWithListing.databases();
  return entries.map((entry) => entry.name ?? '').filter(Boolean);
}

function openCacheDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, CACHE_DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error(`Failed to open IndexedDB ${name}`));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function migrateLegacyCacheDatabaseIfNeeded(targetDb: IDBDatabase): Promise<void> {
  if (cacheMigrationPromise) return cacheMigrationPromise;

  cacheMigrationPromise = (async () => {
    const dbNames = await listCacheDatabaseNames();
    if (!dbNames.includes(LEGACY_CACHE_DB_NAME)) return;

    const legacyDb = await openCacheDatabase(LEGACY_CACHE_DB_NAME);
    try {
      const legacyEntries = await new Promise<Array<CacheEnvelope<unknown>>>((resolve, reject) => {
        const tx = legacyDb.transaction(CACHE_STORE, 'readonly');
        const request = tx.objectStore(CACHE_STORE).getAll();
        request.onsuccess = () => resolve((request.result as Array<CacheEnvelope<unknown>> | undefined) ?? []);
        request.onerror = () => reject(request.error);
      });

      await new Promise<void>((resolve, reject) => {
        const tx = targetDb.transaction(CACHE_STORE, 'readwrite');
        const store = tx.objectStore(CACHE_STORE);
        for (const entry of legacyEntries) store.put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      legacyDb.close();
    }
  })().catch((error) => {
    cacheMigrationPromise = null;
    throw error;
  });

  return cacheMigrationPromise;
}

async function getFromIndexedDb<T>(key: string): Promise<CacheEnvelope<T> | null> {
  const db = await getCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readonly');
    const store = tx.objectStore(CACHE_STORE);
    const request = store.get(key);
    request.onsuccess = () => resolve((request.result as CacheEnvelope<T> | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function setInIndexedDb<T>(payload: CacheEnvelope<T>): Promise<void> {
  const db = await getCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(CACHE_STORE).put(payload);
  });
}

export async function getPersistentCache<T>(key: string): Promise<CacheEnvelope<T> | null> {
  if (isDesktopRuntime()) {
    try {
      const value = await invokeTauri<CacheEnvelope<T> | null>('read_cache_entry', { key });
      return value ?? null;
    } catch (error) {
      console.warn('[persistent-cache] Desktop read failed; falling back to browser storage', error);
    }
  }

  if (isIndexedDbAvailable()) {
    try {
      return await getFromIndexedDb<T>(key);
    } catch (error) {
      console.warn('[persistent-cache] IndexedDB read failed; falling back to localStorage', error);
      cacheDbPromise = null;
    }
  }

  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (raw) return JSON.parse(raw) as CacheEnvelope<T>;
    const legacyRaw = localStorage.getItem(`${LEGACY_CACHE_PREFIX}${key}`);
    return legacyRaw ? JSON.parse(legacyRaw) as CacheEnvelope<T> : null;
  } catch {
    return null;
  }
}

export async function setPersistentCache<T>(key: string, data: T): Promise<void> {
  const payload: CacheEnvelope<T> = { key, data, updatedAt: Date.now() };

  if (isDesktopRuntime()) {
    try {
      await invokeTauri<void>('write_cache_entry', { key, value: JSON.stringify(payload) });
      return;
    } catch (error) {
      console.warn('[persistent-cache] Desktop write failed; falling back to browser storage', error);
    }
  }

  if (isIndexedDbAvailable() && !isStorageQuotaExceeded()) {
    try {
      await setInIndexedDb(payload);
      return;
    } catch (error) {
      if (isQuotaError(error)) markStorageQuotaExceeded();
      else console.warn('[persistent-cache] IndexedDB write failed; falling back to localStorage', error);
      cacheDbPromise = null;
    }
  }

  if (isStorageQuotaExceeded()) return;
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(payload));
  } catch (error) {
    if (isQuotaError(error)) markStorageQuotaExceeded();
  }
}

export async function deletePersistentCache(key: string): Promise<void> {
  if (isDesktopRuntime()) {
    try {
      await invokeTauri<void>('delete_cache_entry', { key });
      return;
    } catch {
      // Fall through to browser storage
    }
  }

  if (isIndexedDbAvailable()) {
    try {
      const db = await getCacheDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(CACHE_STORE).delete(key);
      });
      return;
    } catch (error) {
      console.warn('[persistent-cache] IndexedDB delete failed; falling back to localStorage', error);
      cacheDbPromise = null;
    }
  }

  if (isStorageQuotaExceeded()) return;
  try {
    localStorage.removeItem(`${CACHE_PREFIX}${key}`);
    localStorage.removeItem(`${LEGACY_CACHE_PREFIX}${key}`);
  } catch {
    // Ignore
  }
}

export function cacheAgeMs(updatedAt: number): number {
  return Math.max(0, Date.now() - updatedAt);
}

export function describeFreshness(updatedAt: number): string {
  const age = cacheAgeMs(updatedAt);
  const mins = Math.floor(age / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
