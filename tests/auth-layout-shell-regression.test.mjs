import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

test('layout mode defaults to full unless workspace query explicitly overrides it', () => {
  const app = read('src/App.ts');

  assert.match(app, /function resolveInitialLayoutMode\(\): 'full' \| 'map-only'/);
  assert.match(app, /requestedMode === 'full' \|\| requestedMode === 'map-only'/);
  assert.match(app, /localStorage\.setItem\(QADR_LAYOUT_MODE_KEY, 'full'\)/);
  assert.doesNotMatch(app, /localStorage\.getItem\(QADR_LAYOUT_MODE_KEY\)/);
});

test('auth flow preserves the requested url and exposes trust-device 2FA controls', () => {
  const auth = read('src/services/web-auth.ts');

  assert.match(auth, /const PENDING_URL_KEY = 'qadr110-auth-pending-url'/);
  assert.match(auth, /function captureRequestedUrl\(\)/);
  assert.match(auth, /function restoreRequestedUrl\(\)/);
  assert.match(auth, /captureRequestedUrl\(\);/);
  assert.match(auth, /restoreRequestedUrl\(\);[\s\S]{0,160}overlay\.remove\(\);/);
  assert.match(auth, /ورود این سیستم تا ۳۰ روز حفظ شود/);
  assert.match(auth, /این سیستم تا ۳۰ روز بدون ۲FA معتبر بماند/);
  assert.match(auth, /Google Authenticator را برای/);
  assert.match(auth, /کلید دستی/);
  assert.match(auth, /isAuthSessionResponse/);
});

test('desktop shell includes launcher, clock, and custom floating windows in taskbar flows', () => {
  const layout = read('src/app/panel-layout.ts');
  const mapAware = read('src/services/MapAwareAiBridge.ts');
  const scenarioMap = read('src/services/ScenarioMapOverlay.ts');

  assert.match(layout, /qadrWindowTaskbar/);
  assert.match(layout, /qadrWindowLauncherButton/);
  assert.match(layout, /qadrWindowClockButton/);
  assert.match(layout, /TASKBAR_CLOCK_PRESETS/);
  assert.match(layout, /data-window-taskbar-kind="custom"/);
  assert.match(layout, /status-\$\{item\.status\}/);
  assert.match(layout, /data-clock-choice="\$\{item\.id\}"/);
  assert.match(layout, /setDesktopWindowState\(panelId, 'open'\)/);

  assert.match(mapAware, /registerDesktopWindow\(\{/);
  assert.match(mapAware, /state: 'open'/);
  assert.match(mapAware, /data-map-aware-window-action="minimize"/);
  assert.match(mapAware, /attachFloatingWindowDrag/);

  assert.match(scenarioMap, /registerDesktopWindow\(\{/);
  assert.match(scenarioMap, /state: 'minimized'/);
  assert.match(scenarioMap, /data-scenario-window-action="minimize"/);
  assert.match(scenarioMap, /data-scenario-control="rerun-primary"/);
  assert.match(scenarioMap, /data-scenario-evidence="\$\{item\}"/);
});
