# Map Geo-Analytic Migration Notes

## Added Panel

- New panel id: `geo-analysis-workbench`
- Added to the enabled default panel sets in [`src/config/panels.ts`](../../src/config/panels.ts)

## Event/Contract Changes

- `MapContextEnvelope` now supports:
  - `viewport`
  - `workspaceMode`
  - `watchlists`
  - `selectedEntities`
  - `nearbySignals`
  - `dataFreshness`
- `AnalysisJobQueue` now supports cancellation and emits `wm:analysis-cancelled`

## New Typed Handoffs

- `wm:geo-analysis-assistant-handoff`
- `wm:geo-analysis-scenario-handoff`
- `wm:geo-analysis-open-result`
- `wm:geo-analysis-state-changed`

These are consumed by the existing assistant and scenario planner instead of adding parallel UI stacks.

## SVG Map Fallback

`Map.ts` now supports `setOnMapContextMenu`, and `MapContainer` forwards the callback for SVG mode as well. This preserves right-click parity for non-deck fallback mode.

## Styling

- `src/styles/map-context-menu.css` was expanded for grouped Persian suggestion UX.
- `src/styles/panels.css` now contains the geo-analysis panel and floating HUD styles.

## Follow-Up Recommendations

- Replace nearest-feature inference with explicit layer picking for deck.gl routes and overlays where practical.
- Add server-backed persistence for long-running map analyses if multi-operator collaboration is required.
- If streaming responses are enabled later, render progressive assistant output in `geo-analysis-workbench`.
