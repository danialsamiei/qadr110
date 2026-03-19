import { getCookieDomainForCurrentHost, isKnownQadrAppHostname } from '@/utils/host-routing';

const MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function usesCookies(): boolean {
  return isKnownQadrAppHostname(location.hostname) && Boolean(getCookieDomainForCurrentHost());
}

export function getDismissed(key: string): boolean {
  if (usesCookies()) {
    return document.cookie.split('; ').some((c) => c === `${key}=1`);
  }
  return localStorage.getItem(key) === '1' || localStorage.getItem(key) === 'true';
}

export function setDismissed(key: string): void {
  const cookieDomain = getCookieDomainForCurrentHost();
  if (usesCookies() && cookieDomain) {
    document.cookie = `${key}=1; domain=${cookieDomain}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax; Secure`;
  }
  localStorage.setItem(key, '1');
}
