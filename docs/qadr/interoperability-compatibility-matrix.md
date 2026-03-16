# Interoperability Compatibility Matrix

| System / Family | Real public path today | QADR110 status | Notes |
| --- | --- | --- | --- |
| MISP | Yes | Vendor-neutral bridge + import/export boundary | Real live sync needs `MISP_URL` and `MISP_API_KEY`. |
| STIX 2.1 / TAXII-like flows | Yes | Structured import/export boundary | Current pass handles STIX-like import normalization; TAXII transport remains later custom work. |
| Generic REST / CSV / JSON / GeoJSON / XML | Yes | Implemented | Imported through `generic-structured-import`. |
| Existing repo OSINT feeds | Yes | Implemented | Normalizes current news/Telegram/cyber/aviation/maritime services into the ontology bundle. |
| Weaviate | Yes | Optional connector | Enabled only if `WEAVIATE_URL` is configured. |
| Chroma | Yes | Optional connector | Enabled only if `CHROMA_URL` is configured. |
| Geospatial overlays / GeoJSON | Yes | Implemented | Geo export through `geospatial-workbench`. |
| Collaborative investigation datasets | Open-format path | Implemented as portable JSON graph export | No proprietary case-management claim. |
| DIS / HLA-like simulation exchange | Partial / open concepts | Implemented as defensive exchange envelope | Current pass is export-oriented, not a full simulator runtime. |
| Databricks / Snowflake-style exchange | Open-format path | Compatibility boundary only | Use portable dataset exports; native warehouse connectors need separate credentialed work. |
| NATO / open standards interoperability | Partial / format-level | Compatibility boundary only | Focus remains on portable schemas and exchange envelopes. |
| Rugged edge / tactical deployment concepts | Yes | Compatibility pattern only | Uses existing web/Tauri/offline patterns; no special hardware SDK is bundled. |
| Workforce / personnel readiness tools | Limited / product-specific | Vendor-neutral abstraction only | No native proprietary workforce integration claimed. |
| Palantir Foundry-like APIs | Sometimes, tenant-specific | Compatibility boundary only | Live path only when real endpoint/token are configured. |
| Palantir OSDK-inspired ontology mapping | Conceptual / public docs | Implemented as compatibility mapping | Not a bundled official OSDK integration. |
| Palantir Gotham workflows | Typically closed / licensed | Python sidecar or export-only boundary | No native Gotham integration is claimed. |
| Shoghi-like OSINT profiling | No stable public SDK assumed | Capability-equivalent via ontology + investigation services | Treated as workflow equivalence, not native integration. |
| DataWalk-like investigation workflows | No stable public SDK assumed | Capability-equivalent via graph/investigation services | Link analysis and entity resolution are implemented in-house. |
| OpenPlanter-like collaborative analysis | Open workflow pattern | Portable dataset + prompt evidence bundles | Real collaboration backend can be added later. |
| FalconView-like geospatial workflows | Open workflow pattern | Geo export / overlay compatibility | No proprietary SDK claim. |

## Interpretation Rules

- "Implemented" means there is working code in this repo.
- "Optional connector" means a real path exists but depends on runtime configuration.
- "Compatibility boundary only" means QADR110 can exchange normalized data or emulate the workflow shape, but it does not claim native proprietary integration.
