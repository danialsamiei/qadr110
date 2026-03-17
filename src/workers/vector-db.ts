import { hashString } from '@/utils/hash';

const DB_NAME = 'qadr110_vector_store';
const LEGACY_DB_NAME = 'worldmonitor_vector_store';
const DB_VERSION = 1;
const STORE_NAME = 'embeddings';
const MAX_VECTORS = 5000;

export interface StoredVector {
  id: string;
  text: string;
  embedding: Float32Array;
  pubDate: number;
  ingestedAt: number;
  source: string;
  url: string;
  tags?: string[];
}

export interface VectorSearchResult {
  id: string;
  text: string;
  pubDate: number;
  source: string;
  score: number;
  url: string;
  tags?: string[];
  updatedAt?: string;
}

let db: IDBDatabase | null = null;
let queue: Promise<unknown> = Promise.resolve();
let migrationPromise: Promise<void> | null = null;

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const task = queue.then(fn, () => fn());
  queue = task.then(() => {}, () => {});
  return task;
}

async function listDatabaseNames(): Promise<string[]> {
  const factory = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> };
  if (typeof factory.databases !== 'function') return [];
  const entries = await factory.databases();
  return entries.map((entry) => entry.name ?? '').filter(Boolean);
}

function openNamedDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_ingestedAt', 'ingestedAt');
      }
    };
  });
}

async function migrateLegacyDbIfNeeded(targetDb: IDBDatabase): Promise<void> {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const names = await listDatabaseNames();
    if (!names.includes(LEGACY_DB_NAME)) return;

    const existingCount = await new Promise<number>((resolve, reject) => {
      const tx = targetDb.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (existingCount > 0) return;

    const legacyDb = await openNamedDb(LEGACY_DB_NAME);
    try {
      const records = await new Promise<StoredVector[]>((resolve, reject) => {
        const tx = legacyDb.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve((req.result ?? []) as StoredVector[]);
        req.onerror = () => reject(req.error);
      });
      if (records.length === 0) return;

      await new Promise<void>((resolve, reject) => {
        const tx = targetDb.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        records.forEach((record) => store.put(record));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      legacyDb.close();
    }
  })();

  return migrationPromise;
}

function openDB(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      db.onclose = () => { db = null; };
      void migrateLegacyDbIfNeeded(db)
        .catch((error) => {
          console.warn('[vector-db] Legacy IndexedDB migration failed', error);
        })
        .finally(() => resolve(db!));
    };
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_ingestedAt', 'ingestedAt');
      }
    };
  });
}

export function sanitizeTitle(text: string): string {
  return text.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 200);
}

export function makeVectorId(source: string, url: string, pubDate: number, text: string): string {
  return hashString(JSON.stringify([source, url || '', pubDate, text]));
}

export function storeVectors(
  entries: Array<{
    text: string;
    embedding: Float32Array;
    pubDate: number;
    source: string;
    url: string;
    tags?: string[];
  }>
): Promise<number> {
  return enqueue(async () => {
    const database = await openDB();
    const now = Date.now();
    let stored = 0;

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const entry of entries) {
        const clean = sanitizeTitle(entry.text);
        if (!clean) continue;
        stored++;
        const id = makeVectorId(entry.source, entry.url, entry.pubDate, clean);
        store.put({
          id,
          text: clean,
          embedding: entry.embedding,
          pubDate: entry.pubDate,
          ingestedAt: now,
          source: entry.source,
          url: entry.url,
          ...(entry.tags?.length ? { tags: entry.tags } : {}),
        } satisfies StoredVector);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const count = await new Promise<number>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (count > MAX_VECTORS) {
      const toDelete = count - MAX_VECTORS;
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('by_ingestedAt');
        const cursor = index.openCursor();
        let deleted = 0;
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c || deleted >= toDelete) return;
          c.delete();
          deleted++;
          c.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    return stored;
  });
}

export function searchVectors(
  queryEmbeddings: Float32Array[],
  topK: number,
  minScore: number,
  cosineFn: (a: Float32Array, b: Float32Array) => number,
): Promise<VectorSearchResult[]> {
  return enqueue(async () => {
    const database = await openDB();
    const best = new Map<string, {
      id: string;
      text: string;
      pubDate: number;
      source: string;
      score: number;
      url: string;
      tags?: string[];
      updatedAt: string;
    }>();

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const cursor = store.openCursor();

      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return;
        const record = c.value as StoredVector;
        const stored = record.embedding instanceof Float32Array
          ? record.embedding
          : new Float32Array(record.embedding);

        for (const query of queryEmbeddings) {
          const score = cosineFn(query, stored);
          if (score < minScore) continue;
          const existing = best.get(record.id);
          if (!existing || score > existing.score) {
            best.set(record.id, {
              id: record.id,
              text: record.text,
              pubDate: record.pubDate,
              source: record.source,
              score,
              url: record.url,
              tags: record.tags,
              updatedAt: new Date(record.pubDate || record.ingestedAt).toISOString(),
            });
          }
        }
        c.continue();
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return Array.from(best.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  });
}

export function getCount(): Promise<number> {
  return enqueue(async () => {
    const database = await openDB();
    return new Promise<number>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

export function closeDB(): Promise<void> {
  return enqueue(async () => {
    if (db) {
      db.close();
      db = null;
    }
  });
}

export function resetStore(): Promise<void> {
  return enqueue(async () => {
    const database = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
    db = null;
  });
}
