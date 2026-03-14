import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

function toHealth(ok, stale = false) {
  if (!ok) return 'unavailable';
  return stale ? 'stale' : 'healthy';
}

async function probeJson(url, timeoutMs = 6000, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json', ...(init.headers || {}) }, ...init, signal: controller.signal });
    const payload = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, payload };
  } catch (error) {
    return { ok: false, status: 0, payload: null, error: String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');
  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'content-type': 'application/json', ...corsHeaders },
    });
  }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json', ...corsHeaders },
    });
  }

  const origin = new URL(req.url).origin;
  const [gdelt, ipx] = await Promise.all([
    probeJson(`${origin}/api/intelligence/v1/searchGdeltDocuments`, 7000, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'iran OR israel', maxRecords: 5, timespan: '24h' }) }),
    probeJson(`${origin}/api/ipx-status`, 7000),
  ]);

  const gdeltArticles = Array.isArray(gdelt.payload?.articles) ? gdelt.payload.articles.length : 0;
  const gdeltStale = gdelt.ok && gdeltArticles === 0;

  const gdeltHealth = toHealth(gdelt.ok, gdeltStale);
  const ipxHealth = ipx.payload?.status === 'healthy'
    ? 'healthy'
    : ipx.payload?.status === 'degraded'
      ? 'degraded'
      : ipx.ok
        ? 'stale'
        : 'unavailable';

  const overall = [gdeltHealth, ipxHealth].includes('unavailable')
    ? 'degraded'
    : [gdeltHealth, ipxHealth].includes('stale') || [gdeltHealth, ipxHealth].includes('degraded')
      ? 'warning'
      : 'healthy';

  return new Response(JSON.stringify({
    status: overall,
    checkedAt: new Date().toISOString(),
    components: {
      gdelt: {
        health: gdeltHealth,
        freshness: gdeltStale ? 'stale' : gdelt.ok ? 'fresh' : 'unknown',
        lastSuccessfulAt: gdelt.ok ? new Date().toISOString() : null,
        note: gdelt.ok
          ? (gdeltStale ? 'خروجی GDELT دریافت شد اما داده تازه کم است.' : 'GDELT در دسترس است.')
          : 'اتصال به GDELT برقرار نشد.',
      },
      ipx: {
        health: ipxHealth,
        freshness: ipx.payload?.freshness || 'unknown',
        lastSuccessfulAt: ipx.ok ? new Date().toISOString() : null,
        note: ipx.payload?.message || 'وضعیت IPX نامشخص است.',
      },
    },
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=20, s-maxage=30, stale-while-revalidate=60',
      ...corsHeaders,
    },
  });
}
