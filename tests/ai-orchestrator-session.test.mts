import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createPointMapContext } from '../src/platform/operations/map-context.ts';
import {
  appendAssistantIntent,
  appendAssistantMapInteraction,
  appendReusableInsight,
  buildAssistantSessionContextFromRequest,
  createAssistantSessionContext,
} from '../src/services/ai-orchestrator/session.ts';

describe('AI orchestrator session memory', () => {
  it('tracks intent evolution, map interactions, and reusable insights', () => {
    let session = createAssistantSessionContext('thread-1');
    const mapContext = createPointMapContext('map-1', {
      lat: 29.5926,
      lon: 52.5836,
      countryCode: 'IR',
      countryName: 'ایران',
      label: 'شیراز',
    }, {
      activeLayers: ['news'],
      viewport: { zoom: 7, view: 'map' },
    });

    session = appendAssistantIntent(session, {
      query: 'خلاصه OSINT این محدوده را بده',
      taskClass: 'briefing',
      domainMode: 'osint-digest',
      messages: [],
      mapContext,
      createdAt: '2026-03-17T00:00:00.000Z',
    });
    session = appendAssistantMapInteraction(session, mapContext, '2026-03-17T00:01:00.000Z');
    session = appendReusableInsight(session, {
      id: 'msg-1',
      role: 'assistant',
      createdAt: '2026-03-17T00:02:00.000Z',
      content: 'خلاصه کوتاه',
      structured: {
        reportTitle: 'نمونه',
        executiveSummary: 'خلاصه تحلیلی',
        observedFacts: { title: 'واقعیت', bullets: [], narrative: '', confidence: { band: 'medium', score: 0.5, uncertainty: 0.5 } },
        analyticalInference: { title: 'تحلیل', bullets: [], narrative: '', confidence: { band: 'medium', score: 0.5, uncertainty: 0.5 } },
        scenarios: [],
        uncertainties: { title: 'عدم‌قطعیت', bullets: [], narrative: '', confidence: { band: 'medium', score: 0.5, uncertainty: 0.5 } },
        recommendations: { title: 'توصیه', bullets: [], narrative: '', confidence: { band: 'medium', score: 0.5, uncertainty: 0.5 } },
        resilienceNarrative: { title: 'تاب‌آوری', bullets: [], narrative: '', confidence: { band: 'medium', score: 0.5, uncertainty: 0.5 } },
        followUpSuggestions: [],
      },
      evidenceCards: [],
    }, 'خلاصه OSINT این محدوده را بده');

    assert.equal(session.intentHistory.length, 1);
    assert.equal(session.mapInteractions.length, 1);
    assert.equal(session.reusableInsights.length, 1);
    assert.match(session.activeIntentSummary || '', /شیراز/);
  });

  it('builds a normalized session context from a plain assistant request', () => {
    const mapContext = createPointMapContext('map-2', {
      lat: 41.7151,
      lon: 44.8271,
      countryCode: 'GE',
      countryName: 'گرجستان',
      label: 'تفلیس',
    });

    const session = buildAssistantSessionContextFromRequest({
      conversationId: 'thread-2',
      query: 'برای این نقطه brief دفاعی بساز',
      taskClass: 'assistant',
      domainMode: 'security-brief',
      messages: [],
      mapContext,
      sessionContext: undefined,
    });

    assert.equal(session.sessionId, 'thread-2');
    assert.equal(session.intentHistory.length, 1);
    assert.equal(session.mapInteractions.length, 1);
    assert.equal(session.mapInteractions[0]?.mapContextId, 'map-2');
  });
});
