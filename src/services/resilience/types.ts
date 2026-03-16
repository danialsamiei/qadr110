import type { AssistantRunResponse } from '@/platform/ai/assistant-contracts';

export type ResilienceDimensionId =
  | 'macroFiscal'
  | 'currencyExternal'
  | 'tradeSanctions'
  | 'energy'
  | 'foodWater'
  | 'infrastructure'
  | 'logisticsSupply'
  | 'socialCohesion'
  | 'governanceInstitutional'
  | 'informationCognitive'
  | 'cyberDigital'
  | 'healthPublicService'
  | 'environmentalClimate'
  | 'borderSecurity';

export type ResilienceScoreBand =
  | 'very-strong'
  | 'strong'
  | 'balanced'
  | 'fragile'
  | 'severely-fragile';

export type ResilienceCoverageStatus = 'complete' | 'partial' | 'missing';
export type ResilienceConnectorKind = 'sample' | 'internal-signal' | 'public-indicator';
export type ResilienceSignalDirection = 'higher-is-better' | 'lower-is-better';
export type ResilienceReportType =
  | 'national-brief'
  | 'comparative-country'
  | 'international-economic'
  | 'scenario-forecast';
export type ResilienceChartKind =
  | 'time-series'
  | 'radar'
  | 'heatmap'
  | 'slope'
  | 'ranked-bars'
  | 'table'
  | 'spillover-network'
  | 'stress-matrix';

export interface ResilienceDimensionDefinition {
  id: ResilienceDimensionId;
  label: string;
  shortLabel: string;
  description: string;
  methodology: string;
  weight: number;
  chartGroup: 'economic' | 'societal' | 'infrastructure' | 'governance' | 'security';
}

export interface ResilienceSourceDescriptor {
  id: string;
  title: string;
  kind: ResilienceConnectorKind;
  synthetic: boolean;
  url?: string;
  coverageNote: string;
  lastUpdated: string;
  license?: string;
}

export interface ResilienceIndicatorObservation {
  id: string;
  label: string;
  value: number | null;
  displayValue: string;
  unit: string;
  direction: ResilienceSignalDirection;
  normalizedScore: number | null;
  sourceId: string;
  sourceTitle: string;
  synthetic: boolean;
  confidence: number;
  coverageStatus: ResilienceCoverageStatus;
  lastUpdated: string;
  freshnessDays: number;
  note: string;
  provenance: string;
}

export interface ResilienceConnectorContext {
  countryCode: string;
  countryName: string;
  now: string;
}

export interface ResilienceConnectorResult {
  connectorId: string;
  source: ResilienceSourceDescriptor;
  indicators: ResilienceIndicatorObservation[];
  warnings: string[];
  coveragePercent: number;
}

export interface ResilienceConnector {
  id: string;
  label: string;
  kind: ResilienceConnectorKind;
  synthetic: boolean;
  enabled: boolean;
  collect(countryCode: string, context: ResilienceConnectorContext): ResilienceConnectorResult;
}

export interface ResilienceDimensionScore {
  id: ResilienceDimensionId;
  label: string;
  weight: number;
  score: number;
  change1m: number;
  uncertainty: { lower: number; upper: number };
  coveragePercent: number;
  freshnessPercent: number;
  sampleShare: number;
  liveShare: number;
  methodology: string;
  indicators: ResilienceIndicatorObservation[];
  rationale: string;
  lastUpdated: string;
}

export interface ResilienceCompositeScore {
  score: number;
  band: ResilienceScoreBand;
  change1m: number;
  uncertainty: { lower: number; upper: number };
  coveragePercent: number;
  freshnessPercent: number;
  sampleShare: number;
  liveShare: number;
  methodology: string;
  lastUpdated: string;
}

export interface ResilienceHistoryPoint {
  label: string;
  observedAt: string;
  overall: number;
  dimensions: Partial<Record<ResilienceDimensionId, number>>;
  synthetic: boolean;
  note: string;
}

export interface ResilienceSpilloverLink {
  targetCountryCode: string;
  targetCountryName: string;
  channel: 'border' | 'trade' | 'energy' | 'migration' | 'information' | 'security' | 'logistics';
  intensity: number;
  note: string;
}

export interface ResilienceStressScenario {
  id: string;
  title: string;
  description: string;
  timeHorizon: string;
  stressByDimension: Partial<Record<ResilienceDimensionId, number>>;
  affectedCountries?: string[];
  monitoringSignals: string[];
}

export interface ResilienceStressMatrixCell {
  scenarioId: string;
  scenarioTitle: string;
  countryCode: string;
  countryName: string;
  delta: number;
  resultingScore: number;
  band: ResilienceScoreBand;
  explanation: string;
}

export interface ResilienceCoverageSummary {
  availableIndicators: number;
  missingIndicators: number;
  syntheticIndicators: number;
  liveIndicators: number;
  staleIndicators: number;
  coveragePercent: number;
}

export interface ResilienceCountrySnapshot {
  countryCode: string;
  countryName: string;
  region: string;
  peerGroup: string;
  baselineSet: string[];
  comparisonSet: string[];
  dimensions: Record<ResilienceDimensionId, ResilienceDimensionScore>;
  dimensionOrder: ResilienceDimensionId[];
  composite: ResilienceCompositeScore;
  history: ResilienceHistoryPoint[];
  spillovers: ResilienceSpilloverLink[];
  stressScenarios: ResilienceStressScenario[];
  stressMatrix: ResilienceStressMatrixCell[];
  sources: ResilienceSourceDescriptor[];
  warnings: string[];
  coverage: ResilienceCoverageSummary;
  updatedAt: string;
  asOfLabel: string;
  methodologySummary: string;
  internalSignalSummary: string[];
  synthetic: boolean;
}

export interface ResiliencePeerComparisonRow {
  countryCode: string;
  countryName: string;
  region: string;
  overall: number;
  deltaVsPrimary: number;
  band: ResilienceScoreBand;
  topStrength: string;
  topWeakness: string;
  uncertaintyWidth: number;
}

export interface ResilienceNetworkNode {
  countryCode: string;
  countryName: string;
  overall: number;
  ring: 'primary' | 'neighbor' | 'peer';
}

export interface ResilienceNetworkLink {
  from: string;
  to: string;
  channel: ResilienceSpilloverLink['channel'];
  intensity: number;
}

export interface ResilienceHeatmapRow {
  dimensionId: ResilienceDimensionId;
  label: string;
  values: Array<{
    countryCode: string;
    countryName: string;
    score: number;
    change1m: number;
    coveragePercent: number;
  }>;
}

export interface ResilienceRadarSeries {
  countryCode: string;
  countryName: string;
  values: Array<{
    dimensionId: ResilienceDimensionId;
    label: string;
    score: number;
  }>;
}

export interface ResilienceSlopeSeries {
  countryCode: string;
  countryName: string;
  start: number;
  end: number;
  delta: number;
}

export interface ResilienceCoverageRow {
  countryCode: string;
  countryName: string;
  coveragePercent: number;
  sampleShare: number;
  liveShare: number;
  lastUpdated: string;
}

export interface ResilienceDashboardModel {
  primary: ResilienceCountrySnapshot;
  comparisons: ResilienceCountrySnapshot[];
  rankedRows: ResiliencePeerComparisonRow[];
  heatmapRows: ResilienceHeatmapRow[];
  radarSeries: ResilienceRadarSeries[];
  trendSeries: Array<{
    countryCode: string;
    countryName: string;
    points: ResilienceHistoryPoint[];
  }>;
  slopeSeries: ResilienceSlopeSeries[];
  stressMatrix: ResilienceStressMatrixCell[];
  spilloverNetwork: {
    nodes: ResilienceNetworkNode[];
    links: ResilienceNetworkLink[];
  };
  coverageTable: ResilienceCoverageRow[];
}

export interface ResilienceReportSection {
  id: string;
  title: string;
  body: string;
  bullets: string[];
}

export interface ResilienceReportChart {
  id: string;
  title: string;
  kind: ResilienceChartKind;
  caption: string;
}

export interface ResilienceStructuredReport {
  id: string;
  type: ResilienceReportType;
  title: string;
  generatedAt: string;
  primaryCountryCode: string;
  comparisonCountryCodes: string[];
  executiveSummary: string;
  baselineFacts: ResilienceReportSection;
  indicators: ResilienceReportSection;
  analyticalInterpretation: ResilienceReportSection;
  risks: ResilienceReportSection;
  scenarios: ResilienceReportSection;
  uncertainty: ResilienceReportSection;
  monitoringPriorities: ResilienceReportSection;
  technicalAppendix: ResilienceReportSection;
  methodology: string;
  charts: ResilienceReportChart[];
  sourceSummary: string[];
  markdown: string;
  html: string;
}

export interface ResilienceAiNarrationResult {
  response: AssistantRunResponse;
  evidenceCount: number;
}
