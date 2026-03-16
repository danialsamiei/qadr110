# Production Release - 2026-03-16

## Target

- Public endpoint: `https://qadr.alefba.dev`
- Origin host: `http://192.168.1.225:3000`
- Tunnel path: `cloudflared alefba-ubuntu -> localhost:3000`

## What changed

### Upstream sync

- Deployment branch was synced with the latest upstream `origin/main`.
- New upstream capabilities now included in the release line:
  - `NRC` National Resilience Coefficient scoring
  - `NRC Analytics`
  - `CSRC` cognitive-social panel
  - related map and data-loader support for resilience overlays
- Architecture review documents from upstream were carried into the deployed branch.

### Dashboard surfaces now active

- Analysis quick-nav routes to real panels for:
  - `رسانه`
  - `Pipeline`
  - `Telegram`
  - `Instagram`
  - `X`
  - `Aparat`
  - `Telewebion`
  - `GDELT`
  - `NetBlocks`
  - `GoogleTrends`
  - `ترافیک`
  - `سایبر`
  - `IXP`
  - `DSS`
  - `ESS`
- `Airline Intelligence` remains active for air traffic workflows.
- `Maritime Traffic` remains active as a dedicated panel for maritime workflows.
- Iran-focused panels such as `Media Pipelines`, `Iran Media Matrix`, and `Infra/Traffic/Cyber` remain enabled in the production layout.

### Release visibility

- A new in-app panel, `Change Log / یادداشت انتشار`, was added so operators can read release notes inside the dashboard.
- This document is the GitHub-side release note page for the same production refresh.

## Deployment notes

- The Ubuntu host may still fail on direct `vite build` with a segmentation fault.
- The reliable release path remains:
  1. build `dist` locally with production env
  2. upload to `/opt/qadr110`
  3. restart `qadr110.service`
- Public serving remains through the existing `cloudflared` tunnel and systemd service.
