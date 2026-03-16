export interface PythonSidecarEnvelope {
  task: 'ontology-sync' | 'dataset-export' | 'graph-analysis';
  payload: Record<string, unknown>;
}

export interface PythonSidecarConfig {
  baseUrl?: string;
}

export function isPythonSidecarConfigured(config: PythonSidecarConfig): boolean {
  return Boolean(config.baseUrl);
}

export async function callPythonSidecar<T>(
  config: PythonSidecarConfig,
  envelope: PythonSidecarEnvelope,
): Promise<T | null> {
  if (!config.baseUrl) return null;

  const response = await fetch(new URL('/bridge', config.baseUrl).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  });

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<T>;
}
