/**
 * Bootstrap-hydrated cache keys populated outside the RPC handlers.
 *
 * Some datasets are seeded by scripts (or external jobs/sidecars) directly into
 * Redis and then hydrated into the UI via `/api/bootstrap`.
 *
 * Keeping these strings under `server/worldmonitor/` makes them searchable
 * alongside handlers and preserves bootstrap registry invariants.
 */
export const BOOTSTRAP_SEEDED_CACHE_KEYS = {
  techReadiness: 'economic:worldbank-techreadiness:v1',
  progressData: 'economic:worldbank-progress:v1',
  renewableEnergy: 'economic:worldbank-renewable:v1',
  weatherAlerts: 'weather:alerts:v1',
  spending: 'economic:spending:v1',
} as const;

