import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');
  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  const url = new URL(req.url);
  const geo = (url.searchParams.get('geo') || 'IR').toUpperCase();
  const trendsRss = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;

  try {
    const res = await fetch(trendsRss, { headers: { 'User-Agent': 'QADR110/1.0' } });
    const text = await res.text();
    return new Response(JSON.stringify({ geo, source: trendsRss, rawRss: text.slice(0, 200000) }), {
      status: res.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=120', ...corsHeaders },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Fetch failed', details: String(error) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
