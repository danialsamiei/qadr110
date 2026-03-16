export interface FusionSnapshot {
  generatedAt: string;
  streams: FusionStream[];
}

export interface FusionStream {
  key: string;
  title: string;
  note: string;
  sourceConfidence: number;
  freshness: 'fresh' | 'aging' | 'stale';
  contradictionFlags: string[];
  entitySummary: string[];
  status: 'live' | 'degraded' | 'offline';
}

interface AnalyticalFeed {
  sourceConfidence?: number;
  freshness?: 'fresh' | 'aging' | 'stale';
  contradictionFlags?: string[];
  entitySummary?: string[];
}

function normalizeFeed(data: unknown): AnalyticalFeed | null {
  if (!data || typeof data !== 'object') return null;
  const candidate = data as AnalyticalFeed;
  return {
    sourceConfidence: Number.isFinite(candidate.sourceConfidence) ? candidate.sourceConfidence : 0,
    freshness: candidate.freshness || 'stale',
    contradictionFlags: Array.isArray(candidate.contradictionFlags) ? candidate.contradictionFlags : [],
    entitySummary: Array.isArray(candidate.entitySummary) ? candidate.entitySummary : [],
  };
}

function statusFromMetrics(sourceConfidence: number, freshness: 'fresh' | 'aging' | 'stale'): 'live' | 'degraded' | 'offline' {
  if (sourceConfidence >= 0.74 && freshness === 'fresh') return 'live';
  if (sourceConfidence >= 0.4 || freshness === 'aging') return 'degraded';
  return 'offline';
}

function runFusionRules(streams: FusionStream[]): FusionStream[] {
  const trendStream = streams.find((stream) => stream.key === 'trends');
  const netblocksStream = streams.find((stream) => stream.key === 'netblocks');
  if (!trendStream || !netblocksStream) return streams;

  const trendEntities = new Set(trendStream.entitySummary.map(entity => entity.toLowerCase()));
  const netblocksEntities = new Set(netblocksStream.entitySummary.map(entity => entity.toLowerCase()));
  const hasEntityOverlap = [...trendEntities].some(entity => netblocksEntities.has(entity));

  const trendShift = trendStream.contradictionFlags.includes('sudden_trend_shift');
  const netStress = netblocksStream.contradictionFlags.includes('network_disruption_spike');
  const netRecovery = netblocksStream.contradictionFlags.includes('network_recovery_signal');

  if (trendShift && netStress && hasEntityOverlap) {
    trendStream.contradictionFlags.push('cross_source_escalation');
    netblocksStream.contradictionFlags.push('cross_source_escalation');
  }

  if (netStress && netRecovery) {
    netblocksStream.contradictionFlags.push('source_conflict_restoration_vs_disruption');
  }

  if (trendShift && !hasEntityOverlap) {
    trendStream.contradictionFlags.push('source_entity_mismatch');
  }

  streams.forEach((stream) => {
    stream.contradictionFlags = [...new Set(stream.contradictionFlags)];
    stream.status = statusFromMetrics(stream.sourceConfidence, stream.freshness);
  });

  return streams;
}

export async function loadRealtimeFusionSnapshot(): Promise<FusionSnapshot> {
  const checks = await Promise.allSettled([
    fetch('/api/google-trends?geo=IR').then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => null) })),
    fetch('/api/netblocks?limit=10').then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => null) })),
    fetch('/api/polymarket').then(r => ({ ok: r.ok })),
    fetch('/api/intelligence/v1/searchGdeltDocuments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'iran', limit: 5 }) }).then(r => ({ ok: r.ok })),
  ]);

  const analyticalAt = (i: number): AnalyticalFeed | null => {
    const c = checks[i];
    if (!c || c.status !== 'fulfilled' || !('data' in c.value)) return null;
    return normalizeFeed(c.value.data);
  };

  const byHealth = (i: number): FusionStream => {
    const c = checks[i];
    const ok = c?.status === 'fulfilled' && c.value.ok;
    return {
      key: i === 2 ? 'markets' : 'gdelt',
      title: i === 2 ? 'Polymarket/Crypto/TGJU' : 'GDELT / News Graph',
      note: i === 2 ? 'بازار پیش‌بینی و سیگنال‌های مالی' : 'تحلیل روایی و روندهای خبری جهانی',
      sourceConfidence: ok ? 0.55 : 0.2,
      freshness: ok ? 'aging' : 'stale',
      contradictionFlags: [],
      entitySummary: [],
      status: ok ? 'degraded' : 'offline',
    };
  };

  const trends = analyticalAt(0);
  const netblocks = analyticalAt(1);

  const streams = runFusionRules([
    {
      key: 'gdelt',
      title: 'GDELT / News Graph',
      note: 'تحلیل روایی و روندهای خبری جهانی',
      sourceConfidence: byHealth(3).sourceConfidence,
      freshness: byHealth(3).freshness,
      contradictionFlags: [],
      entitySummary: [],
      status: byHealth(3).status,
    },
    {
      key: 'netblocks',
      title: 'NetBlocks',
      note: 'پایش قطعی/اختلال اینترنت',
      sourceConfidence: netblocks?.sourceConfidence ?? 0,
      freshness: netblocks?.freshness ?? 'stale',
      contradictionFlags: netblocks?.contradictionFlags ?? ['feed_unavailable'],
      entitySummary: netblocks?.entitySummary ?? [],
      status: 'offline',
    },
    {
      key: 'trends',
      title: 'Google Trends',
      note: 'ترندهای جستجو و تغییرات توجه عمومی',
      sourceConfidence: trends?.sourceConfidence ?? 0,
      freshness: trends?.freshness ?? 'stale',
      contradictionFlags: trends?.contradictionFlags ?? ['feed_unavailable'],
      entitySummary: trends?.entitySummary ?? [],
      status: 'offline',
    },
    byHealth(2),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    streams,
  };
}
