import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getScenarios, type ScenarioEngineState } from '../src/ai/scenario-engine.ts';
import { buildScenarioGraph, simulateScenarioWar } from '../src/ai/scenario-graph.ts';
import { renderScenarioConflictGraph } from '../src/components/scenario-graph-view.ts';
import { createPointMapContext } from '../src/platform/operations/map-context.ts';

function makeState(): ScenarioEngineState {
  const mapContext = createPointMapContext('scenario-graph-map', {
    lat: 26.56,
    lon: 56.25,
    countryCode: 'IR',
    countryName: 'ایران',
    label: 'تنگه هرمز',
  }, {
    activeLayers: ['gdelt', 'polymarket', 'ais', 'military', 'sanctions'],
    nearbySignals: [
      { id: 'sig-1', label: 'اختلال تردد نفتکش‌ها', kind: 'shipping', severity: 'high', occurredAt: '2026-03-17T09:10:00.000Z' },
      { id: 'sig-2', label: 'افزایش posture نظامی', kind: 'military', severity: 'high', occurredAt: '2026-03-17T09:20:00.000Z' },
    ],
    geopoliticalContext: ['بازار انرژی و توازن بازدارندگی به این کانون حساس است.'],
    selectedEntities: ['ایران', 'خلیج فارس', 'تنگه هرمز'],
    dataFreshness: { overallStatus: 'sufficient', coveragePercent: 82 },
  });

  const state = getScenarios({
    trigger: 'اگر در تنگه هرمز اختلال راهبردی رخ دهد',
    query: 'اگر در تنگه هرمز اختلال راهبردی رخ دهد',
    mapContext,
    localContextPackets: [
      {
        id: 'pkt-1',
        title: 'GDELT maritime escalation',
        summary: 'shipping and military signals rise',
        content: 'shipping military escalation blockade',
        sourceLabel: 'GDELT',
        sourceType: 'api',
        updatedAt: '2026-03-17T09:15:00.000Z',
        score: 0.72,
        tags: ['gdelt'],
        provenance: { sourceIds: ['src-1'], evidenceIds: ['ev-1'] },
      },
    ],
  });

  state.scenarios = [
    {
      ...state.scenarios[0]!,
      id: 'oil-export-shock',
      title: 'توقف صادرات نفت و شوک انرژی',
      description: 'اختلال دریایی و blockade محدود، صادرات را متوقف و شوک انرژی و بیمه حمل را فعال می‌کند.',
      probability_score: 0.67,
      impact_score: 0.82,
      confidence_score: 0.7,
      uncertainty_level: 'medium',
      time_horizon: 'ساعت‌ها تا چند روز',
      drivers: ['اختلال صادرات', 'ریسک بیمه حمل', 'فشار بازار انرژی'],
      indicators_to_watch: ['بیمه حمل', 'تردد نفتکش‌ها', 'قیمت نفت'],
      second_order_effects: ['سرایت به بازارهای جهانی انرژی'],
      cross_domain_impacts: {
        economics: ['شوک قیمت انرژی'],
        infrastructure: ['اختلال در کریدور دریایی'],
        geopolitics: ['فشار بازدارندگی منطقه‌ای'],
      },
      trend_direction: 'up',
    },
    {
      ...state.scenarios[1]!,
      id: 'regional-military-escalation',
      title: 'تشدید امنیتی و نظامی منطقه‌ای',
      description: 'افزایش posture نظامی و واکنش متقابل، خطر برخورد و محدودیت تردد را بالا می‌برد.',
      probability_score: 0.62,
      impact_score: 0.79,
      confidence_score: 0.66,
      uncertainty_level: 'medium',
      time_horizon: 'چند روز',
      drivers: ['افزایش posture نظامی', 'کاهش کانال deconfliction', 'فشار رسانه‌ای'],
      indicators_to_watch: ['جابجایی نیرو', 'هشدارهای دریایی', 'سطح آماده‌باش'],
      second_order_effects: ['سرریز به بنادر و حمل‌ونقل هوایی'],
      cross_domain_impacts: {
        geopolitics: ['افزایش اصطکاک منطقه‌ای'],
        infrastructure: ['اختلال در کریدورهای حمل'],
        public_sentiment: ['افزایش اضطراب اجتماعی'],
      },
      trend_direction: 'up',
    },
    {
      ...state.scenarios[2]!,
      id: 'diplomatic-de-escalation',
      title: 'مهار دیپلماتیک و کاهش تنش',
      description: 'فعال شدن backchannel و پیام‌رسانی هماهنگ می‌تواند از تشدید نظامی و اختلال طولانی جلوگیری کند.',
      probability_score: 0.41,
      impact_score: 0.48,
      confidence_score: 0.61,
      uncertainty_level: 'medium',
      time_horizon: 'چند روز تا یک هفته',
      drivers: ['فعال شدن backchannel', 'فشار بین‌المللی', 'مدیریت روایت رسمی'],
      indicators_to_watch: ['پیام‌های رسمی', 'میانجی‌گری', 'کاهش هشدارها'],
      second_order_effects: ['کاهش شوک بازار و بازگشایی مسیرها'],
      cross_domain_impacts: {
        geopolitics: ['کاهش اصطکاک'],
        economics: ['تثبیت قیمت انرژی'],
        public_sentiment: ['افت اضطراب عمومی'],
      },
      trend_direction: 'flat',
    },
    {
      ...state.scenarios[3]!,
      id: 'infrastructure-cascade',
      title: 'سرایت به زیرساخت و زنجیره تامین',
      description: 'اگر اختلال ادامه یابد، بنادر، بیمه، ذخیره‌سازی و زنجیره تامین منطقه‌ای تحت فشار cascade قرار می‌گیرند.',
      probability_score: 0.54,
      impact_score: 0.73,
      confidence_score: 0.58,
      uncertainty_level: 'medium',
      time_horizon: 'چند روز تا چند هفته',
      drivers: ['اختلال صادرات', 'تاخیر بندری', 'گلوگاه‌های لجستیکی'],
      indicators_to_watch: ['تاخیر بندری', 'ظرفیت ذخیره‌سازی', 'ترافیک جاده‌ای'],
      second_order_effects: ['سرایت به قیمت کالا و حمل‌ونقل'],
      cross_domain_impacts: {
        infrastructure: ['فشار بر بنادر و انبارش'],
        economics: ['هزینه بالاتر واردات و صادرات'],
        public_sentiment: ['فشار بر مصرف‌کننده'],
      },
      trend_direction: 'up',
    },
    {
      ...state.scenarios[4]!,
      id: 'cyber-financial-black-swan',
      title: 'شوک سایبری-مالی کم‌احتمال',
      description: 'یک رویداد سایبری یا telecom shutdown هم‌زمان می‌تواند picture بحران را از انرژی به collapse مالی-دیجیتال منتقل کند.',
      probability_score: 0.24,
      impact_score: 0.91,
      confidence_score: 0.34,
      uncertainty_level: 'high',
      time_horizon: 'ساعت‌ها تا چند روز',
      drivers: ['آسیب‌پذیری مخابرات', 'وابستگی به سیستم‌های پرداخت', 'شکاف داده'],
      indicators_to_watch: ['telecom outage', 'اختلال پرداخت', 'نشانه‌های regime shift'],
      second_order_effects: ['شوک اعتماد عمومی و توقف موقت خدمات'],
      cross_domain_impacts: {
        cyber: ['اختلال خدمات دیجیتال'],
        economics: ['ریسک بازار و پرداخت'],
        public_sentiment: ['وحشت و شایعه'],
      },
      trend_direction: 'up',
    },
  ];
  state.signals = [
    {
      id: 'sig-ship',
      source: 'gdelt',
      label: 'Shipping disruption rises',
      summary: 'shipping insurance and military warnings rise',
      strength: 0.82,
      polarity: 'escalatory',
      domainWeights: { economics: 0.82, infrastructure: 0.78, geopolitics: 0.72 },
      occurredAt: '2026-03-17T09:30:00.000Z',
    },
    {
      id: 'sig-mil',
      source: 'osint',
      label: 'Military alerts increase',
      summary: 'regional military posture increases near Hormuz',
      strength: 0.76,
      polarity: 'escalatory',
      domainWeights: { geopolitics: 0.9, infrastructure: 0.52 },
      occurredAt: '2026-03-17T09:32:00.000Z',
    },
    {
      id: 'sig-dip',
      source: 'news-cluster',
      label: 'Diplomatic mediation emerges',
      summary: 'backchannel and mediation attempts appear',
      strength: 0.46,
      polarity: 'stabilizing',
      domainWeights: { geopolitics: 0.66, public_sentiment: 0.38 },
      occurredAt: '2026-03-17T09:34:00.000Z',
    },
    {
      id: 'sig-cyber',
      source: 'social-sentiment',
      label: 'Telecom outage rumors',
      summary: 'telecom shutdown and payment disruption rumors spread',
      strength: 0.58,
      polarity: 'neutral',
      domainWeights: { cyber: 0.92, economics: 0.42, public_sentiment: 0.5 },
      occurredAt: '2026-03-17T09:35:00.000Z',
    },
  ];
  state.signalFusion = {
    signalCount: state.signals.length,
    sourceDiversity: 0.82,
    agreement: 0.43,
    anomalyScore: 0.72,
    trendShift: true,
    dominantPolarity: 'mixed',
    sourceBreakdown: {
      gdelt: 1,
      osint: 1,
      'news-cluster': 1,
      'social-sentiment': 1,
    },
  };
  return state;
}

describe('ScenarioGraph', () => {
  it('builds a conflict graph with clusters, unstable regions, and black swan outliers', () => {
    const state = makeState();
    const graph = buildScenarioGraph(state);

    assert.equal(graph.nodes.length, 5);
    assert.ok(graph.edges.length >= 4);
    assert.ok(graph.centralScenarioIds.includes('oil-export-shock') || graph.centralScenarioIds.includes('regional-military-escalation'));
    assert.ok(graph.fragileScenarioIds.length >= 1);
    assert.ok(graph.dominantClusters.length >= 1);
    assert.ok(graph.unstableRegions.length >= 1);
    assert.ok(graph.blackSwanOutliers.some((item) => item.scenarioId === 'cyber-financial-black-swan'));
    assert.match(graph.narrativeExplanation, /battlefield|خوشه|black swan/i);
  });

  it('simulates scenario wars and redistributes plausibility after new signals', () => {
    const state = makeState();
    const graph = buildScenarioGraph(state);
    const war = simulateScenarioWar(graph, state.signals);
    const total = Object.values(war.updatedProbabilityRedistribution).reduce((sum, value) => sum + value, 0);

    assert.ok(war.battlefieldState.length === graph.nodes.length);
    assert.ok(Math.abs(total - 1) < 0.05);
    assert.ok(war.shifts.length >= 3);
    assert.ok(war.transfers.length >= 1);
    assert.match(war.narrative, /battlefield|جذب|تضعیف|بازتوزیع/);
  });

  it('renders an interactive graph panel with node controls and black swan cards', () => {
    const state = makeState();
    const graph = buildScenarioGraph(state);
    const war = simulateScenarioWar(graph, state.signals);
    const html = renderScenarioConflictGraph({
      graph,
      war,
      selectedScenarioId: war.battlefieldState[0]?.scenarioId ?? null,
    });

    assert.match(html, /scenario-conflict-stage/);
    assert.match(html, /data-action="select-graph-node"/);
    assert.match(html, /Scenario Battlefield/);
    assert.match(html, /Black Swan Outliers/);
  });
});
