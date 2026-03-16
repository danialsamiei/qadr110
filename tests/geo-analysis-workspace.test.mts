import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GeoAnalysisWorkspaceState } from '../src/platform/operations/geo-analysis.ts';
import {
  buildForecastConfidenceLabel,
  buildGeoContextSnapshot,
  buildGeoSuggestionGroups,
  createCustomGeoSuggestion,
  createGeoAnalysisDescriptor,
  createMapAnalysisStateChangedDetail,
} from '../src/services/map-analysis-workspace.ts';

describe('geo analysis workspace', () => {
  it('builds a context snapshot with inferred incident selection and trend preview', () => {
    const snapshot = buildGeoContextSnapshot({
      lat: 35.6892,
      lon: 51.389,
      countryCode: 'IR',
      countryName: 'Iran',
      activeLayers: ['military', 'protests', 'economic'],
      timeRangeLabel: '24h',
      zoom: 5.4,
      view: 'mena',
      bbox: '50.8,35.1,52.0,36.1',
      allNews: [
        {
          source: 'Sample Feed',
          title: 'اعتراضات تازه در تهران',
          link: 'https://example.com/news/1',
          pubDate: new Date(),
          isAlert: true,
          lat: 35.7,
          lon: 51.4,
          locationName: 'تهران',
        },
      ],
      protests: [
        {
          id: 'protest-1',
          title: 'تجمع اعتراضی در مرکز شهر',
          eventType: 'protest',
          country: 'Iran',
          city: 'Tehran',
          lat: 35.68,
          lon: 51.41,
          time: new Date(),
          severity: 'medium',
          sources: ['acled'],
          sourceType: 'acled',
          confidence: 'high',
          validated: true,
        },
      ],
      freshnessSummary: {
        totalSources: 5,
        activeSources: 4,
        staleSources: 1,
        disabledSources: 0,
        errorSources: 0,
        overallStatus: 'sufficient',
        coveragePercent: 80,
        oldestUpdate: new Date(),
        newestUpdate: new Date(),
      },
    });

    assert.equal(snapshot.context.selection.kind, 'incident');
    assert.equal(snapshot.dataFreshness.coveragePercent, 80);
    assert.equal(snapshot.trendPreview.length, 4);
    assert.ok(snapshot.selectedEntities.includes('Iran'));
    assert.ok(snapshot.promptContext.includes('لایه‌های فعال'));
  });

  it('builds dynamic suggestion groups based on active layers and nearby signals', () => {
    const snapshot = buildGeoContextSnapshot({
      lat: 35.6892,
      lon: 51.389,
      countryCode: 'IR',
      countryName: 'Iran',
      activeLayers: ['military', 'protests', 'economic', 'roadTraffic'],
      timeRangeLabel: '48h',
      zoom: 4,
      view: 'mena',
      militaryFlights: [
        {
          id: 'flight-1',
          callsign: 'IRIAF001',
          hexCode: 'abc123',
          aircraftType: 'fighter',
          operator: 'other',
          operatorCountry: 'Iran',
          lat: 35.9,
          lon: 51.2,
          altitude: 25000,
          heading: 180,
          speed: 420,
          onGround: false,
          lastSeen: new Date(),
          confidence: 'high',
        },
      ],
      protests: [
        {
          id: 'protest-2',
          title: 'اعتراض محلی',
          eventType: 'protest',
          country: 'Iran',
          lat: 35.7,
          lon: 51.5,
          time: new Date(),
          severity: 'medium',
          sources: ['gdelt'],
          sourceType: 'gdelt',
          confidence: 'medium',
          validated: true,
        },
      ],
      freshnessSummary: {
        totalSources: 6,
        activeSources: 2,
        staleSources: 4,
        disabledSources: 0,
        errorSources: 0,
        overallStatus: 'limited',
        coveragePercent: 38,
        oldestUpdate: new Date(),
        newestUpdate: new Date(),
      },
    });

    const groups = buildGeoSuggestionGroups(snapshot);
    const groupIds = groups.map((group) => group.id);

    assert.ok(groupIds.includes('defensive-military-monitoring'));
    assert.ok(groupIds.includes('economic'));
    assert.ok(groupIds.includes('social'));
    assert.ok(groupIds.includes('data-quality'));
  });

  it('routes custom scenario questions into scenario-oriented descriptors', () => {
    const snapshot = buildGeoContextSnapshot({
      lat: 25.2,
      lon: 55.27,
      countryCode: 'AE',
      countryName: 'United Arab Emirates',
      activeLayers: ['ais', 'waterways'],
      timeRangeLabel: '7d',
      zoom: 3.2,
      view: 'mena',
    });
    const suggestion = createCustomGeoSuggestion('برای این موقعیت یک سناریوی ۷ روزه بساز');
    const descriptor = createGeoAnalysisDescriptor(snapshot, suggestion, 'برای این موقعیت یک سناریوی ۷ روزه بساز');

    assert.equal(descriptor.domainMode, 'scenario-planning');
    assert.equal(descriptor.taskClass, 'forecasting');
    assert.equal(descriptor.mode, 'long');
    assert.match(descriptor.promptText, /درخواست اجرایی/);
  });

  it('summarizes workspace state and forecast labels consistently', () => {
    const snapshot = buildGeoContextSnapshot({
      lat: 41.0,
      lon: 29.0,
      countryCode: 'TR',
      countryName: 'Turkey',
      activeLayers: ['economic'],
      zoom: 2.8,
      view: 'eu',
    });
    const suggestion = createCustomGeoSuggestion('اثر این موقعیت بر تاب‌آوری چیست؟');
    const descriptor = createGeoAnalysisDescriptor(snapshot, suggestion, 'اثر این موقعیت بر تاب‌آوری چیست؟');
    const state: GeoAnalysisWorkspaceState = {
      activeResultId: 'result-1',
      jobs: [{ id: 'job-1', descriptor, status: 'running', createdAt: descriptor.createdAt, updatedAt: descriptor.createdAt, autoMinimized: true }],
      results: [{
        id: 'result-1',
        jobId: 'job-1',
        descriptor,
        createdAt: descriptor.createdAt,
        updatedAt: descriptor.createdAt,
        pinned: false,
        unread: true,
        status: 'completed',
      }],
    };

    const summary = createMapAnalysisStateChangedDetail(state);

    assert.equal(summary.activeResultId, 'result-1');
    assert.equal(summary.runningJobs, 1);
    assert.equal(summary.unreadResults, 1);
    assert.equal(buildForecastConfidenceLabel(state.results[0]!), 'اطمینان محدود');
  });
});
