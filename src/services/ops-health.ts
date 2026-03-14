import { createCircuitBreaker } from '@/utils';

export type HealthLevel = 'healthy' | 'warning' | 'degraded' | 'unavailable' | 'stale';

export interface DependencyHealth {
  health: HealthLevel;
  freshness: 'fresh' | 'stale' | 'unknown';
  lastSuccessfulAt: string | null;
  note: string;
}

export interface OpsHealthSnapshot {
  status: HealthLevel;
  checkedAt: string;
  components: {
    gdelt: DependencyHealth;
    ipx: DependencyHealth;
  };
}

const fallbackSnapshot: OpsHealthSnapshot = {
  status: 'degraded',
  checkedAt: new Date(0).toISOString(),
  components: {
    gdelt: {
      health: 'unavailable',
      freshness: 'unknown',
      lastSuccessfulAt: null,
      note: 'وضعیت GDELT در دسترس نیست.',
    },
    ipx: {
      health: 'unavailable',
      freshness: 'unknown',
      lastSuccessfulAt: null,
      note: 'وضعیت IPX در دسترس نیست.',
    },
  },
};

const breaker = createCircuitBreaker<OpsHealthSnapshot>({
  name: 'Ops Health',
  cacheTtlMs: 90_000,
  persistCache: true,
});

export async function fetchOpsHealth(): Promise<OpsHealthSnapshot> {
  return breaker.execute(async () => {
    const res = await fetch('/api/ops-health', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`ops-health ${res.status}`);
    const payload = await res.json() as OpsHealthSnapshot;
    if (!payload?.components?.gdelt || !payload?.components?.ipx) {
      throw new Error('Invalid ops-health payload');
    }
    return payload;
  }, fallbackSnapshot);
}
