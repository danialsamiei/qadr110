import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_CAPABILITY_REGISTRY } from '../src/platform/capabilities/registry.ts';

describe('QADR foundation capability registry', () => {
  it('covers the required capability kinds for the foundation pass', () => {
    const kinds = new Set(DEFAULT_CAPABILITY_REGISTRY.listCapabilityKinds());
    for (const required of [
      'ingestion',
      'search',
      'retrieval',
      'correlation',
      'geospatial-enrichment',
      'vector-retrieval',
      'scenario-analysis',
      'resilience-scoring',
      'report-generation',
    ]) {
      assert.ok(kinds.has(required), `missing capability kind: ${required}`);
    }
  });

  it('marks OpenRouter as configured when the primary gateway key is present', () => {
    const snapshot = DEFAULT_CAPABILITY_REGISTRY.getStatus('openrouter-gateway', {
      enabledFeatures: ['aiOpenRouter'],
      configuredKeys: ['OPENROUTER_API_KEY'],
    });

    assert.ok(snapshot);
    assert.equal(snapshot?.availability, 'configured');
    assert.deepEqual(snapshot?.missingConfig, []);
    assert.deepEqual(snapshot?.missingFlags, []);
  });

  it('gracefully degrades connectors without required configuration', () => {
    const snapshot = DEFAULT_CAPABILITY_REGISTRY.getStatus('local-llm-hub', {
      enabledFeatures: ['aiOllama'],
      configuredKeys: [],
    });

    assert.ok(snapshot);
    assert.equal(snapshot?.availability, 'missing-configuration');
    assert.deepEqual(snapshot?.missingConfig, ['OLLAMA_API_URL', 'OLLAMA_MODEL']);
    assert.equal(snapshot?.degradation.mode, 'manual');
  });
});
