export type StableIdentifier = string;

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildStableId(namespace: string, type: string, localId: string): StableIdentifier {
  const parts = [namespace, type, localId]
    .map(sanitizeSegment)
    .filter(Boolean);
  return parts.join(':');
}

export function buildOntologyRef(scheme: string, term: string): string {
  return `${sanitizeSegment(scheme)}:${sanitizeSegment(term)}`;
}

export function isStableId(value: string): boolean {
  return /^[a-z0-9]+(?::[a-z0-9-]+)+$/.test(value.trim().toLowerCase());
}
