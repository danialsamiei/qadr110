import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

test('analytical workbench shell keeps the new nested report structure', () => {
  const app = read('src/App.ts');
  const layout = read('src/app/panel-layout.ts');
  const styles = read('src/styles/main.css');
  const rtl = read('src/styles/rtl-overrides.css');

  assert.match(app, /dataset\.qadrShell = 'analytical-workbench'/);
  assert.match(app, /panelLayout\.bindCountryBriefState\(\)/);

  assert.match(layout, /qadrWorkbenchShell/);
  assert.match(layout, /qadrEvidenceDrawer/);
  assert.match(layout, /qadrReportSheetStack/);
  assert.match(layout, /qadrFocusOverlay/);
  assert.match(layout, /qadrCompareOverlay/);
  assert.match(layout, /WORKBENCH_SPECIAL_PAGES/);
  assert.match(layout, /qadr-workbench-page-strip/);
  assert.match(layout, /data-workbench-action="open-page"/);
  assert.match(layout, /data-workbench-sheet="reports"/);
  assert.match(layout, /data-workbench-sheet="timeline"/);
  assert.match(layout, /data-workbench-sheet="notebook"/);
  assert.match(layout, /data-workbench-action="focus"/);
  assert.match(layout, /data-workbench-action="compare"/);
  assert.match(layout, /toggleCompareSelection/);
  assert.match(layout, /toggleFocusMode/);
  assert.match(layout, /openCompareMode/);

  assert.match(styles, /QADR110 Analytical Workbench Shell/);
  assert.match(styles, /--qadr-shell-bg/);
  assert.match(styles, /\.qadr-command-rail/);
  assert.match(styles, /\.qadr-command-rail-page/);
  assert.match(styles, /\.qadr-workbench-stage/);
  assert.match(styles, /\.qadr-workbench-page-strip/);
  assert.match(styles, /\.qadr-evidence-drawer/);
  assert.match(styles, /\.qadr-panel-overlay/);

  assert.match(rtl, /QADR110 analytical workbench/);
  assert.match(rtl, /qadr-workbench-stage/);
  assert.match(rtl, /qadr-workbench-page-btn/);
  assert.match(rtl, /qadr-panel-overlay-body-compare/);
});

test('country deep dive state change is additive for shell and url-sync observers', () => {
  const deepDive = read('src/components/CountryDeepDivePanel.ts');

  assert.match(deepDive, /onStateChangeCallbacks: Array/);
  assert.match(deepDive, /onStateChangeCallbacks\.push\(cb\)/);
  assert.match(deepDive, /onStateChangeCallbacks\.forEach/);
});
