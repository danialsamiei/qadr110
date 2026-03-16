import { ANALYSIS_EVENT_TYPES, type AnalysisLifecycleDetail } from './analysis-events';

export type OpsLogLevel = 'info' | 'warn' | 'error';
export type OpsLogKind = 'analysis' | 'ai' | 'system';

export interface OpsLogEntry {
  id: string;
  kind: OpsLogKind;
  level: OpsLogLevel;
  message: string;
  createdAt: string;
  detail?: Record<string, unknown>;
}

const STORAGE_KEY = 'qadr110-ops-log';
const MAX_ENTRIES = 300;

let cachedEntries: OpsLogEntry[] | null = null;
const listeners = new Set<(entries: OpsLogEntry[]) => void>();
let initialized = false;

function stableHash(input: string): string {
  // Non-cryptographic stable hash for grouping without storing raw text.
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function loadEntries(): OpsLogEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is OpsLogEntry => Boolean(item && typeof item === 'object'));
  } catch {
    return [];
  }
}

function persistEntries(entries: OpsLogEntry[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore quota / storage errors.
  }
}

function ensureEntries(): OpsLogEntry[] {
  if (!cachedEntries) cachedEntries = loadEntries();
  return cachedEntries;
}

function redactDetail(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[Truncated]';
  if (value == null) return value;
  if (typeof value === 'string') {
    // Avoid leaking tokens if they somehow land in logs.
    if (/Bearer\s+\S+/i.test(value)) return '[REDACTED]';
    if (/sk-[A-Za-z0-9]{12,}/.test(value)) return '[REDACTED]';
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactDetail(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      if (/api[_-]?key|token|authorization|password|secret/i.test(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redactDetail(item, depth + 1);
      }
    });
    return out;
  }
  return value;
}

function emit(): void {
  const snapshot = [...ensureEntries()];
  listeners.forEach((listener) => listener(snapshot));
}

export function getOpsLogEntries(): OpsLogEntry[] {
  return [...ensureEntries()];
}

export function subscribeOpsLogs(listener: (entries: OpsLogEntry[]) => void): () => void {
  listeners.add(listener);
  listener(getOpsLogEntries());
  return () => {
    listeners.delete(listener);
  };
}

export function addOpsLog(input: Omit<OpsLogEntry, 'id' | 'createdAt'>): OpsLogEntry {
  const entry: OpsLogEntry = {
    id: createId('ops'),
    createdAt: nowIso(),
    ...input,
    detail: input.detail ? (redactDetail(input.detail) as Record<string, unknown>) : undefined,
  };

  const next = [entry, ...ensureEntries()].slice(0, MAX_ENTRIES);
  cachedEntries = next;
  persistEntries(next);
  emit();
  return entry;
}

export function clearOpsLogs(): void {
  cachedEntries = [];
  persistEntries([]);
  emit();
}

export function recordAiTrace(event: {
  status: 'completed' | 'refused' | 'failed';
  provider: string;
  model: string;
  traceId?: string;
  taskClass: string;
  policyLabel?: string;
  cached: boolean;
  evidenceCount: number;
  localContextCount: number;
  warnings?: string[];
  queryHash: string;
  surface?: string;
}): void {
  const level: OpsLogLevel = event.status === 'failed'
    ? 'error'
    : event.status === 'refused'
      ? 'warn'
      : 'info';
  addOpsLog({
    kind: 'ai',
    level,
    message: `AI ${event.status}: ${event.taskClass} via ${event.provider}`,
    detail: {
      queryHash: event.queryHash,
      provider: event.provider,
      model: event.model,
      traceId: event.traceId,
      taskClass: event.taskClass,
      policyLabel: event.policyLabel,
      cached: event.cached,
      evidenceCount: event.evidenceCount,
      localContextCount: event.localContextCount,
      warnings: event.warnings ?? [],
      surface: event.surface,
    },
  });
}

export function initOpsLogging(target: EventTarget = typeof document !== 'undefined' ? document : new EventTarget()): void {
  if (initialized) return;
  initialized = true;

  const handler = (event: Event): void => {
    const custom = event as CustomEvent<AnalysisLifecycleDetail>;
    const detail = custom.detail;
    if (!detail) return;

    const type = event.type;
    const level: OpsLogLevel = type === ANALYSIS_EVENT_TYPES.failed
      ? 'error'
      : type === ANALYSIS_EVENT_TYPES.cancelled
        ? 'warn'
        : 'info';

    addOpsLog({
      kind: 'analysis',
      level,
      message: `${type.replace('wm:', '')}: ${detail.kind}`,
      detail: {
        jobId: detail.jobId,
        kind: detail.kind,
        surface: detail.surface,
        mode: detail.mode,
        titleHash: stableHash(detail.title || ''),
        createdAt: detail.createdAt,
        startedAt: detail.startedAt,
        completedAt: detail.completedAt,
        durationMs: detail.durationMs,
        promptId: detail.promptId,
        mapContextId: detail.mapContextId,
        reason: detail.reason,
        error: detail.error,
      },
    });
  };

  Object.values(ANALYSIS_EVENT_TYPES).forEach((type) => {
    target.addEventListener(type, handler as EventListener);
  });
}

