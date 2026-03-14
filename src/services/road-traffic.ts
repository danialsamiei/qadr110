import { createCircuitBreaker } from '@/utils';
import { toApiUrl } from '@/services/runtime';

export type RoadCongestionLevel = 'low' | 'moderate' | 'high' | 'severe';

export interface RoadTrafficPoint {
  id: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  speedKph: number;
  freeFlowKph: number;
  congestionLevel: RoadCongestionLevel;
  confidence: number;
  source: 'tomtom' | 'demo';
  updatedAt: Date;
}

export interface RoadTrafficResult {
  points: RoadTrafficPoint[];
  providerConfigured: boolean;
  message?: string;
}

interface RoadTrafficResponse {
  points?: Array<Omit<RoadTrafficPoint, 'updatedAt'> & { updatedAt: string }>;
  configured?: boolean;
  message?: string;
}

const breaker = createCircuitBreaker<RoadTrafficResult>({
  name: 'Road Traffic',
  cacheTtlMs: 2 * 60 * 1000,
  persistCache: true,
});

export async function fetchRoadTraffic(): Promise<RoadTrafficResult> {
  return breaker.execute(async () => {
    const resp = await fetch(toApiUrl('/api/road-traffic'), { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) throw new Error(`Road traffic fetch failed: ${resp.status}`);
    const json = await resp.json() as RoadTrafficResponse;
    const points = (json.points ?? []).map((p) => ({ ...p, updatedAt: new Date(p.updatedAt) }));
    return {
      points,
      providerConfigured: Boolean(json.configured),
      message: typeof json.message === 'string' ? json.message : undefined,
    };
  }, { points: [], providerConfigured: false, message: 'کلید سرویس ترافیک جاده‌ای تنظیم نشده است.' });
}

export function getRoadTrafficStatus(): string {
  return breaker.getStatus();
}
