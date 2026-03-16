# Interoperability Migration Notes

## What Changed

- `src/platform/domain/model.ts` gained additional source, entity, event, and relationship variants needed for interoperability.
- `src/platform/domain/ontology.ts` adds canonical bundle types used by adapters, investigation services, and compatibility exports.
- `src/platform/interoperability/*` adds executable adapters and a registry layered on top of the existing capability manifests.
- `src/platform/investigation/*` adds reusable graph and analyst-workbench services.
- `src/platform/palantir/*` adds compatibility-only mapping and optional sidecar/API boundaries.
- `src/platform/workflows/*` adds lawful defensive workflow helpers.
- `src/services/runtime-config.ts` now knows about interoperability/vector/Foundry/Python-sidecar settings.

## Intended Migration Path

1. Normalize external or repo-native snapshots into `IntelligenceOntologyBundle`.
2. Run investigation services on the bundle.
3. Feed the resulting evidence/timeline graph into assistant prompts, reports, panels, or export adapters.
4. Enable optional connectors only when real endpoints/credentials exist.

## Backward Compatibility

- No panel routing or Tauri/web parity assumptions were broken.
- Existing feed and AI services remain intact.
- Bridges degrade to local/manual/export-only operation when optional connectors are absent.

## Known Limits

- TAXII transport, warehouse-native sync, and true tenant-specific Foundry APIs are not bundled by default.
- The current pass focuses on normalized contracts and adapters, not a full multi-tenant integration server.
- Browser-vector still requires the existing ML worker runtime when actually used.
