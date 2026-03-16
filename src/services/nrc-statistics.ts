/**
 * NRC Statistical Service — Pure mathematical functions for National Resilience Coefficient
 *
 * All functions are side-effect-free and suitable for unit testing.
 * Implements: Cronbach's Alpha, normalization, correlation, forecasting,
 * control charts, changepoint detection, DEA efficiency, and trend analysis.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LagResult {
  lag: number;
  correlation: number;
}

export interface ControlChartResult {
  mean: number;
  stdDev: number;
  upperControl2: number;
  lowerControl2: number;
  upperControl3: number;
  lowerControl3: number;
  violations2Sigma: number[];
  violations3Sigma: number[];
}

export interface DEAUnit {
  id: string;
  name: string;
  inputs: number[];
  outputs: number[];
}

export interface DEAResult {
  id: string;
  name: string;
  efficiency: number;
  isBenchmark: boolean;
  rank: number;
}

export interface ForecastResult {
  values: number[];
  confidenceIntervals: Array<{ lower: number; upper: number; level: number }>;
  mape: number;
  rmseValue: number;
  rSquared: number;
  probabilityUp: number;
  probabilityDown: number;
}

export type TrendDirection = 'rising' | 'falling' | 'sideways';

export interface TrendResult {
  direction: TrendDirection;
  growthRateValue: number;
  momentumValue: number;
  volatilityValue: number;
  ma20: number[];
  ma50: number[];
  crossovers: Array<{ index: number; type: 'golden' | 'death' }>;
}

// ─── Normalization ──────────────────────────────────────────────────────────

export function minMaxNormalize(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = values.length > 60000 ? values.reduce((a, v) => (v < a ? v : a), Infinity) : Math.min(...values);
  const max = values.length > 60000 ? values.reduce((a, v) => (v > a ? v : a), -Infinity) : Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 0.5);
  return values.map((v) => (v - min) / range);
}

export function zScoreNormalize(values: number[]): number[] {
  if (values.length < 2) return values.map(() => 0);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return values.map(() => 0);
  return values.map((v) => (v - mean) / std);
}

// ─── Reliability ────────────────────────────────────────────────────────────

/**
 * Cronbach's Alpha — Internal consistency reliability coefficient.
 * α = (k / (k-1)) × (1 - Σσⱼ² / σ_T²)
 * @param items Matrix where rows = observations, cols = items
 * @returns Alpha coefficient (0-1, acceptable ≥ 0.70)
 */
export function cronbachAlpha(items: number[][]): number {
  if (items.length < 2 || !items[0] || items[0].length < 2) return 0;
  const n = items.length;
  const k = items[0].length;

  // Calculate item variances (columns)
  const itemVariances: number[] = [];
  for (let j = 0; j < k; j++) {
    const col = items.map((row) => row[j] ?? 0);
    const colMean = col.reduce((s, v) => s + v, 0) / n;
    const colVar = col.reduce((s, v) => s + (v - colMean) ** 2, 0) / (n - 1);
    itemVariances.push(colVar);
  }

  // Calculate total score variance
  const totalScores = items.map((row) => row.reduce((s, v) => s + v, 0));
  const totalMean = totalScores.reduce((s, v) => s + v, 0) / n;
  const totalVar = totalScores.reduce((s, v) => s + (v - totalMean) ** 2, 0) / (n - 1);

  if (totalVar === 0) return 0;

  const sumItemVar = itemVariances.reduce((s, v) => s + v, 0);
  return (k / (k - 1)) * (1 - sumItemVar / totalVar);
}

// ─── Correlation ────────────────────────────────────────────────────────────

export function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  const meanX = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const meanY = y.slice(0, n).reduce((s, v) => s + v, 0) / n;

  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = (x[i] ?? 0) - meanX;
    const dy = (y[i] ?? 0) - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denom = Math.sqrt(sumX2 * sumY2);
  return denom === 0 ? 0 : sumXY / denom;
}

export function laggedCorrelation(x: number[], y: number[], maxLag: number): LagResult[] {
  const results: LagResult[] = [];
  for (let lag = 0; lag <= maxLag; lag++) {
    const xSlice = x.slice(0, x.length - lag);
    const ySlice = y.slice(lag);
    const n = Math.min(xSlice.length, ySlice.length);
    if (n < 3) break;
    results.push({ lag, correlation: pearsonCorrelation(xSlice.slice(0, n), ySlice.slice(0, n)) });
  }
  return results;
}

// ─── Control Charts ─────────────────────────────────────────────────────────

export function controlChart(values: number[]): ControlChartResult {
  const n = values.length;
  if (n < 3) {
    return {
      mean: 0,
      stdDev: 0,
      upperControl2: 0,
      lowerControl2: 0,
      upperControl3: 0,
      lowerControl3: 0,
      violations2Sigma: [],
      violations3Sigma: [],
    };
  }

  const mean = values.reduce((s, v) => s + v, 0) / n;
  const stdDev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));

  const uc2 = mean + 2 * stdDev;
  const lc2 = mean - 2 * stdDev;
  const uc3 = mean + 3 * stdDev;
  const lc3 = mean - 3 * stdDev;

  const v2: number[] = [];
  const v3: number[] = [];
  for (let i = 0; i < n; i++) {
    const val = values[i]!;
    if (val > uc3 || val < lc3) v3.push(i);
    else if (val > uc2 || val < lc2) v2.push(i);
  }

  return {
    mean,
    stdDev,
    upperControl2: uc2,
    lowerControl2: lc2,
    upperControl3: uc3,
    lowerControl3: lc3,
    violations2Sigma: v2,
    violations3Sigma: v3,
  };
}

// ─── Changepoint Detection (CUSUM-based) ────────────────────────────────────

export function detectChangepoints(values: number[], threshold = 2.0): number[] {
  if (values.length < 6) return [];

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1));
  if (std === 0) return [];

  const changepoints: number[] = [];
  let cuSumPos = 0;
  let cuSumNeg = 0;
  const k = std * 0.5; // slack parameter

  for (let i = 1; i < values.length; i++) {
    const z = ((values[i] ?? 0) - mean) / std;
    cuSumPos = Math.max(0, cuSumPos + z - k / std);
    cuSumNeg = Math.max(0, cuSumNeg - z - k / std);
    if (cuSumPos > threshold || cuSumNeg > threshold) {
      changepoints.push(i);
      cuSumPos = 0;
      cuSumNeg = 0;
    }
  }
  return changepoints;
}

// ─── Forecasting ────────────────────────────────────────────────────────────

export function exponentialSmoothing(values: number[], alpha = 0.3): number[] {
  if (values.length === 0) return [];
  const result = [values[0]!];
  for (let i = 1; i < values.length; i++) {
    result.push(alpha * values[i]! + (1 - alpha) * result[i - 1]!);
  }
  return result;
}

export function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i]!;
    sumXY += i * values[i]!;
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

const Z_VALUES: Record<number, number> = { 68: 1.0, 95: 1.96, 99: 2.576 };

export function confidenceInterval(
  forecast: number,
  rmseVal: number,
  level: 68 | 95 | 99 = 95,
): [number, number] {
  const z = Z_VALUES[level] ?? 1.96;
  return [forecast - z * rmseVal, forecast + z * rmseVal];
}

// ─── Accuracy Metrics ───────────────────────────────────────────────────────

export function mape(actual: number[], forecast: number[]): number {
  const n = Math.min(actual.length, forecast.length);
  if (n === 0) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(actual[i]!) > 1e-10) {
      sum += Math.abs((actual[i]! - forecast[i]!) / actual[i]!);
      count++;
    }
  }
  return count === 0 ? 0 : (sum / count) * 100;
}

export function rmse(actual: number[], forecast: number[]): number {
  const n = Math.min(actual.length, forecast.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (actual[i]! - forecast[i]!) ** 2;
  }
  return Math.sqrt(sum / n);
}

export function rSquared(actual: number[], forecast: number[]): number {
  const n = Math.min(actual.length, forecast.length);
  if (n < 2) return 0;
  const meanActual = actual.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (actual[i]! - forecast[i]!) ** 2;
    ssTot += (actual[i]! - meanActual) ** 2;
  }
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

// ─── DEA Efficiency (CCR-inspired) ──────────────────────────────────────────

export function deaEfficiency(units: DEAUnit[]): DEAResult[] {
  if (units.length === 0) return [];

  const ratios = units.map((u) => {
    const sumIn = u.inputs.reduce((s, v) => s + Math.max(v, 1e-10), 0);
    const sumOut = u.outputs.reduce((s, v) => s + v, 0);
    return { id: u.id, name: u.name, ratio: sumOut / sumIn };
  });

  const maxRatio = ratios.reduce((m, r) => Math.max(m, r.ratio), 0);
  if (maxRatio === 0) return ratios.map((r, i) => ({ ...r, efficiency: 0, isBenchmark: false, rank: i + 1 }));

  const results = ratios
    .map((r) => ({
      id: r.id,
      name: r.name,
      efficiency: Math.min(r.ratio / maxRatio, 1),
      isBenchmark: Math.abs(r.ratio - maxRatio) < 1e-10,
      rank: 0,
    }))
    .sort((a, b) => b.efficiency - a.efficiency);

  results.forEach((r, i) => {
    r.rank = i + 1;
  });
  return results;
}

// ─── Trend Analysis ─────────────────────────────────────────────────────────

export function movingAverage(values: number[], window: number): number[] {
  if (values.length < window) return [];
  const result: number[] = [];
  let sum = 0;
  for (let i = 0; i < window; i++) sum += values[i]!;
  result.push(sum / window);
  for (let i = window; i < values.length; i++) {
    sum += values[i]! - values[i - window]!;
    result.push(sum / window);
  }
  return result;
}

export function momentum(values: number[], period = 10): number {
  if (values.length < period + 1) return 0;
  const current = values[values.length - 1] ?? 0;
  const prev = values[values.length - 1 - period] ?? 0;
  return prev === 0 ? 0 : ((current - prev) / Math.abs(prev)) * 100;
}

export function volatility(values: number[]): number {
  if (values.length < 2) return 0;
  const changes: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!;
    const curr = values[i]!;
    if (Math.abs(prev) > 1e-10) {
      changes.push((curr - prev) / prev);
    }
  }
  if (changes.length < 2) return 0;
  const mean = changes.reduce((s, v) => s + v, 0) / changes.length;
  return Math.sqrt(changes.reduce((s, v) => s + (v - mean) ** 2, 0) / (changes.length - 1));
}

export function growthRate(values: number[], lookback = 10): number {
  if (values.length < 2) return 0;
  const period = Math.min(lookback, values.length - 1);
  const older = values[values.length - 1 - period] ?? 0;
  const current = values[values.length - 1] ?? 0;
  return older === 0 ? 0 : ((current - older) / Math.abs(older)) * 100;
}

export function detectTrend(values: number[]): TrendDirection {
  if (values.length < 5) return 'sideways';
  const { slope } = linearRegression(values);
  const meanVal = values.reduce((s, v) => s + v, 0) / values.length;
  const normalized = meanVal === 0 ? 0 : slope / Math.abs(meanVal);
  if (normalized > 0.005) return 'rising';
  if (normalized < -0.005) return 'falling';
  return 'sideways';
}

export function detectCrossovers(
  shortMA: number[],
  longMA: number[],
): Array<{ index: number; type: 'golden' | 'death' }> {
  const crossovers: Array<{ index: number; type: 'golden' | 'death' }> = [];
  const n = Math.min(shortMA.length, longMA.length);
  for (let i = 1; i < n; i++) {
    const prevDiff = shortMA[i - 1]! - longMA[i - 1]!;
    const currDiff = shortMA[i]! - longMA[i]!;
    if (prevDiff <= 0 && currDiff > 0) crossovers.push({ index: i, type: 'golden' });
    else if (prevDiff >= 0 && currDiff < 0) crossovers.push({ index: i, type: 'death' });
  }
  return crossovers;
}

// ─── Composite NRC Forecast ─────────────────────────────────────────────────

export function nrcForecast(
  historicalValues: number[],
  horizonDays: number,
  alpha = 0.3,
): ForecastResult {
  if (historicalValues.length < 3) {
    const lastVal = historicalValues[historicalValues.length - 1] ?? 50;
    return {
      values: Array(horizonDays).fill(lastVal) as number[],
      confidenceIntervals: Array(horizonDays)
        .fill(null)
        .map(() => ({ lower: lastVal * 0.9, upper: lastVal * 1.1, level: 95 })),
      mape: 0,
      rmseValue: 0,
      rSquared: 0,
      probabilityUp: 0.5,
      probabilityDown: 0.5,
    };
  }

  // In-sample smoothing
  const smoothed = exponentialSmoothing(historicalValues, alpha);
  const { slope } = linearRegression(historicalValues);

  // Accuracy on training data
  const mapeVal = mape(historicalValues, smoothed);
  const rmseVal = rmse(historicalValues, smoothed);
  const r2Val = rSquared(historicalValues, smoothed);

  // Generate forecast
  const lastSmoothed = smoothed[smoothed.length - 1] ?? historicalValues[historicalValues.length - 1] ?? 50;
  const forecastValues: number[] = [];
  const cis: Array<{ lower: number; upper: number; level: number }> = [];

  for (let d = 1; d <= horizonDays; d++) {
    const trend = slope * d;
    const value = Math.max(0, Math.min(100, lastSmoothed + trend));
    forecastValues.push(Number(value.toFixed(2)));

    const expandedRMSE = rmseVal * Math.sqrt(d);
    const [lower, upper] = confidenceInterval(value, expandedRMSE, 95);
    cis.push({ lower: Math.max(0, Number(lower.toFixed(2))), upper: Math.min(100, Number(upper.toFixed(2))), level: 95 });
  }

  // Probability narrative
  const lastForecast = forecastValues[forecastValues.length - 1] ?? lastSmoothed;
  const lastActual = historicalValues[historicalValues.length - 1] ?? 50;
  const probabilityUp = lastForecast > lastActual ? Math.min(0.95, 0.5 + (lastForecast - lastActual) * 0.05) : Math.max(0.05, 0.5 - (lastActual - lastForecast) * 0.05);

  return {
    values: forecastValues,
    confidenceIntervals: cis,
    mape: Number(mapeVal.toFixed(2)),
    rmseValue: Number(rmseVal.toFixed(4)),
    rSquared: Number(r2Val.toFixed(4)),
    probabilityUp: Number(probabilityUp.toFixed(2)),
    probabilityDown: Number((1 - probabilityUp).toFixed(2)),
  };
}
