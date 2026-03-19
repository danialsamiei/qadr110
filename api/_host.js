export const QADR_PUBLIC_HOST = 'qadr.alefba.dev';
export const QADR_NATIONAL_HOST = 'qadr.gantor.ir';
export const QADR_DIRECT_IP = '5.235.208.128';
export const QADR_PUBLIC_ORIGIN = `https://${QADR_PUBLIC_HOST}`;

const PROD_BROWSER_ORIGIN_PATTERNS = [
  /^https:\/\/(.*\.)?qadr\.alefba\.dev$/i,
  /^https?:\/\/(.*\.)?qadr\.gantor\.ir$/i,
  /^https?:\/\/5\.235\.208\.128(?::\d+)?$/i,
  /^https:\/\/qadr110-[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/qadr-[a-z0-9-]+\.vercel\.app$/i,
];

const DEV_BROWSER_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
];

const DESKTOP_ORIGIN_PATTERNS = [
  /^https?:\/\/tauri\.localhost(:\d+)?$/i,
  /^https?:\/\/[a-z0-9-]+\.tauri\.localhost(:\d+)?$/i,
  /^tauri:\/\/localhost$/i,
  /^asset:\/\/localhost$/i,
];

const BROWSER_ORIGIN_PATTERNS =
  process.env.NODE_ENV === 'production'
    ? PROD_BROWSER_ORIGIN_PATTERNS
    : [...PROD_BROWSER_ORIGIN_PATTERNS, ...DEV_BROWSER_ORIGIN_PATTERNS];

export function stripPort(host = '') {
  return String(host).trim().toLowerCase().replace(/\.$/, '').split(':')[0] || '';
}

export function isAllowedBrowserOrigin(origin) {
  return Boolean(origin) && BROWSER_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

export function isAllowedDesktopOrigin(origin) {
  return Boolean(origin) && DESKTOP_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

export function getRequestOrigin(req) {
  try {
    const url = new URL(req.url);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.origin;
    }
  } catch {
    // fall through to header-derived origin
  }

  const host = req?.headers?.get?.('host') || QADR_PUBLIC_HOST;
  const forwardedProto = req?.headers?.get?.('x-forwarded-proto') || '';
  const proto = forwardedProto.split(',')[0]?.trim() || 'https';
  return `${proto}://${host}`;
}

export function getDefaultAllowedOrigin(req) {
  const requestOrigin = getRequestOrigin(req);
  if (isAllowedBrowserOrigin(requestOrigin)) {
    return requestOrigin;
  }
  return QADR_PUBLIC_ORIGIN;
}
