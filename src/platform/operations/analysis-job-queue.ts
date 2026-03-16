import { ANALYSIS_EVENT_TYPES, dispatchAnalysisEvent, type AnalysisLifecycleDetail } from './analysis-events';

export interface AnalysisJob<T = unknown> {
  id: string;
  kind: string;
  title: string;
  promptId?: string;
  mapContextId?: string;
  surface?: 'assistant' | 'deduction' | 'map' | 'generic';
  mode?: 'fast' | 'long';
  run: (signal: AbortSignal) => Promise<T>;
}

interface QueuedJob<T = unknown> extends AnalysisJob<T> {
  createdAt: number;
  startedAt?: number;
  controller: AbortController;
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
}

function createAbortError(reason: string): Error {
  const error = new Error(reason);
  error.name = 'AbortError';
  return error;
}

export class AnalysisJobQueue {
  private readonly queue: Array<QueuedJob<unknown>> = [];
  private activeJob: QueuedJob<unknown> | null = null;

  constructor(
    private readonly target: EventTarget = new EventTarget(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  get eventTarget(): EventTarget {
    return this.target;
  }

  enqueue<T>(job: AnalysisJob<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        ...job,
        createdAt: this.now(),
        controller: new AbortController(),
        resolve,
        reject,
      });
      void this.processNext();
    });
  }

  minimize(jobId: string, reason = 'user-requested'): boolean {
    const candidate = this.activeJob?.id === jobId
      ? this.activeJob
      : this.queue.find((job) => job.id === jobId) ?? null;
    if (!candidate) return false;

    dispatchAnalysisEvent(this.target, ANALYSIS_EVENT_TYPES.minimized, {
      jobId: candidate.id,
      kind: candidate.kind,
      title: candidate.title,
      createdAt: candidate.createdAt,
      startedAt: candidate.startedAt,
      promptId: candidate.promptId,
      mapContextId: candidate.mapContextId,
      reason,
      surface: candidate.surface,
      mode: candidate.mode,
    });
    return true;
  }

  cancel(jobId: string, reason = 'user-cancelled'): boolean {
    if (this.activeJob?.id === jobId) {
      this.activeJob.controller.abort(reason);
      return true;
    }

    const queueIndex = this.queue.findIndex((job) => job.id === jobId);
    if (queueIndex === -1) return false;

    const [candidate] = this.queue.splice(queueIndex, 1);
    if (!candidate) return false;

    dispatchAnalysisEvent(this.target, ANALYSIS_EVENT_TYPES.cancelled, {
      jobId: candidate.id,
      kind: candidate.kind,
      title: candidate.title,
      createdAt: candidate.createdAt,
      promptId: candidate.promptId,
      mapContextId: candidate.mapContextId,
      reason,
      surface: candidate.surface,
      mode: candidate.mode,
    });
    candidate.reject(createAbortError(reason));
    return true;
  }

  private async processNext(): Promise<void> {
    if (this.activeJob || this.queue.length === 0) return;

    const job = this.queue.shift();
    if (!job) return;
    this.activeJob = job;

    const startedAt = this.now();
    job.startedAt = startedAt;
    const baseDetail: AnalysisLifecycleDetail = {
      jobId: job.id,
      kind: job.kind,
      title: job.title,
      createdAt: job.createdAt,
      startedAt,
      promptId: job.promptId,
      mapContextId: job.mapContextId,
      surface: job.surface,
      mode: job.mode,
    };

    dispatchAnalysisEvent(this.target, ANALYSIS_EVENT_TYPES.started, baseDetail);

    try {
      const result = await job.run(job.controller.signal);
      const completedAt = this.now();
      dispatchAnalysisEvent(this.target, ANALYSIS_EVENT_TYPES.completed, {
        ...baseDetail,
        completedAt,
        durationMs: completedAt - startedAt,
      });
      job.resolve(result);
    } catch (error) {
      const completedAt = this.now();
      const message = error instanceof Error ? error.message : String(error);
      const wasCancelled = job.controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
      if (wasCancelled) {
        dispatchAnalysisEvent(this.target, ANALYSIS_EVENT_TYPES.cancelled, {
          ...baseDetail,
          completedAt,
          durationMs: completedAt - startedAt,
          reason: typeof job.controller.signal.reason === 'string'
            ? job.controller.signal.reason
            : message,
          error: undefined,
        });
      } else {
        dispatchAnalysisEvent(this.target, ANALYSIS_EVENT_TYPES.failed, {
          ...baseDetail,
          completedAt,
          durationMs: completedAt - startedAt,
          error: message,
        });
      }
      job.reject(error);
    } finally {
      this.activeJob = null;
      void this.processNext();
    }
  }
}
