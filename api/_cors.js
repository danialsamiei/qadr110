import { getDefaultAllowedOrigin, isAllowedBrowserOrigin, isAllowedDesktopOrigin } from './_host.js';

function isAllowedOrigin(origin) {
  return isAllowedBrowserOrigin(origin) || isAllowedDesktopOrigin(origin);
}

export function getCorsHeaders(req, methods = 'GET, OPTIONS') {
  const origin = req.headers.get('origin') || '';
  const allowOrigin = isAllowedOrigin(origin) ? origin : getDefaultAllowedOrigin(req);
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-QADR110-Key, X-WorldMonitor-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export function isDisallowedOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  return !isAllowedOrigin(origin);
}
