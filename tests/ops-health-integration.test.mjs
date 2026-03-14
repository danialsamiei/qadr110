import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('ops health api includes gdelt and ipx health components', () => {
  const text = read('api/ops-health.js');
  assert.match(text, /components:\s*\{[\s\S]*gdelt:[\s\S]*ipx:/);
  assert.match(text, /searchGdeltDocuments/);
  assert.match(text, /api\/ipx-status/);
});

test('infra traffic panel consumes realtime fusion snapshot and renders freshness', () => {
  const text = read('src/components/InfraTrafficCyberPanel.ts');
  assert.match(text, /loadRealtimeFusionSnapshot/);
  assert.match(text, /components\.infraTraffic\.freshnessLabel/);
  assert.match(text, /components\.infraTraffic\.retry/);
});

test('gdelt panel exposes localized health and last update labels', () => {
  const text = read('src/components/GdeltIntelPanel.ts');
  assert.match(text, /components\.gdeltIntel\.health/);
  assert.match(text, /components\.gdeltIntel\.lastUpdate/);
});
