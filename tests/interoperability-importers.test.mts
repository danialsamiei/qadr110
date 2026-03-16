import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseStructuredImport } from '../src/platform/interoperability/importers.ts';

describe('structured importers', () => {
  it('parses CSV rows into portable records', () => {
    const records = parseStructuredImport({
      format: 'csv',
      content: 'kind,title,lat,lon\nentity,Border Post,35.7,51.4',
      sourceLabel: 'csv',
    });

    assert.equal(records.length, 1);
    assert.equal(records[0]?.kind, 'entity');
    assert.equal(records[0]?.title, 'Border Post');
  });

  it('parses GeoJSON features into geography records', () => {
    const records = parseStructuredImport({
      format: 'geojson',
      content: JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'hotspot-1',
            properties: { name: 'Hotspot Alpha', description: 'Observed congestion' },
            geometry: { type: 'Point', coordinates: [51.4, 35.7] },
          },
        ],
      }),
      sourceLabel: 'geojson',
    });

    assert.equal(records.length, 1);
    assert.equal(records[0]?.kind, 'geography');
    assert.equal(records[0]?.lat, 35.7);
    assert.equal(records[0]?.lon, 51.4);
  });
});
