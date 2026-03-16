import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildInvestigationWorkbench } from '../src/platform/investigation/services.ts';
import { normalizeStructuredRecords } from '../src/platform/interoperability/normalizers.ts';
import { buildStableId } from '../src/platform/domain/ids.ts';
import { createConfidence, createProvenanceFromEvidence } from '../src/platform/domain/ontology.ts';

describe('investigation workflows', () => {
  it('clusters near duplicates and matches watchlists', () => {
    const bundle = normalizeStructuredRecords([
      {
        kind: 'document',
        title: 'Supply route disruption near corridor',
        summary: 'Supply route disruption near corridor',
      },
      {
        kind: 'document',
        title: 'Supply route disruption near corridor',
        summary: 'Supply route disruption near corridor',
      },
      {
        kind: 'indicator',
        value: 'supply-route-alpha',
      },
    ], 'Investigation feed');

    bundle.watchlists.push({
      id: buildStableId('test', 'watchlist', 'supply'),
      title: 'Supply route watchlist',
      scope: 'narrative',
      ruleCount: 1,
      rules: [{
        id: 'rule-1',
        label: 'supply-route',
        pattern: 'supply route',
        severity: 'watch',
      }],
      labels: ['watchlist'],
      time: {
        createdAt: '2026-03-16T00:00:00.000Z',
        updatedAt: '2026-03-16T00:00:00.000Z',
      },
      confidence: createConfidence(0.8, 'Analyst-authored watchlist'),
      provenance: createProvenanceFromEvidence([], []),
      audit: { revision: 1, createdBy: 'test' },
    });

    const workbench = buildInvestigationWorkbench(bundle);

    assert.equal(workbench.duplicateClusters.length, 1);
    assert.equal(workbench.watchlistMatches.length, 1);
    assert.ok(workbench.promptEvidence.evidenceIds.length >= 2);
  });
});
