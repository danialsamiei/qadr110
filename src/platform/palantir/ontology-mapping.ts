import type { IntelligenceOntologyBundle } from '../domain/ontology';
import type { PalantirCompatibilityEnvelope } from '../interoperability/contracts';
import { buildFoundryLikeRid, buildOntologyObjectTypeId } from './resource-ids';

export interface PalantirCompatibilityOptions {
  foundryConfigured: boolean;
}

export interface OntologyObjectMapping {
  objectType: string;
  rid: string;
  label: string;
}

export function mapBundleToOntologyObjects(bundle: IntelligenceOntologyBundle): OntologyObjectMapping[] {
  const entities = bundle.entities.map((entity) => ({
    objectType: buildOntologyObjectTypeId('qadr', entity.kind),
    rid: buildFoundryLikeRid('qadr110', entity.kind, entity.id),
    label: entity.name,
  }));
  const events = bundle.events.map((event) => ({
    objectType: buildOntologyObjectTypeId('qadr', event.kind),
    rid: buildFoundryLikeRid('qadr110', event.kind, event.id),
    label: event.title,
  }));
  const documents = bundle.documents.map((document) => ({
    objectType: buildOntologyObjectTypeId('qadr', document.kind),
    rid: buildFoundryLikeRid('qadr110', document.kind, document.id),
    label: document.title,
  }));

  return [...entities, ...events, ...documents];
}

export function buildPalantirCompatibilityEnvelope(
  bundle: IntelligenceOntologyBundle,
  options: PalantirCompatibilityOptions,
): PalantirCompatibilityEnvelope {
  const objects = mapBundleToOntologyObjects(bundle);
  const warnings = [
    'This module provides compatibility mappings and optional API boundaries, not a bundled native proprietary integration.',
  ];
  if (!options.foundryConfigured) {
    warnings.push('Foundry-like live API mode is disabled because credentials/endpoints are not configured.');
  }

  return {
    id: 'qadr-palantir-compatibility',
    generatedAt: new Date().toISOString(),
    objectTypes: Array.from(new Set(objects.map((object) => object.objectType))),
    objectCount: objects.length,
    relationCount: bundle.relationships.length,
    resourceIds: objects.slice(0, 25).map((object) => object.rid),
    liveConnectionConfigured: options.foundryConfigured,
    warnings,
  };
}
