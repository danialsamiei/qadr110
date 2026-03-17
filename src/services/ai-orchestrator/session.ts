import type {
  AssistantMessage,
  AssistantRunRequest,
  AssistantSessionContext,
} from '@/platform/ai/assistant-contracts';
import type {
  AssistantIntentSnapshot,
  AssistantMapInteractionSnapshot,
  AssistantReusableInsight,
} from '@/platform/ai/orchestrator-contracts';
import type { MapContextEnvelope } from '@/platform/operations/map-context';

import {
  classifyOrchestratorComplexity,
  inferOrchestratorIntent,
} from './prompt-strategy';

const MAX_INTENT_HISTORY = 8;
const MAX_MAP_INTERACTIONS = 8;
const MAX_REUSABLE_INSIGHTS = 8;

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function trimArray<T>(items: T[], maxItems: number): T[] {
  return items.slice(-maxItems);
}

function lastItem<T>(items: T[]): T | undefined {
  return items.length > 0 ? items[items.length - 1] : undefined;
}

function describeSelectionLabel(mapContext: MapContextEnvelope): string {
  const selection = mapContext.selection;
  if (selection.kind === 'point') {
    const pointLabel = selection.label || `${selection.lat.toFixed(3)}, ${selection.lon.toFixed(3)}`;
    return selection.countryName ? `${pointLabel} | ${selection.countryName}` : pointLabel;
  }
  if (selection.kind === 'country') {
    return `${selection.countryName} (${selection.countryCode})`;
  }
  if (selection.kind === 'polygon') {
    return selection.label || `polygon:${selection.coordinates.length}`;
  }
  if (selection.kind === 'layer') {
    return selection.layerLabel || selection.layerId;
  }
  return selection.label;
}

function buildActiveIntentSummary(sessionContext: AssistantSessionContext): string {
  const latestIntent = lastItem(sessionContext.intentHistory);
  const recentMaps = sessionContext.mapInteractions
    .slice(-2)
    .map((item: AssistantMapInteractionSnapshot) => item.label);
  const recentInsights = sessionContext.reusableInsights
    .slice(-2)
    .map((item: AssistantReusableInsight) => item.summary);

  return [
    latestIntent ? `intent فعلی: ${latestIntent.inferredIntent}` : '',
    recentMaps.length > 0 ? `نقشه: ${recentMaps.join(' | ')}` : '',
    recentInsights.length > 0 ? `reuse: ${recentInsights.join(' | ')}` : '',
  ].filter(Boolean).join(' | ');
}

export function createAssistantSessionContext(sessionId?: string): AssistantSessionContext {
  return {
    sessionId: sessionId || createId('assistant-session'),
    intentHistory: [],
    mapInteractions: [],
    reusableInsights: [],
    activeIntentSummary: '',
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function normalizeAssistantSessionContext(
  sessionContext?: AssistantSessionContext | null,
  fallbackSessionId?: string,
): AssistantSessionContext {
  if (!sessionContext) {
    return createAssistantSessionContext(fallbackSessionId);
  }

  const normalized: AssistantSessionContext = {
    sessionId: sessionContext.sessionId || fallbackSessionId || createId('assistant-session'),
    intentHistory: trimArray(Array.isArray(sessionContext.intentHistory) ? sessionContext.intentHistory : [], MAX_INTENT_HISTORY),
    mapInteractions: trimArray(Array.isArray(sessionContext.mapInteractions) ? sessionContext.mapInteractions : [], MAX_MAP_INTERACTIONS),
    reusableInsights: trimArray(Array.isArray(sessionContext.reusableInsights) ? sessionContext.reusableInsights : [], MAX_REUSABLE_INSIGHTS),
    activeIntentSummary: sessionContext.activeIntentSummary || '',
    lastUpdatedAt: sessionContext.lastUpdatedAt || new Date().toISOString(),
  };

  normalized.activeIntentSummary = buildActiveIntentSummary(normalized);
  return normalized;
}

export function appendAssistantIntent(
  sessionContext: AssistantSessionContext,
  params: Pick<AssistantRunRequest, 'query' | 'taskClass' | 'domainMode' | 'messages' | 'mapContext'> & { createdAt?: string },
): AssistantSessionContext {
  const normalized = normalizeAssistantSessionContext(sessionContext);
  const createdAt = params.createdAt || new Date().toISOString();
  const intentRecord: AssistantIntentSnapshot = {
    id: createId('intent'),
    query: params.query.trim(),
    taskClass: params.taskClass,
    domainMode: params.domainMode,
    createdAt,
    inferredIntent: inferOrchestratorIntent(params.query, params.taskClass, params.domainMode),
    complexity: classifyOrchestratorComplexity(params),
  };

  const next: AssistantSessionContext = {
    ...normalized,
    intentHistory: trimArray([...normalized.intentHistory, intentRecord], MAX_INTENT_HISTORY),
    lastUpdatedAt: createdAt,
  };
  next.activeIntentSummary = buildActiveIntentSummary(next);
  return next;
}

export function appendAssistantMapInteraction(
  sessionContext: AssistantSessionContext,
  mapContext?: MapContextEnvelope | null,
  createdAt = new Date().toISOString(),
): AssistantSessionContext {
  const normalized = normalizeAssistantSessionContext(sessionContext);
  if (!mapContext) return normalized;

  const interaction: AssistantMapInteractionSnapshot = {
    id: createId('map'),
    mapContextId: mapContext.id,
    selectionKind: mapContext.selection.kind,
    label: describeSelectionLabel(mapContext),
    createdAt,
    zoom: mapContext.viewport?.zoom,
    activeLayers: [...(mapContext.activeLayers ?? [])].slice(0, 8),
    lat: mapContext.selection.kind === 'point' ? mapContext.selection.lat : undefined,
    lon: mapContext.selection.kind === 'point' ? mapContext.selection.lon : undefined,
  };

  const next: AssistantSessionContext = {
    ...normalized,
    mapInteractions: trimArray([...normalized.mapInteractions, interaction], MAX_MAP_INTERACTIONS),
    lastUpdatedAt: createdAt,
  };
  next.activeIntentSummary = buildActiveIntentSummary(next);
  return next;
}

export function appendReusableInsight(
  sessionContext: AssistantSessionContext,
  message: AssistantMessage,
  query: string,
): AssistantSessionContext {
  const normalized = normalizeAssistantSessionContext(sessionContext);
  if (message.role !== 'assistant') return normalized;

  const summary = message.structured?.executiveSummary || message.content.trim();
  if (!summary) return normalized;

  const insight: AssistantReusableInsight = {
    id: createId('insight'),
    query,
    summary: summary.slice(0, 240),
    createdAt: message.createdAt,
    evidenceCardIds: (message.evidenceCards ?? []).slice(0, 6).map((item) => item.id),
    traceId: message.traceId,
    relevanceTags: [
      message.domainMode || 'assistant',
      message.taskClass || 'assistant',
    ],
  };

  const next: AssistantSessionContext = {
    ...normalized,
    reusableInsights: trimArray([...normalized.reusableInsights, insight], MAX_REUSABLE_INSIGHTS),
    lastUpdatedAt: message.createdAt,
  };
  next.activeIntentSummary = buildActiveIntentSummary(next);
  return next;
}

export function buildAssistantSessionContextFromRequest(
  request: Pick<
    AssistantRunRequest,
    'conversationId' | 'query' | 'taskClass' | 'domainMode' | 'messages' | 'mapContext' | 'sessionContext'
  >,
): AssistantSessionContext {
  let sessionContext = normalizeAssistantSessionContext(request.sessionContext, request.conversationId);

  const lastIntent = lastItem(sessionContext.intentHistory);
  if (!lastIntent || lastIntent.query !== request.query.trim()) {
    sessionContext = appendAssistantIntent(sessionContext, request);
  }

  if (request.mapContext) {
    const lastMap = lastItem(sessionContext.mapInteractions);
    if (!lastMap || lastMap.mapContextId !== request.mapContext.id) {
      sessionContext = appendAssistantMapInteraction(sessionContext, request.mapContext, request.mapContext.createdAt);
    }
  }

  return sessionContext;
}
