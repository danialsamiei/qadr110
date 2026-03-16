import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_AI_GATEWAY_CONFIG,
  getAiProviderOrder,
  getPolicyForTask,
} from '../src/platform/ai/policy.ts';

describe('OpenRouter-first AI policy', () => {
  it('uses OpenRouter as the strategic default gateway', () => {
    assert.equal(DEFAULT_AI_GATEWAY_CONFIG.primaryGateway, 'openrouter');
    assert.deepEqual(getAiProviderOrder('strategic-default').slice(0, 3), ['openrouter', 'ollama', 'vllm']);
  });

  it('preserves local-first mode for disconnected deployments', () => {
    assert.deepEqual(getAiProviderOrder('local-first').slice(0, 3), ['ollama', 'vllm', 'browser']);
  });

  it('applies defensive safety posture to deduction workloads', () => {
    const policy = getPolicyForTask('deduction');
    assert.equal(policy.safety, 'strict-defensive');
    assert.equal(policy.profile, 'strategic-default');
    assert.equal(policy.preferredProviders[0], 'openrouter');
  });
});
