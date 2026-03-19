import { isAllowedBrowserOrigin, isAllowedDesktopOrigin } from './_host.js';

const DESKTOP_ORIGIN_PATTERNS = [
  /^https?:\/\/tauri\.localhost(:\d+)?$/,
  /^https?:\/\/[a-z0-9-]+\.tauri\.localhost(:\d+)?$/i,
  /^tauri:\/\/localhost$/,
  /^asset:\/\/localhost$/,
];

function getValidKeys() {
  return (process.env.QADR110_VALID_KEYS || process.env.WORLDMONITOR_VALID_KEYS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isDesktopOrigin(origin) {
  return isAllowedDesktopOrigin(origin) || Boolean(origin) && DESKTOP_ORIGIN_PATTERNS.some(p => p.test(origin));
}

function isTrustedBrowserOrigin(origin) {
  return isAllowedBrowserOrigin(origin);
}

function extractOriginFromReferer(referer) {
  if (!referer) return '';
  try {
    return new URL(referer).origin;
  } catch {
    return '';
  }
}

export function validateApiKey(req, options = {}) {
  const forceKey = options.forceKey === true;
  const key = req.headers.get('X-QADR110-Key') || req.headers.get('X-WorldMonitor-Key');
  // Same-origin browser requests don't send Origin (per CORS spec).
  // Fall back to Referer to identify trusted same-origin callers.
  const origin = req.headers.get('Origin') || extractOriginFromReferer(req.headers.get('Referer')) || '';

  // Desktop app — always require API key
  if (isDesktopOrigin(origin)) {
    if (!key) return { valid: false, required: true, error: 'API key required for desktop access' };
    const validKeys = getValidKeys();
    if (!validKeys.includes(key)) return { valid: false, required: true, error: 'Invalid API key' };
    return { valid: true, required: true };
  }

  // Trusted browser origin (public host, national host, direct IP, previews, localhost dev) — no key needed
  if (isTrustedBrowserOrigin(origin)) {
    if (forceKey && !key) {
      return { valid: false, required: true, error: 'API key required' };
    }
    if (key) {
      const validKeys = getValidKeys();
      if (!validKeys.includes(key)) return { valid: false, required: true, error: 'Invalid API key' };
    }
    return { valid: true, required: forceKey };
  }

  // Explicit key provided from unknown origin — validate it
  if (key) {
    const validKeys = getValidKeys();
    if (!validKeys.includes(key)) return { valid: false, required: true, error: 'Invalid API key' };
    return { valid: true, required: true };
  }

  // No origin, no key — require API key (blocks unauthenticated curl/scripts)
  return { valid: false, required: true, error: 'API key required' };
}
