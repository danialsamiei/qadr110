import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const repoRoot = new URL('../', import.meta.url);

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, repoRoot), 'utf8');
}

test('i18n locale loader uses direct import.meta.glob so production builds include fa bundle', () => {
  const source = read('src/services/i18n.ts');
  assert.match(source, /const localeModules = import\.meta\.glob/);
  assert.doesNotMatch(source, /i18nMeta\.glob/);
  assert.match(source, /SUPPORTED_LANGUAGES = \['fa', 'en'/);
});

test('built dist includes a dedicated fa locale chunk', () => {
  const distAssets = fs.readdirSync(new URL('dist/assets/', repoRoot));
  assert.ok(
    distAssets.some((entry) => /^locale-fa-.*\.js$/.test(entry)),
    'expected dist/assets to include a locale-fa chunk',
  );
});
