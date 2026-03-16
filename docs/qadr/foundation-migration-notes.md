# Foundation Migration Notes

## What changed

- OpenRouter now defines the default strategic AI route.
- local/self-hosted fallbacks remain available through Ollama-compatible endpoints and browser inference.
- a new platform foundation layer was added under `src/platform`.
- deduction flows now use a shared async analysis queue and emit lifecycle events.
- map right-click context now emits a typed geo-context envelope consumable by AI workflows.
- assistant prompts moved from hardcoded literals to a catalog schema.

## Non-breaking behavior

- panel architecture is unchanged.
- web/Tauri parity is unchanged.
- Persian-first/RTL posture is unchanged.
- existing `wm:deduct-context` events continue to work.
- if no new connector config is present, the system degrades gracefully instead of hard failing.

## New files and namespaces

- `src/platform/domain/*`
- `src/platform/capabilities/*`
- `src/platform/ai/*`
- `src/platform/operations/*`

## Environment migration

### Newly recognized env vars

- `OPENROUTER_MODEL`
- `OPENROUTER_API_URL`
- `GROQ_MODEL`
- `GROQ_API_URL`
- `LLM_API_KEY`
- `LLM_API_URL`
- `LLM_MODEL`

### Operational recommendation

- if you want the canonical path, set `OPENROUTER_API_KEY` and optionally `OPENROUTER_MODEL`.
- keep `OLLAMA_API_URL` and `OLLAMA_MODEL` for local fallback.
- keep `GROQ_API_KEY` only as a secondary cloud fallback.

## Migration guidance for future work

1. when adding a new connector, first add or extend an adapter manifest in `src/platform/capabilities/catalog.ts`
2. if the connector adds new AI behavior, define policy and route implications in `src/platform/ai/*`
3. if the connector emits geo-relevant selections or incidents, map it into `MapContextEnvelope`
4. if the feature runs async, prefer `AnalysisJobQueue` over ad hoc promise flows
5. if the feature introduces new evidence objects, map them into `EntityRecord` / `EventRecord` / `ClaimRecord` / `EvidenceRecord`

## Known follow-up work

- expose capability registry state in the UI
- persist analysis job history
- finish migrating Groq-specific docs text to the new OpenRouter-first baseline
- add real adapter implementations for vector stores and exchange formats
