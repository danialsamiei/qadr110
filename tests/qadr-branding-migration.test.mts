import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QADR_STORAGE_MIGRATION_MARKER,
  getLegacyBrandKeys,
  migrateLegacyBrandStorage,
  normalizeBrandStorageKey,
  readBrandStorageItem,
} from '../src/utils/qadr-branding';

class MemoryStorage {
  #map = new Map<string, string>();

  get length(): number {
    return this.#map.size;
  }

  getItem(key: string): string | null {
    return this.#map.has(key) ? this.#map.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.#map.set(key, value);
  }

  removeItem(key: string): void {
    this.#map.delete(key);
  }

  key(index: number): string | null {
    return [...this.#map.keys()][index] ?? null;
  }
}

test('normalizes legacy storage keys to qadr110 identifiers', () => {
  assert.equal(normalizeBrandStorageKey('worldmonitor-theme'), 'qadr110-theme');
  assert.equal(normalizeBrandStorageKey('worldmonitor_recent_searches'), 'qadr110_recent_searches');
  assert.equal(normalizeBrandStorageKey('wm-map-theme:pmtiles'), 'qadr110-map-theme:pmtiles');
  assert.equal(normalizeBrandStorageKey('wm-update-dismissed-2.6.1'), 'qadr110-update-dismissed-2.6.1');
});

test('reads primary key first and falls back to migrated legacy aliases', () => {
  const storage = new MemoryStorage();
  storage.setItem('worldmonitor-theme', 'light');
  storage.setItem('worldmonitor_recent_searches', '["iran","tehran"]');

  assert.deepEqual(getLegacyBrandKeys('qadr110-theme'), ['worldmonitor-theme']);
  assert.equal(readBrandStorageItem('qadr110-theme', undefined, storage), 'light');
  assert.equal(readBrandStorageItem('qadr110_recent_searches', undefined, storage), '["iran","tehran"]');

  storage.setItem('qadr110-theme', 'dark');
  assert.equal(readBrandStorageItem('qadr110-theme', undefined, storage), 'dark');
});

test('copies old branded localStorage entries to qadr110 keys once', () => {
  const storage = new MemoryStorage();
  storage.setItem('worldmonitor-variant', 'finance');
  storage.setItem('worldmonitor_recent_searches', '["mashhad"]');
  storage.setItem('wm-font-family', 'system');
  storage.setItem('wm-map-theme:pmtiles', 'black');

  migrateLegacyBrandStorage(storage);

  assert.equal(storage.getItem('qadr110-variant'), 'finance');
  assert.equal(storage.getItem('qadr110_recent_searches'), '["mashhad"]');
  assert.equal(storage.getItem('qadr110-font-family'), 'system');
  assert.equal(storage.getItem('qadr110-map-theme:pmtiles'), 'black');
  assert.equal(storage.getItem(QADR_STORAGE_MIGRATION_MARKER), 'done');

  storage.setItem('qadr110-variant', 'full');
  migrateLegacyBrandStorage(storage);
  assert.equal(storage.getItem('qadr110-variant'), 'full');
});
