import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { getDemoModeState } from '../src/platform/operations/demo-mode.ts';

const ORIGINAL_FLAG = process.env.VITE_DEMO_MODE;

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) {
    delete process.env.VITE_DEMO_MODE;
  } else {
    process.env.VITE_DEMO_MODE = ORIGINAL_FLAG;
  }
});

describe('demo mode', () => {
  it('enables via VITE_DEMO_MODE env', () => {
    process.env.VITE_DEMO_MODE = '1';
    const state = getDemoModeState();
    assert.equal(state.enabled, true);
    assert.equal(state.source, 'env');
  });

  it('defaults to disabled when no flags are present', () => {
    delete process.env.VITE_DEMO_MODE;
    const state = getDemoModeState();
    assert.equal(state.enabled, false);
    assert.equal(state.source, 'off');
  });
});

