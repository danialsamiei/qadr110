import type { AssistantContextPacket } from '@/platform/ai/assistant-contracts';
import {
  buildMapContextCacheKey,
  describeMapContextForPrompt,
  type MapContextEnvelope,
} from '@/platform/operations/map-context';

export function resolveMapSelectionLabel(mapContext?: MapContextEnvelope | null): string {
  if (!mapContext) return 'محدوده انتخاب‌شده';
  if (mapContext.selection.kind === 'country') return mapContext.selection.countryName;
  if (mapContext.selection.kind === 'point') {
    return mapContext.selection.label || mapContext.selection.countryName || `${mapContext.selection.lat.toFixed(3)}, ${mapContext.selection.lon.toFixed(3)}`;
  }
  if (mapContext.selection.kind === 'polygon') return mapContext.selection.label || 'محدوده انتخاب‌شده';
  if (mapContext.selection.kind === 'incident') return mapContext.selection.label;
  return mapContext.selection.layerLabel || mapContext.selection.layerId;
}

export function resolveMapAwareCommandQuery(query: string, mapContext?: MapContextEnvelope | null): string {
  const normalized = query.trim().toLowerCase();
  if (!mapContext) return query;
  const selectionLabel = resolveMapSelectionLabel(mapContext);

  if (/^(analyze this area|analyse this area|این محدوده را تحلیل کن)$/i.test(normalized)) {
    return `این محدوده را با تکیه بر کانتکست نقشه تحلیل کن: ${selectionLabel}`;
  }
  if (/^(forecast this region|predict this region|این منطقه را پیش‌بینی کن)$/i.test(normalized)) {
    return `برای ${selectionLabel} در ۷۲ ساعت آینده چه سناریوهایی محتمل است و چه triggerهایی باید پایش شود؟`;
  }
  if (/^(detect anomalies here|find anomalies here|ناهنجاری‌های اینجا را پیدا کن)$/i.test(normalized)) {
    return `برای ${selectionLabel} ناهنجاری‌ها، سیگنال‌های متناقض، الگوهای خارج از روند و شکاف‌های داده را شناسایی کن.`;
  }
  if (/^(simulate this region|این منطقه را شبیه‌سازی کن)$/i.test(normalized)) {
    return `برای ${selectionLabel} سناریوهای محلی، تشدید منطقه‌ای و ripple effect جهانی را شبیه‌سازی کن.`;
  }
  if (/^(forecast escalation here|پیش‌بینی تشدید از اینجا)$/i.test(normalized)) {
    return `برای ${selectionLabel} مسیرهای تشدید احتمالی، triggerها، hotspotها و شرایط ابطال را پیش‌بینی کن.`;
  }
  if (/^(what happens if conflict spreads from here\?|what happens if conflict spreads from here|اگر منازعه از اینجا گسترش یابد چه می‌شود)$/i.test(normalized)) {
    return `اگر منازعه از ${selectionLabel} سرریز کند، پیامدهای محلی، منطقه‌ای و جهانی آن چیست و کدام مسیرهای spillover محتمل‌ترند؟`;
  }
  return query;
}

export function buildMapAwarePromptInjection(mapContext?: MapContextEnvelope | null): string {
  if (!mapContext) return '';
  const sections = [
    `کانتکست نقشه:\n${describeMapContextForPrompt(mapContext)}`,
    mapContext.contextSummary ? `خلاصه تحلیلی نقشه:\n${mapContext.contextSummary}` : '',
    mapContext.geopoliticalContext?.length ? `زمینه ژئوپلیتیک:\n- ${mapContext.geopoliticalContext.join('\n- ')}` : '',
  ].filter(Boolean);
  return sections.join('\n\n');
}

export function buildMapAwareContextPackets(mapContext?: MapContextEnvelope | null): AssistantContextPacket[] {
  if (!mapContext) return [];
  const cacheKey = mapContext.cacheKey || buildMapContextCacheKey(mapContext);
  const now = mapContext.createdAt || new Date().toISOString();
  const packets: AssistantContextPacket[] = [
    {
      id: `map-aware:${cacheKey}:summary`,
      title: `کانتکست نقشه | ${resolveMapSelectionLabel(mapContext)}`,
      summary: mapContext.contextSummary || describeMapContextForPrompt(mapContext).slice(0, 280),
      content: describeMapContextForPrompt(mapContext),
      sourceLabel: 'QADR110 Map Context',
      sourceType: 'manual',
      updatedAt: now,
      score: 0.82,
      tags: ['map', 'geo-context', 'selection'],
      provenance: { sourceIds: [`map:${cacheKey}`], evidenceIds: [`map:${cacheKey}:summary`] },
    },
  ];

  if (mapContext.nearbySignals?.length) {
    packets.push({
      id: `map-aware:${cacheKey}:signals`,
      title: 'سیگنال‌های نزدیک',
      summary: mapContext.nearbySignals.slice(0, 5).map((signal) => `${signal.label} (${signal.kind})`).join('، '),
      content: mapContext.nearbySignals.map((signal) => {
        const distance = signal.distanceKm != null ? ` | ${signal.distanceKm.toFixed(0)}km` : '';
        const severity = signal.severity ? ` | شدت ${signal.severity}` : '';
        return `${signal.label} | ${signal.kind}${distance}${severity}`;
      }).join('\n'),
      sourceLabel: 'QADR110 Nearby Signals',
      sourceType: 'manual',
      updatedAt: now,
      score: 0.78,
      tags: ['map', 'signals', 'osint'],
      provenance: { sourceIds: [`map:${cacheKey}`], evidenceIds: [`map:${cacheKey}:signals`] },
    });
  }

  if (mapContext.geopoliticalContext?.length) {
    packets.push({
      id: `map-aware:${cacheKey}:geopolitics`,
      title: 'زمینه ژئوپلیتیک',
      summary: mapContext.geopoliticalContext.slice(0, 3).join(' | '),
      content: mapContext.geopoliticalContext.join('\n'),
      sourceLabel: 'QADR110 Geopolitical Context',
      sourceType: 'manual',
      updatedAt: now,
      score: 0.74,
      tags: ['map', 'geopolitics'],
      provenance: { sourceIds: [`map:${cacheKey}`], evidenceIds: [`map:${cacheKey}:geopolitics`] },
    });
  }

  if (mapContext.sourceClusters?.length) {
    packets.push({
      id: `map-aware:${cacheKey}:clusters`,
      title: 'خوشه‌های رخداد',
      summary: mapContext.sourceClusters.map((cluster) => `${cluster.kind} (${cluster.count})`).join('، '),
      content: mapContext.sourceClusters.map((cluster) =>
        `${cluster.kind} | ${cluster.count} | ${(cluster.topLabels ?? []).join('، ')}`
      ).join('\n'),
      sourceLabel: 'QADR110 Event Clusters',
      sourceType: 'manual',
      updatedAt: now,
      score: 0.7,
      tags: ['map', 'clusters'],
      provenance: { sourceIds: [`map:${cacheKey}`], evidenceIds: [`map:${cacheKey}:clusters`] },
    });
  }

  return packets;
}

export function buildViewportPolygonCoordinates(bounds?: {
  west: number;
  south: number;
  east: number;
  north: number;
}): Array<[number, number]> {
  if (!bounds) return [];
  return [
    [bounds.west, bounds.south],
    [bounds.east, bounds.south],
    [bounds.east, bounds.north],
    [bounds.west, bounds.north],
    [bounds.west, bounds.south],
  ];
}
