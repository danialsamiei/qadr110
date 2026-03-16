import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addOpsLog,
  clearOpsLogs,
  getOpsLogEntries,
  recordAiTrace,
} from '../src/platform/operations/observability.ts';

describe('observability log', () => {
  it('redacts sensitive keys in detail payloads', () => {
    clearOpsLogs();
    addOpsLog({
      kind: 'system',
      level: 'info',
      message: 'test',
      detail: {
        token: 'Bearer secret',
        apiKey: 'sk-THIS_SHOULD_NOT_APPEAR',
        ok: 'value',
        nested: {
          authorization: 'Bearer also-secret',
          note: 'safe',
        },
      },
    });

    const [entry] = getOpsLogEntries();
    assert.ok(entry);
    assert.equal(entry?.detail?.token, '[REDACTED]');
    assert.equal(entry?.detail?.apiKey, '[REDACTED]');
    assert.equal((entry?.detail?.nested as any)?.authorization, '[REDACTED]');
    assert.equal(entry?.detail?.ok, 'value');
    assert.equal((entry?.detail?.nested as any)?.note, 'safe');
  });

  it('records AI trace metadata without requiring browser storage', () => {
    clearOpsLogs();
    recordAiTrace({
      status: 'completed',
      provider: 'browser',
      model: 'demo-fixture',
      taskClass: 'assistant',
      cached: true,
      evidenceCount: 2,
      localContextCount: 3,
      warnings: ['demo'],
      queryHash: 'deadbeef',
      surface: 'assistant',
    });

    const entries = getOpsLogEntries();
    assert.ok(entries.length >= 1);
    assert.equal(entries[0]?.kind, 'ai');
    assert.equal(entries[0]?.level, 'info');
    assert.match(entries[0]?.message || '', /AI completed/);
  });
});

