import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildMapContextCacheKey,
  createPointMapContext,
} from '../src/platform/operations/map-context.ts';
import {
  buildMapAwareContextPackets,
  resolveMapAwareCommandQuery,
  buildViewportPolygonCoordinates,
} from '../src/services/map-aware-ai-utils.ts';

describe('map-aware AI utilities', () => {
  it('builds a stable map cache key independent of runtime context id', () => {
    const ctxA = createPointMapContext('map-a', {
      lat: 35.6892,
      lon: 51.389,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'تهران',
    }, {
      activeLayers: ['gdelt', 'roadTraffic'],
      timeRange: { label: '24h' },
      viewport: {
        zoom: 7.8,
        view: 'mena',
        bounds: { west: 50, south: 35, east: 52, north: 36 },
      },
      workspaceMode: 'variant:full',
    });

    const ctxB = createPointMapContext('map-b', {
      lat: 35.6892,
      lon: 51.389,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'تهران',
    }, {
      activeLayers: ['roadTraffic', 'gdelt'],
      timeRange: { label: '24h' },
      viewport: {
        zoom: 7.8,
        view: 'mena',
        bounds: { west: 50, south: 35, east: 52, north: 36 },
      },
      workspaceMode: 'variant:full',
    });

    assert.equal(buildMapContextCacheKey(ctxA), buildMapContextCacheKey(ctxB));
  });

  it('rewrites generic map commands into anchored Persian queries', () => {
    const context = createPointMapContext('map-c', {
      lat: 35.6892,
      lon: 51.389,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'تهران',
    });

    assert.match(
      resolveMapAwareCommandQuery('analyze this area', context),
      /این محدوده را با تکیه بر کانتکست نقشه تحلیل کن: تهران/,
    );
    assert.match(
      resolveMapAwareCommandQuery('forecast this region', context),
      /برای تهران در ۷۲ ساعت آینده/,
    );
    assert.match(
      resolveMapAwareCommandQuery('detect anomalies here', context),
      /برای تهران ناهنجاری‌ها/,
    );
  });

  it('creates map-aware packets from signals, geopolitics, and clusters', () => {
    const context = createPointMapContext('map-d', {
      lat: 35.6892,
      lon: 51.389,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'تهران',
    }, {
      activeLayers: ['gdelt', 'roadTraffic'],
      viewport: { zoom: 6.5, view: 'mena' },
      contextSummary: 'خلاصه تحلیلی کوتاه',
      geopoliticalContext: ['فشار منطقه‌ای در حال افزایش است.'],
      nearbySignals: [
        { id: 's1', label: 'خبر ۱', kind: 'خبر', distanceKm: 12, severity: 'medium' },
        { id: 's2', label: 'اعتراض ۱', kind: 'اعتراض', distanceKm: 18, severity: 'high' },
      ],
      sourceClusters: [
        { kind: 'خبر', count: 3, topLabels: ['خبر ۱', 'خبر ۲'] },
      ],
    });

    const packets = buildMapAwareContextPackets(context);
    assert.equal(packets[0]?.title.includes('کانتکست نقشه'), true);
    assert.ok(packets.some((packet) => packet.id.includes(':signals')));
    assert.ok(packets.some((packet) => packet.id.includes(':geopolitics')));
    assert.ok(packets.some((packet) => packet.id.includes(':clusters')));
  });

  it('builds a closed viewport polygon from map bounds', () => {
    const coords = buildViewportPolygonCoordinates({
      west: 50,
      south: 35,
      east: 52,
      north: 36,
    });

    assert.equal(coords.length, 5);
    assert.deepEqual(coords[0], coords[coords.length - 1]);
  });
});
