export interface FoundryLikeClientConfig {
  baseUrl?: string;
  token?: string;
}

export interface FoundryLikeRequest {
  path: string;
  method?: 'GET' | 'POST';
  body?: unknown;
}

export function isFoundryLikeConfigured(config: FoundryLikeClientConfig): boolean {
  return Boolean(config.baseUrl && config.token);
}

export async function callFoundryLikeApi<T>(
  config: FoundryLikeClientConfig,
  request: FoundryLikeRequest,
): Promise<T | null> {
  if (!isFoundryLikeConfigured(config)) return null;

  const response = await fetch(new URL(request.path, config.baseUrl).toString(), {
    method: request.method ?? 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: request.body ? JSON.stringify(request.body) : undefined,
  });

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<T>;
}
