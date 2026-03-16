import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_INTEROPERABILITY_REGISTRY } from '../src/platform/interoperability/registry.ts';

const context = {
  enabledFeatures: new Set<string>(['vectorWeaviate', 'vectorChroma', 'palantirFoundry']),
  configuredKeys: new Set<string>(['WEAVIATE_URL', 'PALANTIR_FOUNDRY_URL', 'PALANTIR_FOUNDRY_TOKEN']),
  configValues: {
    WEAVIATE_URL: 'https://weaviate.example',
    PALANTIR_FOUNDRY_URL: 'https://foundry.example',
    PALANTIR_FOUNDRY_TOKEN: 'token-123',
  },
  transport: 'web' as const,
  now: '2026-03-16T00:00:00.000Z',
};

describe('interoperability registry', () => {
  it('exposes the adapter families required by the interoperability pass', () => {
    const ids = new Set(DEFAULT_INTEROPERABILITY_REGISTRY.listAdapters().map((adapter) => adapter.id));
    for (const required of [
      'generic-structured-import',
      'osint-ingestion-hub',
      'misp-stix-bridge',
      'vector-store-bridge',
      'geospatial-workbench',
      'investigation-workbench',
      'simulation-exchange',
      'palantir-compatibility',
    ]) {
      assert.ok(ids.has(required), `missing interoperability adapter: ${required}`);
    }
  });

  it('reports Palantir compatibility as available without claiming a native live integration', () => {
    const health = DEFAULT_INTEROPERABILITY_REGISTRY.getHealth('palantir-compatibility', context);
    assert.ok(health);
    assert.equal(health?.availability, 'available');
    assert.match(health?.degradationMessage || '', /ontology mappings/i);
  });
});
