export type ScenarioSeverity = 'low' | 'moderate' | 'high' | 'severe';

export interface ScenarioDefinition {
  name: string;
  event: string;
  severity: ScenarioSeverity;
  durationDays: number;
  actors: string[];
  constraints: string[];
}

export interface ScenarioSectorImpact {
  baseline: number;
  optimistic: number;
  pessimistic: number;
}

export interface ScenarioCountryRisk {
  code: string;
  name: string;
  baseline: number;
  optimistic: number;
  pessimistic: number;
}

export interface ScenarioEngineOutput {
  energy: ScenarioSectorImpact;
  shipping: ScenarioSectorImpact;
  financialMarkets: ScenarioSectorImpact;
  countryRiskIndex: ScenarioCountryRisk[];
}
