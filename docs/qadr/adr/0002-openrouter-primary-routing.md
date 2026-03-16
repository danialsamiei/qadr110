# ADR 0002: OpenRouter As Primary Generative AI Gateway

## Status

Accepted

## Context

The repository had mixed AI routing assumptions. Some docs referenced OpenRouter, while multiple handlers still defaulted to Groq-first or ad hoc provider routing. The target platform needs a single declared primary gateway while preserving local/self-hosted fallbacks and lawful defensive guardrails.

## Decision

- declare OpenRouter as the default strategic AI gateway
- preserve local/self-hosted fallback paths through Ollama-compatible endpoints and browser inference
- keep Groq as a secondary cloud fallback
- move shared policy into `src/platform/ai/policy.ts`
- route key intelligence handlers through `server/_shared/llm.ts` where possible

## Consequences

- provider behavior is more consistent across summarization, deduction, and country briefs
- deployments with only legacy custom/Groq config still need smoke testing
- future provider additions must be declared in the policy layer first
