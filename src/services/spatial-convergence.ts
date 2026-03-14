import type { PredictionMarket } from '@/services/prediction';
import type { SocialUnrestEvent, CyberThreat } from '@/types';
import { getCountryCentroid } from '@/services/country-geometry';

export type SignalSource = 'polymarket' | 'gdelt' | 'cyber';
export type GeoPrecision = 'exact' | 'city' | 'country' | 'region' | 'global';

export interface NormalizedGeoSignal {
  id: string;
  source: SignalSource;
  title: string;
  summary: string;
  timestamp: string;
  lat: number;
  lon: number;
  geoPrecision: GeoPrecision;
  geoConfidence: number;
  severity: number;
  probability?: number;
  evidence: string[];
  url?: string;
}

export interface ConvergenceSignal {
  id: string;
  lat: number;
  lon: number;
  region: string;
  score: number;
  confidence: number;
  sourceBreakdown: Record<SignalSource, number>;
  evidence: NormalizedGeoSignal[];
  summaryFa: string;
}

const REGION_FALLBACK: Record<string, { lat: number; lon: number }> = {
  global: { lat: 20, lon: 0 },
  mena: { lat: 30, lon: 45 },
  eu: { lat: 50, lon: 12 },
  asia: { lat: 30, lon: 100 },
  america: { lat: 39, lon: -98 },
  latam: { lat: -15, lon: -60 },
  africa: { lat: 1, lon: 20 },
  oceania: { lat: -25, lon: 135 },
};

function scoreMarketConviction(yesPrice: number): number {
  const dist = Math.abs(yesPrice - 50) / 50;
  return Math.max(0.2, Math.min(1, dist));
}

function extractCountryCodeFromTitle(title: string): string | null {
  const s = title.toLowerCase();
  const map: Record<string, string> = {
    iran: 'IR', israel: 'IL', gaza: 'PS', russia: 'RU', ukraine: 'UA', china: 'CN', taiwan: 'TW',
    usa: 'US', 'united states': 'US', america: 'US', turkey: 'TR', saudi: 'SA', lebanon: 'LB',
    yemen: 'YE', iraq: 'IQ', syria: 'SY', afghanistan: 'AF', india: 'IN', pakistan: 'PK',
  };
  for (const [k, code] of Object.entries(map)) {
    if (s.includes(k)) return code;
  }
  return null;
}

export function normalizePolymarket(markets: PredictionMarket[]): NormalizedGeoSignal[] {
  return markets.map((m, idx) => {
    const code = extractCountryCodeFromTitle(m.title || '');
    const centroid = code ? getCountryCentroid(code) : null;
    const fallbackGlobal = REGION_FALLBACK.global ?? { lat: 20, lon: 0 };
    const lat = centroid?.lat ?? fallbackGlobal.lat;
    const lon = centroid?.lon ?? fallbackGlobal.lon;
    const precision: GeoPrecision = centroid ? 'country' : 'global';
    const geoConfidence = centroid ? 0.72 : 0.25;
    const volumeScore = Math.min(1, Math.log10((m.volume || 1) + 1) / 6);
    const conviction = scoreMarketConviction(m.yesPrice || 50);
    return {
      id: `pm-${idx}-${(m.title || '').slice(0, 16)}`,
      source: 'polymarket',
      title: m.title,
      summary: `احتمال بله ${Math.round(m.yesPrice || 0)}٪`,
      timestamp: m.endDate || new Date().toISOString(),
      lat,
      lon,
      geoPrecision: precision,
      geoConfidence,
      severity: Number((0.4 * conviction + 0.6 * volumeScore).toFixed(3)),
      probability: m.yesPrice,
      evidence: [
        `بازار پیش‌بینی با احتمال ${Math.round(m.yesPrice || 0)}٪`,
        m.volume ? `حجم معامله: ${Math.round(m.volume).toLocaleString('fa-IR')}` : 'حجم معامله نامشخص',
      ],
      url: m.url,
    };
  });
}

export function normalizeGdeltFromUnrest(events: SocialUnrestEvent[]): NormalizedGeoSignal[] {
  return events
    .filter((e) => e.sourceType === 'gdelt' && Number.isFinite(e.lat) && Number.isFinite(e.lon))
    .map((e) => ({
      id: `gdelt-${e.id}`,
      source: 'gdelt' as const,
      title: e.title,
      summary: e.summary || e.country,
      timestamp: e.time.toISOString(),
      lat: e.lat,
      lon: e.lon,
      geoPrecision: e.city ? 'city' : 'country',
      geoConfidence: e.city ? 0.82 : 0.68,
      severity: e.severity === 'high' ? 0.9 : e.severity === 'medium' ? 0.65 : 0.45,
      evidence: [
        `شدت: ${e.severity}`,
        `منبع: GDELT`,
      ],
    }));
}

export function normalizeCyber(threats: CyberThreat[]): NormalizedGeoSignal[] {
  return threats
    .filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lon))
    .map((t, idx) => ({
      id: `cyber-${idx}-${(t.indicator || 'threat').slice(0, 12)}`,
      source: 'cyber' as const,
      title: t.indicator || 'Cyber IOC',
      summary: t.country || 'تهدید سایبری',
      timestamp: t.lastSeen || t.firstSeen || new Date().toISOString(),
      lat: t.lat,
      lon: t.lon,
      geoPrecision: 'city' as const,
      geoConfidence: 0.78,
      severity: t.severity === 'critical' ? 1 : t.severity === 'high' ? 0.8 : t.severity === 'medium' ? 0.6 : 0.4,
      evidence: [`شاخص تهدید: ${t.severity}`, `کشور: ${t.country || 'نامشخص'}`],
      url: t.source,
    }));
}

function bucketKey(lat: number, lon: number): string {
  return `${Math.round(lat * 2) / 2}:${Math.round(lon * 2) / 2}`;
}

export function buildConvergenceSignals(input: {
  polymarket: PredictionMarket[];
  gdelt: SocialUnrestEvent[];
  cyber: CyberThreat[];
}): { convergence: ConvergenceSignal[]; normalized: NormalizedGeoSignal[] } {
  const normalized = [
    ...normalizePolymarket(input.polymarket),
    ...normalizeGdeltFromUnrest(input.gdelt),
    ...normalizeCyber(input.cyber),
  ];

  const groups = new Map<string, NormalizedGeoSignal[]>();
  for (const s of normalized) {
    const key = bucketKey(s.lat, s.lon);
    const arr = groups.get(key) || [];
    arr.push(s);
    groups.set(key, arr);
  }

  const convergence: ConvergenceSignal[] = [];
  for (const [key, items] of groups.entries()) {
    const [latRaw, lonRaw] = key.split(':').map(Number);
    const lat = Number.isFinite(latRaw) ? Number(latRaw) : 0;
    const lon = Number.isFinite(lonRaw) ? Number(lonRaw) : 0;
    const breakdown: Record<SignalSource, number> = { polymarket: 0, gdelt: 0, cyber: 0 };
    for (const i of items) breakdown[i.source] += 1;
    const distinctSources = Object.values(breakdown).filter(Boolean).length;
    if (distinctSources < 2) continue;

    const severity = items.reduce((a, b) => a + b.severity, 0) / items.length;
    const geoConf = items.reduce((a, b) => a + b.geoConfidence, 0) / items.length;
    const recency = items.reduce((a, b) => {
      const ageH = Math.max(0, (Date.now() - Date.parse(b.timestamp || '')) / 3_600_000);
      return a + Math.max(0.1, 1 - ageH / 72);
    }, 0) / items.length;
    const score = Math.round((0.35 * severity + 0.3 * geoConf + 0.2 * recency + 0.15 * (distinctSources / 3)) * 100);
    const confidence = Math.round((0.55 * geoConf + 0.45 * (distinctSources / 3)) * 100);
    const region = items[0]?.title || 'ناحیه';

    convergence.push({
      id: `conv-${key}`,
      lat,
      lon,
      region,
      score,
      confidence,
      sourceBreakdown: breakdown,
      evidence: items.slice(0, 8),
      summaryFa: `همگرایی ${score} از ۱۰۰؛ ${breakdown.polymarket ? 'Polymarket' : ''}${breakdown.gdelt ? ' + GDELT' : ''}${breakdown.cyber ? ' + Cyber' : ''}`,
    });
  }

  return { convergence: convergence.sort((a, b) => b.score - a.score), normalized };
}

export function buildDeterministicConvergenceNarrative(signal: ConvergenceSignal): string {
  const pm = signal.sourceBreakdown.polymarket;
  const gd = signal.sourceBreakdown.gdelt;
  const cb = signal.sourceBreakdown.cyber;
  const strength = signal.score >= 75 ? 'قوی' : signal.score >= 55 ? 'متوسط' : 'نوظهور';
  return `این ناحیه در حال حاضر سیگنال ترکیبی ${strength} دارد. سهم منابع: Polymarket ${pm}، GDELT ${gd} و Cyber ${cb}. سطح اطمینان مکانی ${signal.confidence} از ۱۰۰ است.`;
}
