export const ANALYSIS_EVENT_TYPES = {
  started: 'wm:analysis-started',
  minimized: 'wm:analysis-minimized',
  completed: 'wm:analysis-completed',
  failed: 'wm:analysis-failed',
  cancelled: 'wm:analysis-cancelled',
} as const;

export type AnalysisEventType = typeof ANALYSIS_EVENT_TYPES[keyof typeof ANALYSIS_EVENT_TYPES];

export interface AnalysisLifecycleDetail {
  jobId: string;
  kind: string;
  title: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  provider?: string;
  model?: string;
  promptId?: string;
  mapContextId?: string;
  reason?: string;
  error?: string;
  surface?: 'assistant' | 'deduction' | 'map' | 'generic';
  mode?: 'fast' | 'long';
}

export function dispatchAnalysisEvent(
  target: EventTarget,
  type: AnalysisEventType,
  detail: AnalysisLifecycleDetail,
): boolean {
  return target.dispatchEvent(new CustomEvent(type, { detail }));
}
