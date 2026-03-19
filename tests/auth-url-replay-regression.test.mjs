import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

test('auth flow keeps the requested url in session storage until post-login restore runs', () => {
  const auth = read('src/services/web-auth.ts');

  assert.match(auth, /const PENDING_URL_KEY = 'qadr110-auth-pending-url'/);
  assert.match(auth, /function captureRequestedUrl\(\)/);
  assert.match(auth, /function restoreRequestedUrl\(\)/);
  assert.match(auth, /captureRequestedUrl\(\);/);
  assert.match(auth, /restoreRequestedUrl\(\);[\s\S]{0,220}overlay\.remove\(\);/);
});

test('url sync defers early replacement until the requested viewport has replayed', () => {
  const handlers = read('src/app/event-handlers.ts');
  const layout = read('src/app/panel-layout.ts');
  const mapContainer = read('src/components/MapContainer.ts');

  assert.match(handlers, /private shouldDeferInitialUrlSync\(\): boolean/);
  assert.match(handlers, /if \(this\.shouldDeferInitialUrlSync\(\)\) \{\s*return;\s*\}/);
  assert.match(handlers, /if \(!this\.shouldDeferInitialUrlSync\(\)\) \{\s*this\.debouncedUrlSync\(\);\s*\}/);
  assert.match(layout, /const applyExactViewport = \(\): void =>/);
  assert.match(layout, /window\.setTimeout\(\(\) => \{\s*applyExactViewport\(\);\s*\}, 900\);/);
  assert.match(mapContainer, /public setWorldCopies\(enabled: boolean\): void/);
});
