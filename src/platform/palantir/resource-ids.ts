import { buildStableId } from '../domain/ids';

export function buildCanonicalResourceId(resourceType: string, namespace: string, localId: string): string {
  return buildStableId(namespace, resourceType, localId);
}

export function buildFoundryLikeRid(dataset: string, objectType: string, localId: string): string {
  return `ri.foundry.${buildStableId(dataset, objectType, localId)}`;
}

export function buildOntologyObjectTypeId(namespace: string, objectType: string): string {
  return `${namespace}.${objectType}`.toLowerCase().replace(/[^a-z0-9.]+/g, '_');
}
