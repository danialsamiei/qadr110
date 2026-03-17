import type { SourceRecord } from '../domain/model';
import type { MapContextEnvelope } from '../operations/map-context';
import type { AiGatewayProvider, AiTaskClass } from './contracts';

export type OrchestratorComplexity = 'fast' | 'reasoning' | 'complex';

export type OrchestratorRouteClass =
  | 'fast-local'
  | 'reasoning-local'
  | 'cloud-escalation'
  | 'structured-json';

export type OrchestratorNodeName =
  | 'planning'
  | 'tool-selection'
  | 'execution'
  | 'reflection'
  | 'retry-escalation';

export type OrchestratorToolName =
  | 'web_search'
  | 'openrouter_call'
  | 'map_context'
  | 'osint_fetch'
  | 'strategic_foresight'
  | 'scenario_engine'
  | 'run_war_room'
  | 'war_room_on_scenarios'
  | 'detect_black_swans'
  | 'meta_scenario_engine'
  | 'scenario_simulation'
  | 'prompt_optimizer'
  | 'summarize_context';

export type OrchestratorToolPhase = 'execution' | 'retry';

export interface AssistantIntentSnapshot {
  id: string;
  query: string;
  taskClass: AiTaskClass;
  domainMode?: string;
  createdAt: string;
  inferredIntent: string;
  complexity: OrchestratorComplexity;
}

export interface AssistantMapInteractionSnapshot {
  id: string;
  mapContextId?: string;
  selectionKind: MapContextEnvelope['selection']['kind'];
  label: string;
  createdAt: string;
  zoom?: number;
  activeLayers: string[];
  lat?: number;
  lon?: number;
}

export interface AssistantReusableInsight {
  id: string;
  query: string;
  summary: string;
  createdAt: string;
  evidenceCardIds: string[];
  traceId?: string;
  relevanceTags: string[];
}

export interface AssistantSessionContext {
  sessionId: string;
  intentHistory: AssistantIntentSnapshot[];
  mapInteractions: AssistantMapInteractionSnapshot[];
  reusableInsights: AssistantReusableInsight[];
  activeIntentSummary?: string;
  lastUpdatedAt?: string;
}

export interface OrchestratorToolSpec {
  name: OrchestratorToolName;
  phase: OrchestratorToolPhase;
  required: boolean;
  reason: string;
  fallbackTools?: OrchestratorToolName[];
}

export interface OrchestratorPlan {
  intent: string;
  complexity: OrchestratorComplexity;
  routeClass: OrchestratorRouteClass;
  rationale: string;
  providerChain: AiGatewayProvider[];
  toolPlan: OrchestratorToolSpec[];
}

export interface OrchestratorTraceSummary {
  routeClass: OrchestratorRouteClass;
  nodeTimeline: OrchestratorNodeName[];
  toolPlan: OrchestratorToolName[];
  sessionReuseCount: number;
}

export interface OrchestratorSourceBundle {
  sources: SourceRecord[];
  sourceLabels: string[];
}
