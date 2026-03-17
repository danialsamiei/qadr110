import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

test('QADRPredict brand and Persian localization are wired into the embedded predict app', () => {
  const app = read('predict/frontend/src/App.vue');
  const brand = read('predict/frontend/src/brand.js');
  const main = read('predict/frontend/src/main.js');
  const home = read('predict/frontend/src/views/Home.vue');

  assert.match(brand, /APP_BRAND = 'QADRPredict'/);
  assert.match(brand, /کارگاه فارسی پیش بینی/);
  assert.match(main, /document\.documentElement\.lang = 'fa'/);
  assert.match(main, /document\.documentElement\.dir = 'rtl'/);
  assert.match(main, /installPersianUiLocalization/);
  assert.match(app, /predict-brand-badge/);
  assert.match(home, /QADRPredict Core/);
  assert.match(home, /شروع شبیه سازی/);
});
