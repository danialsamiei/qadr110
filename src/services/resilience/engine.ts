import { calculateCII, getCountryData, type CountryData, type CountryScore } from '@/services/country-instability';

import {
  INTERNAL_SIGNAL_SOURCE,
  RESILIENCE_BASELINE_COUNTRY_CODES,
  RESILIENCE_COUNTRY_NAME_MAP,
  RESILIENCE_COUNTRY_SEEDS,
  RESILIENCE_DIMENSIONS,
  RESILIENCE_METHOD_SOURCE,
  RESILIENCE_STRESS_SCENARIOS,
  SAMPLE_BASELINE_SOURCE,
  type ResilienceCountrySeedProfile,
} from './data';
import type {
  ResilienceCompositeScore,
  ResilienceConnector,
  ResilienceConnectorContext,
  ResilienceConnectorResult,
  ResilienceCountrySnapshot,
  ResilienceCoverageRow,
  ResilienceCoverageSummary,
  ResilienceDashboardModel,
  ResilienceDimensionId,
  ResilienceDimensionScore,
  ResilienceHeatmapRow,
  ResilienceHistoryPoint,
  ResilienceIndicatorObservation,
  ResilienceNetworkLink,
  ResilienceNetworkNode,
  ResiliencePeerComparisonRow,
  ResilienceRadarSeries,
  ResilienceScoreBand,
  ResilienceSlopeSeries,
  ResilienceStressMatrixCell,
} from './types';

type InternalAdjustmentInput = {
  cii?: CountryScore | null;
  data?: CountryData;
};

const DIMENSION_ORDER = RESILIENCE_DIMENSIONS.map((item) => item.id);
const CURRENT_SERIES_MONTHS = 12;
const SAMPLE_DATA_NOTE = 'نمایش نمونه/ترکیبی برای نشان دادن روش، نه داده ثبتی مستقیم.';
const PEER_COMPARISON_FALLBACK = ['IR', 'TR', 'IQ', 'AZ', 'PK', 'US', 'CN'];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundScore(value: number): number {
  return Math.round(clamp(value, 0, 100));
}

function roundRatio(value: number): number {
  return Number(clamp(value, 0, 1).toFixed(2));
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('fa-IR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function hashText(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function scoreToBand(score: number): ResilienceScoreBand {
  if (score >= 75) return 'very-strong';
  if (score >= 62) return 'strong';
  if (score >= 47) return 'balanced';
  if (score >= 32) return 'fragile';
  return 'severely-fragile';
}

function describeScoreBand(score: number): string {
  const band = scoreToBand(score);
  if (band === 'very-strong') return 'بسیار مقاوم';
  if (band === 'strong') return 'مقاوم';
  if (band === 'balanced') return 'مختلط';
  if (band === 'fragile') return 'شکننده';
  return 'بسیار شکننده';
}

function computeCoveragePercent(indicators: ResilienceIndicatorObservation[]): number {
  if (indicators.length === 0) return 0;
  const total = indicators.reduce((sum, indicator) => {
    if (indicator.coverageStatus === 'complete') return sum + 1;
    if (indicator.coverageStatus === 'partial') return sum + 0.5;
    return sum;
  }, 0);
  return roundScore((total / indicators.length) * 100);
}

function computeFreshnessPercent(indicators: ResilienceIndicatorObservation[]): number {
  if (indicators.length === 0) return 0;
  const total = indicators.reduce((sum, indicator) => {
    const freshness = 1 - clamp(indicator.freshnessDays / 30, 0, 1);
    return sum + freshness;
  }, 0);
  return roundScore((total / indicators.length) * 100);
}

function buildSyntheticIndicator(
  country: ResilienceCountrySeedProfile,
  dimensionId: ResilienceDimensionId,
  suffix: string,
  label: string,
  offset: number,
): ResilienceIndicatorObservation {
  const baseScore = country.seedDimensions[dimensionId];
  const adjusted = roundScore(baseScore + offset);
  return {
    id: `${country.code}:${dimensionId}:${suffix}`,
    label,
    value: adjusted,
    displayValue: `${adjusted} / 100 (نمونه)`,
    unit: 'score',
    direction: 'higher-is-better',
    normalizedScore: adjusted,
    sourceId: SAMPLE_BASELINE_SOURCE.id,
    sourceTitle: SAMPLE_BASELINE_SOURCE.title,
    synthetic: true,
    confidence: 0.42,
    coverageStatus: 'partial',
    lastUpdated: SAMPLE_BASELINE_SOURCE.lastUpdated,
    freshnessDays: 7,
    note: SAMPLE_DATA_NOTE,
    provenance: 'این شاخص نمونه برای هم‌ترازی و مقایسه‌پذیری داشبورد تاب‌آوری تنظیم شده است.',
  };
}

const sampleConnector: ResilienceConnector = {
  id: 'sample-baseline',
  label: 'خط پایه نمونه',
  kind: 'sample',
  synthetic: true,
  enabled: true,
  collect(countryCode: string, context: ResilienceConnectorContext): ResilienceConnectorResult {
    const country = RESILIENCE_COUNTRY_SEEDS[countryCode];
    if (!country) {
      return {
        connectorId: this.id,
        source: SAMPLE_BASELINE_SOURCE,
        indicators: [],
        warnings: [`برای ${context.countryCode} هنوز خط پایه نمونه تعریف نشده است.`],
        coveragePercent: 0,
      };
    }

    const indicators: ResilienceIndicatorObservation[] = [];
    DIMENSION_ORDER.forEach((dimensionId) => {
      const definition = RESILIENCE_DIMENSIONS.find((item) => item.id === dimensionId);
      const dimensionLabel = definition?.shortLabel ?? dimensionId;
      indicators.push(
        buildSyntheticIndicator(country, dimensionId, 'anchor', `خط پایه ${dimensionLabel}`, 0),
        buildSyntheticIndicator(country, dimensionId, 'buffer', `بافر ${dimensionLabel}`, dimensionId === 'currencyExternal' ? -4 : 4),
      );
    });

    return {
      connectorId: this.id,
      source: { ...SAMPLE_BASELINE_SOURCE, lastUpdated: context.now },
      indicators,
      warnings: ['این منبع نمایشی است و باید در محیط عملیاتی با داده‌های عمومی/رسمی جایگزین یا تکمیل شود.'],
      coveragePercent: 50,
    };
  },
};

function buildCountIndicator(
  countryCode: string,
  label: string,
  suffix: string,
  value: number,
  cap: number,
  note: string,
): ResilienceIndicatorObservation {
  const normalized = roundScore(100 - (clamp(value, 0, cap) / cap) * 100);
  return {
    id: `${countryCode}:internal:${suffix}`,
    label,
    value,
    displayValue: `${value}`,
    unit: 'count',
    direction: 'lower-is-better',
    normalizedScore: normalized,
    sourceId: INTERNAL_SIGNAL_SOURCE.id,
    sourceTitle: INTERNAL_SIGNAL_SOURCE.title,
    synthetic: false,
    confidence: 0.74,
    coverageStatus: 'complete',
    lastUpdated: new Date().toISOString(),
    freshnessDays: 0,
    note,
    provenance: 'از سیگنال‌ها و رویدادهای زنده و نرمال‌شده QADR110 مشتق شده است.',
  };
}

const internalSignalConnector: ResilienceConnector = {
  id: 'internal-signals',
  label: 'سیگنال‌های نرمال‌شده QADR110',
  kind: 'internal-signal',
  synthetic: false,
  enabled: true,
  collect(countryCode: string): ResilienceConnectorResult {
    const data = getCountryData(countryCode);
    if (!data) {
      return {
        connectorId: this.id,
        source: INTERNAL_SIGNAL_SOURCE,
        indicators: [],
        warnings: ['سیگنال زنده‌ی داخلی برای این کشور هنوز وارد موتور تاب‌آوری نشده است.'],
        coveragePercent: 0,
      };
    }

    const indicators: ResilienceIndicatorObservation[] = [
      buildCountIndicator(countryCode, 'اعتراض/ناآرامی', 'protests', data.protests.length, 12, 'اثر مستقیم بر انسجام اجتماعی.'),
      buildCountIndicator(countryCode, 'درگیری/رویداد امنیتی', 'conflicts', data.conflicts.length + data.strikes.length, 12, 'اثر مستقیم بر بعد مرزی و امنیتی.'),
      buildCountIndicator(countryCode, 'اختلال زیرساخت/اینترنت', 'outages', data.outages.length, 10, 'اثر مستقیم بر تاب‌آوری زیرساخت و خدمات.'),
      buildCountIndicator(countryCode, 'اختلالات هوایی', 'aviation', data.aviationDisruptions.length, 10, 'نشانه فشار لجستیکی و جریان حمل.'),
      buildCountIndicator(countryCode, 'اختلالات AIS', 'ais', data.aisDisruptionHighCount + data.aisDisruptionElevatedCount + data.aisDisruptionLowCount, 12, 'نشانه فشار در کریدورهای دریایی/لجستیکی.'),
      buildCountIndicator(countryCode, 'تهدیدات سایبری/جمینگ', 'cyber', data.cyberThreatHighCount + data.cyberThreatCriticalCount + data.gpsJammingHighCount + data.gpsJammingMediumCount, 16, 'اثر مستقیم بر بعد سایبری و دیجیتال.'),
      buildCountIndicator(countryCode, 'فشار اقلیمی/آتش', 'climate', data.climateStress + data.satelliteFireCount, 20, 'اثر مستقیم بر محیط‌زیست و آب/غذا.'),
      buildCountIndicator(countryCode, 'جابجایی/آوارگی', 'displacement', data.displacementOutflow >= 1_000_000 ? 12 : data.displacementOutflow >= 100_000 ? 8 : data.displacementOutflow > 0 ? 4 : 0, 12, 'اثر بر انسجام اجتماعی و خدمات عمومی.'),
      buildCountIndicator(countryCode, 'آشفتگی اطلاعاتی/نابهنجاری', 'information', data.temporalAnomalyCount + data.orefAlertCount + data.advisoryCount, 14, 'اثر مستقیم بر تاب‌آوری اطلاعاتی و شناختی.'),
    ];

    return {
      connectorId: this.id,
      source: { ...INTERNAL_SIGNAL_SOURCE, lastUpdated: new Date().toISOString() },
      indicators,
      warnings: [],
      coveragePercent: 100,
    };
  },
};

const CONNECTORS: ResilienceConnector[] = [sampleConnector, internalSignalConnector];

function getConnectors(): ResilienceConnector[] {
  return CONNECTORS.filter((connector) => connector.enabled);
}

function calculateInternalPenalties(input: InternalAdjustmentInput): Partial<Record<ResilienceDimensionId, number>> {
  const penalties: Partial<Record<ResilienceDimensionId, number>> = {};
  const cii = input.cii;
  const data = input.data;
  if (!cii && !data) return penalties;

  const informationPenalty = roundScore((cii?.components.information ?? 0) * 0.18);
  const securityPenalty = roundScore((cii?.components.security ?? 0) * 0.18);
  const unrestPenalty = roundScore((cii?.components.unrest ?? 0) * 0.16);
  const conflictPenalty = roundScore((cii?.components.conflict ?? 0) * 0.18);
  const outagesPenalty = roundScore(((data?.outages.length ?? 0) * 3) + ((data?.aviationDisruptions.length ?? 0) * 2));
  const logisticsPenalty = roundScore(((data?.aisDisruptionHighCount ?? 0) * 4) + ((data?.aisDisruptionElevatedCount ?? 0) * 2) + ((data?.aviationDisruptions.length ?? 0) * 2));
  const cyberPenalty = roundScore(((data?.cyberThreatCriticalCount ?? 0) * 5) + ((data?.cyberThreatHighCount ?? 0) * 3) + ((data?.gpsJammingHighCount ?? 0) * 4) + ((data?.gpsJammingMediumCount ?? 0) * 2));
  const climatePenalty = roundScore((data?.climateStress ?? 0) + ((data?.satelliteFireHighCount ?? 0) * 3) + ((data?.satelliteFireCount ?? 0) * 1.5));
  const socialPenalty = roundScore(((data?.protests.length ?? 0) * 3) + ((data?.displacementOutflow ?? 0) >= 1_000_000 ? 10 : (data?.displacementOutflow ?? 0) >= 100_000 ? 6 : (data?.displacementOutflow ?? 0) > 0 ? 3 : 0));
  const borderPenalty = roundScore(((data?.conflicts.length ?? 0) * 3) + ((data?.strikes.length ?? 0) * 4) + ((data?.militaryFlights.length ?? 0) * 1.5) + ((data?.militaryVessels.length ?? 0) * 1.5));

  penalties.infrastructure = clamp(Math.round((informationPenalty + outagesPenalty) * 0.55), 0, 22);
  penalties.logisticsSupply = clamp(Math.round((logisticsPenalty + securityPenalty) * 0.6), 0, 24);
  penalties.socialCohesion = clamp(Math.round((socialPenalty + unrestPenalty + conflictPenalty) * 0.55), 0, 26);
  penalties.governanceInstitutional = clamp(Math.round((securityPenalty + informationPenalty) * 0.45), 0, 18);
  penalties.informationCognitive = clamp(Math.round((informationPenalty + roundScore((data?.temporalAnomalyCount ?? 0) * 3)) * 0.6), 0, 22);
  penalties.cyberDigital = clamp(Math.round((cyberPenalty + informationPenalty) * 0.55), 0, 24);
  penalties.healthPublicService = clamp(Math.round((socialPenalty + climatePenalty + outagesPenalty) * 0.4), 0, 20);
  penalties.environmentalClimate = clamp(Math.round(climatePenalty * 0.6), 0, 24);
  penalties.borderSecurity = clamp(Math.round((borderPenalty + securityPenalty + conflictPenalty) * 0.5), 0, 28);
  penalties.foodWater = clamp(Math.round((climatePenalty + socialPenalty) * 0.35), 0, 18);
  penalties.energy = clamp(Math.round((securityPenalty + logisticsPenalty) * 0.25), 0, 14);
  penalties.tradeSanctions = clamp(Math.round((informationPenalty + logisticsPenalty) * 0.25), 0, 14);
  penalties.currencyExternal = clamp(Math.round((informationPenalty + socialPenalty) * 0.2), 0, 10);
  penalties.macroFiscal = clamp(Math.round((socialPenalty + securityPenalty) * 0.16), 0, 10);
  return penalties;
}

function buildDimensionRationale(
  country: ResilienceCountrySeedProfile,
  dimensionId: ResilienceDimensionId,
  score: number,
  penalty: number,
  coveragePercent: number,
): string {
  const dimensionLabel = RESILIENCE_DIMENSIONS.find((item) => item.id === dimensionId)?.label || dimensionId;
  const direction = penalty > 0
    ? `سیگنال‌های زنده حدود ${penalty} امتیاز از خط پایه این بعد کم کرده‌اند.`
    : 'فعلاً سیگنال زنده معناداری برای افت این بعد ثبت نشده است.';
  return `${country.name} در بعد «${dimensionLabel}» امتیاز ${score} دارد. ${direction} پوشش شاخص‌ها ${coveragePercent}% است.`;
}

function buildDimensionIndicators(
  countryCode: string,
  dimensionId: ResilienceDimensionId,
  connectorResults: ResilienceConnectorResult[],
): ResilienceIndicatorObservation[] {
  return connectorResults.flatMap((result) =>
    result.indicators.filter((indicator) => indicator.id.startsWith(`${countryCode}:${dimensionId}:`) || (
      result.connectorId === 'internal-signals'
      && (
        (dimensionId === 'socialCohesion' && (indicator.id.includes(':protests') || indicator.id.includes(':displacement')))
        || (dimensionId === 'borderSecurity' && (indicator.id.includes(':conflicts') || indicator.id.includes(':information')))
        || (dimensionId === 'infrastructure' && indicator.id.includes(':outages'))
        || (dimensionId === 'logisticsSupply' && (indicator.id.includes(':aviation') || indicator.id.includes(':ais')))
        || (dimensionId === 'cyberDigital' && indicator.id.includes(':cyber'))
        || (dimensionId === 'informationCognitive' && indicator.id.includes(':information'))
        || (dimensionId === 'environmentalClimate' && indicator.id.includes(':climate'))
        || (dimensionId === 'healthPublicService' && indicator.id.includes(':displacement'))
        || (dimensionId === 'foodWater' && indicator.id.includes(':climate'))
      )
    )),
  );
}

function buildCoverageSummary(allIndicators: ResilienceIndicatorObservation[]): ResilienceCoverageSummary {
  const availableIndicators = allIndicators.filter((indicator) => indicator.coverageStatus !== 'missing').length;
  const missingIndicators = allIndicators.length - availableIndicators;
  const syntheticIndicators = allIndicators.filter((indicator) => indicator.synthetic).length;
  const liveIndicators = allIndicators.length - syntheticIndicators;
  const staleIndicators = allIndicators.filter((indicator) => indicator.freshnessDays > 7).length;
  return {
    availableIndicators,
    missingIndicators,
    syntheticIndicators,
    liveIndicators,
    staleIndicators,
    coveragePercent: allIndicators.length > 0 ? roundScore((availableIndicators / allIndicators.length) * 100) : 0,
  };
}

function buildUncertainty(score: number, coveragePercent: number, sampleShare: number): { lower: number; upper: number } {
  const margin = Math.round(((100 - coveragePercent) * 0.08) + (sampleShare * 14));
  return {
    lower: clamp(score - margin, 0, 100),
    upper: clamp(score + margin, 0, 100),
  };
}

function buildDimensionScore(
  country: ResilienceCountrySeedProfile,
  dimensionId: ResilienceDimensionId,
  connectorResults: ResilienceConnectorResult[],
  internalPenalties: Partial<Record<ResilienceDimensionId, number>>,
): ResilienceDimensionScore {
  const definition = RESILIENCE_DIMENSIONS.find((item) => item.id === dimensionId)!;
  const indicators = buildDimensionIndicators(country.code, dimensionId, connectorResults);
  const baseline = country.seedDimensions[dimensionId];
  const penalty = internalPenalties[dimensionId] ?? 0;
  const score = roundScore(baseline - penalty);
  const coveragePercent = computeCoveragePercent(indicators);
  const freshnessPercent = computeFreshnessPercent(indicators);
  const sampleShare = roundRatio(indicators.length === 0 ? 1 : indicators.filter((indicator) => indicator.synthetic).length / indicators.length);
  const liveShare = roundRatio(1 - sampleShare);
  const uncertainty = buildUncertainty(score, coveragePercent, sampleShare);

  return {
    id: dimensionId,
    label: definition.label,
    weight: definition.weight,
    score,
    change1m: 0,
    uncertainty,
    coveragePercent,
    freshnessPercent,
    sampleShare,
    liveShare,
    methodology: definition.methodology,
    indicators,
    rationale: buildDimensionRationale(country, dimensionId, score, penalty, coveragePercent),
    lastUpdated: new Date().toISOString(),
  };
}

function buildCompositeScore(dimensions: Record<ResilienceDimensionId, ResilienceDimensionScore>): ResilienceCompositeScore {
  const weightedScore = DIMENSION_ORDER.reduce((sum, id) => {
    const dimension = dimensions[id];
    return sum + (dimension.score * dimension.weight);
  }, 0);
  const score = roundScore(weightedScore);
  const coveragePercent = roundScore(DIMENSION_ORDER.reduce((sum, id) => sum + dimensions[id].coveragePercent, 0) / DIMENSION_ORDER.length);
  const freshnessPercent = roundScore(DIMENSION_ORDER.reduce((sum, id) => sum + dimensions[id].freshnessPercent, 0) / DIMENSION_ORDER.length);
  const sampleShare = roundRatio(DIMENSION_ORDER.reduce((sum, id) => sum + dimensions[id].sampleShare, 0) / DIMENSION_ORDER.length);
  const liveShare = roundRatio(1 - sampleShare);
  const uncertainty = buildUncertainty(score, coveragePercent, sampleShare);

  return {
    score,
    band: scoreToBand(score),
    change1m: 0,
    uncertainty,
    coveragePercent,
    freshnessPercent,
    sampleShare,
    liveShare,
    methodology: 'شاخص کل از میانگین وزنی ۱۴ بعد به‌دست می‌آید. داده‌های نمونه به‌صراحت برچسب‌گذاری می‌شوند و سیگنال‌های زنده فقط به‌صورت تعدیل شفاف روی همان خط پایه اعمال می‌شوند.',
    lastUpdated: new Date().toISOString(),
  };
}

function buildHistory(country: ResilienceCountrySeedProfile, currentOverall: number): ResilienceHistoryPoint[] {
  const points: ResilienceHistoryPoint[] = [];
  const baseAverage = DIMENSION_ORDER.reduce((sum, id) => sum + country.seedDimensions[id], 0) / DIMENSION_ORDER.length;
  const drift = currentOverall - roundScore(baseAverage);
  const hash = hashText(country.code);
  for (let index = CURRENT_SERIES_MONTHS - 1; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(2025, 3 + (CURRENT_SERIES_MONTHS - 1 - index), 1, 0, 0, 0));
    const wave = ((hash + index * 17) % 7) - 3;
    const recencyBoost = index === 0 ? drift : Math.round(drift * ((CURRENT_SERIES_MONTHS - index - 1) / (CURRENT_SERIES_MONTHS - 1)));
    const overall = roundScore(baseAverage + wave + recencyBoost);
    points.push({
      label: formatMonthLabel(date),
      observedAt: date.toISOString(),
      overall,
      dimensions: {
        macroFiscal: roundScore(country.seedDimensions.macroFiscal + Math.round(wave * 0.6)),
        tradeSanctions: roundScore(country.seedDimensions.tradeSanctions + Math.round(wave * 0.5)),
        socialCohesion: roundScore(country.seedDimensions.socialCohesion + Math.round(wave * 0.8)),
        infrastructure: roundScore(country.seedDimensions.infrastructure + Math.round(wave * 0.4)),
        borderSecurity: roundScore(country.seedDimensions.borderSecurity + Math.round(wave * 0.9)),
      },
      synthetic: index !== 0,
      note: index === 0
        ? 'آخرین نقطه با تعدیل سیگنال‌های داخلی ساخته شده است.'
        : 'سری زمانی نمایشی برای نمایش جهت حرکت و مقایسه ماهانه است.',
    });
  }
  return points;
}

function deriveSignalSummary(data?: CountryData, cii?: CountryScore | null): string[] {
  if (!data && !cii) {
    return ['برای این کشور هنوز سیگنال زنده‌ی داخلی وارد موتور تاب‌آوری نشده است.'];
  }
  const summary: string[] = [];
  if (cii) {
    summary.push(`شاخص بی‌ثباتی داخلی ${cii.score}/100 با روند ${cii.trend}.`);
  }
  if (data) {
    if (data.outages.length > 0) summary.push(`${data.outages.length} اختلال زیرساخت/اینترنت در ورودی داخلی دیده شد.`);
    if (data.protests.length > 0) summary.push(`${data.protests.length} رویداد اعتراضی در ورودی داخلی ثبت شد.`);
    if ((data.conflicts.length + data.strikes.length) > 0) summary.push(`${data.conflicts.length + data.strikes.length} رخداد امنیتی/درگیری روی بعد مرزی فشار وارد می‌کند.`);
    if ((data.cyberThreatHighCount + data.cyberThreatCriticalCount + data.gpsJammingHighCount) > 0) {
      summary.push('فشار سایبری/جمینگ در تنظیم بعد دیجیتال لحاظ شده است.');
    }
    if (data.climateStress > 0 || data.satelliteFireCount > 0) {
      summary.push('تنش اقلیمی/آتش‌سوزی در ابعاد محیط‌زیستی و غذا/آب منعکس شده است.');
    }
  }
  return summary.slice(0, 5);
}

function buildSpillovers(country: ResilienceCountrySeedProfile, scoreMap: Map<string, ResilienceCountrySnapshot>) {
  const links: ResilienceCountrySnapshot['spillovers'] = [];
  const related = [...country.neighbors, ...country.strategicPartners]
    .filter((code, index, items) => items.indexOf(code) === index)
    .slice(0, 6);

  related.forEach((code) => {
    const target = scoreMap.get(code);
    if (!target) return;
    const isNeighbor = country.neighbors.includes(code);
    const intensity = roundScore((100 - target.composite.score) * (isNeighbor ? 0.24 : 0.16));
    links.push({
      targetCountryCode: code,
      targetCountryName: target.countryName,
      channel: isNeighbor ? 'border' : 'trade',
      intensity,
      note: isNeighbor
        ? `مرز/پیرامون ${target.countryName} می‌تواند بخشی از فشار امنیتی یا لجستیکی را سرریز کند.`
        : `${target.countryName} در زنجیره تجارت/انرژی ${country.name} اهمیت مقایسه‌ای دارد.`,
    });
  });

  return links.sort((left, right) => right.intensity - left.intensity);
}

function buildStressMatrix(snapshot: ResilienceCountrySnapshot): ResilienceStressMatrixCell[] {
  return snapshot.stressScenarios.map((scenario) => {
    const delta = roundScore(Object.entries(scenario.stressByDimension).reduce((sum, [dimensionId, pressure]) => {
      const dimension = snapshot.dimensions[dimensionId as ResilienceDimensionId];
      if (!dimension) return sum;
      const exposure = 1.2 - (dimension.score / 100);
      return sum + ((pressure ?? 0) * dimension.weight * exposure);
    }, 0));
    const resultingScore = roundScore(snapshot.composite.score - delta);
    return {
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      countryCode: snapshot.countryCode,
      countryName: snapshot.countryName,
      delta,
      resultingScore,
      band: scoreToBand(resultingScore),
      explanation: `${scenario.title} با توجه به profile فعلی، حدود ${delta} امتیاز از شاخص کل ${snapshot.countryName} می‌کاهد.`,
    };
  });
}

function finalizeChanges(snapshot: ResilienceCountrySnapshot): ResilienceCountrySnapshot {
  const last = snapshot.history[snapshot.history.length - 1];
  const previous = snapshot.history[snapshot.history.length - 2];
  snapshot.composite.change1m = last && previous ? roundScore(last.overall - previous.overall) : 0;
  snapshot.dimensionOrder.forEach((dimensionId) => {
    const current = snapshot.dimensions[dimensionId];
    const previousValue = previous?.dimensions[dimensionId];
    current.change1m = typeof previousValue === 'number'
      ? roundScore(current.score - previousValue)
      : 0;
  });
  return snapshot;
}

function createSnapshot(
  country: ResilienceCountrySeedProfile,
  ciiMap: Map<string, CountryScore>,
): ResilienceCountrySnapshot {
  const context: ResilienceConnectorContext = {
    countryCode: country.code,
    countryName: country.name,
    now: new Date().toISOString(),
  };
  const connectorResults = getConnectors().map((connector) => connector.collect(country.code, context));
  const cii = ciiMap.get(country.code) ?? null;
  const internalPenalties = calculateInternalPenalties({ cii, data: getCountryData(country.code) });
  const dimensions = {} as Record<ResilienceDimensionId, ResilienceDimensionScore>;
  DIMENSION_ORDER.forEach((dimensionId) => {
    dimensions[dimensionId] = buildDimensionScore(country, dimensionId, connectorResults, internalPenalties);
  });

  const composite = buildCompositeScore(dimensions);
  const history = buildHistory(country, composite.score);
  const sources = [RESILIENCE_METHOD_SOURCE, ...connectorResults.map((result) => result.source)];
  const allIndicators = connectorResults.flatMap((result) => result.indicators);
  const coverage = buildCoverageSummary(allIndicators);
  const warnings = connectorResults.flatMap((result) => result.warnings);

  return finalizeChanges({
    countryCode: country.code,
    countryName: country.name,
    region: country.region,
    peerGroup: country.peerGroup,
    baselineSet: [...RESILIENCE_BASELINE_COUNTRY_CODES],
    comparisonSet: [...country.neighbors, ...country.strategicPartners].filter((code, index, items) => items.indexOf(code) === index),
    dimensions,
    dimensionOrder: [...DIMENSION_ORDER],
    composite,
    history,
    spillovers: [],
    stressScenarios: RESILIENCE_STRESS_SCENARIOS.map((scenario) => ({ ...scenario })),
    stressMatrix: [],
    sources,
    warnings,
    coverage,
    updatedAt: context.now,
    asOfLabel: new Date(context.now).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }),
    methodologySummary: 'خط پایه نمونه با لایه‌های زنده داخلی QADR110 ترکیب می‌شود. هر افت ناشی از سیگنال زنده به‌صورت صریح در توضیح هر بعد ثبت می‌شود.',
    internalSignalSummary: deriveSignalSummary(getCountryData(country.code), cii),
    synthetic: coverage.liveIndicators === 0,
  });
}

function buildScoreMap(countryCodes?: string[]): Map<string, ResilienceCountrySnapshot> {
  const ciiMap = new Map(calculateCII().map((score) => [score.code, score]));
  const selectedCodes = (countryCodes && countryCodes.length > 0 ? countryCodes : [...RESILIENCE_BASELINE_COUNTRY_CODES])
    .map((code) => code.toUpperCase())
    .filter((code, index, items) => items.indexOf(code) === index);

  const map = new Map<string, ResilienceCountrySnapshot>();
  selectedCodes.forEach((code) => {
    const country = RESILIENCE_COUNTRY_SEEDS[code];
    if (!country) return;
    map.set(code, createSnapshot(country, ciiMap));
  });

  map.forEach((snapshot, code) => {
    const profile = RESILIENCE_COUNTRY_SEEDS[code];
    if (!profile) return;
    snapshot.spillovers = buildSpillovers(profile, map);
    snapshot.stressMatrix = buildStressMatrix(snapshot);
  });

  return map;
}

function pickTopStrength(snapshot: ResilienceCountrySnapshot): string {
  const top = snapshot.dimensionOrder
    .map((id) => snapshot.dimensions[id])
    .sort((left, right) => right.score - left.score)[0];
  return top ? top.label : 'نامشخص';
}

function pickTopWeakness(snapshot: ResilienceCountrySnapshot): string {
  const weakest = snapshot.dimensionOrder
    .map((id) => snapshot.dimensions[id])
    .sort((left, right) => left.score - right.score)[0];
  return weakest ? weakest.label : 'نامشخص';
}

function buildComparisonRows(primary: ResilienceCountrySnapshot, comparisons: ResilienceCountrySnapshot[]): ResiliencePeerComparisonRow[] {
  return [primary, ...comparisons]
    .map((snapshot) => ({
      countryCode: snapshot.countryCode,
      countryName: snapshot.countryName,
      region: snapshot.region,
      overall: snapshot.composite.score,
      deltaVsPrimary: roundScore(snapshot.composite.score - primary.composite.score),
      band: snapshot.composite.band,
      topStrength: pickTopStrength(snapshot),
      topWeakness: pickTopWeakness(snapshot),
      uncertaintyWidth: snapshot.composite.uncertainty.upper - snapshot.composite.uncertainty.lower,
    }))
    .sort((left, right) => right.overall - left.overall);
}

function buildHeatmapRows(primary: ResilienceCountrySnapshot, comparisons: ResilienceCountrySnapshot[]): ResilienceHeatmapRow[] {
  const series = [primary, ...comparisons];
  return primary.dimensionOrder.map((dimensionId) => ({
    dimensionId,
    label: primary.dimensions[dimensionId].label,
    values: series.map((snapshot) => ({
      countryCode: snapshot.countryCode,
      countryName: snapshot.countryName,
      score: snapshot.dimensions[dimensionId].score,
      change1m: snapshot.dimensions[dimensionId].change1m,
      coveragePercent: snapshot.dimensions[dimensionId].coveragePercent,
    })),
  }));
}

function buildRadarSeries(primary: ResilienceCountrySnapshot, comparisons: ResilienceCountrySnapshot[]): ResilienceRadarSeries[] {
  return [primary, ...comparisons].map((snapshot) => ({
    countryCode: snapshot.countryCode,
    countryName: snapshot.countryName,
    values: snapshot.dimensionOrder.map((dimensionId) => ({
      dimensionId,
      label: snapshot.dimensions[dimensionId].label,
      score: snapshot.dimensions[dimensionId].score,
    })),
  }));
}

function buildSlopeSeries(primary: ResilienceCountrySnapshot, comparisons: ResilienceCountrySnapshot[]): ResilienceSlopeSeries[] {
  return [primary, ...comparisons].map((snapshot) => {
    const start = snapshot.history[0]?.overall ?? snapshot.composite.score;
    const end = snapshot.history[snapshot.history.length - 1]?.overall ?? snapshot.composite.score;
    return {
      countryCode: snapshot.countryCode,
      countryName: snapshot.countryName,
      start,
      end,
      delta: roundScore(end - start),
    };
  });
}

function buildSpilloverNetwork(primary: ResilienceCountrySnapshot, comparisons: ResilienceCountrySnapshot[]) {
  const nodes: ResilienceNetworkNode[] = [{
    countryCode: primary.countryCode,
    countryName: primary.countryName,
    overall: primary.composite.score,
    ring: 'primary',
  }];
  const links: ResilienceNetworkLink[] = [];
  const seenNodes = new Set<string>([primary.countryCode]);

  [primary, ...comparisons].forEach((snapshot) => {
    if (!seenNodes.has(snapshot.countryCode)) {
      nodes.push({
        countryCode: snapshot.countryCode,
        countryName: snapshot.countryName,
        overall: snapshot.composite.score,
        ring: primary.comparisonSet.includes(snapshot.countryCode) ? 'neighbor' : 'peer',
      });
      seenNodes.add(snapshot.countryCode);
    }
    snapshot.spillovers.slice(0, 4).forEach((spillover) => {
      if (!seenNodes.has(spillover.targetCountryCode)) {
        nodes.push({
          countryCode: spillover.targetCountryCode,
          countryName: spillover.targetCountryName,
          overall: 0,
          ring: primary.comparisonSet.includes(spillover.targetCountryCode) ? 'neighbor' : 'peer',
        });
        seenNodes.add(spillover.targetCountryCode);
      }
      links.push({
        from: snapshot.countryCode,
        to: spillover.targetCountryCode,
        channel: spillover.channel,
        intensity: spillover.intensity,
      });
    });
  });

  return { nodes, links };
}

function buildCoverageRows(primary: ResilienceCountrySnapshot, comparisons: ResilienceCountrySnapshot[]): ResilienceCoverageRow[] {
  return [primary, ...comparisons].map((snapshot) => ({
    countryCode: snapshot.countryCode,
    countryName: snapshot.countryName,
    coveragePercent: snapshot.coverage.coveragePercent,
    sampleShare: snapshot.composite.sampleShare,
    liveShare: snapshot.composite.liveShare,
    lastUpdated: snapshot.asOfLabel,
  }));
}

function normalizeCountryCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  return RESILIENCE_COUNTRY_SEEDS[upper] ? upper : null;
}

export function listResilienceBaselineCountries(): Array<{ code: string; name: string }> {
  return [...RESILIENCE_BASELINE_COUNTRY_CODES].map((code) => ({
    code,
    name: RESILIENCE_COUNTRY_NAME_MAP[code] ?? code,
  }));
}

export function getResilienceCountrySnapshot(countryCode: string): ResilienceCountrySnapshot | null {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) return null;
  return buildScoreMap([normalized]).get(normalized) ?? null;
}

export function getResilienceComparisonSet(primaryCountryCode: string): string[] {
  const normalized = normalizeCountryCode(primaryCountryCode);
  const profile = normalized ? RESILIENCE_COUNTRY_SEEDS[normalized] : null;
  if (!profile) return [...PEER_COMPARISON_FALLBACK];
  return [...profile.neighbors, ...profile.strategicPartners]
    .filter((code, index, items) => items.indexOf(code) === index)
    .filter((code) => !!RESILIENCE_COUNTRY_SEEDS[code]);
}

export function getResilienceDashboardModel(
  primaryCountryCode = 'IR',
  compareCountryCodes: string[] = [],
): ResilienceDashboardModel {
  const primaryCode = normalizeCountryCode(primaryCountryCode) ?? 'IR';
  const compareCodes = (compareCountryCodes.length > 0 ? compareCountryCodes : getResilienceComparisonSet(primaryCode))
    .map((code) => normalizeCountryCode(code))
    .filter((code): code is string => !!code && code !== primaryCode)
    .slice(0, 7);

  const scoreMap = buildScoreMap([primaryCode, ...compareCodes]);
  const primary = scoreMap.get(primaryCode) ?? buildScoreMap(['IR']).get('IR')!;
  const comparisons = compareCodes
    .map((code) => scoreMap.get(code))
    .filter((snapshot): snapshot is ResilienceCountrySnapshot => !!snapshot);

  return {
    primary,
    comparisons,
    rankedRows: buildComparisonRows(primary, comparisons),
    heatmapRows: buildHeatmapRows(primary, comparisons),
    radarSeries: buildRadarSeries(primary, comparisons),
    trendSeries: [primary, ...comparisons].map((snapshot) => ({
      countryCode: snapshot.countryCode,
      countryName: snapshot.countryName,
      points: snapshot.history,
    })),
    slopeSeries: buildSlopeSeries(primary, comparisons),
    stressMatrix: [primary, ...comparisons].flatMap((snapshot) => snapshot.stressMatrix),
    spilloverNetwork: buildSpilloverNetwork(primary, comparisons),
    coverageTable: buildCoverageRows(primary, comparisons),
  };
}

export function getResilienceRankedSnapshots(countryCodes?: string[]): ResilienceCountrySnapshot[] {
  return [...buildScoreMap(countryCodes).values()].sort((left, right) => right.composite.score - left.composite.score);
}

export function getResilienceMethodologySummary(): string {
  return 'امتیاز تاب‌آوری QADR110 از ۱۴ بعد با وزن‌های ثابت تشکیل می‌شود. خط پایه نمونه به‌صراحت برچسب‌گذاری می‌شود و سیگنال‌های داخلی فقط به‌صورت تعدیل شفاف روی همان خط پایه اعمال می‌شوند. هر بعد پوشش، تازگی، عدم‌قطعیت و سهم داده نمونه/زنده را جداگانه نشان می‌دهد.';
}

export function describeResilienceBand(score: number): string {
  return describeScoreBand(score);
}
