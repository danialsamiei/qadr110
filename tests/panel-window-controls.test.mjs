import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(file) {
  return fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

test('panel base enforces minimize and close controls on retrieval', () => {
  const panel = read('src/components/Panel.ts');

  assert.match(panel, /private readonly closable: boolean;/);
  assert.match(panel, /protected ensureWindowControls\(\): void \{/);
  assert.match(panel, /panel-minimize-btn/);
  assert.match(panel, /panel-close-btn/);
  assert.match(panel, /public getElement\(\): HTMLElement \{\s*this\.ensureWindowControls\(\);/s);
});

test('live stream panels remain closable by default', () => {
  const liveNews = read('src/components/LiveNewsPanel.ts');
  const liveWebcams = read('src/components/LiveWebcamsPanel.ts');

  assert.doesNotMatch(liveNews, /closable:\s*false/);
  assert.doesNotMatch(liveWebcams, /closable:\s*false/);
});
