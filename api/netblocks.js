import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');
  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  const feedUrl = 'https://netblocks.org/feed/';
  try {
    const res = await fetch(feedUrl, { headers: { 'User-Agent': 'QADR110/1.0' } });
    const xml = await res.text();
    return new Response(JSON.stringify({ source: feedUrl, rawRss: xml.slice(0, 200000) }), {
      status: res.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=180', ...corsHeaders },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Fetch failed', details: String(error) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
