import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getScenarios } from '../src/ai/scenario-engine.ts';
import { runWarRoom } from '../src/ai/war-room/index.ts';
import { createPointMapContext } from '../src/platform/operations/map-context.ts';
import { createAssistantSessionContext } from '../src/services/ai-orchestrator/session.ts';
import {
  buildWarRoomDeckTabs,
  buildWarRoomCognitiveLayer,
  buildWarRoomContextBanner,
  buildWarRoomCyberLayer,
  buildWarRoomDefenseLayer,
  buildWarRoomHeatTone,
  buildWarRoomShortcutHints,
  buildWarRoomSpecialViewNotes,
  buildWarRoomViewNarrative,
  cycleWarRoomFocusAgent,
  debatePresetToEngineMode,
  filterWarRoomAgentsByView,
  localizeWarRoomDebatePreset,
  localizeWarRoomDeckMode,
  localizeWarRoomViewMode,
  pickWarRoomFocusAgent,
  resolveWarRoomDrilldown,
  strongestObjection,
} from '../src/components/war-room-ui.ts';

function makeScenarioInput() {
  const session = createAssistantSessionContext('war-room-ui');
  session.intentHistory = [
    {
      query: 'برای این محدوده مناظره چندعاملی سناریومحور بساز',
      taskClass: 'scenario-analysis',
      timestamp: '2026-03-17T09:00:00.000Z',
    },
  ];
  const mapContext = createPointMapContext('war-room-ui-map', {
    lat: 26.5667,
    lon: 56.25,
    countryCode: 'IR',
    countryName: 'ایران',
    label: 'تنگه هرمز',
  }, {
    activeLayers: ['gdelt', 'polymarket', 'osint'],
    workspaceMode: 'scenario-planning',
    nearbySignals: [
      { id: 'sig-1', label: 'افزایش ریسک بیمه کشتیرانی', kind: 'shipping', severity: 'high' },
      { id: 'sig-2', label: 'نوسان قیمت انرژی', kind: 'energy', severity: 'medium' },
    ],
    geopoliticalContext: ['گذرگاه حیاتی انرژی'],
    selectedEntities: ['حمل دریایی', 'صادرات انرژی'],
    viewport: { zoom: 7, view: 'map' },
  });

  return {
    session,
    mapContext,
  };
}

function makeWarRoom() {
  const { session, mapContext } = makeScenarioInput();

  return runWarRoom({
    question: 'اگر عبور دریایی در تنگه هرمز مختل شود، کدام عامل‌ها واگرایی اصلی دارند؟',
    trigger: 'اختلال در عبور دریایی تنگه هرمز',
    query: 'برای تنگه هرمز مناظره چندعاملی بساز',
    mapContext,
    sessionContext: session,
    timeContext: '2026-03-17T09:10:00.000Z',
    challengeIterations: 2,
  });
}

function makeWarRoomWithScenarioState() {
  const { session, mapContext } = makeScenarioInput();
  const scenarioState = makeScenarioState();
  const warRoom = runWarRoom({
    question: 'اگر عبور دریایی در تنگه هرمز مختل شود، کدام عامل‌ها واگرایی اصلی دارند؟',
    trigger: 'اختلال در عبور دریایی تنگه هرمز',
    query: 'برای تنگه هرمز مناظره چندعاملی بساز',
    mapContext,
    sessionContext: session,
    timeContext: '2026-03-17T09:15:00.000Z',
    challengeIterations: 2,
    baseScenarioOutput: scenarioState,
    localContextPackets: scenarioState.contextPackets,
  });

  return {
    scenarioState,
    warRoom,
  };
}

function makeScenarioState() {
  const { session, mapContext } = makeScenarioInput();
  return getScenarios({
    trigger: 'اختلال دریایی و موج روایتی در تنگه هرمز',
    query: 'برای تنگه هرمز سناریوهای حمل‌ونقل، فشار رسانه‌ای، قطبی‌سازی اجتماعی و فشار سایبری را بررسی کن.',
    mapContext,
    sessionContext: session,
    timeContext: '2026-03-17T09:12:00.000Z',
    localContextPackets: [
      {
        id: 'packet-media-wave',
        title: 'خوشه خبررسانی درباره ریسک عبور',
        summary: 'الگوی بازنشر هماهنگ در رسانه‌ها و شبکه‌های اجتماعی روی ریسک عبور و بیمه کشتیرانی دیده می‌شود.',
        content: 'media wave',
        sourceLabel: 'gdelt',
        sourceType: 'rss',
        updatedAt: '2026-03-17T09:05:00.000Z',
        score: 0.82,
        tags: ['media', 'narrative'],
        provenance: { sourceIds: ['src-media-wave'], evidenceIds: ['ev-media-wave'] },
      },
      {
        id: 'packet-cyber-outage',
        title: 'اختلال مقطعی در visibility زیرساخت بندری',
        summary: 'گزارش‌های OSINT از کندی سرویس‌های بندری، فشار لجستیکی و dependency شبکه‌ای خبر می‌دهند.',
        content: 'cyber outage',
        sourceLabel: 'netblocks',
        sourceType: 'feed',
        updatedAt: '2026-03-17T09:07:00.000Z',
        score: 0.78,
        tags: ['cyber', 'infrastructure'],
        provenance: { sourceIds: ['src-cyber-outage'], evidenceIds: ['ev-cyber-outage'] },
      },
    ],
  });
}

describe('war-room ui helpers', () => {
  it('maps presets and labels to localized war room UI strings', () => {
    assert.equal(debatePresetToEngineMode('quick'), 'fast');
    assert.equal(debatePresetToEngineMode('deep'), 'deep');
    assert.equal(localizeWarRoomDebatePreset('scenario-linked'), 'مناظره سناریومحور');
    assert.equal(localizeWarRoomViewMode('red-team'), 'نمای ردتیم');
    assert.equal(localizeWarRoomDeckMode('battlefield'), 'میدان سناریو');
  });

  it('filters agents and focus state for special views', () => {
    const warRoom = makeWarRoom();
    const executiveAgents = filterWarRoomAgentsByView(warRoom, 'executive');
    const redTeamAgents = filterWarRoomAgentsByView(warRoom, 'red-team');

    assert.equal(redTeamAgents.length, 1);
    assert.equal(redTeamAgents[0]?.id, 'skeptic-red-team');
    assert.ok(executiveAgents.some((agent) => agent.id === 'executive-synthesizer'));
    assert.ok(executiveAgents.some((agent) => agent.id === 'scenario-moderator'));

    const focusAgent = pickWarRoomFocusAgent(warRoom, 'red-team', null);
    assert.equal(focusAgent?.id, 'skeptic-red-team');
    assert.match(strongestObjection(redTeamAgents[0]!), /فرض|blind spot|کم‌برآورد|سناریو|شاهد/);
  });

  it('builds contextual view narratives, notes, and heat tones', () => {
    const warRoom = makeWarRoom();

    assert.match(buildWarRoomViewNarrative(warRoom, 'executive'), /تنگه هرمز|جمع‌بندی|رصد/);
    assert.match(buildWarRoomContextBanner(warRoom, 'scenario-linked'), /سناریو|watchpoint/);
    assert.ok(buildWarRoomSpecialViewNotes(warRoom, 'conflict').length >= 1);

    assert.equal(buildWarRoomHeatTone(0), 'muted');
    assert.equal(buildWarRoomHeatTone(0.2), 'low');
    assert.equal(buildWarRoomHeatTone(0.45), 'medium');
    assert.equal(buildWarRoomHeatTone(0.65), 'high');
    assert.equal(buildWarRoomHeatTone(0.9), 'critical');
  });

  it('builds cognitive, cyber, and defense layers for the premium war room surface', () => {
    const warRoom = makeWarRoom();
    const scenarioState = makeScenarioState();
    const cognitive = buildWarRoomCognitiveLayer(warRoom, scenarioState);
    const cyber = buildWarRoomCyberLayer(warRoom, scenarioState);
    const defense = buildWarRoomDefenseLayer(warRoom, scenarioState);

    assert.equal(cognitive.cards.length, 3);
    assert.ok(cognitive.vectors.length >= 3);
    assert.ok(cognitive.watchpoints.length >= 2);
    assert.match(cognitive.summary, /شناختی|روایت|drift/);

    assert.equal(cyber.cards.length, 3);
    assert.ok(cyber.actions.length >= 2);
    assert.match(cyber.summary, /زیرساخت|سایبری|fragility/);

    assert.equal(defense.cards.length, 3);
    assert.ok(defense.watchpoints.length >= 2);
    assert.match(defense.summary, /دفاعی|mitigation|counter/i);
  });

  it('builds deck tabs, shortcuts, and drill-down payloads for report-within-report interactions', () => {
    const { warRoom, scenarioState } = makeWarRoomWithScenarioState();
    const deckTabs = buildWarRoomDeckTabs(warRoom, scenarioState);
    const shortcutHints = buildWarRoomShortcutHints();
    const agentDrilldown = resolveWarRoomDrilldown(warRoom, scenarioState, {
      kind: 'agent',
      id: 'strategic-analyst',
    });
    const scenarioDrilldown = resolveWarRoomDrilldown(warRoom, scenarioState, {
      kind: 'scenario',
      id: scenarioState.scenarios[0]!.id,
    });
    const evidenceDrilldown = resolveWarRoomDrilldown(warRoom, scenarioState, {
      kind: 'evidence',
      id: warRoom.contextPackets[0]!.id,
    });

    assert.equal(deckTabs.length, 4);
    assert.ok(deckTabs.some((item) => item.id === 'evidence'));
    assert.ok(shortcutHints.some((item) => item.keys === 'B / G / T / E'));
    assert.ok(agentDrilldown);
    assert.match(agentDrilldown!.summary, /سناریو|پیامد|رصد|تحلیل/);
    assert.ok(agentDrilldown!.sections.some((section) => section.id === 'transcript'));
    assert.ok(scenarioDrilldown);
    assert.ok(scenarioDrilldown!.sections.some((section) => section.id === 'conflicts'));
    assert.ok(evidenceDrilldown);
    assert.ok(evidenceDrilldown!.chips.some((chip) => chip.includes('%')));
  });

  it('cycles focused agents deterministically for keyboard navigation', () => {
    const warRoom = makeWarRoom();
    const visibleAgents = filterWarRoomAgentsByView(warRoom, 'overview');
    const first = cycleWarRoomFocusAgent(visibleAgents, null, 1);
    const second = cycleWarRoomFocusAgent(visibleAgents, first, 1);
    const back = cycleWarRoomFocusAgent(visibleAgents, second, -1);

    assert.equal(first, visibleAgents[0]!.id);
    assert.equal(back, first);
  });
});
