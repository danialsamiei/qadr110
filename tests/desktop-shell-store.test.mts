import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DESKTOP_SHELL_STATE_KEYS,
  isManagedDesktopShellKey,
  resolveManagedDesktopShellValue,
} from '../src/services/desktop-shell-store.ts';
import { isAllowedDesktopExternalUrl } from '../src/services/desktop-opener.ts';

test('desktop shell managed keys cover layout and theme state only', () => {
  assert.ok(DESKTOP_SHELL_STATE_KEYS.includes('panel-order'));
  assert.ok(DESKTOP_SHELL_STATE_KEYS.includes('qadr110-theme'));
  assert.ok(DESKTOP_SHELL_STATE_KEYS.includes('qadr110-font-family'));
  assert.equal(isManagedDesktopShellKey('qadr110-settings-open'), false);
});

test('desktop shell migration keeps plugin-store as canonical source when present', () => {
  assert.deepEqual(
    resolveManagedDesktopShellValue('legacy-value', 'store-value'),
    { localValue: 'store-value', storeValue: 'store-value' },
  );

  assert.deepEqual(
    resolveManagedDesktopShellValue('local-only', undefined),
    { localValue: 'local-only', storeValue: 'local-only' },
  );

  assert.deepEqual(
    resolveManagedDesktopShellValue(null, undefined),
    { localValue: null, storeValue: undefined },
  );
});

test('desktop opener keeps the previous safe external URL policy', () => {
  assert.equal(isAllowedDesktopExternalUrl('https://qadr.alefba.dev/pro'), true);
  assert.equal(isAllowedDesktopExternalUrl('http://localhost:3000'), true);
  assert.equal(isAllowedDesktopExternalUrl('http://127.0.0.1:46123/api/health'), true);
  assert.equal(isAllowedDesktopExternalUrl('http://example.com'), false);
  assert.equal(isAllowedDesktopExternalUrl('javascript:alert(1)'), false);
  assert.equal(isAllowedDesktopExternalUrl('data:text/plain,hi'), false);
});
