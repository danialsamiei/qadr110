import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

function readJson(file) {
  return JSON.parse(read(file));
}

test('branding uses QADR110 on offline and desktop shell surfaces', () => {
  const offline = read('public/offline.html');
  const tauriConfig = read('src-tauri/tauri.conf.json');
  const tauriMain = read('src-tauri/src/main.rs');
  const settings = read('settings.html');
  const liveChannels = read('live-channels.html');

  assert.match(offline, /QADR110/);
  assert.match(tauriConfig, /"productName": "QADR110"/);
  assert.match(tauriConfig, /"title": "QADR110"/);
  assert.match(tauriMain, /تنظیمات QADR110/);
  assert.match(tauriMain, /QADR110 \| مدیریت کانال‌ها/);
  assert.match(settings, /QADR110/);
  assert.match(liveChannels, /QADR110/);
});

test('analysis hub and persian strategic panel use i18n keys (no hardcoded prose blocks)', () => {
  const hub = read('src/components/WorldMonitoringHubPanel.ts');
  const strategic = read('src/components/PersianStrategicPanel.ts');

  assert.match(hub, /t\('components\.analysisHub\./);
  assert.match(hub, /t\('panels\.analysisHub'\)/);
  assert.match(strategic, /t\('components\.persianAnalysis\./);
  assert.match(strategic, /t\('panels\.persianAnalysis'\)/);
});

test('locale keys for touched Persian-first modules exist in en/fa and preserve parity', () => {
  const en = readJson('src/locales/en.json');
  const fa = readJson('src/locales/fa.json');

  assert.equal(typeof en.common.analyzeWithAi, 'string');
  assert.equal(typeof fa.common.analyzeWithAi, 'string');

  assert.equal(typeof en.panels.analysisHub, 'string');
  assert.equal(typeof fa.panels.analysisHub, 'string');
  assert.equal(typeof en.panels.persianAnalysis, 'string');
  assert.equal(typeof fa.panels.persianAnalysis, 'string');

  assert.equal(typeof en.components.analysisHub.disclaimer, 'string');
  assert.equal(typeof fa.components.analysisHub.disclaimer, 'string');
  assert.equal(typeof en.components.persianAnalysis.disclaimer, 'string');
  assert.equal(typeof fa.components.persianAnalysis.disclaimer, 'string');
});


test('road traffic layer is registered and localized in touched traffic-map surfaces', () => {
  const layerDefs = read('src/config/map-layer-definitions.ts');
  const mapTs = read('src/components/Map.ts');
  const loader = read('src/app/data-loader.ts');
  const en = readJson('src/locales/en.json');
  const fa = readJson('src/locales/fa.json');

  assert.match(layerDefs, /roadTraffic/);
  assert.match(mapTs, /components\.deckgl\.layers\.roadTraffic/);
  assert.match(loader, /loadRoadTraffic\(/);
  assert.equal(typeof en.components.deckgl.layers.roadTraffic, 'string');
  assert.equal(typeof fa.components.deckgl.layers.roadTraffic, 'string');
  assert.equal(typeof en.popups.roadTraffic.currentSpeed, 'string');
  assert.equal(typeof fa.popups.roadTraffic.currentSpeed, 'string');
});
