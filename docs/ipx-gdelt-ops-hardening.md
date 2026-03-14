# IPX + GDELT Operational Hardening

## What changed
- Added `api/ipx-status.js` as an operational IPX telemetry endpoint with explicit health and freshness semantics.
- Added `api/ops-health.js` aggregate dependency health endpoint for GDELT and IPX.
- Wired UI path via `src/services/ops-health.ts` → `src/services/realtime-fusion.ts` → `InfraTrafficCyberPanel`.
- Hardened GDELT panel state with health badge updates, freshness metadata, and Persian fallback messages.

## Health/Freshness model
- `healthy`: dependency reachable and non-empty where applicable.
- `degraded`: partial availability / low confidence.
- `stale`: endpoint reachable but data not fresh enough.
- `unavailable`: endpoint unreachable or invalid response.

Both `/api/ipx-status` and `/api/ops-health` return `checkedAt` and short-TTL cache headers for deterministic menu rendering.

## Config and env
- No required new env vars for baseline behavior.
- Optional runtime reliability depends on public upstream access used for probes.

## Testing
- `node --test tests/ops-health-integration.test.mjs`
- `node --test tests/branding-localization.test.mjs`
- `npm run typecheck`

## Assumption
`IPX` is implemented as Internet Peering eXchange operational telemetry (not image proxy), because the product area is infrastructure/traffic/cyber monitoring and existing UI already referenced exchange-like monitoring context.
