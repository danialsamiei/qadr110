import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeNewsItems, normalizeStructuredRecords } from '../src/platform/interoperability/normalizers.ts';

describe('ontology normalization', () => {
  it('normalizes structured records into canonical ontology bundles', () => {
    const bundle = normalizeStructuredRecords([
      {
        kind: 'entity',
        title: 'Actor Alpha',
        aliases: ['Alpha Group'],
        lat: 35.7,
        lon: 51.4,
        countryCode: 'IR',
      },
      {
        kind: 'indicator',
        value: '198.51.100.10',
        tags: ['ip'],
      },
    ], 'Structured feed');

    assert.equal(bundle.sources.length, 1);
    assert.equal(bundle.entities.length, 1);
    assert.equal(bundle.indicators.length, 1);
    assert.equal(bundle.geographies.length, 1);
    assert.equal(bundle.evidence.length, 2);
  });

  it('normalizes feed items into reports, events, claims, and alerts', () => {
    const bundle = normalizeNewsItems([
      {
        source: 'Reuters',
        title: 'Border crossing sees unusual convoy activity',
        link: 'https://example.test/item-1',
        pubDate: new Date('2026-03-16T00:00:00.000Z'),
        isAlert: true,
        lat: 35.7,
        lon: 51.4,
      },
    ]);

    assert.equal(bundle.documents.length, 1);
    assert.equal(bundle.events.length, 1);
    assert.equal(bundle.claims.length, 1);
    assert.equal(bundle.alerts.length, 1);
    assert.equal(bundle.relationships[0]?.kind, 'reported-by');
  });
});
