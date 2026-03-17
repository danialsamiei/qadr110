import type {
  ScenarioEngineComparison,
  ScenarioEngineDriftRecord,
  ScenarioEngineState,
} from '@/ai/scenario-engine';

export const SCENARIO_INTELLIGENCE_EVENT_TYPES = {
  stateChanged: 'qadr110:scenario-intelligence-state-changed',
  driftDetected: 'qadr110:scenario-intelligence-drift-detected',
} as const;

export interface ScenarioIntelligenceStateDetail {
  state: ScenarioEngineState;
  reason: string;
}

export interface ScenarioIntelligenceDriftDetail {
  state: ScenarioEngineState;
  drift: ScenarioEngineDriftRecord[];
  compare?: ScenarioEngineComparison | null;
  reason: string;
}

export function dispatchScenarioIntelligenceStateChanged(
  target: EventTarget,
  detail: ScenarioIntelligenceStateDetail,
): boolean {
  return target.dispatchEvent(new CustomEvent<ScenarioIntelligenceStateDetail>(
    SCENARIO_INTELLIGENCE_EVENT_TYPES.stateChanged,
    { detail },
  ));
}

export function dispatchScenarioIntelligenceDriftDetected(
  target: EventTarget,
  detail: ScenarioIntelligenceDriftDetail,
): boolean {
  return target.dispatchEvent(new CustomEvent<ScenarioIntelligenceDriftDetail>(
    SCENARIO_INTELLIGENCE_EVENT_TYPES.driftDetected,
    { detail },
  ));
}
