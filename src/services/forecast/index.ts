export type ForecastVariable = 'oil' | 'gold' | 'riskIndex' | 'shippingRate';

export interface ForecastPoint {
  step: number;
  p10: number;
  p50: number;
  p90: number;
  confidenceInterval: [number, number];
}

export interface ForecastDistribution {
  variable: ForecastVariable;
  unit: string;
  points: ForecastPoint[];
  latest: ForecastPoint;
  mainDrivers: string[];
  modelConfidence: number;
}

interface ForecastConfig {
  unit: string;
  drift: number;
  volatility: number;
  meanReversion: number;
  drivers: string[];
  confidenceBase: number;
}

const FORECAST_CONFIG: Record<ForecastVariable, ForecastConfig> = {
  oil: {
    unit: 'USD/bbl',
    drift: 0.004,
    volatility: 0.055,
    meanReversion: 0.18,
    drivers: ['OPEC+ supply discipline', 'Inventory surprises', 'Geopolitical route risk'],
    confidenceBase: 0.73,
  },
  gold: {
    unit: 'USD/oz',
    drift: 0.003,
    volatility: 0.04,
    meanReversion: 0.14,
    drivers: ['Real-yield trend', 'Safe-haven flows', 'Central-bank accumulation'],
    confidenceBase: 0.76,
  },
  riskIndex: {
    unit: 'index',
    drift: 0.002,
    volatility: 0.07,
    meanReversion: 0.22,
    drivers: ['Conflict intensity', 'Policy uncertainty', 'Cross-asset volatility'],
    confidenceBase: 0.69,
  },
  shippingRate: {
    unit: 'index',
    drift: 0.005,
    volatility: 0.08,
    meanReversion: 0.2,
    drivers: ['Port congestion', 'Canal/transit disruptions', 'Fuel and insurance costs'],
    confidenceBase: 0.67,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function seededNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function estimatePercentiles(center: number, sigma: number): Pick<ForecastPoint, 'p10' | 'p50' | 'p90' | 'confidenceInterval'> {
  const p10 = center * (1 - sigma * 1.28);
  const p90 = center * (1 + sigma * 1.28);
  const ciLow = center * (1 - sigma * 1.96);
  const ciHigh = center * (1 + sigma * 1.96);
  return {
    p10: Number(p10.toFixed(2)),
    p50: Number(center.toFixed(2)),
    p90: Number(p90.toFixed(2)),
    confidenceInterval: [Number(ciLow.toFixed(2)), Number(ciHigh.toFixed(2))],
  };
}

export function generateForecastDistribution(
  variable: ForecastVariable,
  baseValue: number,
  options?: { horizon?: number; trendBias?: number }
): ForecastDistribution {
  const cfg = FORECAST_CONFIG[variable];
  const horizon = Math.max(4, Math.min(options?.horizon ?? 8, 16));
  const trendBias = options?.trendBias ?? 0;
  const points: ForecastPoint[] = [];

  let level = Math.max(baseValue, 0.01);
  for (let step = 1; step <= horizon; step += 1) {
    const shock = seededNoise(baseValue + step + variable.length * 11) * cfg.volatility;
    const drift = cfg.drift + trendBias * 0.01;
    level = Math.max(0.01, level * (1 + drift + shock * 0.35 - cfg.meanReversion * (shock * 0.2)));
    const sigma = cfg.volatility * (0.75 + step / (horizon * 1.6));
    const distribution = estimatePercentiles(level, sigma);
    points.push({ step, ...distribution });
  }

  const latestPoint = points[points.length - 1] ?? { step: horizon, p10: level, p50: level, p90: level, confidenceInterval: [level, level] as [number, number] };
  const spread = Math.abs(latestPoint.p90 - latestPoint.p10) / Math.max(latestPoint.p50, 0.01);
  const modelConfidence = clamp(cfg.confidenceBase - spread * 0.2, 0.45, 0.92);

  return {
    variable,
    unit: cfg.unit,
    points,
    latest: latestPoint,
    mainDrivers: cfg.drivers,
    modelConfidence: Number(modelConfidence.toFixed(2)),
  };
}

export function generateCoreForecasts(input: {
  oil: number;
  gold: number;
  riskIndex: number;
  shippingRate: number;
}): Record<ForecastVariable, ForecastDistribution> {
  return {
    oil: generateForecastDistribution('oil', input.oil),
    gold: generateForecastDistribution('gold', input.gold),
    riskIndex: generateForecastDistribution('riskIndex', input.riskIndex),
    shippingRate: generateForecastDistribution('shippingRate', input.shippingRate),
  };
}
