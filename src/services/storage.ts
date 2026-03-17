import { APP_STORAGE_PREFIX, LEGACY_STORAGE_PREFIX } from '@/utils/qadr-branding';

const DB_NAME = `${APP_STORAGE_PREFIX}_db`;
const LEGACY_DB_NAME = `${LEGACY_STORAGE_PREFIX}_db`;
const DB_VERSION = 1;

interface BaselineEntry {
  key: string;
  counts: number[];
  timestamps: number[];
  avg7d: number;
  avg30d: number;
  lastUpdated: number;
}

let db: IDBDatabase | null = null;
let migrationPromise: Promise<void> | null = null;

function createStores(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains('baselines')) {
    database.createObjectStore('baselines', { keyPath: 'key' });
  }

  if (!database.objectStoreNames.contains('snapshots')) {
    const store = database.createObjectStore('snapshots', { keyPath: 'timestamp' });
    store.createIndex('by_time', 'timestamp');
  }
}

async function listDatabaseNames(): Promise<string[]> {
  const indexedDbWithListing = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> };
  if (typeof indexedDbWithListing.databases !== 'function') return [];
  const entries = await indexedDbWithListing.databases();
  return entries.map((entry) => entry.name ?? '').filter(Boolean);
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => createStores(request.result);
    request.onsuccess = () => resolve(request.result);
  });
}

async function migrateLegacyDatabaseIfNeeded(targetDb: IDBDatabase): Promise<void> {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const databaseNames = await listDatabaseNames();
    if (!databaseNames.includes(LEGACY_DB_NAME)) return;

    const legacyDb = await openDatabase(LEGACY_DB_NAME);
    try {
      const baselineEntries = await new Promise<BaselineEntry[]>((resolve, reject) => {
        const tx = legacyDb.transaction('baselines', 'readonly');
        const request = tx.objectStore('baselines').getAll();
        request.onsuccess = () => resolve((request.result as BaselineEntry[] | undefined) ?? []);
        request.onerror = () => reject(request.error);
      });

      const snapshotEntries = await new Promise<DashboardSnapshot[]>((resolve, reject) => {
        const tx = legacyDb.transaction('snapshots', 'readonly');
        const request = tx.objectStore('snapshots').getAll();
        request.onsuccess = () => resolve((request.result as DashboardSnapshot[] | undefined) ?? []);
        request.onerror = () => reject(request.error);
      });

      await new Promise<void>((resolve, reject) => {
        const tx = targetDb.transaction(['baselines', 'snapshots'], 'readwrite');
        const baselineStore = tx.objectStore('baselines');
        const snapshotStore = tx.objectStore('snapshots');
        for (const entry of baselineEntries) baselineStore.put(entry);
        for (const entry of snapshotEntries) snapshotStore.put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      legacyDb.close();
    }
  })().catch((error) => {
    migrationPromise = null;
    throw error;
  });

  return migrationPromise;
}

export async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
      db.onclose = () => { db = null; };
      void migrateLegacyDatabaseIfNeeded(db)
        .catch((error) => {
          console.warn('[Storage] Legacy IndexedDB migration failed', error);
        })
        .finally(() => resolve(db!));
    };

    request.onupgradeneeded = (event) => {
      createStores((event.target as IDBOpenDBRequest).result);
    };
  });
}

async function withTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore, tx: IDBTransaction) => IDBRequest | void,
  extractResult?: boolean,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const database = await initDB();
      return await new Promise<T>((resolve, reject) => {
        const tx = database.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = fn(store, tx);
        if (request && extractResult !== false) {
          request.onsuccess = () => resolve(request.result as T);
          request.onerror = () => reject(request.error);
        } else {
          tx.oncomplete = () => resolve(undefined as T);
          tx.onerror = () => reject(tx.error);
        }
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'InvalidStateError') {
        db = null;
        if (attempt === 0) continue;
        console.warn('[Storage] IndexedDB connection closing after retry');
        if (mode === 'readwrite') throw new DOMException('IndexedDB write failed — connection closing', 'InvalidStateError');
        return undefined as T;
      }
      throw err;
    }
  }
  throw new Error('IndexedDB transaction failed after retry');
}

export async function getBaseline(key: string): Promise<BaselineEntry | null> {
  const result = await withTransaction<BaselineEntry | undefined>(
    'baselines', 'readonly', (store) => store.get(key), true,
  );
  return result || null;
}

export async function updateBaseline(key: string, currentCount: number): Promise<BaselineEntry> {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  let entry = await getBaseline(key);

  if (!entry) {
    entry = {
      key,
      counts: [currentCount],
      timestamps: [now],
      avg7d: currentCount,
      avg30d: currentCount,
      lastUpdated: now,
    };
  } else {
    entry.counts.push(currentCount);
    entry.timestamps.push(now);

    const cutoff30d = now - 30 * DAY_MS;
    const validIndices = entry.timestamps
      .map((t, i) => (t > cutoff30d ? i : -1))
      .filter(i => i >= 0);

    entry.counts = validIndices.map(i => entry!.counts[i]!);
    entry.timestamps = validIndices.map(i => entry!.timestamps[i]!);

    const cutoff7d = now - 7 * DAY_MS;
    const last7dCounts = entry.counts.filter((_, i) => entry!.timestamps[i]! > cutoff7d);

    entry.avg7d = last7dCounts.length > 0
      ? last7dCounts.reduce((a, b) => a + b, 0) / last7dCounts.length
      : currentCount;

    entry.avg30d = entry.counts.length > 0
      ? entry.counts.reduce((a, b) => a + b, 0) / entry.counts.length
      : currentCount;

    entry.lastUpdated = now;
  }

  await withTransaction<void>(
    'baselines', 'readwrite', (store) => { store.put(entry); }, false,
  );
  return entry!;
}

export function calculateDeviation(current: number, baseline: BaselineEntry): {
  zScore: number;
  percentChange: number;
  level: 'normal' | 'elevated' | 'spike' | 'quiet';
} {
  const avg = baseline.avg7d;
  const counts = baseline.counts;

  if (counts.length < 3) {
    return { zScore: 0, percentChange: 0, level: 'normal' };
  }

  const variance = counts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance) || 1;

  const zScore = (current - avg) / stdDev;
  const percentChange = avg > 0 ? ((current - avg) / avg) * 100 : 0;

  let level: 'normal' | 'elevated' | 'spike' | 'quiet' = 'normal';
  if (zScore > 2.5) level = 'spike';
  else if (zScore > 1.5) level = 'elevated';
  else if (zScore < -2) level = 'quiet';

  return {
    zScore: Math.round(zScore * 100) / 100,
    percentChange: Math.round(percentChange),
    level,
  };
}

export async function getAllBaselines(): Promise<BaselineEntry[]> {
  return (await withTransaction<BaselineEntry[]>(
    'baselines', 'readonly', (store) => store.getAll(), true,
  )) || [];
}

// Snapshot types and functions
export interface DashboardSnapshot {
  timestamp: number;
  events: unknown[];
  marketPrices: Record<string, number>;
  predictions: Array<{ title: string; yesPrice: number }>;
  hotspotLevels: Record<string, string>;
}

const SNAPSHOT_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function saveSnapshot(snapshot: DashboardSnapshot): Promise<void> {
  await withTransaction<void>(
    'snapshots', 'readwrite', (store) => { store.put(snapshot); }, false,
  );
}

export async function getSnapshots(fromTime?: number, toTime?: number): Promise<DashboardSnapshot[]> {
  const from = fromTime ?? Date.now() - SNAPSHOT_RETENTION_DAYS * DAY_MS;
  const to = toTime ?? Date.now();

  return (await withTransaction<DashboardSnapshot[]>(
    'snapshots', 'readonly',
    (store) => store.index('by_time').getAll(IDBKeyRange.bound(from, to)),
    true,
  )) || [];
}

export async function getSnapshotAt(timestamp: number): Promise<DashboardSnapshot | null> {
  const snapshots = await getSnapshots(timestamp - 15 * 60 * 1000, timestamp + 15 * 60 * 1000);
  if (snapshots.length === 0) return null;

  // Find closest snapshot to requested time
  return snapshots.reduce((closest, snap) =>
    Math.abs(snap.timestamp - timestamp) < Math.abs(closest.timestamp - timestamp) ? snap : closest
  );
}

export async function cleanOldSnapshots(): Promise<void> {
  const cutoff = Date.now() - SNAPSHOT_RETENTION_DAYS * DAY_MS;

  await withTransaction<void>(
    'snapshots', 'readwrite',
    (store, tx) => {
      const request = store.index('by_time').openCursor(IDBKeyRange.upperBound(cutoff));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      void tx;
    },
    false,
  );
}

export async function getSnapshotTimestamps(): Promise<number[]> {
  return (await withTransaction<number[]>(
    'snapshots', 'readonly', (store) => store.getAllKeys() as IDBRequest<number[]>, true,
  )) || [];
}
