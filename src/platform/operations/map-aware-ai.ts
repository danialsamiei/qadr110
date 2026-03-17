export const MAP_AWARE_AI_EVENT_TYPES = {
  insightUpdated: 'qadr110:map-aware-ai-insight-updated',
} as const;

export interface MapAwareAiInsightDetail {
  mapContextId: string;
  mapContextCacheKey?: string;
  title: string;
  summary: string;
  evidenceTitles: string[];
  followUpSuggestions: string[];
  confidenceBand?: string;
  updatedAt: string;
}

export function dispatchMapAwareAiInsightUpdated(
  target: EventTarget,
  detail: MapAwareAiInsightDetail,
): boolean {
  return target.dispatchEvent(new CustomEvent<MapAwareAiInsightDetail>(
    MAP_AWARE_AI_EVENT_TYPES.insightUpdated,
    { detail },
  ));
}
