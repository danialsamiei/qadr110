import { cronbachAlpha, detectTrend } from './nrc-statistics';
import {
  getResilienceCountrySnapshot,
  getResilienceRankedSnapshots,
} from './resilience/engine';
import type { ResilienceDimensionId } from './resilience/types';

export type NRCLevel = 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';
export type NRCDomainKey = 'economic' | 'social' | 'governance' | 'health' | 'infrastructure' | 'cognitiveSocial';

export interface DomainScore {
  value: number;
  weight: number;
  weighted: number;
  confidence: number;
  indicators: number[];
}

export interface NRCScore {
  countryCode: string;
  countryName: string;
  overallScore: number;
  level: NRCLevel;
  domains: Record<NRCDomainKey, DomainScore>;
  cronbachAlpha: number;
  confidenceInterval: { lower: number; upper: number; level: number };
  trend: 'rising' | 'stable' | 'falling';
  change24h: number;
  lastUpdated: string;
}

const DEFAULT_WEIGHTS: Record<NRCDomainKey, number> = {
  economic: 0.2,
  social: 0.18,
  governance: 0.17,
  health: 0.15,
  infrastructure: 0.15,
  cognitiveSocial: 0.15,
};

const DOMAIN_DIMENSIONS: Record<NRCDomainKey, ResilienceDimensionId[]> = {
  economic: ['macroFiscal', 'currencyExternal', 'tradeSanctions'],
  social: ['socialCohesion', 'foodWater', 'healthPublicService'],
  governance: ['governanceInstitutional', 'informationCognitive', 'borderSecurity'],
  health: ['healthPublicService'],
  infrastructure: ['infrastructure', 'logisticsSupply', 'energy', 'cyberDigital'],
  cognitiveSocial: ['informationCognitive', 'socialCohesion', 'cyberDigital'],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreToLevel(score: number): NRCLevel {
  if (score >= 80) return 'very_high';
  if (score >= 60) return 'high';
  if (score >= 40) return 'moderate';
  if (score >= 20) return 'low';
  return 'very_low';
}

function mapTrend(history: number[]): NRCScore['trend'] {
  if (history.length < 3) return 'stable';
  const direction = detectTrend(history);
  return direction === 'sideways' ? 'stable' : direction;
}

function buildDomainScore(
  key: NRCDomainKey,
  snapshot: NonNullable<ReturnType<typeof getResilienceCountrySnapshot>>,
): DomainScore {
  const dimensions = DOMAIN_DIMENSIONS[key].map((id) => snapshot.dimensions[id]);
  const value = dimensions.reduce((sum, dimension) => sum + dimension.score, 0) / dimensions.length;
  const confidence = dimensions.reduce((sum, dimension) => sum + (dimension.coveragePercent / 100), 0) / dimensions.length;
  return {
    value: Math.round(value),
    weight: DEFAULT_WEIGHTS[key],
    weighted: 0,
    confidence: Number(confidence.toFixed(2)),
    indicators: dimensions.map((dimension) => dimension.score),
  };
}

function buildAlpha(snapshot: NonNullable<ReturnType<typeof getResilienceCountrySnapshot>>, domains: Record<NRCDomainKey, DomainScore>): number {
  const domainKeys = Object.keys(domains) as NRCDomainKey[];
  const matrix = snapshot.history.slice(-6).map((point) =>
    domainKeys.map((key) => {
      const current = domains[key].value;
      const delta = point.overall - snapshot.composite.score;
      return clamp(Math.round(current + delta * 0.45), 0, 100);
    }));
  return matrix.length >= 2 ? Number(Math.max(0, cronbachAlpha(matrix)).toFixed(2)) : 0;
}

function toNRCScore(countryCode: string): NRCScore | null {
  const snapshot = getResilienceCountrySnapshot(countryCode);
  if (!snapshot) return null;

  const domains: Record<NRCDomainKey, DomainScore> = {
    economic: buildDomainScore('economic', snapshot),
    social: buildDomainScore('social', snapshot),
    governance: buildDomainScore('governance', snapshot),
    health: buildDomainScore('health', snapshot),
    infrastructure: buildDomainScore('infrastructure', snapshot),
    cognitiveSocial: buildDomainScore('cognitiveSocial', snapshot),
  };

  (Object.keys(domains) as NRCDomainKey[]).forEach((key) => {
    domains[key].weighted = Number((domains[key].value * domains[key].weight).toFixed(2));
  });

  const history = snapshot.history.map((point) => point.overall);
  return {
    countryCode: snapshot.countryCode,
    countryName: snapshot.countryName,
    overallScore: snapshot.composite.score,
    level: scoreToLevel(snapshot.composite.score),
    domains,
    cronbachAlpha: buildAlpha(snapshot, domains),
    confidenceInterval: {
      lower: snapshot.composite.uncertainty.lower,
      upper: snapshot.composite.uncertainty.upper,
      level: 95,
    },
    trend: mapTrend(history),
    change24h: snapshot.composite.change1m,
    lastUpdated: snapshot.updatedAt,
  };
}

export function calculateNRC(): NRCScore[] {
  return getResilienceRankedSnapshots().map((snapshot) => toNRCScore(snapshot.countryCode)).filter((item): item is NRCScore => !!item);
}

export function getNRCScore(countryCode: string): NRCScore | null {
  return toNRCScore(countryCode.toUpperCase());
}

export function getNRCHistory(countryCode: string): number[] {
  const snapshot = getResilienceCountrySnapshot(countryCode.toUpperCase());
  return snapshot ? snapshot.history.map((point) => point.overall) : [];
}

export function getTopResilientCountries(limit = 10): NRCScore[] {
  return calculateNRC().slice(0, limit);
}

export function getMostVulnerableCountries(limit = 10): NRCScore[] {
  return calculateNRC().slice().reverse().slice(0, limit);
}

export function getRegionalAverages(): Array<{ region: string; avgScore: number; countries: number }> {
  const buckets = new Map<string, { total: number; count: number }>();
  getResilienceRankedSnapshots().forEach((snapshot) => {
    const current = buckets.get(snapshot.region) ?? { total: 0, count: 0 };
    current.total += snapshot.composite.score;
    current.count += 1;
    buckets.set(snapshot.region, current);
  });

  return [...buckets.entries()]
    .map(([region, value]) => ({
      region,
      avgScore: Math.round(value.total / value.count),
      countries: value.count,
    }))
    .sort((left, right) => right.avgScore - left.avgScore);
}

export function getNRCLevelColor(level: NRCLevel): string {
  switch (level) {
    case 'very_high': return '#22c55e';
    case 'high': return '#84cc16';
    case 'moderate': return '#eab308';
    case 'low': return '#f97316';
    case 'very_low': return '#ef4444';
  }
}

export const NRC_LEVEL_COLORS: Record<NRCLevel, [number, number, number, number]> = {
  very_high: [34, 197, 94, 200],
  high: [132, 204, 22, 200],
  moderate: [234, 179, 8, 200],
  low: [249, 115, 22, 200],
  very_low: [239, 68, 68, 200],
};
