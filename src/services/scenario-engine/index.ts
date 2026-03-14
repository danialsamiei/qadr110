import type { ScenarioDefinition, ScenarioEngineOutput, ScenarioSeverity, ScenarioCountryRisk } from './types';

const SEVERITY_MULTIPLIER: Record<ScenarioSeverity, number> = {
  low: 0.55,
  moderate: 0.85,
  high: 1.15,
  severe: 1.45,
};

const COUNTRY_EXPOSURE: Array<{ code: string; name: string; energy: number; shipping: number; finance: number }> = [
  { code: 'US', name: 'United States', energy: 0.6, shipping: 0.5, finance: 0.95 },
  { code: 'CN', name: 'China', energy: 0.7, shipping: 0.9, finance: 0.75 },
  { code: 'SA', name: 'Saudi Arabia', energy: 0.95, shipping: 0.65, finance: 0.45 },
  { code: 'IR', name: 'Iran', energy: 0.85, shipping: 0.8, finance: 0.35 },
  { code: 'IN', name: 'India', energy: 0.65, shipping: 0.7, finance: 0.55 },
  { code: 'DE', name: 'Germany', energy: 0.55, shipping: 0.4, finance: 0.7 },
  { code: 'JP', name: 'Japan', energy: 0.5, shipping: 0.8, finance: 0.78 },
  { code: 'GB', name: 'United Kingdom', energy: 0.45, shipping: 0.55, finance: 0.82 },
  { code: 'EG', name: 'Egypt', energy: 0.52, shipping: 0.88, finance: 0.38 },
  { code: 'SG', name: 'Singapore', energy: 0.35, shipping: 0.95, finance: 0.76 },
];

const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, Math.round(value)));

function scoreScenario(definition: ScenarioDefinition): { energy: number; shipping: number; financialMarkets: number } {
  const normalizedDuration = Math.min(definition.durationDays / 30, 4);
  const actorPressure = Math.min(definition.actors.length * 0.12, 0.7);
  const constraintPressure = Math.min(definition.constraints.length * 0.08, 0.5);
  const eventBias = Math.min(definition.event.trim().length / 80, 0.4);

  const severityFactor = SEVERITY_MULTIPLIER[definition.severity] ?? 1;
  const base = severityFactor + normalizedDuration * 0.2 + actorPressure + constraintPressure + eventBias;

  return {
    energy: clamp(30 + base * 20),
    shipping: clamp(24 + base * 22),
    financialMarkets: clamp(28 + base * 24),
  };
}

function buildCountryRisk(baseScores: { energy: number; shipping: number; financialMarkets: number }): ScenarioCountryRisk[] {
  return COUNTRY_EXPOSURE
    .map((country) => {
      const blended = (baseScores.energy * country.energy) + (baseScores.shipping * country.shipping) + (baseScores.financialMarkets * country.finance);
      const baseline = clamp(blended / 3);
      return {
        code: country.code,
        name: country.name,
        baseline,
        optimistic: clamp(baseline * 0.8),
        pessimistic: clamp(baseline * 1.25),
      };
    })
    .sort((a, b) => b.baseline - a.baseline)
    .slice(0, 8);
}

export function runScenarioEngine(definition: ScenarioDefinition): ScenarioEngineOutput {
  const baseScores = scoreScenario(definition);

  return {
    energy: {
      baseline: baseScores.energy,
      optimistic: clamp(baseScores.energy * 0.8),
      pessimistic: clamp(baseScores.energy * 1.25),
    },
    shipping: {
      baseline: baseScores.shipping,
      optimistic: clamp(baseScores.shipping * 0.82),
      pessimistic: clamp(baseScores.shipping * 1.27),
    },
    financialMarkets: {
      baseline: baseScores.financialMarkets,
      optimistic: clamp(baseScores.financialMarkets * 0.78),
      pessimistic: clamp(baseScores.financialMarkets * 1.3),
    },
    countryRiskIndex: buildCountryRisk(baseScores),
  };
}

export type { ScenarioDefinition, ScenarioEngineOutput, ScenarioCountryRisk, ScenarioSectorImpact } from './types';
