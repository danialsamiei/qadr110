import { isDesktopRuntime } from './runtime';

const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1']);

function normalizeUrl(candidate: string | URL): URL {
  if (candidate instanceof URL) return candidate;
  if (typeof window === 'undefined') {
    return new URL(candidate);
  }
  return new URL(candidate, window.location.href);
}

export function isAllowedDesktopExternalUrl(candidate: string | URL): boolean {
  let url: URL;
  try {
    url = normalizeUrl(candidate);
  } catch {
    return false;
  }

  if (url.protocol === 'https:') return true;
  if (url.protocol !== 'http:') return false;
  return LOCAL_HTTP_HOSTS.has(url.hostname);
}

export async function openExternalUrl(candidate: string | URL): Promise<void> {
  const url = normalizeUrl(candidate);
  const href = url.toString();

  if (!isAllowedDesktopExternalUrl(url)) {
    throw new Error(`Refusing to open unsupported external URL: ${href}`);
  }

  if (isDesktopRuntime()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(href);
      return;
    } catch (error) {
      console.warn('[desktop-opener] Falling back to window.open', error);
    }
  }

  if (typeof window !== 'undefined') {
    window.open(href, '_blank', 'noopener');
  }
}
