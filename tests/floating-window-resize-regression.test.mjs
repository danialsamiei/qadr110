import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

test('floating window state persists size and clamp helpers support viewport-safe resizing', () => {
  const service = read('src/services/qadr-floating-window.ts');

  assert.match(service, /export interface FloatingWindowSize/);
  assert.match(service, /size\?: FloatingWindowSize \| null/);
  assert.match(service, /export function clampFloatingWindowSize/);
  assert.match(service, /minWidth = options\.minWidth \?\? 320/);
  assert.match(service, /minHeight = options\.minHeight \?\? 220/);
});

test('map-aware and scenario cards persist resized geometry and stay constrained above taskbar', () => {
  const mapAware = read('src/services/MapAwareAiBridge.ts');
  const scenarioMap = read('src/services/ScenarioMapOverlay.ts');
  const styles = read('src/styles/main.css');

  assert.match(mapAware, /private resizeObserver: ResizeObserver \| null = null/);
  assert.match(mapAware, /clampFloatingWindowSize/);
  assert.match(mapAware, /card\.style\.width =/);
  assert.match(mapAware, /card\.style\.height =/);
  assert.match(mapAware, /bottomInset: 92/);

  assert.match(scenarioMap, /private resizeObserver: ResizeObserver \| null = null/);
  assert.match(scenarioMap, /clampFloatingWindowSize/);
  assert.match(scenarioMap, /card\.style\.width =/);
  assert.match(scenarioMap, /card\.style\.height =/);
  assert.match(scenarioMap, /data-scenario-control=\"show-more-evidence\"/);

  assert.match(styles, /\.qadr-map-aware-card \{/);
  assert.match(styles, /resize: both;/);
  assert.match(styles, /max-height: min\(32rem, calc\(100vh - 6rem\)\)/);
  assert.match(styles, /\.qadr-scenario-map-card \{/);
  assert.match(styles, /max-height: min\(34rem, calc\(100vh - 6rem\)\)/);
});
