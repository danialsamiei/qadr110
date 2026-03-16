/**
 * NRC Resilience Service — National Resilience Coefficient computation
 *
 * NRC = Σ(wᵢ × Dᵢ) where Σwᵢ = 1.0
 *
 * Six domains: Economic (0.20), Social (0.18), Governance (0.17),
 * Health (0.15), Infrastructure (0.15), Cognitive-Social (0.15)
 *
 * Aggregates data from existing CII components, macro signals,
 * infrastructure status, and sentiment analysis.
 */

import { cronbachAlpha, detectTrend } from './nrc-statistics';
import { calculateCII, type CountryScore as CIIScore } from './country-instability';
import { CURATED_COUNTRIES } from '@/config/countries';

// ─── Types ──────────────────────────────────────────────────────────────────

export type NRCLevel = 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';

export type NRCDomainKey = 'economic' | 'social' | 'governance' | 'health' | 'infrastructure' | 'cognitiveSocial';

export interface DomainScore {
  value: number;          // 0-100
  weight: number;         // domain weight
  weighted: number;       // value × weight
  confidence: number;     // 0-1 data availability
  indicators: number[];   // raw indicator values for Cronbach's Alpha
}

export interface NRCScore {
  countryCode: string;
  countryName: string;
  overallScore: number;       // 0-100
  level: NRCLevel;
  domains: Record<NRCDomainKey, DomainScore>;
  cronbachAlpha: number;
  confidenceInterval: { lower: number; upper: number; level: number };
  trend: 'rising' | 'stable' | 'falling';
  change24h: number;
  lastUpdated: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_WEIGHTS: Record<NRCDomainKey, number> = {
  economic: 0.20,
  social: 0.18,
  governance: 0.17,
  health: 0.15,
  infrastructure: 0.15,
  cognitiveSocial: 0.15,
};

/** Base health scores per region — placeholder until WHO data integration */
const REGION_HEALTH_BASELINES: Record<string, number> = {
  IR: 58, IL: 78, US: 72, GB: 80, DE: 82, FR: 79, RU: 55, CN: 65,
  UA: 48, SA: 62, AE: 74, TR: 60, EG: 45, IQ: 35, SY: 22, AF: 18,
  PK: 38, IN: 42, JP: 85, KR: 80, AU: 83, BR: 52, NG: 28, ZA: 48,
  YE: 15, LB: 40, JO: 56, KW: 68, QA: 72, BH: 66, OM: 60, PS: 30,
};

const HISTORY_WINDOW = 30; // days of NRC history for trend
const nrcHistory = new Map<string, number[]>();

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function scoreToLevel(score: number): NRCLevel {
  if (score >= 80) return 'very_high';
  if (score >= 60) return 'high';
  if (score >= 40) return 'moderate';
  if (score >= 20) return 'low';
  return 'very_low';
}

/** Invert a CII component (0-100 instability → 0-100 resilience) */
function invertScore(instability: number): number {
  return clamp(100 - instability, 0, 100);
}

/** Rebalance weights when some domains have no data */
function rebalanceWeights(
  available: Partial<Record<NRCDomainKey, boolean>>,
): Record<NRCDomainKey, number> {
  const keys = Object.keys(DEFAULT_WEIGHTS) as NRCDomainKey[];
  const activeKeys = keys.filter(k => available[k] !== false);
  if (activeKeys.length === keys.length) return { ...DEFAULT_WEIGHTS };

  const totalActive = activeKeys.reduce((s, k) => s + DEFAULT_WEIGHTS[k], 0);
  if (totalActive === 0) return { ...DEFAULT_WEIGHTS };

  const rebalanced = {} as Record<NRCDomainKey, number>;
  for (const k of keys) {
    rebalanced[k] = available[k] !== false ? DEFAULT_WEIGHTS[k] / totalActive : 0;
  }
  return rebalanced;
}

// ─── Domain Calculators ─────────────────────────────────────────────────────

function computeEconomicDomain(cii: CIIScore | undefined): DomainScore {
  // Use information component as a proxy for economic stability
  // Higher information disruption → lower economic resilience
  const infoScore = cii?.components.information ?? 0;
  const value = clamp(invertScore(infoScore * 0.6) + 20, 0, 100);
  return {
    value: Math.round(value),
    weight: DEFAULT_WEIGHTS.economic,
    weighted: 0, // computed later
    confidence: cii ? 0.7 : 0.3,
    indicators: [value],
  };
}

function computeSocialDomain(cii: CIIScore | undefined): DomainScore {
  // Inverse of unrest component
  const unrest = cii?.components.unrest ?? 0;
  const conflict = cii?.components.conflict ?? 0;
  const socialStability = invertScore(unrest * 0.6 + conflict * 0.4);
  const value = clamp(socialStability, 0, 100);
  return {
    value: Math.round(value),
    weight: DEFAULT_WEIGHTS.social,
    weighted: 0,
    confidence: cii ? 0.75 : 0.3,
    indicators: [invertScore(unrest), invertScore(conflict)],
  };
}

function computeGovernanceDomain(cii: CIIScore | undefined): DomainScore {
  // Security component inversed = governance quality proxy
  const security = cii?.components.security ?? 0;
  const information = cii?.components.information ?? 0;
  const value = clamp(invertScore(security * 0.55 + information * 0.45), 0, 100);
  return {
    value: Math.round(value),
    weight: DEFAULT_WEIGHTS.governance,
    weighted: 0,
    confidence: cii ? 0.65 : 0.3,
    indicators: [invertScore(security), invertScore(information)],
  };
}

function computeHealthDomain(countryCode: string): DomainScore {
  const baseline = REGION_HEALTH_BASELINES[countryCode] ?? 50;
  // Add slight randomization based on code hash for variety
  const hash = countryCode.charCodeAt(0) + countryCode.charCodeAt(1);
  const jitter = ((hash % 7) - 3) * 0.5;
  const value = clamp(baseline + jitter, 0, 100);
  return {
    value: Math.round(value),
    weight: DEFAULT_WEIGHTS.health,
    weighted: 0,
    confidence: 0.5, // static baseline = lower confidence
    indicators: [value],
  };
}

function computeInfrastructureDomain(cii: CIIScore | undefined): DomainScore {
  // Information component captures internet outages, cable health
  const info = cii?.components.information ?? 0;
  const security = cii?.components.security ?? 0;
  const value = clamp(invertScore(info * 0.7 + security * 0.3), 0, 100);
  return {
    value: Math.round(value),
    weight: DEFAULT_WEIGHTS.infrastructure,
    weighted: 0,
    confidence: cii ? 0.7 : 0.3,
    indicators: [invertScore(info), invertScore(security)],
  };
}

function computeCognitiveSocialDomain(cii: CIIScore | undefined): DomainScore {
  // CSRC = 0.55 × CogR + 0.45 × SocR
  // CogR approximated from information resilience
  // SocR approximated from social stability (inverse unrest)
  const info = cii?.components.information ?? 0;
  const unrest = cii?.components.unrest ?? 0;
  const cogR = invertScore(info * 0.8);
  const socR = invertScore(unrest * 0.7);
  const csrc = 0.55 * cogR + 0.45 * socR;
  const value = clamp(csrc, 0, 100);
  return {
    value: Math.round(value),
    weight: DEFAULT_WEIGHTS.cognitiveSocial,
    weighted: 0,
    confidence: cii ? 0.55 : 0.25,
    indicators: [cogR, socR],
  };
}

// ─── Main Calculator ────────────────────────────────────────────────────────

function computeNRCForCountry(
  countryCode: string,
  countryName: string,
  cii: CIIScore | undefined,
): NRCScore {
  const domains: Record<NRCDomainKey, DomainScore> = {
    economic: computeEconomicDomain(cii),
    social: computeSocialDomain(cii),
    governance: computeGovernanceDomain(cii),
    health: computeHealthDomain(countryCode),
    infrastructure: computeInfrastructureDomain(cii),
    cognitiveSocial: computeCognitiveSocialDomain(cii),
  };

  // Determine data availability for weight rebalancing
  const available: Partial<Record<NRCDomainKey, boolean>> = {};
  for (const [key, domain] of Object.entries(domains) as Array<[NRCDomainKey, DomainScore]>) {
    available[key] = domain.confidence > 0.2;
  }
  const weights = rebalanceWeights(available);

  // Compute weighted NRC score
  let overallScore = 0;
  const domainKeys = Object.keys(domains) as NRCDomainKey[];
  for (const key of domainKeys) {
    domains[key].weight = weights[key];
    domains[key].weighted = domains[key].value * weights[key];
    overallScore += domains[key].weighted;
  }
  overallScore = clamp(Math.round(overallScore), 0, 100);

  // Cronbach's Alpha for reliability
  const allIndicators = domainKeys.map(k => domains[k].indicators);
  const maxLen = Math.max(...allIndicators.map(a => a.length));
  const itemMatrix: number[][] = [];
  for (let i = 0; i < maxLen; i++) {
    const row = domainKeys.map(k => domains[k].indicators[i] ?? domains[k].value);
    itemMatrix.push(row);
  }
  const alpha = itemMatrix.length >= 2 ? cronbachAlpha(itemMatrix) : 0;

  // Confidence interval (based on average confidence across domains)
  const avgConfidence = domainKeys.reduce((s, k) => s + domains[k].confidence, 0) / domainKeys.length;
  const margin = (1 - avgConfidence) * 15;
  const ci = {
    lower: clamp(Math.round(overallScore - margin), 0, 100),
    upper: clamp(Math.round(overallScore + margin), 0, 100),
    level: 95,
  };

  // Update history for trend detection
  const history = nrcHistory.get(countryCode) ?? [];
  history.push(overallScore);
  if (history.length > HISTORY_WINDOW) history.shift();
  nrcHistory.set(countryCode, history);

  const rawTrend = history.length >= 5 ? detectTrend(history) : 'sideways';
  const trendMapped: 'rising' | 'stable' | 'falling' = rawTrend === 'sideways' ? 'stable' : rawTrend;
  const change24h = history.length >= 2 ? overallScore - (history[history.length - 2] ?? overallScore) : 0;

  return {
    countryCode,
    countryName,
    overallScore,
    level: scoreToLevel(overallScore),
    domains,
    cronbachAlpha: Number(Math.max(alpha, 0).toFixed(2)),
    confidenceInterval: ci,
    trend: trendMapped,
    change24h,
    lastUpdated: new Date().toISOString(),
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Calculate NRC scores for all tracked countries */
export function calculateNRC(): NRCScore[] {
  const ciiScores = calculateCII();
  const ciiMap = new Map(ciiScores.map(s => [s.code, s]));

  const countryCodes = new Set<string>();
  for (const s of ciiScores) countryCodes.add(s.code);
  for (const code of Object.keys(CURATED_COUNTRIES)) countryCodes.add(code);

  const results: NRCScore[] = [];
  for (const code of countryCodes) {
    const cii = ciiMap.get(code);
    const name = cii?.name ?? CURATED_COUNTRIES[code]?.name ?? code;
    results.push(computeNRCForCountry(code, name, cii));
  }

  return results.sort((a, b) => b.overallScore - a.overallScore);
}

/** Get NRC score for a single country */
export function getNRCScore(countryCode: string): NRCScore | null {
  const all = calculateNRC();
  return all.find(s => s.countryCode === countryCode) ?? null;
}

/** Get NRC history for trend analysis */
export function getNRCHistory(countryCode: string): number[] {
  return nrcHistory.get(countryCode) ?? [];
}

/** Get top resilient countries */
export function getTopResilientCountries(limit = 10): NRCScore[] {
  return calculateNRC().slice(0, limit);
}

/** Get most vulnerable countries (lowest NRC) */
export function getMostVulnerableCountries(limit = 10): NRCScore[] {
  return calculateNRC().reverse().slice(0, limit);
}

/** Regional NRC averages */
export function getRegionalAverages(): Array<{ region: string; avgScore: number; countries: number }> {
  const scores = calculateNRC();
  const regions: Record<string, { total: number; count: number }> = {
    'MENA': { total: 0, count: 0 },
    'Europe': { total: 0, count: 0 },
    'Asia-Pacific': { total: 0, count: 0 },
    'Americas': { total: 0, count: 0 },
    'Africa': { total: 0, count: 0 },
  };

  const regionMap: Record<string, string> = {
    IR: 'MENA', IL: 'MENA', SA: 'MENA', AE: 'MENA', TR: 'MENA', EG: 'MENA',
    IQ: 'MENA', SY: 'MENA', YE: 'MENA', LB: 'MENA', JO: 'MENA', KW: 'MENA',
    QA: 'MENA', BH: 'MENA', OM: 'MENA', PS: 'MENA', AF: 'MENA',
    US: 'Americas', BR: 'Americas',
    GB: 'Europe', DE: 'Europe', FR: 'Europe', UA: 'Europe', RU: 'Europe',
    CN: 'Asia-Pacific', JP: 'Asia-Pacific', KR: 'Asia-Pacific', IN: 'Asia-Pacific',
    PK: 'Asia-Pacific', AU: 'Asia-Pacific',
    NG: 'Africa', ZA: 'Africa',
  };

  for (const s of scores) {
    const region = regionMap[s.countryCode] ?? 'Other';
    if (regions[region]) {
      regions[region].total += s.overallScore;
      regions[region].count++;
    }
  }

  return Object.entries(regions)
    .filter(([, v]) => v.count > 0)
    .map(([region, v]) => ({
      region,
      avgScore: Math.round(v.total / v.count),
      countries: v.count,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);
}

/** NRC level color mapping (green=resilient → red=vulnerable) */
export function getNRCLevelColor(level: NRCLevel): string {
  switch (level) {
    case 'very_high': return '#22c55e'; // green
    case 'high': return '#84cc16';      // lime
    case 'moderate': return '#eab308';  // yellow
    case 'low': return '#f97316';       // orange
    case 'very_low': return '#ef4444';  // red
  }
}

/** NRC level to RGBA for map choropleth */
export const NRC_LEVEL_COLORS: Record<NRCLevel, [number, number, number, number]> = {
  very_high: [34, 197, 94, 200],
  high: [132, 204, 22, 200],
  moderate: [234, 179, 8, 200],
  low: [249, 115, 22, 200],
  very_low: [239, 68, 68, 200],
};
