# Map Geo-Analytic Workspace

## Goal

This phase makes the map/globe the primary surface for starting geo-aware analysis in QADR110 without replacing the existing architecture.

## What Was Extended

- Existing right-click entrypoint in [`MapContainer`](../../src/components/MapContainer.ts) and [`CountryIntelManager`](../../src/app/country-intel.ts)
- Existing typed map-context contract in [`map-context.ts`](../../src/platform/operations/map-context.ts)
- Existing async analysis lifecycle in [`analysis-job-queue.ts`](../../src/platform/operations/analysis-job-queue.ts)
- Existing assistant/scenario panels through typed handoff events instead of direct brittle coupling

## Runtime Pieces

- `src/services/map-analysis-workspace.ts`
  - builds geo-context snapshots from current map state and nearby signals
  - generates dynamic Persian suggestion groups
  - routes map-triggered analyses through the shared AI fabric
  - stores running jobs, results, unread notifications, and export/pin state
- `src/services/map-analysis-hud.ts`
  - renders the compact running-jobs widget and completion toasts
- `src/components/MapAnalysisPanel.ts`
  - provides the full result surface, archive, evidence view, rerun/export actions, and handoffs
- `src/components/MapContextMenu.ts`
  - upgraded from a flat list into grouped suggestion UI with custom analyst question support

## Geo-Context Model

Each right-click snapshot now considers:

- clicked coordinates
- inferred country or nearest incident/layer feature
- visible layers
- zoom level and viewport bounds
- nearby news/signals
- active time range
- workspace variant
- watchlist hints
- source freshness and evidence density

The enriched envelope is still dispatched through `wm:map-context`, so existing downstream consumers continue to work.

## Long-Running Analysis Flow

1. User right-clicks the map and chooses a suggestion.
2. A `map-analysis` job is created through the shared analysis queue.
3. Long-running jobs auto-minimize into the floating HUD chip stack.
4. On completion, the HUD raises a Persian toast.
5. Clicking the toast opens the result in `geo-analysis-workbench`.

## Result Surface

The result panel includes:

- executive summary
- separated observed facts / inference / scenarios / uncertainties / recommendations
- evidence cards
- related places/entities
- trend preview
- forecast confidence label
- follow-up prompts
- handoff to `qadr-assistant`
- handoff to `scenario-planner`

## Current Limits

- Feature selection on right-click is inferred from nearest nearby signal or infrastructure, not from native deck.gl pick info for every layer.
- The HUD is browser-side only and does not yet persist cross-device.
- Background jobs are still single-process browser jobs; there is no server-side durable queue in this phase.
