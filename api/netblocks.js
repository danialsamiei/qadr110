import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

function hoursSince(dateValue) {
  const ts = Date.parse(dateValue || '');
  if (!Number.isFinite(ts)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - ts) / 36e5);
}

function freshnessFromHours(hours) {
  if (hours <= 3) return 'fresh';
  if (hours <= 18) return 'aging';
  return 'stale';
}

function parseNetblocksRss(rawRss, limit = 10) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawRss, 'text/xml');
  const items = Array.from(doc.querySelectorAll('item')).slice(0, limit);

  const incidents = items.map((item) => ({
    title: (item.querySelector('title')?.textContent || '').trim(),
    pubDate: item.querySelector('pubDate')?.textContent || '',
    link: item.querySelector('link')?.textContent || '',
  })).filter((item) => item.title);

  const newestAge = incidents.length
    ? Math.min(...incidents.map((item) => hoursSince(item.pubDate)))
    : Number.POSITIVE_INFINITY;

  const avgAgeHours = incidents.length
    ? incidents.reduce((sum, item) => sum + hoursSince(item.pubDate), 0) / incidents.length
    : Number.POSITIVE_INFINITY;

  const keywordMap = [
    ['iran', 'Iran'],
    ['israel', 'Israel'],
    ['gaza', 'Gaza'],
    ['syria', 'Syria'],
    ['lebanon', 'Lebanon'],
    ['tehran', 'Tehran'],
  ];

  const entityHits = new Map();
  incidents.forEach((incident) => {
    const text = incident.title.toLowerCase();
    keywordMap.forEach(([needle, entity]) => {
      if (text.includes(needle)) entityHits.set(entity, (entityHits.get(entity) || 0) + 1);
    });
  });

  const entitySummary = [...entityHits.entries()].sort((a, b) => b[1] - a[1]).map(([entity]) => entity).slice(0, 5);

  const disruptionCount = incidents.filter((incident) => /disrupt|outage|shutdown|throttle|block/i.test(incident.title)).length;
  const recoveryCount = incidents.filter((incident) => /restore|restored|recovered|resume/i.test(incident.title)).length;

  const contradictionFlags = [];
  if (disruptionCount >= 2) contradictionFlags.push('network_disruption_spike');
  if (recoveryCount >= 1) contradictionFlags.push('network_recovery_signal');
  if (incidents.length < 4) contradictionFlags.push('low_sample_size');
  if (newestAge > 12) contradictionFlags.push('slow_feed_update');

  const sourceConfidence = Math.max(
    0.25,
    Math.min(
      0.93,
      0.5
      + (disruptionCount > 0 ? 0.15 : 0)
      + (newestAge <= 6 ? 0.12 : 0)
      - (contradictionFlags.includes('low_sample_size') ? 0.16 : 0)
      - (contradictionFlags.includes('slow_feed_update') ? 0.1 : 0),
    ),
  );

  return {
    feedType: 'netblocks',
    itemCount: incidents.length,
    sourceConfidence,
    freshness: freshnessFromHours(avgAgeHours),
    contradictionFlags,
    entitySummary,
    incidents,
  };
}

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');
  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'GET') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  const url = new URL(req.url);
  const limit = Math.max(3, Math.min(25, Number.parseInt(url.searchParams.get('limit') || '10', 10) || 10));
  const feedUrl = 'https://netblocks.org/feed/';
  try {
    const res = await fetch(feedUrl, { headers: { 'User-Agent': 'QADR110/1.0' } });
    const xml = await res.text();
    const analytical = parseNetblocksRss(xml, limit);
    return new Response(JSON.stringify({ source: feedUrl, limit, ...analytical, rawRss: xml.slice(0, 200000) }), {
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
