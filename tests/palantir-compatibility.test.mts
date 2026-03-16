import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildConjureLikeBoundary } from '../src/platform/palantir/conjure-boundary.ts';
import { buildPalantirCompatibilityEnvelope } from '../src/platform/palantir/ontology-mapping.ts';
import { buildFoundryLikeRid } from '../src/platform/palantir/resource-ids.ts';
import { normalizeStructuredRecords } from '../src/platform/interoperability/normalizers.ts';

describe('Palantir compatibility layer', () => {
  it('builds OSDK-inspired compatibility envelopes without claiming live integration', () => {
    const bundle = normalizeStructuredRecords([
      { kind: 'entity', title: 'Actor Alpha' },
      { kind: 'event', title: 'Incident Bravo', summary: 'Observed near route' },
    ], 'Palantir compatibility');

    const envelope = buildPalantirCompatibilityEnvelope(bundle, { foundryConfigured: false });

    assert.ok(envelope.objectCount >= 2);
    assert.equal(envelope.liveConnectionConfigured, false);
    assert.ok(envelope.warnings.some((warning) => warning.includes('not a bundled native proprietary integration')));
  });

  it('exposes a conjure-like typed boundary and deterministic resource identifiers', () => {
    const boundary = buildConjureLikeBoundary('foundry');
    const rid = buildFoundryLikeRid('qadr110', 'entity', 'actor-alpha');

    assert.equal(boundary.endpoints.length, 2);
    assert.match(rid, /^ri\.foundry\./);
  });
});
