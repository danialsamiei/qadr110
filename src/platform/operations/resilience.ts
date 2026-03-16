export const RESILIENCE_EVENT_TYPES = {
  openDashboard: 'wm:resilience-open-dashboard',
} as const;

export type ResilienceDashboardTab = 'dashboard' | 'compare' | 'stress' | 'report' | 'methodology';
export type ResilienceReportKind =
  | 'national-brief'
  | 'comparative-country'
  | 'international-economic'
  | 'scenario-forecast';

export interface ResilienceScenarioSeed {
  title: string;
  event: string;
  durationDays?: number;
  actors?: string[];
  constraints?: string[];
}

export interface ResilienceOpenDetail {
  source: 'country-page' | 'map-context' | 'assistant' | 'scenario-workbench' | 'dynamic-prompt';
  primaryCountryCode?: string;
  compareCountryCodes?: string[];
  focusTab?: ResilienceDashboardTab;
  reportType?: ResilienceReportKind;
  title?: string;
  mapContextId?: string;
  promptText?: string;
  scenario?: ResilienceScenarioSeed;
}

export function dispatchOpenResilienceDashboard(target: EventTarget, detail: ResilienceOpenDetail): boolean {
  return target.dispatchEvent(new CustomEvent<ResilienceOpenDetail>(RESILIENCE_EVENT_TYPES.openDashboard, { detail }));
}
