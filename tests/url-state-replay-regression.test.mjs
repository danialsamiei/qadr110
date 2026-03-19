import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const panelLayoutSource = fs.readFileSync(
  new URL('../src/app/panel-layout.ts', import.meta.url),
  'utf8',
);

test('initial url state replays explicit lat/lon even at low zoom', () => {
  assert.match(
    panelLayoutSource,
    /const hasExplicitCenter = lat !== undefined && lon !== undefined;/,
  );
  assert.match(
    panelLayoutSource,
    /if \(view && !hasExplicitCenter\) \{\s*this\.ctx\.map\.setView\(view\);/s,
  );
  assert.match(
    panelLayoutSource,
    /if \(hasExplicitCenter\) \{\s*const effectiveZoom = zoom \?\? this\.ctx\.map\.getState\(\)\.zoom;\s*if \(effectiveZoom <= 2\) \{\s*this\.ctx\.map\.setWorldCopies\(true\);\s*\}\s*this\.ctx\.map\.setCenter\(lat, lon, effectiveZoom\);/s,
  );
  assert.doesNotMatch(panelLayoutSource, /if \(effectiveZoom > 2\)/);
});
