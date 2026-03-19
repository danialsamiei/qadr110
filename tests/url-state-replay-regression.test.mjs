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
    /if \(lat !== undefined && lon !== undefined\) \{\s*const effectiveZoom = zoom \?\? this\.ctx\.map\.getState\(\)\.zoom;\s*this\.ctx\.map\.setCenter\(lat, lon, effectiveZoom\);/s,
  );
  assert.doesNotMatch(panelLayoutSource, /if \(effectiveZoom > 2\)/);
});
