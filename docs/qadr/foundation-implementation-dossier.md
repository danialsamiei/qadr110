# QADR110 Foundation Implementation Dossier

## Scope

این سند، گذار QADR110 از یک داشبورد OSINT/map-centric به یک foundation برای پلتفرم راهبردی فارسی‌محور، AI-native و adapter-driven را ثبت می‌کند. این pass بر پایه‌ی کد موجود انجام شده و جایگزین معماری فعلی نشده است.

## Current Architecture Overview

### Existing canonical foundations

- UI همچنان بر پایه‌ی `TypeScript + Vite + Preact` است.
- parity وب و دسکتاپ با `Tauri` حفظ شده است.
- معماری پنل‌محور فعلی (`src/components`, `src/config/panels.ts`, `src/app/panel-layout.ts`) حفظ شده است.
- لایه‌ی map-centric فعلی (`MapContainer`, `DeckGLMap`, globe/map layers) canonical باقی مانده است.
- قراردادهای typed API همچنان proto-first هستند (`proto/worldmonitor/...` + `src/generated/...`).
- state orchestration سبک فعلی با `App.ts`, `AppContext`, `CustomEvent` bus و cache managers حفظ شده است.
- explainability و provenance قبلی در briefها، signal aggregation، country context و cached handlers حفظ شده است.

### Existing strengths reused in this pass

- panel modularity برای توسعه‌ی incremental
- RPC/service contracts برای web/Tauri parity
- signal aggregation و geo-context اولیه
- browser/local AI fallback patterns
- feature gating و graceful degradation در runtime config
- multi-source OSINT ingestion registry

### New foundation layer added

- `src/platform/domain/*`: canonical domain model + stable identifiers
- `src/platform/capabilities/*`: capability registry + adapter manifests
- `src/platform/ai/*`: OpenRouter-first AI contracts and routing policy
- `src/platform/operations/*`: analysis lifecycle queue, map-context schema, prompt catalog

## Gap Analysis

| Target capability | Existing state | Gap before this pass | Foundation delivered |
| --- | --- | --- | --- |
| Persian-first AI-native platform | Persian UI existed, but AI contracts were fragmented | no single AI policy baseline | centralized AI contracts and OpenRouter-first policy |
| Adapter-driven interoperability | sources existed, but no vendor-neutral connector layer | integration patterns lived in services only | capability registry + adapter manifests + degradation rules |
| Canonical intelligence ontology | many app types existed | no stable cross-domain model for claims/evidence/provenance/jobs | canonical domain model under `src/platform/domain` |
| Async analytic lifecycle | ad hoc async handlers | no common analysis started/completed/failed contract | `AnalysisJobQueue` + lifecycle events |
| Dynamic geo-context prompting | geo context existed as strings | no typed schema shared across modules | `MapContextEnvelope` + prompt formatter |
| Prompt catalog | hardcoded assistant prompts | no schema, no action model | `DEFAULT_PROMPT_CATALOG` wired into `QadrAssistantPanel` |
| OpenRouter primary gateway | docs partially referenced it, runtime often Groq-first | inconsistent provider ordering | default policy and handlers now OpenRouter-first |

## Implementation Summary

### Foundation modules

- `src/platform/domain/model.ts`
  - entities, events, indicators, relationships, claims, evidence, sources, geographies, scenarios, resilience/risk dimensions, alerts, analytic jobs
- `src/platform/domain/ids.ts`
  - stable IDs and ontology refs
- `src/platform/capabilities/contracts.ts`
  - normalized capability and adapter contracts
- `src/platform/capabilities/catalog.ts`
  - default adapter catalog with graceful degradation metadata
- `src/platform/capabilities/registry.ts`
  - registry snapshot/status evaluation
- `src/platform/ai/contracts.ts`
  - routing, model policy, tracing, streaming, cache, safety, token budgeting
- `src/platform/ai/policy.ts`
  - OpenRouter-first default policy, local-first profile, task policies
- `src/platform/operations/analysis-events.ts`
  - lifecycle event contracts
- `src/platform/operations/analysis-job-queue.ts`
  - async job queue for analysis workflows
- `src/platform/operations/map-context.ts`
  - typed map context schema + prompt formatter
- `src/platform/operations/prompt-catalog.ts`
  - catalog schema for dynamic suggestion buttons

### Runtime integrations completed

- `QadrAssistantPanel` now consumes the prompt catalog instead of hardcoded prompt literals.
- `QadrAssistantPanel` can dispatch prompts directly into the deduction workflow.
- `DeductionPanel` now runs through `AnalysisJobQueue`.
- `DeductionPanel` consumes typed map context when no free-text geo context is provided.
- `CountryIntelManager` emits structured map context on right-click.
- summarization and server-side intelligence handlers were moved to an OpenRouter-first routing baseline.

## Dependency And Licensing Review

| Area | Existing dependency posture | Foundation implication | Licensing note |
| --- | --- | --- | --- |
| Core frontend | `preact`, `vite`, `deck.gl`, `maplibre-gl` | unchanged | all remain compatible with AGPL project distribution |
| Proto/RPC | generated clients/servers | unchanged | internal/generated artifacts |
| Local AI | `@xenova/transformers`, Ollama-compatible endpoints | elevated as fallback layer | model licenses remain deployment-specific |
| Cloud AI | OpenRouter, Groq | normalized under policy layer | third-party service terms still apply |
| Vector retrieval | not bundled | adapter-ready for Weaviate/Chroma | no bundled server introduced in this pass |
| Data exchange | JSON/Proto already present | adapter-ready for parquet/jsonl/arrow exports | keep portable open formats first |
| Threat intel | abuse.ch / OTX / AbuseIPDB already present | adapterized as bridge contracts | source-specific terms remain in force |

### Legal posture

- این pass هیچ integration proprietary جعلی اضافه نمی‌کند.
- برای systems proprietary فقط compatibility stance یا adapter contract تعریف شده است.
- playbook language به‌صورت defensive-only نگه داشته شده است.

## Palantir Compatibility Matrix

| Palantir-like expectation | QADR110 status after this pass | Notes |
| --- | --- | --- |
| ontology-backed domain model | Partial / adapter-ready | canonical entities/events/claims/evidence added |
| provenance and audit chain | Partial / real | provenance, confidence, audit fields are now first-class |
| workflow orchestration | Partial / real | analysis job queue and lifecycle events added |
| map-centric investigation | Real | existing map stack retained; typed map context added |
| multi-source correlation | Partial / real | signal aggregation existed; adapter contracts formalized |
| collaborative case management | Planned / adapter-ready | not shipped natively; documented via workbench adapter |
| data exchange fabric | Planned / adapter-ready | open formats and warehouse bridge contract only |
| simulation coupling | Planned / adapter-ready | DIS-style exchange contract only, no simulator bundle |

## External Compatibility Matrix

| System family | Compatibility approach | Current status | Notes |
| --- | --- | --- | --- |
| MISP | `misp-stix-bridge` adapter family | adapter-ready | STIX/TAXII-oriented bridge, not native packaged MISP |
| Shoghi-like OSINT profiling | `osint-ingestion-hub` + entity/claim model | conceptual-compatible | modeled as public-source profiling workflow, not product-specific integration |
| DataWalk-like investigation workflows | `investigation-workbench` adapter family | adapter-ready | graph/case workflow compatibility, not proprietary SDK claim |
| OpenPlanter-like collaborative analysis | workflow + report-generation contracts | adapter-ready | future notebook/workbook layer can bind here |
| FalconView-like geospatial workflows | `geospatial-workbench` adapter family | partial-real | map stack exists today; interoperability envelope now explicit |
| Databricks/Snowflake-style exchange | `data-exchange-bridge` | adapter-ready | export/import through open formats first |
| Weaviate / Chroma | `vector-store-bridge` | adapter-ready | no bundled vector DB added in this pass |
| NATO / open standards | ontology refs + interoperable adapter tags | partial | standards posture documented, no false native compliance claim |
| DIS-style simulation/event exchange | `simulation-exchange` | adapter-ready | defensive scenario envelopes only |
| Rugged edge / tactical deployment concepts | `edge-resilience-node` | partial-real | Tauri + local inference + cached snapshots support the concept |
| Personnel / workforce intelligence ops tools | `workforce-intelligence-bridge` | adapter-ready | readiness-focused, lawful and defensive-only |

## Phased Roadmap

### Phase 1: Foundation Hardening

- expose capability registry in a settings/ops panel
- extend prompt catalog with localized task profiles and policy presets
- wire analysis lifecycle events into toasts/notifications
- add structured export of entities/events/claims/evidence

### Phase 2: Connector Realization

- add opt-in MISP/STIX export/import adapter
- add vector retrieval provider bindings (Weaviate/Chroma)
- add portable parquet/jsonl export/import for warehouse exchange
- move more intelligence handlers to shared AI policy and tracing

### Phase 3: Investigative Workflow

- case workspace and notebook/workbook layer
- human review checkpoints for scenario analysis and report generation
- evidence graph exploration panel
- analytic job history panel with provenance drill-down

### Phase 4: Edge And Resilience

- portable offline bundle manifest
- edge sync and last-known-good data packages
- resilience scoring against data/comms/model degradation
- desktop-first controlled deployment profile

## Risks And Constraints

- OpenRouter-first routing increases consistency, but deployments depending only on custom/Groq envs must be checked during rollout.
- The new foundation is intentionally contract-heavy; full connector realization still requires adapter implementations.
- Map context is currently emitted from country-intel right-click flow; broader map interactions should adopt the same schema over time.
- No new persistence layer was added for canonical domain records in this pass.

## Recommended Next Steps

1. add a small “Foundation Status” panel consuming the capability registry snapshot
2. persist analytic job history and provenance bundles for audit replay
3. wire adapter statuses into runtime settings so missing config is visible in UI
4. migrate remaining Groq-specific docs and handlers to the shared AI policy
