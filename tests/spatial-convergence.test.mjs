import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('spatial convergence service includes geo inference and convergence scoring primitives', () => {
  const src = read('src/services/spatial-convergence.ts');
  assert.match(src, /function extractCountryCodeFromTitle/);
  assert.match(src, /export function normalizePolymarket/);
  assert.match(src, /export function buildConvergenceSignals/);
  assert.match(src, /distinctSources < 2/);
  assert.match(src, /buildDeterministicConvergenceNarrative/);
});

test('data loader wires polymarket\+gdelt\+cyber convergence overlay refresh', () => {
  const src = read('src/app/data-loader.ts');
  assert.match(src, /buildConvergenceSignals/);
  assert.match(src, /refreshConvergenceOverlay/);
  assert.match(src, /setConvergenceSignals/);
});
