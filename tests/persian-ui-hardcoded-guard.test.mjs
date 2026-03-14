import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('critical UI surfaces use i18n keys instead of hardcoded English', () => {
  const market = read('src/components/MarketPanel.ts');
  assert.doesNotMatch(market, /Market watchlist|Customize market watchlist|Add extra tickers|\bReset\b|\bCancel\b|\bSave\b/);
  assert.match(market, /components\.market\.watchlist\./);

  const map = read('src/components/Map.ts');
  assert.doesNotMatch(map, /aria-label="Zoom in"|aria-label="Zoom out"|aria-label="Reset rotation"|TIME RANGE/);
  assert.match(map, /components\.deckgl\.zoomIn/);

  const webcams = read('src/components/LiveWebcamsPanel.ts');
  assert.doesNotMatch(webcams, /This stream is blocked or failed to load\.|Open on YouTube|\|\| 'Retry'/);
  assert.match(webcams, /components\.liveWebcams\.embedBlocked/);

  const country = read('src/components/CountryDeepDivePanel.ts');
  assert.doesNotMatch(country, /Loading country headlines|Loading flights, vessels, and nearby bases|Loading available indicators|Loading top high-severity signals|\bProbability:|\bVolume:|\bOpen'/);
  assert.match(country, /countryBrief\.loadingHeadlines/);

  const aviation = read('src/components/AviationCommandBar.ts');
  assert.doesNotMatch(aviation, /Aviation Command|No ops data found|No prices found|No recent aviation news|Unrecognized command|Running…|Error:|Unknown error/);
  assert.match(aviation, /components\.aviationCommand\./);
});
