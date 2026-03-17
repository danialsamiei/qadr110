import type { AppModule } from '@/app/app-context';
import {
  getBlackSwans,
  updateBlackSwans,
  type BlackSwanEngineInput,
  type BlackSwanEngineState,
} from '@/ai/black-swan-engine';
import type { AssistantContextPacket } from '@/platform/ai/assistant-contracts';
import {
  dispatchBlackSwanIntelligenceStateChanged,
  dispatchBlackSwanSeverityChanged,
} from '@/platform/operations/black-swan-intelligence';
import { scenarioIntelligenceStore } from '@/services/scenario-intelligence';
import type { ScenarioEngineState } from '@/ai/scenario-engine';

type Listener = (state: BlackSwanEngineState | null) => void;

class BlackSwanIntelligenceStore {
  private state: BlackSwanEngineState | null = null;
  private readonly listeners = new Set<Listener>();

  getState(): BlackSwanEngineState | null {
    return this.state;
  }

  setState(state: BlackSwanEngineState | null): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const blackSwanIntelligenceStore = new BlackSwanIntelligenceStore();

function dedupePackets(packets: AssistantContextPacket[]): AssistantContextPacket[] {
  const seen = new Set<string>();
  return packets.filter((packet) => {
    if (seen.has(packet.id)) return false;
    seen.add(packet.id);
    return true;
  });
}

function buildInputFromScenarioState(state: ScenarioEngineState): BlackSwanEngineInput {
  return {
    trigger: state.trigger,
    query: state.inputSnapshot.query,
    mapContext: state.inputSnapshot.mapContext,
    sessionContext: state.inputSnapshot.sessionContext,
    timeContext: new Date().toISOString(),
    maxCandidates: 5,
    localContextPackets: dedupePackets([
      ...(state.inputSnapshot.localContextPackets ?? []),
      ...state.contextPackets,
    ]),
    baseScenarioOutput: state,
  };
}

function promotedCandidateIds(previous: BlackSwanEngineState | null, next: BlackSwanEngineState): string[] {
  return next.candidates
    .filter((candidate) => {
      const prior = previous?.candidates.find((item) => item.id === candidate.id);
      if (!prior) return (candidate.monitoring_status ?? 'watch') !== 'watch';
      if ((candidate.monitoring_status ?? 'watch') !== (prior.monitoring_status ?? 'watch')) return true;
      return (candidate.severity_score ?? 0) - (prior.severity_score ?? 0) >= 0.08;
    })
    .map((candidate) => candidate.id);
}

export class BlackSwanIntelligenceEngine implements AppModule {
  private state: BlackSwanEngineState | null = null;
  private unsubscribeScenario: (() => void) | null = null;

  init(): void {
    const current = scenarioIntelligenceStore.getState();
    if (current) {
      this.refresh(current, 'scenario-bootstrap');
    }
    this.unsubscribeScenario = scenarioIntelligenceStore.subscribe((nextState) => {
      if (!nextState) return;
      this.refresh(nextState, 'scenario-update');
    });
  }

  destroy(): void {
    this.unsubscribeScenario?.();
    this.unsubscribeScenario = null;
  }

  private refresh(scenarioState: ScenarioEngineState, reason: string): void {
    const input = buildInputFromScenarioState(scenarioState);
    const previous = this.state;
    const next = previous && previous.contextKey === scenarioState.contextKey
      ? updateBlackSwans({
        previousState: previous,
        input,
        reason,
      })
      : getBlackSwans(input);

    this.state = next;
    blackSwanIntelligenceStore.setState(next);
    dispatchBlackSwanIntelligenceStateChanged(document, { state: next, reason });

    const promoted = promotedCandidateIds(previous, next);
    if (promoted.length > 0) {
      dispatchBlackSwanSeverityChanged(document, {
        state: next,
        promotedCandidateIds: promoted,
        reason,
      });
    }
  }
}
