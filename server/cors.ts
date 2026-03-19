/**
 * CORS header generation -- TypeScript port of api/_cors.js.
 *
 * Identical ALLOWED_ORIGIN_PATTERNS and logic, with methods set
 * to 'GET, POST, OPTIONS' (sebuf routes support GET and POST).
 */

const PRODUCTION_PATTERNS: RegExp[] = [
  /^https:\/\/(.*\.)?qadr\.alefba\.dev$/,
  /^https?:\/\/(.*\.)?qadr\.gantor\.ir$/i,
  /^https?:\/\/5\.235\.208\.128(?::\d+)?$/i,
  /^https:\/\/qadr110-[a-z0-9-]+\.vercel\.app$/,
  /^https:\/\/qadr-[a-z0-9-]+\.vercel\.app$/,
  /^https?:\/\/tauri\.localhost(:\d+)?$/,
  /^https?:\/\/[a-z0-9-]+\.tauri\.localhost(:\d+)?$/i,
  /^tauri:\/\/localhost$/,
  /^asset:\/\/localhost$/,
];

const DEV_PATTERNS: RegExp[] = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
];

const ALLOWED_ORIGIN_PATTERNS: RegExp[] =
  process.env.NODE_ENV === 'production'
    ? PRODUCTION_PATTERNS
    : [...PRODUCTION_PATTERNS, ...DEV_PATTERNS];

function isAllowedOrigin(origin: string): boolean {
  return Boolean(origin) && ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

function getDefaultAllowedOrigin(req: Request): string {
  try {
    const url = new URL(req.url);
    if (isAllowedOrigin(url.origin)) {
      return url.origin;
    }
  } catch {
    // ignore malformed request URLs
  }
  return 'https://qadr.alefba.dev';
}

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = isAllowedOrigin(origin) ? origin : getDefaultAllowedOrigin(req);
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-QADR110-Key, X-WorldMonitor-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export function isDisallowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  return !isAllowedOrigin(origin);
}
