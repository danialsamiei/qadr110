export interface FusionSnapshot {
  generatedAt: string;
  streams: Array<{ key: string; title: string; status: 'live' | 'degraded' | 'offline'; note: string }>;
}

export async function loadRealtimeFusionSnapshot(): Promise<FusionSnapshot> {
  const checks = await Promise.allSettled([
    fetch('/api/google-trends?geo=IR').then(r => r.ok),
    fetch('/api/netblocks?limit=10').then(r => r.ok),
    fetch('/api/polymarket').then(r => r.ok),
    fetch('/api/intelligence/v1/searchGdeltDocuments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'iran', limit: 5 }) }).then(r => r.ok),
  ]);

  const toStatus = (i: number): 'live' | 'degraded' | 'offline' => {
    const c = checks[i];
    if (!c) return 'offline';
    if (c.status === 'fulfilled' && c.value === true) return 'live';
    if (c.status === 'fulfilled' && c.value === false) return 'degraded';
    return 'offline';
  };

  return {
    generatedAt: new Date().toISOString(),
    streams: [
      { key: 'gdelt', title: 'GDELT / News Graph', status: toStatus(3), note: 'تحلیل روایی و روندهای خبری جهانی' },
      { key: 'netblocks', title: 'NetBlocks', status: toStatus(1), note: 'پایش قطعی/اختلال اینترنت' },
      { key: 'trends', title: 'Google Trends', status: toStatus(0), note: 'ترندهای جستجو و تغییرات توجه عمومی' },
      { key: 'markets', title: 'Polymarket/Crypto/TGJU', status: toStatus(2), note: 'بازار پیش‌بینی و سیگنال‌های مالی' },
    ],
  };
}
