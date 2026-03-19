export const QADR_PUBLIC_HOST = 'qadr.alefba.dev';
export const QADR_NATIONAL_HOST = 'qadr.gantor.ir';
export const QADR_DIRECT_IP = '5.235.208.128';
export const QADR_PUBLIC_API_HOST = 'api.alefba.dev';
export const QADR_PUBLIC_PREDICT_HOST = 'predict.alefba.dev';
export const QADR_PUBLIC_PROXY_HOST = 'proxy.qadr.alefba.dev';
export const QADR_PUBLIC_ORIGIN = `https://${QADR_PUBLIC_HOST}`;

export interface HostLocationLike {
  origin?: string;
  protocol?: string;
  host?: string;
  hostname?: string;
}

function normalizeHostValue(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '').split(':')[0] ?? '';
}

export function stripPort(host: string): string {
  return normalizeHostValue(host);
}

export function isPublicQadrHostname(hostname: string): boolean {
  const normalized = normalizeHostValue(hostname);
  return normalized === QADR_PUBLIC_HOST || normalized.endsWith(`.${QADR_PUBLIC_HOST}`);
}

export function isNationalQadrHostname(hostname: string): boolean {
  const normalized = normalizeHostValue(hostname);
  return normalized === QADR_NATIONAL_HOST || normalized.endsWith(`.${QADR_NATIONAL_HOST}`);
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = normalizeHostValue(hostname);
  return normalized === 'localhost' || normalized === '127.0.0.1';
}

export function isKnownQadrAppHostname(hostname: string): boolean {
  const normalized = normalizeHostValue(hostname);
  return normalized === QADR_DIRECT_IP
    || isLoopbackHostname(normalized)
    || isPublicQadrHostname(normalized)
    || isNationalQadrHostname(normalized);
}

export function isKnownQadrOrigin(origin: string): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    return isKnownQadrAppHostname(url.hostname);
  } catch {
    return false;
  }
}

export function getHostAwareOriginFromLocation(
  locationLike?: HostLocationLike | null,
  fallbackOrigin = QADR_PUBLIC_ORIGIN,
): string {
  if (!locationLike) return fallbackOrigin;

  const protocol = typeof locationLike.protocol === 'string' ? locationLike.protocol : '';
  const host = typeof locationLike.host === 'string' ? locationLike.host : '';
  const origin = typeof locationLike.origin === 'string' ? locationLike.origin : '';

  if ((protocol === 'http:' || protocol === 'https:') && host) {
    return `${protocol}//${host}`.replace(/\/$/, '');
  }

  if (origin && /^https?:\/\//i.test(origin)) {
    return origin.replace(/\/$/, '');
  }

  const hostname = typeof locationLike.hostname === 'string' ? locationLike.hostname : '';
  if (hostname && isKnownQadrAppHostname(hostname)) {
    const preferredProtocol = isNationalQadrHostname(hostname) || normalizeHostValue(hostname) === QADR_DIRECT_IP
      ? 'http:'
      : 'https:';
    return `${preferredProtocol}//${hostname}`.replace(/\/$/, '');
  }

  return fallbackOrigin;
}

export function getCurrentAppOrigin(fallbackOrigin = QADR_PUBLIC_ORIGIN): string {
  if (typeof window === 'undefined' || !window.location) {
    return fallbackOrigin;
  }
  return getHostAwareOriginFromLocation(window.location, fallbackOrigin);
}

export function buildHostAwareUrl(path: string, origin = getCurrentAppOrigin()): string {
  return new URL(path, origin.endsWith('/') ? origin : `${origin}/`).toString();
}

export function getCookieDomainForHostname(hostname: string): string | null {
  if (isPublicQadrHostname(hostname)) return `.${QADR_PUBLIC_HOST}`;
  if (isNationalQadrHostname(hostname)) return `.${QADR_NATIONAL_HOST}`;
  return null;
}

export function getCookieDomainForCurrentHost(): string | null {
  if (typeof window === 'undefined' || !window.location) {
    return null;
  }
  return getCookieDomainForHostname(window.location.hostname);
}
