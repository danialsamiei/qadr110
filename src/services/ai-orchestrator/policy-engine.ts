import type { ModelProvider, ModelRoutingDecision, PolicyConstraints } from './types';

interface PolicyCandidate {
  provider: ModelProvider;
  model: string;
  costUsd: number;
  latencyMs: number;
  quality: number;
}

const MODEL_CANDIDATES: PolicyCandidate[] = [
  { provider: 'openrouter', model: 'openai/gpt-4o-mini', costUsd: 0.02, latencyMs: 2300, quality: 0.9 },
  { provider: 'ollama', model: 'llama3.1:8b', costUsd: 0.002, latencyMs: 1400, quality: 0.77 },
  { provider: 'vllm', model: 'qwen2.5-7b-instruct', costUsd: 0.004, latencyMs: 900, quality: 0.8 },
];

function scoreCandidate(candidate: PolicyCandidate, constraints: Required<PolicyConstraints>): number {
  const costScore = Math.min(1, constraints.maxCostUsd / Math.max(candidate.costUsd, 0.0001));
  const latencyScore = Math.min(1, constraints.maxLatencyMs / Math.max(candidate.latencyMs, 1));
  const qualityScore = Math.min(1, candidate.quality / Math.max(constraints.minQuality, 0.01));
  return costScore * 0.35 + latencyScore * 0.25 + qualityScore * 0.4;
}

export class ModelPolicyEngine {
  constructor(private readonly defaults: Required<PolicyConstraints> = {
    maxCostUsd: 0.015,
    maxLatencyMs: 1800,
    minQuality: 0.75,
  }) {}

  selectModel(input: {
    constraints?: PolicyConstraints;
    preferredProviders?: ModelProvider[];
  }): ModelRoutingDecision {
    const constraints: Required<PolicyConstraints> = {
      ...this.defaults,
      ...input.constraints,
    };

    const providerFilter = input.preferredProviders?.length
      ? new Set<ModelProvider>(input.preferredProviders)
      : null;

    const candidates = MODEL_CANDIDATES
      .filter((candidate) => (providerFilter ? providerFilter.has(candidate.provider) : true))
      .map((candidate) => ({
        candidate,
        score: scoreCandidate(candidate, constraints),
      }))
      .sort((a, b) => b.score - a.score);

    const defaultCandidate = MODEL_CANDIDATES[0];
    const winner = candidates[0]?.candidate ?? defaultCandidate;
    if (!winner) {
      throw new Error('No model candidates configured for policy engine');
    }

    const reason = `Selected ${winner.provider}/${winner.model} (cost=${winner.costUsd.toFixed(3)}, latency=${winner.latencyMs}ms, quality=${winner.quality.toFixed(2)}) under constraints cost<=${constraints.maxCostUsd}, latency<=${constraints.maxLatencyMs}ms, quality>=${constraints.minQuality}.`;

    return {
      provider: winner.provider,
      model: winner.model,
      reason,
      estimatedCostUsd: winner.costUsd,
      estimatedLatencyMs: winner.latencyMs,
      estimatedQuality: winner.quality,
    };
  }
}
