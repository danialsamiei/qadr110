import type { BlackSwanEngineState } from '@/ai/black-swan-engine';

export const BLACK_SWAN_INTELLIGENCE_EVENT_TYPES = {
  stateChanged: 'qadr110:black-swan-intelligence-state-changed',
  severityChanged: 'qadr110:black-swan-intelligence-severity-changed',
} as const;

export interface BlackSwanIntelligenceStateDetail {
  state: BlackSwanEngineState;
  reason: string;
}

export interface BlackSwanSeverityChangedDetail {
  state: BlackSwanEngineState;
  promotedCandidateIds: string[];
  reason: string;
}

export function dispatchBlackSwanIntelligenceStateChanged(
  target: EventTarget,
  detail: BlackSwanIntelligenceStateDetail,
): boolean {
  return target.dispatchEvent(new CustomEvent<BlackSwanIntelligenceStateDetail>(
    BLACK_SWAN_INTELLIGENCE_EVENT_TYPES.stateChanged,
    { detail },
  ));
}

export function dispatchBlackSwanSeverityChanged(
  target: EventTarget,
  detail: BlackSwanSeverityChangedDetail,
): boolean {
  return target.dispatchEvent(new CustomEvent<BlackSwanSeverityChangedDetail>(
    BLACK_SWAN_INTELLIGENCE_EVENT_TYPES.severityChanged,
    { detail },
  ));
}
