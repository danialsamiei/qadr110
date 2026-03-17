import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { parseRssItems } from './_rss-parser.js';

export const config = { runtime: 'edge' };

function hoursSince(dateValue) {
  const ts = Date.parse(dateValue || '');
  if (!Number.isFinite(ts)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - ts) / 36e5);
}

function freshnessFromHours(hours) {
  if (hours <= 2) return 'fresh';
  if (hours <= 10) return 'aging';
  return 'stale';
}

function buildUnavailablePayload(geo, source, details) {
  return {
    geo,
    source,
    feedType: 'google-trends',
    itemCount: 0,
    trends: [],
    samples: [],
    sourceConfidence: 0,
    freshness: 'stale',
    contradictionFlags: ['feed_unavailable'],
    entitySummary: [],
    upstreamUnavailable: true,
    details,
  };
}

function parseGoogleTrendsRss(rawRss) {
  const topics = parseRssItems(rawRss).map((item) => ({
    title: item.title,
    pubDate: item.pubDate || '',
  }));

  const avgAgeHours = topics.length
    ? topics.reduce((sum, item) => sum + hoursSince(item.pubDate), 0) / topics.length
    : Number.POSITIVE_INFINITY;

  const newestAge = topics.length
    ? Math.min(...topics.map((item) => hoursSince(item.pubDate)))
    : Number.POSITIVE_INFINITY;

  const titleTokens = topics
    .flatMap((item) => item.title.split(/[\s\-/:،,.]+/g).map((x) => x.trim()).filter(Boolean))
    .filter((token) => token.length >= 3);

  const tokenCounts = new Map();
  titleTokens.forEach((token) => tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1));

  const entitySummary = [...tokenCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([entity]) => entity);

  const contradictionFlags = [];
  if (topics.length < 6) contradictionFlags.push('low_sample_size');
  if (newestAge > 6) contradictionFlags.push('slow_feed_update');

  const repeatedEntity = [...tokenCounts.values()].some((count) => count >= 4);
  if (repeatedEntity && topics.length >= 8) contradictionFlags.push('sudden_trend_shift');

  const sourceConfidence = Math.max(
    0.2,
    Math.min(
      0.95,
      (topics.length >= 8 ? 0.62 : 0.42)
      + (newestAge <= 4 ? 0.2 : 0)
      - (contradictionFlags.includes('low_sample_size') ? 0.14 : 0)
      - (contradictionFlags.includes('slow_feed_update') ? 0.12 : 0),
    ),
  );

  return {
    feedType: 'google-trends',
    itemCount: topics.length,
    trends: topics.slice(0, 10),
    sourceConfidence,
    freshness: freshnessFromHours(avgAgeHours),
    contradictionFlags,
    entitySummary,
    samples: topics.slice(0, 10),
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
  const geo = (url.searchParams.get('geo') || 'IR').toUpperCase();
  const trendsRss = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;

  try {
    const res = await fetch(trendsRss, { headers: { 'User-Agent': 'QADR110/1.0' } });
    const text = await res.text();
    if (!res.ok) {
      return new Response(JSON.stringify(buildUnavailablePayload(geo, trendsRss, `HTTP ${res.status}`)), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120', ...corsHeaders },
      });
    }

    const analytical = parseGoogleTrendsRss(text);
    const isXmlLike = analytical.itemCount > 0 || /<rss[\s>]|<feed[\s>]/i.test(text);
    if (!isXmlLike) {
      return new Response(JSON.stringify(buildUnavailablePayload(geo, trendsRss, 'Unexpected upstream payload')), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ geo, source: trendsRss, ...analytical, rawRss: text.slice(0, 200000) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=120', ...corsHeaders },
    });
  } catch (error) {
    return new Response(JSON.stringify(buildUnavailablePayload(geo, trendsRss, String(error))), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120', ...corsHeaders },
    });
  }
}
