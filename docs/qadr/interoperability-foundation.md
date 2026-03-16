# Interoperability Foundation

## Scope

This pass extends the existing QADR110 `src/platform` foundation with:

- a canonical intelligence ontology for entities, events, indicators, claims, documents, geographies, playbooks, watchlists, and resilience metrics
- a vendor-neutral interoperability adapter layer
- investigation/graph workflows reusable across panels and services
- a Palantir-aware compatibility module that does not claim native proprietary integration unless real endpoints and credentials are present
- lawful defensive workflow helpers for border anomalies, route disruption, infrastructure outage correlation, sanctions shock mapping, misinformation mapping, and humanitarian/logistics stress

## Repository Integration

The implementation is additive and follows the existing structure:

- `src/platform/domain/ontology.ts`
- `src/platform/interoperability/*`
- `src/platform/investigation/*`
- `src/platform/palantir/*`
- `src/platform/workflows/*`
- `src/services/interoperability.ts`

No parallel app or alternate frontend architecture was introduced.

## Canonical Ontology

The normalized model now covers:

- entities: actor, person, organization, country, location, unit, asset, platform, network, group, concept
- events: incident, anomaly, policy, protest, conflict, cyber, aviation, maritime, infrastructure, economic, logistics, humanitarian, environmental, media, scenario
- documents: document, post, feed, report
- graph relationships: location, control, support, opposition, references, impacts, travel paths, provenance, and membership
- watchlists, playbooks, hypotheses, and resilience metrics

Each record family preserves:

- stable identifiers
- timestamps and observed/updated bounds
- confidence + uncertainty
- provenance and evidence references
- audit metadata
- multilingual aliases

## Adapter Architecture

The interoperability layer exposes executable adapters, not just manifests:

- `generic-structured-import`: JSON/CSV/GeoJSON/XML/STIX/MISP-like import
- `osint-ingestion-hub`: normalization of current repo feeds, Telegram OSINT, cyber, aviation, and maritime snapshots
- `misp-stix-bridge`: vendor-neutral threat-intel exchange bundle
- `vector-store-bridge`: lexical/browser-vector first, optional Weaviate/Chroma if configured
- `geospatial-workbench`: GeoJSON export boundary
- `investigation-workbench`: portable case/graph dataset export
- `simulation-exchange`: defensive scenario exchange envelope
- `palantir-compatibility`: OSDK-inspired ontology export and optional Foundry/Python bridge boundaries

Graceful degradation is explicit. Optional backends do not block the bridge itself.

## Investigation Services

Reusable services now exist for:

- link analysis
- entity resolution
- source correlation
- near-duplicate clustering
- timeline synthesis
- geospatial correlation
- watchlist matching
- prompt-ready evidence bundles

These services operate on the canonical ontology bundle so they can feed assistant prompts, DSS/ESS panels, or external exports.

## Defensive Workflows

`src/platform/workflows/defensive.ts` provides lawful defensive decision-support helpers for:

- border anomaly monitoring
- air/maritime route disruption analysis
- infrastructure outage correlation
- sanctions and supply-chain shock mapping
- misinformation/narrative mapping
- humanitarian/logistics stress monitoring

These helpers are descriptive. They do not generate offensive or harmful action guidance.

## Palantir Compatibility

The Palantir module is intentionally bounded:

- object/resource identifier helpers
- OSDK-inspired ontology object mapping
- Conjure-like typed boundary descriptors
- optional Foundry-like HTTP boundary only when endpoint/token are configured
- optional Python sidecar boundary for notebook/SDK workflows

It is a compatibility/export layer, not a bundled native proprietary integration.

## Runtime and Configuration

Runtime configuration now includes optional keys for:

- `MISP_URL`, `MISP_API_KEY`
- `WEAVIATE_URL`, `WEAVIATE_API_KEY`
- `CHROMA_URL`
- `PALANTIR_FOUNDRY_URL`, `PALANTIR_FOUNDRY_TOKEN`
- `PYTHON_SIDECAR_URL`

The interoperability service builds a live registry context from the existing runtime-config subsystem so adapter health and optional backend paths stay aligned with the current app settings model.
