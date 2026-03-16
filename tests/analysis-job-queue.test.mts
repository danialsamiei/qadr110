import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AnalysisJobQueue } from '../src/platform/operations/analysis-job-queue.ts';
import { ANALYSIS_EVENT_TYPES } from '../src/platform/operations/analysis-events.ts';

function collectEvents(target: EventTarget, type: string): any[] {
  const seen: any[] = [];
  target.addEventListener(type, ((event: Event) => {
    seen.push((event as CustomEvent).detail);
  }) as EventListener);
  return seen;
}

describe('analysis job queue', () => {
  it('emits started, minimized, and completed lifecycle events', async () => {
    const target = new EventTarget();
    const queue = new AnalysisJobQueue(target, () => 1_000);
    const started = collectEvents(target, ANALYSIS_EVENT_TYPES.started);
    const minimized = collectEvents(target, ANALYSIS_EVENT_TYPES.minimized);
    const completed = collectEvents(target, ANALYSIS_EVENT_TYPES.completed);

    const promise = queue.enqueue({
      id: 'job-1',
      kind: 'deduction',
      title: 'Test deduction',
      run: async () => 'ok',
    });

    assert.equal(queue.minimize('job-1', 'panel-hidden'), true);
    const result = await promise;

    assert.equal(result, 'ok');
    assert.equal(started.length, 1);
    assert.equal(minimized.length, 1);
    assert.equal(completed.length, 1);
    assert.equal(started[0].jobId, 'job-1');
    assert.equal(minimized[0].reason, 'panel-hidden');
    assert.equal(completed[0].jobId, 'job-1');
  });

  it('emits failed events when a job throws', async () => {
    const target = new EventTarget();
    const queue = new AnalysisJobQueue(target, () => 2_000);
    const failed = collectEvents(target, ANALYSIS_EVENT_TYPES.failed);

    await assert.rejects(() => queue.enqueue({
      id: 'job-2',
      kind: 'report',
      title: 'Failing report',
      run: async () => {
        throw new Error('boom');
      },
    }));

    assert.equal(failed.length, 1);
    assert.equal(failed[0].jobId, 'job-2');
    assert.match(failed[0].error, /boom/);
  });

  it('emits cancelled events when an active job is aborted', async () => {
    const target = new EventTarget();
    const queue = new AnalysisJobQueue(target, () => 3_000);
    const cancelled = collectEvents(target, ANALYSIS_EVENT_TYPES.cancelled);

    const promise = queue.enqueue({
      id: 'job-3',
      kind: 'map-analysis',
      title: 'Long running analysis',
      run: async (signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const error = new Error(String(signal.reason || 'cancelled'));
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      }),
    });

    assert.equal(queue.cancel('job-3', 'manual-cancel'), true);
    await assert.rejects(() => promise, /manual-cancel/);
    assert.equal(cancelled.length, 1);
    assert.equal(cancelled[0].jobId, 'job-3');
    assert.equal(cancelled[0].reason, 'manual-cancel');
  });
});
