import { setCorsHeaders, handleOptions } from './_cors.js';

export const config = { runtime: 'edge' };

const CITIES = [
  { id: 'tehran', city: 'Tehran', country: 'IR', lat: 35.6892, lon: 51.389 },
  { id: 'mashhad', city: 'Mashhad', country: 'IR', lat: 36.2605, lon: 59.6168 },
  { id: 'tabriz', city: 'Tabriz', country: 'IR', lat: 38.0962, lon: 46.2738 },
  { id: 'isfahan', city: 'Isfahan', country: 'IR', lat: 32.6546, lon: 51.668 },
  { id: 'istanbul', city: 'Istanbul', country: 'TR', lat: 41.0082, lon: 28.9784 },
  { id: 'dubai', city: 'Dubai', country: 'AE', lat: 25.2048, lon: 55.2708 },
  { id: 'riyadh', city: 'Riyadh', country: 'SA', lat: 24.7136, lon: 46.6753 },
  { id: 'london', city: 'London', country: 'GB', lat: 51.5072, lon: -0.1276 },
];

function withCors(res) {
  setCorsHeaders(res, {
    methods: ['GET', 'OPTIONS'],
    headers: ['Content-Type'],
    maxAge: 86400,
  });
  return res;
}

function seededCongestion(id) {
  const seed = Array.from(id).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const cycle = (Date.now() / 600000) | 0; // 10-min buckets
  const value = (seed * 31 + cycle * 7) % 100;
  if (value > 82) return 'severe';
  if (value > 63) return 'high';
  if (value > 35) return 'moderate';
  return 'low';
}

function levelToMetrics(level) {
  switch (level) {
    case 'severe': return { speedKph: 14, freeFlowKph: 58, confidence: 0.55 };
    case 'high': return { speedKph: 22, freeFlowKph: 55, confidence: 0.62 };
    case 'moderate': return { speedKph: 35, freeFlowKph: 60, confidence: 0.7 };
    default: return { speedKph: 49, freeFlowKph: 62, confidence: 0.8 };
  }
}

function buildDemoPoints() {
  const now = new Date().toISOString();
  return CITIES.map((c) => {
    const level = seededCongestion(c.id);
    const metrics = levelToMetrics(level);
    return {
      id: c.id,
      city: c.city,
      country: c.country,
      lat: c.lat,
      lon: c.lon,
      speedKph: metrics.speedKph,
      freeFlowKph: metrics.freeFlowKph,
      congestionLevel: level,
      confidence: metrics.confidence,
      source: 'demo',
      updatedAt: now,
    };
  });
}

async function fetchTomTomPoint(city, apiKey) {
  const endpoint = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${encodeURIComponent(apiKey)}&point=${city.lat},${city.lon}`;
  const res = await fetch(endpoint, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`TomTom ${city.id}: ${res.status}`);
  const payload = await res.json();
  const flow = payload.flowSegmentData;
  if (!flow) throw new Error(`TomTom ${city.id}: no flowSegmentData`);
  const speedKph = Number(flow.currentSpeed || 0);
  const freeFlowKph = Number(flow.freeFlowSpeed || 0) || Math.max(speedKph, 1);
  const ratio = freeFlowKph > 0 ? speedKph / freeFlowKph : 0;
  const congestionLevel = ratio >= 0.8 ? 'low' : ratio >= 0.55 ? 'moderate' : ratio >= 0.35 ? 'high' : 'severe';
  return {
    id: city.id,
    city: city.city,
    country: city.country,
    lat: city.lat,
    lon: city.lon,
    speedKph,
    freeFlowKph,
    congestionLevel,
    confidence: 0.9,
    source: 'tomtom',
    updatedAt: new Date().toISOString(),
  };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return handleOptions(req, ['GET', 'OPTIONS']);

  try {
    const apiKey = process.env.TOMTOM_TRAFFIC_API_KEY || process.env.TOMTOM_API_KEY;
    if (!apiKey) {
      return withCors(new Response(JSON.stringify({
        configured: false,
        message: 'کلید سرویس ترافیک جاده‌ای تنظیم نشده است.',
        points: buildDemoPoints(),
      }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=90, s-maxage=120' },
      }));
    }

    const settled = await Promise.allSettled(CITIES.map((city) => fetchTomTomPoint(city, apiKey)));
    const points = settled
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);

    if (points.length === 0) {
      return withCors(new Response(JSON.stringify({
        configured: true,
        message: 'داده ترافیک جاده‌ای موقتاً در دسترس نیست.',
        points: buildDemoPoints(),
      }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60, s-maxage=90' },
      }));
    }

    return withCors(new Response(JSON.stringify({ configured: true, points }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60, s-maxage=90, stale-while-revalidate=180' },
    }));
  } catch (error) {
    return withCors(new Response(JSON.stringify({
      configured: false,
      message: 'دریافت داده ترافیک جاده‌ای با خطا مواجه شد.',
      points: buildDemoPoints(),
      error: String(error),
    }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=30, s-maxage=60' },
    }));
  }
}
