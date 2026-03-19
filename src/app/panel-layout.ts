import type { AppContext, AppModule } from '@/app/app-context';
import { replayPendingCalls, clearAllPendingCalls, enqueuePanelCall } from '@/app/pending-panel-data';
import type { MapLayers, RelatedAsset } from '@/types';
import type { TheaterPostureSummary } from '@/services/military-surge';
import {
  MapContainer,
  NewsPanel,
  MarketPanel,
  StockAnalysisPanel,
  StockBacktestPanel,
  HeatmapPanel,
  CommoditiesPanel,
  CryptoPanel,
  PredictionPanel,
  MonitorPanel,
  EconomicPanel,
  GdeltIntelPanel,
  LiveNewsPanel,
  LiveWebcamsPanel,
  CIIPanel,
  NRCPanel,
  NRCAnalyticsPanel,
  CSRCPanel,
  CascadePanel,
  StrategicRiskPanel,
  StrategicPosturePanel,
  TechEventsPanel,
  ServiceStatusPanel,
  RuntimeConfigPanel,
  InsightsPanel,
  MacroSignalsPanel,
  ETFFlowsPanel,
  StablecoinPanel,
  UcdpEventsPanel,
  InvestmentsPanel,
  TradePolicyPanel,
  SupplyChainPanel,
  GulfEconomiesPanel,
  WorldClockPanel,
  AirlineIntelPanel,
  AviationCommandBar,
  PersianStrategicPanel,
  NarrativeAnalysisPanel,
  CognitiveWarfarePanel,
  MapAnalysisPanel,
  ScenarioPlannerPanel,
  StrategicForesightPanel,
  WarRoomPanel,
  BlackSwanPanel,
} from '@/components';
import { SatelliteFiresPanel } from '@/components/SatelliteFiresPanel';
import { DarkwebDefensivePanel } from '@/components/DarkwebDefensivePanel';
import { InfraTrafficCyberPanel } from '@/components/InfraTrafficCyberPanel';
import { IranMediaMatrixPanel } from '@/components/IranMediaMatrixPanel';
import { MaritimeTrafficPanel } from '@/components/MaritimeTrafficPanel';
import { MediaPipelinesPanel } from '@/components/MediaPipelinesPanel';
import { PremiumBenchmarkPanel } from '@/components/PremiumBenchmarkPanel';
import { QadrAssistantPanel } from '@/components/QadrAssistantPanel';
import { ReleaseNotesPanel } from '@/components/ReleaseNotesPanel';
import { OpsAuditPanel } from '@/components/OpsAuditPanel';
import { RegionalSlicesPanel } from '@/components/RegionalSlicesPanel';
import { QadrMonitoringHubPanel } from '@/components/QadrMonitoringHubPanel';
import { focusInvestmentOnMap } from '@/services/investments-focus';
import { debounce, saveToStorage, loadFromStorage } from '@/utils';
import { escapeHtml } from '@/utils/sanitize';
import {
  FEEDS,
  INTEL_SOURCES,
  DEFAULT_PANELS,
  STORAGE_KEYS,
  SITE_VARIANT,
} from '@/config';
import { BETA_MODE } from '@/config/beta';
import { t } from '@/services/i18n';
import { getCurrentTheme } from '@/utils';
import { trackCriticalBannerAction } from '@/services/analytics';
import { getSecretState } from '@/services/runtime-config';

export interface PanelLayoutCallbacks {
  openCountryStory: (code: string, name: string) => void;
  openCountryBrief: (code: string) => void;
  loadAllData: () => Promise<void>;
  updateMonitorResults: () => void;
  loadSecurityAdvisories?: () => Promise<void>;
}

type AnalysisNavPanelCall = {
  panelId: string;
  method: string;
  args?: unknown[];
};

type AnalysisNavAction = {
  id: string;
  label: string;
  panelId: string;
  layers?: Array<keyof MapLayers>;
  panelCalls?: AnalysisNavPanelCall[];
};

type WorkbenchSheet = 'reports' | 'timeline' | 'notebook';
type WorkbenchMode = 'analysis' | 'scenario' | 'war-room' | 'foresight';

type WorkbenchPanelRestore = {
  panelId: string;
  parentId: string;
  nextSiblingPanelId: string | null;
};

type WorkbenchModeAction = {
  id: WorkbenchMode;
  label: string;
  kicker: string;
  description: string;
  panelId: string;
};

type WorkbenchSpecialPage = {
  id: string;
  label: string;
  kicker: string;
  description: string;
  panelId: string;
  mode: WorkbenchMode;
  sheet: WorkbenchSheet;
  icon: string;
  href?: string;
};

const ANALYSIS_NAV_ACTIONS: AnalysisNavAction[] = [
  { id: 'media', label: 'رسانه', panelId: 'iran-media-matrix', panelCalls: [{ panelId: 'iran-media-matrix', method: 'applyQuickFilter', args: [''] }] },
  { id: 'pipelines', label: 'Pipeline', panelId: 'media-pipelines', panelCalls: [{ panelId: 'media-pipelines', method: 'applyPlatformFilter', args: ['all'] }] },
  { id: 'telegram', label: 'Telegram', panelId: 'telegram-intel' },
  { id: 'instagram', label: 'Instagram', panelId: 'media-pipelines', panelCalls: [{ panelId: 'media-pipelines', method: 'applyPlatformFilter', args: ['instagram'] }] },
  { id: 'x', label: 'X', panelId: 'media-pipelines', panelCalls: [{ panelId: 'media-pipelines', method: 'applyPlatformFilter', args: ['x'] }] },
  { id: 'aparat', label: 'Aparat', panelId: 'iran-media-matrix', panelCalls: [{ panelId: 'iran-media-matrix', method: 'applyQuickFilter', args: ['Aparat'] }] },
  { id: 'telewebion', label: 'Telewebion', panelId: 'iran-media-matrix', panelCalls: [{ panelId: 'iran-media-matrix', method: 'applyQuickFilter', args: ['Telewebion'] }] },
  { id: 'gdelt', label: 'GDELT', panelId: 'gdelt-intel' },
  { id: 'cognitive', label: 'شناختی', panelId: 'cognitive-warfare', panelCalls: [{ panelId: 'cognitive-warfare', method: 'setView', args: ['graph'] }] },
  { id: 'netblocks', label: 'NetBlocks', panelId: 'infra-traffic-cyber', panelCalls: [{ panelId: 'infra-traffic-cyber', method: 'focusStream', args: ['netblocks'] }] },
  { id: 'google-trends', label: 'GoogleTrends', panelId: 'infra-traffic-cyber', panelCalls: [{ panelId: 'infra-traffic-cyber', method: 'focusStream', args: ['trends'] }] },
  { id: 'traffic', label: 'ترافیک', panelId: 'infra-traffic-cyber', layers: ['roadTraffic', 'flights', 'ais', 'waterways'] },
  { id: 'air-traffic', label: 'هوایی', panelId: 'airline-intel', layers: ['flights'] },
  { id: 'maritime-traffic', label: 'دریایی', panelId: 'maritime-traffic', layers: ['ais', 'waterways', 'military'] },
  { id: 'cyber', label: 'سایبر', panelId: 'darkweb-defensive', layers: ['cyberThreats'] },
  { id: 'ixp', label: 'IXP', panelId: 'infra-traffic-cyber', layers: ['outages', 'datacenters'] },
  { id: 'dss', label: 'DSS', panelId: 'media-pipelines' },
  { id: 'ess', label: 'ESS', panelId: 'media-pipelines' },
];

const WORKBENCH_MODES: WorkbenchModeAction[] = [
  { id: 'analysis', label: 'تحلیل', kicker: 'A', description: 'مرکز تحلیل و شواهد زنده', panelId: 'qadr-monitoring-hub' },
  { id: 'scenario', label: 'سناریو', kicker: 'S', description: 'سناریونویسی، graph و timeline', panelId: 'scenario-planner' },
  { id: 'war-room', label: 'War Room', kicker: 'W', description: 'مناظره چندعاملی و battlefield', panelId: 'war-room' },
  { id: 'foresight', label: 'پیش‌نگری', kicker: 'F', description: 'سنتز foresight و board view', panelId: 'strategic-foresight' },
];

const WORKBENCH_SPECIAL_PAGES: WorkbenchSpecialPage[] = [
  {
    id: 'overview',
    label: 'نمای کلان',
    kicker: 'HQ',
    description: 'مانیتورینگ هاب، جمع‌بندی و ورود سریع به پرونده‌ها',
    panelId: 'qadr-monitoring-hub',
    mode: 'analysis',
    sheet: 'reports',
    icon: '◈',
  },
  {
    id: 'assistant',
    label: 'دستیار',
    kicker: 'AI',
    description: 'چت، evidence card و handoff بین تحلیل و نقشه',
    panelId: 'qadr-assistant',
    mode: 'analysis',
    sheet: 'reports',
    icon: '✦',
  },
  {
    id: 'map-analysis',
    label: 'تحلیل نقشه',
    kicker: 'MAP',
    description: 'تحلیل مکان‌محور، drill-down و promptهای جغرافیایی',
    panelId: 'map-analysis',
    mode: 'analysis',
    sheet: 'reports',
    icon: '⌖',
  },
  {
    id: 'cognitive',
    label: 'شناختی',
    kicker: 'COG',
    description: 'روایت‌ها، کمپین‌ها و ریسک‌های شناختی/رسانه‌ای',
    panelId: 'cognitive-warfare',
    mode: 'analysis',
    sheet: 'reports',
    icon: '☍',
  },
  {
    id: 'scenario-lab',
    label: 'آزمایشگاه سناریو',
    kicker: 'SIM',
    description: 'مدل‌سازی If/Then، causal chain و branching futures',
    panelId: 'scenario-planner',
    mode: 'scenario',
    sheet: 'timeline',
    icon: '⟁',
  },
  {
    id: 'black-swan',
    label: 'بلک سوان',
    kicker: 'BS',
    description: 'فرضیه‌های کم‌احتمال/پراثر، watchpoint و stress test',
    panelId: 'black-swan-watch',
    mode: 'scenario',
    sheet: 'notebook',
    icon: '⚠',
  },
  {
    id: 'war-room',
    label: 'War Room',
    kicker: 'WR',
    description: 'مناظره چندعاملی، conflict heatmap و synthesis',
    panelId: 'war-room',
    mode: 'war-room',
    sheet: 'timeline',
    icon: '⚖',
  },
  {
    id: 'foresight',
    label: 'پیش‌نگری',
    kicker: 'FX',
    description: 'ترکیب scenario، meta-scenario، black swan و debate',
    panelId: 'strategic-foresight',
    mode: 'foresight',
    sheet: 'reports',
    icon: '◇',
  },
  {
    id: 'predict',
    label: 'QADRPredict',
    kicker: 'QDP',
    description: 'کارگاه فارسی شبیه سازی، گزارش سازی و تعامل سناریویی QADR',
    panelId: 'strategic-foresight',
    mode: 'foresight',
    sheet: 'reports',
    icon: '◌',
    href: '/predict/',
  },
  {
    id: 'audit',
    label: 'ممیزی عملیات',
    kicker: 'LOG',
    description: 'audit trail، سلامت اجزا و رهگیری تصمیم‌ها',
    panelId: 'ops-audit',
    mode: 'analysis',
    sheet: 'notebook',
    icon: '⊕',
  },
];

const MAP_VIEW_LABELS: Record<string, string> = {
  global: 'جهانی',
  america: 'آمریکا',
  mena: 'خاورمیانه',
  eu: 'اروپا',
  asia: 'آسیا',
  latam: 'آمریکای لاتین',
  africa: 'آفریقا',
  oceania: 'اقیانوسیه',
};

export class PanelLayoutManager implements AppModule {
  private ctx: AppContext;
  private callbacks: PanelLayoutCallbacks;
  private panelDragCleanupHandlers: Array<() => void> = [];
  private workbenchCleanupHandlers: Array<() => void> = [];
  private resolvedPanelOrder: string[] = [];
  private bottomSetMemory: Set<string> = new Set();
  private criticalBannerEl: HTMLElement | null = null;
  private aviationCommandBar: AviationCommandBar | null = null;
  private readonly applyTimeRangeFilterDebounced: (() => void) & { cancel(): void };
  private readonly handleWindowResize = (): void => {
    this.ensureCorrectZones();
    this.updateWorkbenchChrome();
  };
  private activeSheet: WorkbenchSheet = 'reports';
  private selectedPanelId: string | null = null;
  private compareSelection: string[] = [];
  private focusRestore: WorkbenchPanelRestore | null = null;
  private compareRestore: WorkbenchPanelRestore[] = [];
  private countryBriefState: { visible: boolean; maximized: boolean; code: string | null; name: string | null } = {
    visible: false,
    maximized: false,
    code: null,
    name: null,
  };

  constructor(ctx: AppContext, callbacks: PanelLayoutCallbacks) {
    this.ctx = ctx;
    this.callbacks = callbacks;
    this.applyTimeRangeFilterDebounced = debounce(() => {
      this.applyTimeRangeFilterToNewsPanels();
    }, 120);
  }

  init(): void {
    this.renderLayout();
  }

  destroy(): void {
    clearAllPendingCalls();
    this.applyTimeRangeFilterDebounced.cancel();
    this.panelDragCleanupHandlers.forEach((cleanup) => cleanup());
    this.panelDragCleanupHandlers = [];
    this.workbenchCleanupHandlers.forEach((cleanup) => cleanup());
    this.workbenchCleanupHandlers = [];
    this.closeFocusMode();
    this.closeCompareMode();
    if (this.criticalBannerEl) {
      this.criticalBannerEl.remove();
      this.criticalBannerEl = null;
    }
    // Clean up happy variant panels
    this.ctx.tvMode?.destroy();
    this.ctx.tvMode = null;
    this.ctx.countersPanel?.destroy();
    this.ctx.progressPanel?.destroy();
    this.ctx.breakthroughsPanel?.destroy();
    this.ctx.heroPanel?.destroy();
    this.ctx.digestPanel?.destroy();
    this.ctx.speciesPanel?.destroy();
    this.ctx.renewablePanel?.destroy();

    // Clean up aviation components
    this.aviationCommandBar?.destroy();
    this.aviationCommandBar = null;
    this.ctx.panels['airline-intel']?.destroy();

    window.removeEventListener('resize', this.handleWindowResize);
  }

  renderLayout(): void {
    this.ctx.container.innerHTML = `
      ${this.ctx.isDesktopApp ? '<div class="tauri-titlebar" data-tauri-drag-region></div>' : ''}
      <div class="header">
        <div class="header-left">
          <button class="hamburger-btn" id="hamburgerBtn" aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div class="variant-switcher">${(() => {
        const local = this.ctx.isDesktopApp || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        const vHref = (v: string, prod: string) => local || SITE_VARIANT === v ? '#' : prod;
        const vTarget = (_v: string) => '';
        return `
            <a href="${vHref('full', 'https://qadr.alefba.dev')}"
               class="variant-option ${SITE_VARIANT === 'full' ? 'active' : ''}"
               data-variant="full"
               ${vTarget('full')}
               title="${t('header.world')}${SITE_VARIANT === 'full' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">🌍</span>
              <span class="variant-label">${t('header.world')}</span>
            </a>
            <span class="variant-divider"></span>
            <a href="${vHref('tech', 'https://qadr.alefba.dev')}"
               class="variant-option ${SITE_VARIANT === 'tech' ? 'active' : ''}"
               data-variant="tech"
               ${vTarget('tech')}
               title="${t('header.tech')}${SITE_VARIANT === 'tech' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">💻</span>
              <span class="variant-label">${t('header.tech')}</span>
            </a>
            <span class="variant-divider"></span>
            <a href="${vHref('finance', 'https://qadr.alefba.dev')}"
               class="variant-option ${SITE_VARIANT === 'finance' ? 'active' : ''}"
               data-variant="finance"
               ${vTarget('finance')}
               title="${t('header.finance')}${SITE_VARIANT === 'finance' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">📈</span>
              <span class="variant-label">${t('header.finance')}</span>
            </a>
            <span class="variant-divider"></span>
            <a href="${vHref('commodity', 'https://qadr.alefba.dev')}"
               class="variant-option ${SITE_VARIANT === 'commodity' ? 'active' : ''}"
               data-variant="commodity"
               ${vTarget('commodity')}
               title="${t('header.commodity')}${SITE_VARIANT === 'commodity' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">⛏️</span>
              <span class="variant-label">${t('header.commodity')}</span>
            </a>
            <span class="variant-divider"></span>
            <a href="${vHref('happy', 'https://qadr.alefba.dev')}"
               class="variant-option ${SITE_VARIANT === 'happy' ? 'active' : ''}"
               data-variant="happy"
               ${vTarget('happy')}
               title="Good News${SITE_VARIANT === 'happy' ? ` ${t('common.currentVariant')}` : ''}">
              <span class="variant-icon">☀️</span>
              <span class="variant-label">Good News</span>
            </a>`;
      })()}</div>
          <span class="logo">QADR110</span><span class="logo-mobile">QADR110</span><span class="version">v${__APP_VERSION__}</span>${BETA_MODE ? '<span class="beta-badge">BETA</span>' : ''}
          <a href="https://x.com/danialsamiei" target="_blank" rel="noopener" class="credit-link">
            <svg class="x-logo" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            <span class="credit-text">@danialsamiei</span>
          </a>
          <a href="https://github.com/danialsamiei/qadr110" target="_blank" rel="noopener" class="github-link" title="${t('header.viewOnGitHub')}">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          </a>
          <button class="mobile-settings-btn" id="mobileSettingsBtn" title="${t('header.settings')}">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
          <div class="status-indicator">
            <span class="status-dot"></span>
            <span>${t('header.live')}</span>
          </div>
          <div class="region-selector">
            <select id="regionSelect" class="region-select">
              <option value="global">${t('components.deckgl.views.global')}</option>
              <option value="america">${t('components.deckgl.views.americas')}</option>
              <option value="mena">${t('components.deckgl.views.mena')}</option>
              <option value="eu">${t('components.deckgl.views.europe')}</option>
              <option value="asia">${t('components.deckgl.views.asia')}</option>
              <option value="latam">${t('components.deckgl.views.latam')}</option>
              <option value="africa">${t('components.deckgl.views.africa')}</option>
              <option value="oceania">${t('components.deckgl.views.oceania')}</option>
            </select>
          </div>
          <button class="mobile-search-btn" id="mobileSearchBtn" aria-label="${t('header.search')}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
        <div class="header-right">
          <button class="search-btn" id="searchBtn"><kbd>⌘K</kbd> ${t('header.search')}</button>
          ${this.ctx.isDesktopApp ? '' : `<button class="copy-link-btn" id="copyLinkBtn">${t('header.copyLink')}</button>`}
          ${this.ctx.isDesktopApp ? '' : `<button class="fullscreen-btn" id="fullscreenBtn" title="${t('header.fullscreen')}">⛶</button>`}
          ${SITE_VARIANT === 'happy' ? `<button class="tv-mode-btn" id="tvModeBtn" title="TV Mode (Shift+T)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></button>` : ''}
          <span id="unifiedSettingsMount"></span>
        </div>
      </div>
      <div class="mobile-menu-overlay" id="mobileMenuOverlay"></div>
      <nav class="mobile-menu" id="mobileMenu">
        <div class="mobile-menu-header">
          <span class="mobile-menu-title">QADR110</span>
          <button class="mobile-menu-close" id="mobileMenuClose" aria-label="Close menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="mobile-menu-divider"></div>
        ${(() => {
        const variants = [
          { key: 'full', icon: '🌍', label: t('header.world') },
          { key: 'tech', icon: '💻', label: t('header.tech') },
          { key: 'finance', icon: '📈', label: t('header.finance') },
          { key: 'commodity', icon: '⛏️', label: t('header.commodity') },
          { key: 'happy', icon: '☀️', label: 'Good News' },
        ];
        return variants.map(v =>
          `<button class="mobile-menu-item mobile-menu-variant ${v.key === SITE_VARIANT ? 'active' : ''}" data-variant="${v.key}">
            <span class="mobile-menu-item-icon">${v.icon}</span>
            <span class="mobile-menu-item-label">${v.label}</span>
            ${v.key === SITE_VARIANT ? '<span class="mobile-menu-check">✓</span>' : ''}
          </button>`
        ).join('');
      })()}
        <div class="mobile-menu-divider"></div>
        <button class="mobile-menu-item" id="mobileMenuRegion">
          <span class="mobile-menu-item-icon">🌐</span>
          <span class="mobile-menu-item-label">${t('components.deckgl.views.global')}</span>
          <span class="mobile-menu-chevron">▸</span>
        </button>
        <div class="mobile-menu-divider"></div>
        <button class="mobile-menu-item" id="mobileMenuSettings">
          <span class="mobile-menu-item-icon">⚙️</span>
          <span class="mobile-menu-item-label">${t('header.settings')}</span>
        </button>
        <button class="mobile-menu-item" id="mobileMenuTheme">
          <span class="mobile-menu-item-icon">${getCurrentTheme() === 'dark' ? '☀️' : '🌙'}</span>
          <span class="mobile-menu-item-label">${getCurrentTheme() === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <a class="mobile-menu-item" href="https://x.com/danialsamiei" target="_blank" rel="noopener">
          <span class="mobile-menu-item-icon"><svg class="x-logo" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></span>
          <span class="mobile-menu-item-label">@danialsamiei</span>
        </a>
        <div class="mobile-menu-divider"></div>
        <div class="mobile-menu-version">v${__APP_VERSION__}</div>
      </nav>
      <div class="region-sheet-backdrop" id="regionSheetBackdrop"></div>
      <div class="region-bottom-sheet" id="regionBottomSheet">
        <div class="region-sheet-header">${t('header.selectRegion')}</div>
        <div class="region-sheet-divider"></div>
        ${[
        { value: 'global', label: t('components.deckgl.views.global') },
        { value: 'america', label: t('components.deckgl.views.americas') },
        { value: 'mena', label: t('components.deckgl.views.mena') },
        { value: 'eu', label: t('components.deckgl.views.europe') },
        { value: 'asia', label: t('components.deckgl.views.asia') },
        { value: 'latam', label: t('components.deckgl.views.latam') },
        { value: 'africa', label: t('components.deckgl.views.africa') },
        { value: 'oceania', label: t('components.deckgl.views.oceania') },
      ].map(r =>
        `<button class="region-sheet-option ${r.value === 'global' ? 'active' : ''}" data-region="${r.value}">
          <span>${r.label}</span>
          <span class="region-sheet-check">${r.value === 'global' ? '✓' : ''}</span>
        </button>`
      ).join('')}
      </div>
      <div class="qadr-workbench-shell" id="qadrWorkbenchShell">
        ${this.renderCommandRail()}
        <div class="qadr-workbench-main">
          ${this.renderWorkbenchTopbar()}
          <div class="qadr-workbench-stage">
            <div class="qadr-workbench-canvas">
              <div class="main-content">
                <div class="map-section" id="mapSection">
                  <div class="panel-header">
                    <div class="panel-header-left">
                      <span class="panel-title">${SITE_VARIANT === 'tech' ? t('panels.techMap') : SITE_VARIANT === 'happy' ? 'Good News Map' : t('panels.map')}</span>
                    </div>
                    <span class="header-clock" id="headerClock" translate="no"></span>
                    <div class="map-header-actions">
                      <div class="map-dimension-toggle" id="mapDimensionToggle">
                        <button class="map-dim-btn${loadFromStorage<string>(STORAGE_KEYS.mapMode, 'flat') === 'globe' ? '' : ' active'}" data-mode="flat" title="2D Map">2D</button>
                        <button class="map-dim-btn${loadFromStorage<string>(STORAGE_KEYS.mapMode, 'flat') === 'globe' ? ' active' : ''}" data-mode="globe" title="3D Globe">3D</button>
                      </div>
                      <button class="map-pin-btn" id="mapFullscreenBtn" title="Fullscreen">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
                      </button>
                      <button class="map-pin-btn" id="mapPinBtn" title="${t('header.pinMap')}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M12 17v5M9 10.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24V16a1 1 0 001 1h12a1 1 0 001-1v-.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V7a1 1 0 011-1 1 1 0 001-1V4a1 1 0 00-1-1H8a1 1 0 00-1 1v1a1 1 0 001 1 1 1 0 011 1v3.76z"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div class="map-container" id="mapContainer"></div>
                  ${SITE_VARIANT === 'happy' ? '<button class="tv-exit-btn" id="tvExitBtn">Exit TV Mode</button>' : ''}
                  <div class="map-resize-handle" id="mapResizeHandle"></div>
                </div>
                <div class="qadr-report-sheet-stack" id="qadrReportSheetStack">
                  <section class="qadr-sheet active" id="qadrSheetReports" data-sheet="reports" role="tabpanel" aria-labelledby="qadrSheetTabReports">
                    <div class="panels-grid" id="panelsGrid"></div>
                  </section>
                  <section class="qadr-sheet" id="qadrSheetTimeline" data-sheet="timeline" role="tabpanel" aria-labelledby="qadrSheetTabTimeline" hidden>
                    <div class="map-bottom-grid" id="mapBottomGrid"></div>
                  </section>
                  <section class="qadr-sheet" id="qadrSheetNotebook" data-sheet="notebook" role="tabpanel" aria-labelledby="qadrSheetTabNotebook" hidden>
                    <div class="qadr-workbench-notebook" id="qadrWorkbenchNotebook"></div>
                  </section>
                </div>
                <button class="search-mobile-fab" id="searchMobileFab" aria-label="Search">\u{1F50D}</button>
              </div>
            </div>
            ${this.renderEvidenceDrawer()}
          </div>
        </div>
      </div>
      ${this.renderPanelOverlays()}
      <footer class="site-footer">
        <div class="site-footer-brand">
          <img src="/branding/qadr-logo.svg" alt="" width="28" height="28" class="site-footer-icon" />
          <div class="site-footer-brand-text">
            <span class="site-footer-name">QADR110</span>
            <span class="site-footer-sub">BY ADMIN@DANIAL.AI</span>
          </div>
        </div>
        <nav>
          <span>admin@danial.ai</span>
        </nav>
        <span class="site-footer-copy">&copy; ${new Date().getFullYear()} QADR110</span>
      </footer>
    `;

    this.createPanels();
    this.setupAnalysisNav();
    this.setupWorkbenchShell();

    if (this.ctx.isMobile) {
      this.setupMobileMapToggle();
    }
  }

  private renderCommandRail(): string {
    return `
      <aside class="qadr-command-rail" aria-label="فرمان‌های تحلیلی">
        <div class="qadr-command-rail-header">
          <span class="qadr-command-rail-kicker">میز تحلیل</span>
          <button
            class="qadr-command-rail-palette"
            type="button"
            id="workbenchCommandPaletteBtn"
            aria-keyshortcuts="Control+K Meta+K"
          >
            <span>پالت فرمان</span>
            <kbd>⌘K</kbd>
          </button>
        </div>
        <div class="qadr-command-rail-scroll">
          <section class="qadr-command-rail-section">
            <div class="qadr-command-rail-section-label">حالت‌ها</div>
            <div class="qadr-command-rail-actions qadr-command-rail-mode-grid">
              ${WORKBENCH_MODES.map((mode) => `
                <button
                  class="qadr-command-rail-chip qadr-command-rail-mode"
                  type="button"
                  data-workbench-action="set-mode"
                  data-workbench-mode="${mode.id}"
                  data-panel-target="${mode.panelId}"
                  title="${mode.description}"
                >
                  <span class="qadr-command-rail-chip-kicker">${mode.kicker}</span>
                  <span class="qadr-command-rail-chip-label">${mode.label}</span>
                </button>
              `).join('')}
            </div>
          </section>
          <section class="qadr-command-rail-section">
            <div class="qadr-command-rail-section-label">صفحات ویژه</div>
            <div class="qadr-command-rail-pages">
              ${WORKBENCH_SPECIAL_PAGES.map((page) => `
                <button
                  class="qadr-command-rail-page"
                  type="button"
                  data-workbench-action="open-page"
                  data-workbench-page="${page.id}"
                  data-panel-target="${page.panelId}"
                  title="${page.description}"
                >
                  <span class="qadr-command-rail-page-icon" aria-hidden="true">${page.icon}</span>
                  <span class="qadr-command-rail-page-label">${page.label}</span>
                  <span class="qadr-command-rail-page-kicker">${page.kicker}</span>
                </button>
              `).join('')}
            </div>
          </section>
          <section class="qadr-command-rail-section">
            <div class="qadr-command-rail-section-label">فرمان‌های میدانی</div>
            <div class="qadr-command-rail-actions">
              ${ANALYSIS_NAV_ACTIONS.map((item) => `
                <button
                  class="analysis-nav-chip qadr-command-rail-chip"
                  type="button"
                  data-analysis-action="${item.id}"
                  data-panel-target="${item.panelId}"
                  title="${item.label}"
                >
                  <span class="qadr-command-rail-chip-label">${item.label}</span>
                </button>
              `).join('')}
            </div>
          </section>
          <section class="qadr-command-rail-section qadr-command-rail-section-compact">
            <div class="qadr-command-rail-section-label">میانبرها</div>
            <div class="qadr-command-rail-hints">
              <span><kbd>Alt+A</kbd> تحلیل</span>
              <span><kbd>Alt+S</kbd> سناریو</span>
              <span><kbd>Alt+W</kbd> War Room</span>
              <span><kbd>Alt+F</kbd> پیش‌نگری</span>
            </div>
          </section>
        </div>
        <div class="qadr-command-rail-footer">
          <button class="qadr-rail-utility" type="button" data-workbench-action="focus">تمرکز</button>
          <button class="qadr-rail-utility" type="button" data-workbench-action="compare">مقایسه</button>
          <button class="qadr-rail-utility" type="button" data-workbench-action="assistant">دستیار</button>
        </div>
      </aside>
    `;
  }

  private renderWorkbenchTopbar(): string {
    return `
      <div class="qadr-workbench-topbar">
        <div class="qadr-workbench-topbar-main">
          <div class="qadr-workbench-breadcrumbs" id="qadrWorkbenchBreadcrumbs" aria-label="مسیر تحلیل"></div>
          <div class="qadr-workbench-meta-grid" aria-label="برد راهبردی">
            <article class="qadr-workbench-meta-card">
              <span class="qadr-workbench-meta-label">سناریو</span>
              <strong id="qadrWorkbenchMetaScenario">کارگاه تحلیلی</strong>
              <small id="qadrWorkbenchMetaScenarioDetail">بدون گزارش فعال</small>
            </article>
            <article class="qadr-workbench-meta-card">
              <span class="qadr-workbench-meta-label">منطقه</span>
              <strong id="qadrWorkbenchMetaRegion">جهانی</strong>
              <small id="qadrWorkbenchMetaRegionDetail">دید نقشه و زوم جاری</small>
            </article>
            <article class="qadr-workbench-meta-card">
              <span class="qadr-workbench-meta-label">افق زمانی</span>
              <strong id="qadrWorkbenchMetaHorizon">۷ روز اخیر</strong>
              <small id="qadrWorkbenchMetaHorizonDetail">وضعیت لایه‌ها</small>
            </article>
            <article class="qadr-workbench-meta-card">
              <span class="qadr-workbench-meta-label">Mode</span>
              <strong id="qadrWorkbenchMetaMode">تحلیل</strong>
              <small id="qadrWorkbenchMetaModeDetail">مرکز تحلیل و شواهد زنده</small>
            </article>
          </div>
        </div>
        <div class="qadr-workbench-toolbar">
          <div class="qadr-workbench-toolbar-stack">
            <div class="qadr-workbench-mode-switch" role="tablist" aria-label="حالت‌های کارگاه">
              ${WORKBENCH_MODES.map((mode) => `
                <button
                  class="qadr-workbench-mode-btn"
                  type="button"
                  role="tab"
                  data-workbench-action="set-mode"
                  data-workbench-mode="${mode.id}"
                  aria-selected="false"
                >
                  ${mode.label}
                </button>
              `).join('')}
            </div>
            <div class="qadr-workbench-page-strip-wrap">
              <div class="qadr-workbench-page-strip-label">صفحات ویژه</div>
              <div class="qadr-workbench-page-strip" role="navigation" aria-label="صفحات ویژه">
                ${WORKBENCH_SPECIAL_PAGES.map((page) => `
                  <button
                    class="qadr-workbench-page-btn"
                    type="button"
                    data-workbench-action="open-page"
                    data-workbench-page="${page.id}"
                    data-panel-target="${page.panelId}"
                    title="${page.description}"
                  >
                    <span class="qadr-workbench-page-icon" aria-hidden="true">${page.icon}</span>
                    <span class="qadr-workbench-page-meta">
                      <strong>${page.label}</strong>
                      <small>${page.description}</small>
                    </span>
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
          <div class="qadr-workbench-tabs" id="qadrWorkbenchSheetTabs" role="tablist" aria-label="sheet tabs">
            <button class="qadr-workbench-tab active" id="qadrSheetTabReports" type="button" role="tab" aria-selected="true" aria-controls="qadrSheetReports" data-workbench-sheet="reports">پرونده‌ها</button>
            <button class="qadr-workbench-tab" id="qadrSheetTabTimeline" type="button" role="tab" aria-selected="false" aria-controls="qadrSheetTimeline" data-workbench-sheet="timeline">خط زمان</button>
            <button class="qadr-workbench-tab" id="qadrSheetTabNotebook" type="button" role="tab" aria-selected="false" aria-controls="qadrSheetNotebook" data-workbench-sheet="notebook">دفتر تحلیل</button>
          </div>
          <div class="qadr-workbench-toolbar-actions">
            <button class="qadr-workbench-action" type="button" id="workbenchSearchBtn" data-workbench-open-search="true">فرمان</button>
            <button class="qadr-workbench-action" type="button" data-workbench-action="focus">حالت تمرکز</button>
            <button class="qadr-workbench-action" type="button" data-workbench-action="compare">حالت مقایسه</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderEvidenceDrawer(): string {
    return `
      <aside class="qadr-evidence-drawer" id="qadrEvidenceDrawer" aria-label="بازرس شواهد">
        <div class="qadr-evidence-drawer-header">
          <div>
            <div class="qadr-evidence-kicker">Evidence Stack</div>
            <h2>پنل‌های اطلاعاتی</h2>
            <p class="qadr-evidence-caption">شواهد، watchpoint و handoffهای لایه چپ</p>
          </div>
          <button class="qadr-evidence-collapse" type="button" data-workbench-action="toggle-inspector" aria-expanded="true">◀</button>
        </div>
        <div class="qadr-evidence-drawer-body" id="qadrEvidenceDrawerBody"></div>
      </aside>
    `;
  }

  private renderPanelOverlays(): string {
    return `
      <div class="qadr-panel-overlay" id="qadrFocusOverlay" hidden>
        <div class="qadr-panel-overlay-shell" role="dialog" aria-modal="true" aria-labelledby="qadrFocusOverlayTitle">
          <div class="qadr-panel-overlay-header">
            <div>
              <div class="qadr-panel-overlay-kicker">تمرکز</div>
              <h2 id="qadrFocusOverlayTitle">گزارش فعال</h2>
            </div>
            <button class="qadr-panel-overlay-close" type="button" data-workbench-action="close-focus" aria-label="بستن">×</button>
          </div>
          <div class="qadr-panel-overlay-body qadr-panel-overlay-body-single" id="qadrFocusOverlayBody"></div>
        </div>
      </div>
      <div class="qadr-panel-overlay qadr-panel-overlay-compare" id="qadrCompareOverlay" hidden>
        <div class="qadr-panel-overlay-shell" role="dialog" aria-modal="true" aria-labelledby="qadrCompareOverlayTitle">
          <div class="qadr-panel-overlay-header">
            <div>
              <div class="qadr-panel-overlay-kicker">مقایسه</div>
              <h2 id="qadrCompareOverlayTitle">دو نمای تحلیلی</h2>
            </div>
            <button class="qadr-panel-overlay-close" type="button" data-workbench-action="close-compare" aria-label="بستن">×</button>
          </div>
          <div class="qadr-panel-overlay-body qadr-panel-overlay-body-compare">
            <div class="qadr-compare-pane" id="qadrComparePaneA"></div>
            <div class="qadr-compare-pane" id="qadrComparePaneB"></div>
          </div>
        </div>
      </div>
    `;
  }

  private setupMobileMapToggle(): void {
    const mapSection = document.getElementById('mapSection');
    const headerLeft = mapSection?.querySelector('.panel-header-left');
    if (!mapSection || !headerLeft) return;

    const stored = localStorage.getItem('mobile-map-collapsed');
    const collapsed = stored === 'true';
    if (collapsed) mapSection.classList.add('collapsed');

    const updateBtn = (btn: HTMLButtonElement, isCollapsed: boolean) => {
      btn.textContent = isCollapsed ? `▶ ${t('components.map.showMap')}` : `▼ ${t('components.map.hideMap')}`;
    };

    const btn = document.createElement('button');
    btn.className = 'map-collapse-btn';
    updateBtn(btn, collapsed);
    headerLeft.after(btn);

    btn.addEventListener('click', () => {
      const isCollapsed = mapSection.classList.toggle('collapsed');
      updateBtn(btn, isCollapsed);
      localStorage.setItem('mobile-map-collapsed', String(isCollapsed));
      if (!isCollapsed) window.dispatchEvent(new Event('resize'));
    });
  }

  public bindCountryBriefState(): void {
    this.syncCountryBriefState();
    this.ctx.countryBriefPage?.onStateChange?.(() => {
      this.syncCountryBriefState();
    });
  }

  private syncCountryBriefState(): void {
    const page = this.ctx.countryBriefPage;
    this.countryBriefState = {
      visible: page?.isVisible?.() ?? false,
      maximized: page?.getIsMaximized?.() ?? false,
      code: page?.getCode?.() ?? null,
      name: page?.getName?.() ?? null,
    };
    this.updateWorkbenchChrome();
  }

  private setupWorkbenchShell(): void {
    const openSearch = () => {
      this.ctx.searchModal?.open();
    };
    const searchLaunchers = Array.from(this.ctx.container.querySelectorAll<HTMLElement>('[data-workbench-open-search], #workbenchCommandPaletteBtn'));
    searchLaunchers.forEach((button) => {
      button.addEventListener('click', openSearch);
      this.workbenchCleanupHandlers.push(() => button.removeEventListener('click', openSearch));
    });

    const sheetTabs = Array.from(this.ctx.container.querySelectorAll<HTMLButtonElement>('[data-workbench-sheet]'));
    sheetTabs.forEach((tab) => {
      const onClick = () => {
        const sheet = tab.dataset.workbenchSheet as WorkbenchSheet | undefined;
        if (sheet) this.setActiveSheet(sheet);
      };
      tab.addEventListener('click', onClick);
      this.workbenchCleanupHandlers.push(() => tab.removeEventListener('click', onClick));
    });

    const delegatedClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const actionButton = target.closest<HTMLElement>('[data-workbench-action]');
      if (actionButton?.dataset.workbenchAction) {
        this.handleWorkbenchAction(actionButton.dataset.workbenchAction, actionButton);
        return;
      }

      const breadcrumb = target.closest<HTMLElement>('[data-breadcrumb-action]');
      if (breadcrumb?.dataset.breadcrumbAction) {
        const action = breadcrumb.dataset.breadcrumbAction;
        if (action === 'map') {
          this.focusPanel('map');
        } else if (action === 'page') {
          const pageId = breadcrumb.dataset.breadcrumbPage;
          if (pageId) this.openWorkbenchPage(pageId);
        } else if (action === 'report') {
          this.setActiveSheet('notebook');
          if (this.ctx.countryBriefPage?.maximize && this.countryBriefState.visible) {
            this.ctx.countryBriefPage.maximize();
          }
        } else if (action === 'panel') {
          const panelId = breadcrumb.dataset.breadcrumbPanel;
          if (panelId) this.focusPanel(panelId);
        } else if (action === 'sheet') {
          const sheet = breadcrumb.dataset.breadcrumbSheet as WorkbenchSheet | undefined;
          if (sheet) this.setActiveSheet(sheet);
        }
        return;
      }

      const panelEl = target.closest<HTMLElement>('.panel[data-panel]');
      if (panelEl?.dataset.panel) {
        this.selectPanelForWorkbench(panelEl.dataset.panel);
      }
    };
    this.ctx.container.addEventListener('click', delegatedClick);
    this.workbenchCleanupHandlers.push(() => this.ctx.container.removeEventListener('click', delegatedClick));

    const focusInHandler = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      const panelEl = target?.closest<HTMLElement>('.panel[data-panel]');
      if (panelEl?.dataset.panel) {
        this.selectPanelForWorkbench(panelEl.dataset.panel, { syncSheet: false });
      }
    };
    this.ctx.container.addEventListener('focusin', focusInHandler);
    this.workbenchCleanupHandlers.push(() => this.ctx.container.removeEventListener('focusin', focusInHandler));

    const overlayBackdropHandler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.id === 'qadrFocusOverlay') {
        this.closeFocusMode();
      } else if (target?.id === 'qadrCompareOverlay') {
        this.closeCompareMode();
      }
    };
    this.ctx.container.addEventListener('mousedown', overlayBackdropHandler);
    this.workbenchCleanupHandlers.push(() => this.ctx.container.removeEventListener('mousedown', overlayBackdropHandler));

    const keydownHandler = (event: KeyboardEvent) => {
      if (this.isTextEntryTarget(event.target)) return;
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        this.handleWorkbenchAction('focus');
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        this.handleWorkbenchAction('compare');
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        this.handleWorkbenchAction('toggle-inspector');
        return;
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        const key = event.key.toLowerCase();
        const mode = key === 'a'
          ? 'analysis'
          : key === 's'
            ? 'scenario'
            : key === 'w'
              ? 'war-room'
              : key === 'f'
                ? 'foresight'
                : null;
        if (mode) {
          event.preventDefault();
          this.activateWorkbenchMode(mode);
          return;
        }
      }
      if (event.altKey && ['1', '2', '3'].includes(event.key)) {
        event.preventDefault();
        const sheet = event.key === '1' ? 'reports' : event.key === '2' ? 'timeline' : 'notebook';
        this.setActiveSheet(sheet);
        return;
      }
      if (event.key === 'Escape') {
        if (this.closeCompareMode()) return;
        if (this.closeFocusMode()) return;
      }
    };
    document.addEventListener('keydown', keydownHandler);
    this.workbenchCleanupHandlers.push(() => document.removeEventListener('keydown', keydownHandler));

    const preferredSelection = ['qadr-assistant', 'qadr-monitoring-hub', 'insights', 'live-news']
      .find((panelId) => this.ctx.panels[panelId]?.getElement());
    if (preferredSelection) {
      this.selectPanelForWorkbench(preferredSelection, { syncSheet: false });
    }
    this.updateWorkbenchChrome();
  }

  private handleWorkbenchAction(action: string, source?: HTMLElement): void {
    switch (action) {
      case 'focus':
        this.toggleFocusMode();
        break;
      case 'compare':
        this.openCompareMode();
        break;
      case 'assistant':
        this.focusPanel('qadr-assistant');
        break;
      case 'open-page': {
        const pageId = source?.dataset.workbenchPage;
        if (pageId) this.openWorkbenchPage(pageId);
        break;
      }
      case 'toggle-inspector':
        this.toggleInspectorCollapsed();
        break;
      case 'toggle-compare-candidate':
        this.toggleCompareSelection();
        break;
      case 'close-focus':
        this.closeFocusMode();
        break;
      case 'close-compare':
        this.closeCompareMode();
        break;
      case 'set-mode': {
        const mode = source?.dataset.workbenchMode as WorkbenchMode | undefined;
        if (mode) this.activateWorkbenchMode(mode);
        break;
      }
    }
  }

  private isTextEntryTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    return !!element?.closest('input, textarea, select, [contenteditable="true"]');
  }

  private setActiveSheet(sheet: WorkbenchSheet): void {
    this.activeSheet = sheet;
    this.updateWorkbenchChrome();
  }

  private getSheetLabel(sheet: WorkbenchSheet): string {
    switch (sheet) {
      case 'timeline':
        return 'خط زمان';
      case 'notebook':
        return 'دفتر تحلیل';
      case 'reports':
      default:
        return 'پرونده‌ها';
    }
  }

  private resolveSheetForPanel(panelId: string): WorkbenchSheet | null {
    const panelEl = this.getPanelElement(panelId);
    if (!panelEl) return null;
    if (panelEl.closest('#mapBottomGrid')) return 'timeline';
    if (panelEl.closest('#panelsGrid')) return 'reports';
    return null;
  }

  private selectPanelForWorkbench(panelId: string | null, options: { syncSheet?: boolean } = {}): void {
    const previousSelected = this.selectedPanelId ? this.getPanelElement(this.selectedPanelId) : null;
    previousSelected?.classList.remove('qadr-workbench-selected');

    if (!panelId || !this.getPanelElement(panelId)) {
      this.selectedPanelId = null;
      this.updateWorkbenchChrome();
      return;
    }

    this.selectedPanelId = panelId;
    const nextSelected = this.getPanelElement(panelId);
    nextSelected?.classList.add('qadr-workbench-selected');

    if (options.syncSheet !== false) {
      const owningSheet = this.resolveSheetForPanel(panelId);
      if (owningSheet) {
        this.activeSheet = owningSheet;
      }
    }

    this.updateWorkbenchChrome();
  }

  private updateWorkbenchChrome(): void {
    this.ensureOverlayIntegrity();
    this.updateSheetState();
    this.updateBreadcrumbs();
    this.updateTopbarMeta();
    this.updateInspector();
    this.updateNotebook();
    this.updateRailSelection();
  }

  private updateSheetState(): void {
    const sheetButtons = Array.from(this.ctx.container.querySelectorAll<HTMLElement>('[data-workbench-sheet]'));
    sheetButtons.forEach((button) => {
      const isActive = button.dataset.workbenchSheet === this.activeSheet;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    const sheets = Array.from(this.ctx.container.querySelectorAll<HTMLElement>('.qadr-sheet[data-sheet]'));
    sheets.forEach((sheet) => {
      const isActive = sheet.dataset.sheet === this.activeSheet;
      sheet.classList.toggle('active', isActive);
      sheet.hidden = !isActive;
    });
  }

  private updateBreadcrumbs(): void {
    const breadcrumbsEl = document.getElementById('qadrWorkbenchBreadcrumbs');
    if (!breadcrumbsEl) return;

    const parts: string[] = [];
    const activePage = this.getActiveWorkbenchPage();
    parts.push(`
      <button class="qadr-breadcrumb" type="button" data-breadcrumb-action="map">کارگاه تحلیلی</button>
    `);
    if (activePage) {
      parts.push(`
        <button class="qadr-breadcrumb" type="button" data-breadcrumb-action="page" data-breadcrumb-page="${activePage.id}">${escapeHtml(activePage.label)}</button>
      `);
    }
    parts.push(`
      <button class="qadr-breadcrumb" type="button" data-breadcrumb-action="sheet" data-breadcrumb-sheet="${this.activeSheet}">${this.getSheetLabel(this.activeSheet)}</button>
    `);

    const selectedTitle = this.getSelectedPanelTitle();
    if (selectedTitle && this.selectedPanelId) {
      parts.push(`
        <button class="qadr-breadcrumb current" type="button" data-breadcrumb-action="panel" data-breadcrumb-panel="${this.selectedPanelId}">${escapeHtml(selectedTitle)}</button>
      `);
    }

    if (this.countryBriefState.visible) {
      const label = this.countryBriefState.name
        ? `گزارش ${escapeHtml(this.countryBriefState.name)}`
        : 'گزارش کشوری';
      parts.push(`
        <button class="qadr-breadcrumb current" type="button" data-breadcrumb-action="report">${label}</button>
      `);
    }

    breadcrumbsEl.innerHTML = parts.join('<span class="qadr-breadcrumb-sep">/</span>');
  }

  private updateTopbarMeta(): void {
    const mode = this.getWorkbenchMode();
    const modeMeta = WORKBENCH_MODES.find((item) => item.id === mode) ?? WORKBENCH_MODES[0]!;
    const selectedTitle = this.getSelectedPanelTitle();
    const mapState = this.ctx.map?.getState();
    const activeLayers = Object.values(this.ctx.mapLayers).filter(Boolean).length;
    const scenarioLabel = this.getWorkbenchScenarioLabel();
    const scenarioDetail = this.countryBriefState.visible
      ? `گزارش تو در تو: ${this.countryBriefState.name ?? this.countryBriefState.code ?? 'کشور'}`
      : selectedTitle
        ? `محور فعلی: ${selectedTitle}`
        : 'محور فعلی هنوز انتخاب نشده است';
    const regionLabel = this.getWorkbenchRegionLabel();
    const regionDetail = mapState
      ? `${this.localizeMapView(mapState.view)} · زوم ${mapState.zoom.toFixed(1)}`
      : 'نقشه هنوز آماده نیست';
    const horizonDetail = `${activeLayers} لایه فعال${this.compareSelection.length ? ` · ${this.compareSelection.length}/2 در صف مقایسه` : ''}`;

    const textMap: Record<string, string> = {
      qadrWorkbenchMetaScenario: scenarioLabel,
      qadrWorkbenchMetaScenarioDetail: scenarioDetail,
      qadrWorkbenchMetaRegion: regionLabel,
      qadrWorkbenchMetaRegionDetail: regionDetail,
      qadrWorkbenchMetaHorizon: this.getTimeRangeLabel(),
      qadrWorkbenchMetaHorizonDetail: horizonDetail,
      qadrWorkbenchMetaMode: modeMeta.label,
      qadrWorkbenchMetaModeDetail: modeMeta.description,
    };

    Object.entries(textMap).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });

    const modeButtons = Array.from(this.ctx.container.querySelectorAll<HTMLElement>('.qadr-workbench-mode-btn[data-workbench-mode]'));
    modeButtons.forEach((button) => {
      const isActive = button.dataset.workbenchMode === mode;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  }

  private updateInspector(): void {
    const body = document.getElementById('qadrEvidenceDrawerBody');
    const drawer = document.getElementById('qadrEvidenceDrawer');
    if (!body || !drawer) return;

    const selectedTitle = this.getSelectedPanelTitle();
    const activeMode = WORKBENCH_MODES.find((item) => item.id === this.getWorkbenchMode()) ?? WORKBENCH_MODES[0]!;
    const regionLabel = this.getWorkbenchRegionLabel();
    const activeLayers = Object.entries(this.ctx.mapLayers)
      .filter(([, enabled]) => enabled)
      .map(([layer]) => layer)
      .slice(0, 8);
    const compareTitles = this.compareSelection
      .map((panelId) => ({ panelId, title: this.getPanelTitle(panelId) }))
      .filter((item): item is { panelId: string; title: string } => !!item.title);

    drawer.classList.toggle('has-selection', !!selectedTitle);
    body.innerHTML = `
      <section class="qadr-inspector-card">
        <div class="qadr-inspector-kicker">تمرکز جاری</div>
        <h3>${selectedTitle ? escapeHtml(selectedTitle) : 'نقشه و جریان‌های تحلیلی'}</h3>
        <p>
          ${selectedTitle
            ? `این پنل در نمای «${this.getSheetLabel(this.activeSheet)}» و حالت «${activeMode.label}» به‌عنوان نقطه کانونی انتخاب شده است.`
            : 'یک پنل، گزارش یا لایه را انتخاب کنید تا شواهد، مسیر تحلیل، handoff و controlهای سریع اینجا جمع شود.'}
        </p>
        <div class="qadr-inspector-actions">
          <button class="qadr-inline-action" type="button" data-workbench-action="focus">تمرکز</button>
          <button class="qadr-inline-action" type="button" data-workbench-action="toggle-compare-candidate">${this.selectedPanelId && this.compareSelection.includes(this.selectedPanelId) ? 'حذف از مقایسه' : 'افزودن به مقایسه'}</button>
          <button class="qadr-inline-action" type="button" data-workbench-action="assistant">باز کردن دستیار</button>
        </div>
      </section>
      <section class="qadr-inspector-grid">
        <article class="qadr-mini-card">
          <span class="qadr-mini-card-label">Mode</span>
          <strong>${escapeHtml(activeMode.label)}</strong>
        </article>
        <article class="qadr-mini-card">
          <span class="qadr-mini-card-label">Region</span>
          <strong>${escapeHtml(regionLabel)}</strong>
        </article>
        <article class="qadr-mini-card">
          <span class="qadr-mini-card-label">بازه زمانی</span>
          <strong>${escapeHtml(this.getTimeRangeLabel())}</strong>
        </article>
        <article class="qadr-mini-card">
          <span class="qadr-mini-card-label">لایه‌های فعال</span>
          <strong>${activeLayers.length}</strong>
        </article>
        <article class="qadr-mini-card">
          <span class="qadr-mini-card-label">صف مقایسه</span>
          <strong>${compareTitles.length}/2</strong>
        </article>
        <article class="qadr-mini-card">
          <span class="qadr-mini-card-label">گزارش تو در تو</span>
          <strong>${this.countryBriefState.visible ? (this.countryBriefState.maximized ? 'باز و متمرکز' : 'باز') : 'غیرفعال'}</strong>
        </article>
      </section>
      <section class="qadr-inspector-card">
        <div class="qadr-inspector-kicker">شواهد نقشه</div>
        <ul class="qadr-bullet-list">
          ${activeLayers.length
            ? activeLayers.map((layer) => `<li>${escapeHtml(this.localizeLayerName(layer as keyof MapLayers))}</li>`).join('')
            : '<li>در حال حاضر لایه فعالی برای مرور سریع انتخاب نشده است.</li>'}
        </ul>
      </section>
      <section class="qadr-inspector-card">
        <div class="qadr-inspector-kicker">مقایسه و drill-down</div>
        <ul class="qadr-bullet-list">
          ${compareTitles.length
            ? compareTitles.map((item) => `<li>${escapeHtml(item.title)}</li>`).join('')
            : '<li>دو پنل یا گزارش را انتخاب کنید تا compare mode فعال شود.</li>'}
          ${this.countryBriefState.visible
            ? `<li>گزارش فعال: ${escapeHtml(this.countryBriefState.name ?? this.countryBriefState.code ?? 'کشور')}</li>`
            : '<li>در حال حاضر گزارش nested فعال نیست.</li>'}
        </ul>
      </section>
      <section class="qadr-inspector-card">
        <div class="qadr-inspector-kicker">صفحات ویژه</div>
        <div class="qadr-page-chip-grid">
          ${this.renderInlinePageButtons()}
        </div>
      </section>
    `;
  }

  private updateNotebook(): void {
    const notebook = document.getElementById('qadrWorkbenchNotebook');
    if (!notebook) return;

    const selectedTitle = this.getSelectedPanelTitle();
    const compareTitles = this.compareSelection
      .map((panelId) => this.getPanelTitle(panelId))
      .filter((title): title is string => !!title);
    const reportLabel = this.countryBriefState.visible
      ? (this.countryBriefState.name ?? this.countryBriefState.code ?? 'گزارش کشوری')
      : 'بدون گزارش باز';

    notebook.innerHTML = `
      <article class="qadr-notebook-card">
        <span class="qadr-notebook-kicker">یادداشت تحلیلی</span>
        <h3>${selectedTitle ? escapeHtml(selectedTitle) : 'نمای انتخاب نشده'}</h3>
        <p>این شیت برای جمع‌کردن تحلیل‌های nested، خلاصه‌های context و handoff بین پنل‌ها، نقشه و گزارش‌های کشوری طراحی شده است.</p>
      </article>
      <article class="qadr-notebook-card">
        <span class="qadr-notebook-kicker">زمینه فعال</span>
        <ul class="qadr-bullet-list">
          <li>شیت جاری: ${this.getSheetLabel(this.activeSheet)}</li>
          <li>بازه زمانی: ${escapeHtml(this.getTimeRangeLabel())}</li>
          <li>گزارش باز: ${escapeHtml(reportLabel)}</li>
        </ul>
      </article>
      <article class="qadr-notebook-card">
        <span class="qadr-notebook-kicker">صف مقایسه</span>
        <ul class="qadr-bullet-list">
          ${compareTitles.length
            ? compareTitles.map((title) => `<li>${escapeHtml(title)}</li>`).join('')
            : '<li>هنوز موردی برای compare mode انتخاب نشده است.</li>'}
        </ul>
      </article>
      <article class="qadr-notebook-card">
        <span class="qadr-notebook-kicker">اقدام بعدی</span>
        <div class="qadr-inspector-actions">
          <button class="qadr-inline-action" type="button" data-workbench-action="focus">تمرکز روی نمای فعال</button>
          <button class="qadr-inline-action" type="button" data-workbench-action="compare">باز کردن compare mode</button>
          <button class="qadr-inline-action" type="button" data-workbench-action="assistant">ارسال به دستیار</button>
        </div>
      </article>
      <article class="qadr-notebook-card">
        <span class="qadr-notebook-kicker">صفحات ویژه</span>
        <div class="qadr-page-chip-grid">
          ${this.renderInlinePageButtons()}
        </div>
      </article>
    `;
  }

  private updateRailSelection(): void {
    const actionButtons = Array.from(this.ctx.container.querySelectorAll<HTMLElement>('[data-analysis-action]'));
    actionButtons.forEach((button) => {
      const isActive = button.dataset.panelTarget === this.selectedPanelId;
      button.classList.toggle('active', isActive);
    });

    const activeMode = this.getWorkbenchMode();
    const modeButtons = Array.from(this.ctx.container.querySelectorAll<HTMLElement>('[data-workbench-mode]'));
    modeButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.workbenchMode === activeMode);
    });

    const activePage = this.getActiveWorkbenchPage();
    const pageButtons = Array.from(this.ctx.container.querySelectorAll<HTMLElement>('[data-workbench-page]'));
    pageButtons.forEach((button) => {
      const isActive = button.dataset.workbenchPage === activePage?.id;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
  }

  private getPanelElement(panelId: string): HTMLElement | null {
    return this.ctx.panels[panelId]?.getElement() ?? this.ctx.container.querySelector<HTMLElement>(`[data-panel="${CSS.escape(panelId)}"]`);
  }

  private getPanelTitle(panelId: string): string | null {
    const panelEl = this.getPanelElement(panelId);
    return panelEl?.querySelector<HTMLElement>('.panel-title')?.textContent?.trim() ?? null;
  }

  private getSelectedPanelTitle(): string | null {
    return this.selectedPanelId ? this.getPanelTitle(this.selectedPanelId) : null;
  }

  private getWorkbenchMode(): WorkbenchMode {
    const panelId = this.selectedPanelId;
    if (panelId === 'strategic-foresight') return 'foresight';
    if (panelId === 'war-room') return 'war-room';
    if (panelId === 'scenario-planner' || panelId === 'black-swan-watch') return 'scenario';
    if (this.countryBriefState.visible) return 'scenario';
    return 'analysis';
  }

  private getWorkbenchScenarioLabel(): string {
    if (this.countryBriefState.visible) {
      return this.countryBriefState.name
        ? `گزارش ${this.countryBriefState.name}`
        : 'گزارش کشوری';
    }
    if (this.selectedPanelId === 'war-room') return 'نبرد سناریوها';
    if (this.selectedPanelId === 'strategic-foresight') return 'سنتز پیش‌نگر';
    if (this.selectedPanelId === 'scenario-planner') return 'گراف و timeline';
    return this.getSelectedPanelTitle() ?? 'کارگاه تحلیلی';
  }

  private getWorkbenchRegionLabel(): string {
    if (this.countryBriefState.name) return this.countryBriefState.name;
    return this.localizeMapView(this.ctx.map?.getState().view);
  }

  private localizeMapView(view?: string | null): string {
    if (!view) return 'جهانی';
    return MAP_VIEW_LABELS[view] ?? view;
  }

  private localizeLayerName(layer: keyof MapLayers): string {
    const key = `components.deckgl.layers.${layer}`;
    const localized = t(key);
    return localized === key ? layer.replace(/([A-Z])/g, ' $1') : localized;
  }

  private activateWorkbenchMode(mode: WorkbenchMode): void {
    const target = WORKBENCH_MODES.find((item) => item.id === mode);
    if (!target) return;
    this.setActiveSheet('reports');
    this.focusPanel(target.panelId);
  }

  private openWorkbenchPage(pageId: string): void {
    const page = WORKBENCH_SPECIAL_PAGES.find((item) => item.id === pageId);
    if (!page) return;
    if (page.href) {
      window.location.assign(page.href);
      return;
    }
    this.setActiveSheet(page.sheet);
    this.focusPanel(page.panelId);
  }

  private getActiveWorkbenchPage(): WorkbenchSpecialPage | null {
    if (this.selectedPanelId) {
      const exact = WORKBENCH_SPECIAL_PAGES.find((page) => page.panelId === this.selectedPanelId);
      if (exact) return exact;
    }

    if (this.countryBriefState.visible) {
      return WORKBENCH_SPECIAL_PAGES.find((page) => page.id === 'scenario-lab') ?? null;
    }

    const activeMode = this.getWorkbenchMode();
    return WORKBENCH_SPECIAL_PAGES.find((page) => page.mode === activeMode) ?? null;
  }

  private renderInlinePageButtons(): string {
    return WORKBENCH_SPECIAL_PAGES.map((page) => `
      <button
        class="qadr-page-inline-chip"
        type="button"
        data-workbench-action="open-page"
        data-workbench-page="${page.id}"
        data-panel-target="${page.panelId}"
        title="${page.description}"
      >
        <span class="qadr-page-inline-icon" aria-hidden="true">${page.icon}</span>
        <span class="qadr-page-inline-meta">
          <strong>${escapeHtml(page.label)}</strong>
          <small>${escapeHtml(page.description)}</small>
        </span>
      </button>
    `).join('');
  }

  private toggleInspectorCollapsed(): void {
    const drawer = document.getElementById('qadrEvidenceDrawer');
    const button = this.ctx.container.querySelector<HTMLElement>('[data-workbench-action="toggle-inspector"]');
    if (!drawer || !button) return;
    const collapsed = drawer.classList.toggle('collapsed');
    button.textContent = collapsed ? '▶' : '◀';
    button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }

  private toggleCompareSelection(panelId = this.selectedPanelId): void {
    if (!panelId) return;
    const existingIndex = this.compareSelection.indexOf(panelId);
    if (existingIndex !== -1) {
      this.compareSelection.splice(existingIndex, 1);
    } else {
      this.compareSelection = [...this.compareSelection.slice(-1), panelId];
    }
    this.updateWorkbenchChrome();
  }

  private toggleFocusMode(): void {
    if (this.closeFocusMode()) return;
    if (!this.selectedPanelId) {
      if (this.countryBriefState.visible) {
        if (this.countryBriefState.maximized) {
          this.ctx.countryBriefPage?.minimize?.();
        } else {
          this.ctx.countryBriefPage?.maximize?.();
        }
        this.syncCountryBriefState();
      }
      return;
    }

    const panelEl = this.getPanelElement(this.selectedPanelId);
    const overlay = document.getElementById('qadrFocusOverlay');
    const body = document.getElementById('qadrFocusOverlayBody');
    const title = document.getElementById('qadrFocusOverlayTitle');
    if (!panelEl || !overlay || !body || !title) return;

    this.closeCompareMode();
    this.focusRestore = this.capturePanelRestore(panelEl, this.selectedPanelId);
    body.replaceChildren(panelEl);
    title.textContent = this.getPanelTitle(this.selectedPanelId) ?? 'گزارش فعال';
    overlay.hidden = false;
    overlay.classList.add('active');
    document.body.classList.add('qadr-focus-open');
    this.updateWorkbenchChrome();
  }

  private closeFocusMode(): boolean {
    const overlay = document.getElementById('qadrFocusOverlay');
    const restore = this.focusRestore;
    if (!overlay || !restore) return false;
    this.restorePanelLocation(restore);
    overlay.hidden = true;
    overlay.classList.remove('active');
    this.focusRestore = null;
    document.body.classList.remove('qadr-focus-open');
    this.updateWorkbenchChrome();
    return true;
  }

  private openCompareMode(): void {
    if (this.closeCompareMode()) return;
    if (this.selectedPanelId && !this.compareSelection.includes(this.selectedPanelId)) {
      this.compareSelection = [...this.compareSelection.slice(-1), this.selectedPanelId];
    }
    const uniquePanels = Array.from(new Set(this.compareSelection)).filter((panelId) => !!this.getPanelElement(panelId)).slice(0, 2);
    if (uniquePanels.length < 2) {
      this.compareSelection = uniquePanels;
      this.updateWorkbenchChrome();
      return;
    }

    const overlay = document.getElementById('qadrCompareOverlay');
    const paneA = document.getElementById('qadrComparePaneA');
    const paneB = document.getElementById('qadrComparePaneB');
    const title = document.getElementById('qadrCompareOverlayTitle');
    if (!overlay || !paneA || !paneB || !title) return;

    this.closeFocusMode();
    this.compareRestore = uniquePanels
      .map((panelId) => {
        const panelEl = this.getPanelElement(panelId);
        if (!panelEl) return null;
        return this.capturePanelRestore(panelEl, panelId);
      })
      .filter((restore): restore is WorkbenchPanelRestore => !!restore);

    const [panelA, panelB] = uniquePanels.map((panelId) => this.getPanelElement(panelId));
    if (!panelA || !panelB || this.compareRestore.length !== 2) return;

    paneA.replaceChildren(panelA);
    paneB.replaceChildren(panelB);
    title.textContent = `${this.getPanelTitle(uniquePanels[0]!) ?? 'گزارش اول'} در برابر ${this.getPanelTitle(uniquePanels[1]!) ?? 'گزارش دوم'}`;
    overlay.hidden = false;
    overlay.classList.add('active');
    document.body.classList.add('qadr-compare-open');
    this.compareSelection = uniquePanels;
    this.updateWorkbenchChrome();
  }

  private closeCompareMode(): boolean {
    const overlay = document.getElementById('qadrCompareOverlay');
    if (!overlay) return false;
    if (this.compareRestore.length > 0) {
      this.compareRestore.forEach((restore) => this.restorePanelLocation(restore));
      this.compareRestore = [];
    }
    overlay.hidden = true;
    overlay.classList.remove('active');
    document.body.classList.remove('qadr-compare-open');
    this.updateWorkbenchChrome();
    return true;
  }

  private ensureOverlayIntegrity(): void {
    const overlay = document.getElementById('qadrCompareOverlay');
    if (!overlay || overlay.hidden) return;

    const paneA = document.getElementById('qadrComparePaneA');
    const paneB = document.getElementById('qadrComparePaneB');
    const hasBothPanels = Boolean(
      paneA?.querySelector('.panel[data-panel]') &&
      paneB?.querySelector('.panel[data-panel]')
    );

    if (hasBothPanels) return;

    overlay.hidden = true;
    overlay.classList.remove('active');
    document.body.classList.remove('qadr-compare-open');
    if (this.compareRestore.length > 0) {
      this.compareRestore.forEach((restore) => this.restorePanelLocation(restore));
    }
    this.compareRestore = [];
    this.compareSelection = [];
  }

  private capturePanelRestore(panelEl: HTMLElement, panelId: string): WorkbenchPanelRestore | null {
    const parent = panelEl.parentElement as HTMLElement | null;
    if (!parent?.id) return null;
    const nextSibling = panelEl.nextElementSibling as HTMLElement | null;
    return {
      panelId,
      parentId: parent.id,
      nextSiblingPanelId: nextSibling?.dataset.panel ?? null,
    };
  }

  private restorePanelLocation(restore: WorkbenchPanelRestore): void {
    const panelEl = this.getPanelElement(restore.panelId);
    const parent = document.getElementById(restore.parentId);
    if (!panelEl || !parent) return;

    if (restore.nextSiblingPanelId) {
      const nextSibling = parent.querySelector<HTMLElement>(`[data-panel="${CSS.escape(restore.nextSiblingPanelId)}"]`);
      if (nextSibling) {
        parent.insertBefore(panelEl, nextSibling);
        return;
      }
    }

    if (parent.id === 'panelsGrid') {
      const addPanelBlock = parent.querySelector('.add-panel-block');
      if (addPanelBlock) {
        parent.insertBefore(panelEl, addPanelBlock);
        return;
      }
    }

    this.insertByOrder(parent, panelEl, restore.panelId);
  }

  renderCriticalBanner(postures: TheaterPostureSummary[]): void {
    if (this.ctx.isMobile) {
      if (this.criticalBannerEl) {
        this.criticalBannerEl.remove();
        this.criticalBannerEl = null;
      }
      document.body.classList.remove('has-critical-banner');
      return;
    }

    const dismissedAt = sessionStorage.getItem('banner-dismissed');
    if (dismissedAt && Date.now() - parseInt(dismissedAt, 10) < 30 * 60 * 1000) {
      return;
    }

    const critical = postures.filter(
      (p) => p.postureLevel === 'critical' || (p.postureLevel === 'elevated' && p.strikeCapable)
    );

    if (critical.length === 0) {
      if (this.criticalBannerEl) {
        this.criticalBannerEl.remove();
        this.criticalBannerEl = null;
        document.body.classList.remove('has-critical-banner');
      }
      return;
    }

    const top = critical[0]!;
    const isCritical = top.postureLevel === 'critical';

    if (!this.criticalBannerEl) {
      this.criticalBannerEl = document.createElement('div');
      this.criticalBannerEl.className = 'critical-posture-banner';
      const header = document.querySelector('.header');
      if (header) header.insertAdjacentElement('afterend', this.criticalBannerEl);
    }

    document.body.classList.add('has-critical-banner');
    this.criticalBannerEl.className = `critical-posture-banner ${isCritical ? 'severity-critical' : 'severity-elevated'}`;
    this.criticalBannerEl.innerHTML = `
      <div class="banner-content">
        <span class="banner-icon">${isCritical ? '🚨' : '⚠️'}</span>
        <span class="banner-headline">${escapeHtml(top.headline)}</span>
        <span class="banner-stats">${top.totalAircraft} aircraft • ${escapeHtml(top.summary)}</span>
        ${top.strikeCapable ? '<span class="banner-strike">STRIKE CAPABLE</span>' : ''}
      </div>
      <button class="banner-view" data-lat="${top.centerLat}" data-lon="${top.centerLon}">View Region</button>
      <button class="banner-dismiss">×</button>
    `;

    this.criticalBannerEl.querySelector('.banner-view')?.addEventListener('click', () => {
      console.log('[Banner] View Region clicked:', top.theaterId, 'lat:', top.centerLat, 'lon:', top.centerLon);
      trackCriticalBannerAction('view', top.theaterId);
      if (typeof top.centerLat === 'number' && typeof top.centerLon === 'number') {
        this.ctx.map?.setCenter(top.centerLat, top.centerLon, 4);
      } else {
        console.error('[Banner] Missing coordinates for', top.theaterId);
      }
    });

    this.criticalBannerEl.querySelector('.banner-dismiss')?.addEventListener('click', () => {
      trackCriticalBannerAction('dismiss', top.theaterId);
      this.criticalBannerEl?.classList.add('dismissed');
      document.body.classList.remove('has-critical-banner');
      sessionStorage.setItem('banner-dismissed', Date.now().toString());
    });
  }

  applyPanelSettings(): void {
    Object.entries(this.ctx.panelSettings).forEach(([key, config]) => {
      if (key === 'map') {
        const mapSection = document.getElementById('mapSection');
        if (mapSection) {
          mapSection.classList.toggle('hidden', !config.enabled);
          const mainContent = document.querySelector('.main-content');
          if (mainContent) {
            mainContent.classList.toggle('map-hidden', !config.enabled);
          }
          this.ensureCorrectZones();
        }
        return;
      }
      const panel = this.ctx.panels[key];
      panel?.toggle(config.enabled);
      if (!config.enabled && this.selectedPanelId === key) {
        this.selectedPanelId = null;
      }
    });
    this.updateWorkbenchChrome();
  }

  private shouldCreatePanel(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(DEFAULT_PANELS, key);
  }

  private createNewsPanel(key: string, labelKey: string): NewsPanel | null {
    if (!this.shouldCreatePanel(key)) return null;
    const panel = new NewsPanel(key, t(labelKey));
    this.attachRelatedAssetHandlers(panel);
    this.ctx.newsPanels[key] = panel;
    this.ctx.panels[key] = panel;
    return panel;
  }

  private createPanel<T extends import('@/components/Panel').Panel>(key: string, factory: () => T): T | null {
    if (!this.shouldCreatePanel(key)) return null;
    const panel = factory();
    this.ctx.panels[key] = panel;
    return panel;
  }

  private createPanels(): void {
    const panelsGrid = document.getElementById('panelsGrid')!;

    const mapContainer = document.getElementById('mapContainer') as HTMLElement;
    const preferGlobe = loadFromStorage<string>(STORAGE_KEYS.mapMode, 'flat') === 'globe';
    this.ctx.map = new MapContainer(mapContainer, {
      zoom: this.ctx.isMobile ? 2.5 : 1.0,
      pan: { x: 0, y: 0 },
      view: this.ctx.isMobile ? this.ctx.resolvedLocation : 'global',
      layers: this.ctx.mapLayers,
      timeRange: '7d',
    }, preferGlobe);

    this.ctx.map.initEscalationGetters();
    this.ctx.currentTimeRange = this.ctx.map.getTimeRange();

    this.createNewsPanel('politics', 'panels.politics');
    this.createNewsPanel('tech', 'panels.tech');
    this.createNewsPanel('finance', 'panels.finance');

    this.createPanel('heatmap', () => new HeatmapPanel());
    this.createPanel('markets', () => new MarketPanel());
    const stockAnalysisPanel = this.createPanel('stock-analysis', () => new StockAnalysisPanel());
    if (stockAnalysisPanel && !getSecretState('QADR110_API_KEY').present) {
      stockAnalysisPanel.showLocked([
        'AI stock briefs with technical + news synthesis',
        'Trend scoring from MA, MACD, RSI, and volume structure',
        'Actionable watchlist monitoring for your premium workspace',
      ]);
    }
    const stockBacktestPanel = this.createPanel('stock-backtest', () => new StockBacktestPanel());
    if (stockBacktestPanel && !getSecretState('QADR110_API_KEY').present) {
      stockBacktestPanel.showLocked([
        'Historical replay of premium stock-analysis signals',
        'Win-rate, accuracy, and simulated-return metrics',
        'Recent evaluation samples for your tracked symbols',
      ]);
    }

    const monitorPanel = this.createPanel('monitors', () => new MonitorPanel(this.ctx.monitors));
    monitorPanel?.onChanged((monitors) => {
      this.ctx.monitors = monitors;
      saveToStorage(STORAGE_KEYS.monitors, monitors);
      this.callbacks.updateMonitorResults();
    });

    this.createPanel('commodities', () => new CommoditiesPanel());
    this.createPanel('polymarket', () => new PredictionPanel());

    this.createNewsPanel('gov', 'panels.gov');
    this.createNewsPanel('intel', 'panels.intel');

    this.createPanel('crypto', () => new CryptoPanel());
    this.createNewsPanel('middleeast', 'panels.middleeast');
    this.createNewsPanel('layoffs', 'panels.layoffs');
    this.createNewsPanel('ai', 'panels.ai');
    this.createNewsPanel('startups', 'panels.startups');
    this.createNewsPanel('vcblogs', 'panels.vcblogs');
    this.createNewsPanel('regionalStartups', 'panels.regionalStartups');
    this.createNewsPanel('unicorns', 'panels.unicorns');
    this.createNewsPanel('accelerators', 'panels.accelerators');
    this.createNewsPanel('funding', 'panels.funding');
    this.createNewsPanel('producthunt', 'panels.producthunt');
    this.createNewsPanel('security', 'panels.security');
    this.createNewsPanel('policy', 'panels.policy');
    this.createNewsPanel('hardware', 'panels.hardware');
    this.createNewsPanel('cloud', 'panels.cloud');
    this.createNewsPanel('dev', 'panels.dev');
    this.createNewsPanel('github', 'panels.github');
    this.createNewsPanel('ipo', 'panels.ipo');
    this.createNewsPanel('thinktanks', 'panels.thinktanks');
    this.createPanel('economic', () => new EconomicPanel());

    this.createPanel('trade-policy', () => new TradePolicyPanel());
    this.createPanel('supply-chain', () => new SupplyChainPanel());

    this.createPanel('scenario-planner', () => {
      const panel = new ScenarioPlannerPanel();
      panel.setScenarioComputedHandler((output) => {
        this.ctx.mapLayers.ciiChoropleth = true;
        this.ctx.map?.setLayers(this.ctx.mapLayers);

        const topCountry = output.countryRiskIndex[0];
        if (topCountry) {
          this.ctx.map?.highlightCountry(topCountry.code);
        }

        this.ctx.map?.setCIIScores(
          output.countryRiskIndex.map((c) => ({
            code: c.code,
            score: c.baseline,
            level: c.baseline >= 75 ? 'critical' : c.baseline >= 60 ? 'high' : c.baseline >= 45 ? 'elevated' : c.baseline >= 30 ? 'normal' : 'low',
          })),
        );
      });
      return panel;
    });

    this.createNewsPanel('africa', 'panels.africa');
    this.createNewsPanel('latam', 'panels.latam');
    this.createNewsPanel('asia', 'panels.asia');
    this.createNewsPanel('energy', 'panels.energy');

    for (const key of Object.keys(FEEDS)) {
      if (this.ctx.newsPanels[key]) continue;
      if (!Array.isArray((FEEDS as Record<string, unknown>)[key])) continue;
      const panelKey = this.ctx.panels[key] && !this.ctx.newsPanels[key] ? `${key}-news` : key;
      if (this.ctx.panels[panelKey]) continue;
      if (!DEFAULT_PANELS[panelKey] && !DEFAULT_PANELS[key]) continue;
      const panelConfig = DEFAULT_PANELS[panelKey] ?? DEFAULT_PANELS[key];
      const label = panelConfig?.name ?? key.charAt(0).toUpperCase() + key.slice(1);
      const panel = new NewsPanel(panelKey, label);
      this.attachRelatedAssetHandlers(panel);
      this.ctx.newsPanels[key] = panel;
      this.ctx.panels[panelKey] = panel;
    }

    this.createPanel('gdelt-intel', () => new GdeltIntelPanel());

    if (SITE_VARIANT === 'full' && this.ctx.isDesktopApp) {
      import('@/components/DeductionPanel').then(({ DeductionPanel }) => {
        const deductionPanel = new DeductionPanel(() => this.ctx.allNews);
        this.ctx.panels['deduction'] = deductionPanel;
        const el = deductionPanel.getElement();
        this.makeDraggable(el, 'deduction');
        const grid = document.getElementById('panelsGrid');
        if (grid) {
          const gdeltEl = this.ctx.panels['gdelt-intel']?.getElement();
          if (gdeltEl?.nextSibling) {
            grid.insertBefore(el, gdeltEl.nextSibling);
          } else {
            grid.appendChild(el);
          }
        }
      });
    }

    if (this.shouldCreatePanel('cii')) {
      const ciiPanel = new CIIPanel();
      ciiPanel.setShareStoryHandler((code, name) => {
        this.callbacks.openCountryStory(code, name);
      });
      ciiPanel.setCountryClickHandler((code) => {
        this.callbacks.openCountryBrief(code);
      });
      this.ctx.panels['cii'] = ciiPanel;
    }

    if (this.shouldCreatePanel('nrc-resilience')) {
      const nrcPanel = new NRCPanel();
      nrcPanel.setCountryClickHandler((code) => {
        this.callbacks.openCountryBrief(code);
      });
      this.ctx.panels['nrc-resilience'] = nrcPanel;
    }

    if (this.shouldCreatePanel('nrc-analytics')) {
      this.ctx.panels['nrc-analytics'] = new NRCAnalyticsPanel();
    }

    if (this.shouldCreatePanel('csrc-cognitive')) {
      this.ctx.panels['csrc-cognitive'] = new CSRCPanel();
    }

    this.createPanel('cascade', () => new CascadePanel());
    this.createPanel('satellite-fires', () => new SatelliteFiresPanel());

    if (this.shouldCreatePanel('strategic-risk')) {
      const strategicRiskPanel = new StrategicRiskPanel();
      strategicRiskPanel.setLocationClickHandler((lat, lon) => {
        this.ctx.map?.setCenter(lat, lon, 4);
      });
      this.ctx.panels['strategic-risk'] = strategicRiskPanel;
    }

    if (this.shouldCreatePanel('strategic-posture')) {
      const strategicPosturePanel = new StrategicPosturePanel(() => this.ctx.allNews);
      strategicPosturePanel.setLocationClickHandler((lat, lon) => {
        console.log('[App] StrategicPosture handler called:', { lat, lon, hasMap: !!this.ctx.map });
        this.ctx.map?.setCenter(lat, lon, 4);
      });
      this.ctx.panels['strategic-posture'] = strategicPosturePanel;
    }

    if (this.shouldCreatePanel('ucdp-events')) {
      const ucdpEventsPanel = new UcdpEventsPanel();
      ucdpEventsPanel.setEventClickHandler((lat, lon) => {
        this.ctx.map?.setCenter(lat, lon, 5);
      });
      this.ctx.panels['ucdp-events'] = ucdpEventsPanel;
    }

    this.lazyPanel('displacement', () =>
      import('@/components/DisplacementPanel').then(m => {
        const p = new m.DisplacementPanel();
        p.setCountryClickHandler((lat: number, lon: number) => { this.ctx.map?.setCenter(lat, lon, 4); });
        return p;
      }),
    );

    this.lazyPanel('climate', () =>
      import('@/components/ClimateAnomalyPanel').then(m => {
        const p = new m.ClimateAnomalyPanel();
        p.setZoneClickHandler((lat: number, lon: number) => { this.ctx.map?.setCenter(lat, lon, 4); });
        return p;
      }),
    );

    this.lazyPanel('population-exposure', () =>
      import('@/components/PopulationExposurePanel').then(m => new m.PopulationExposurePanel()),
    );

    this.lazyPanel('security-advisories', () =>
      import('@/components/SecurityAdvisoriesPanel').then(m => {
        const p = new m.SecurityAdvisoriesPanel();
        p.setRefreshHandler(() => { void this.callbacks.loadSecurityAdvisories?.(); });
        return p;
      }),
    );

    const _wmKeyPresent = getSecretState('QADR110_API_KEY').present;
    const _lockPanels = this.ctx.isDesktopApp && !_wmKeyPresent;

    this.lazyPanel('daily-market-brief', () =>
      import('@/components/DailyMarketBriefPanel').then(m => new m.DailyMarketBriefPanel()),
      undefined,
      !_wmKeyPresent ? ['Pre-market watchlist priorities', 'Action plan for the session', 'Risk watch tied to current finance headlines'] : undefined,
    );

    this.lazyPanel('oref-sirens', () =>
      import('@/components/OrefSirensPanel').then(m => new m.OrefSirensPanel()),
      undefined,
      _lockPanels ? [t('premium.features.orefSirens1'), t('premium.features.orefSirens2')] : undefined,
    );

    this.lazyPanel('telegram-intel', () =>
      import('@/components/TelegramIntelPanel').then(m => new m.TelegramIntelPanel()),
      undefined,
      _lockPanels ? [t('premium.features.telegramIntel1'), t('premium.features.telegramIntel2')] : undefined,
    );

    if (this.shouldCreatePanel('gcc-investments')) {
      const investmentsPanel = new InvestmentsPanel((inv) => {
        focusInvestmentOnMap(this.ctx.map, this.ctx.mapLayers, inv.lat, inv.lon);
      });
      this.ctx.panels['gcc-investments'] = investmentsPanel;
    }

    if (this.shouldCreatePanel('world-clock')) {
      this.ctx.panels['world-clock'] = new WorldClockPanel();
    }

    if (this.shouldCreatePanel('persian-analysis')) {
      this.ctx.panels['persian-analysis'] = new PersianStrategicPanel();
    }

    if (this.shouldCreatePanel('narrative-analysis')) {
      this.ctx.panels['narrative-analysis'] = new NarrativeAnalysisPanel();
    }

    this.createPanel('cognitive-warfare', () => new CognitiveWarfarePanel());

    this.createPanel('qadr-assistant', () => new QadrAssistantPanel());
    this.createPanel('geo-analysis-workbench', () => new MapAnalysisPanel());
    this.createPanel('qadr-monitoring-hub', () => new QadrMonitoringHubPanel());
    this.createPanel('strategic-foresight', () => new StrategicForesightPanel());
    this.createPanel('war-room', () => new WarRoomPanel());
    this.createPanel('black-swan-watch', () => new BlackSwanPanel());
    this.createPanel('premium-benchmark', () => new PremiumBenchmarkPanel());
    this.createPanel('release-notes', () => new ReleaseNotesPanel());
    this.createPanel('ops-audit', () => new OpsAuditPanel());
    this.createPanel('darkweb-defensive', () => new DarkwebDefensivePanel());
    this.createPanel('iran-media-matrix', () => new IranMediaMatrixPanel());
    this.createPanel('regional-slices', () => new RegionalSlicesPanel());
    this.createPanel('infra-traffic-cyber', () => new InfraTrafficCyberPanel());
    this.createPanel('media-pipelines', () => new MediaPipelinesPanel());
    this.createPanel('maritime-traffic', () => new MaritimeTrafficPanel());

    if (this.shouldCreatePanel('airline-intel')) {
      this.ctx.panels['airline-intel'] = new AirlineIntelPanel();
      this.aviationCommandBar = new AviationCommandBar();
    }

    if (this.shouldCreatePanel('gulf-economies') && !this.ctx.panels['gulf-economies']) {
      this.ctx.panels['gulf-economies'] = new GulfEconomiesPanel();
    }

    if (this.shouldCreatePanel('live-news')) {
      this.ctx.panels['live-news'] = new LiveNewsPanel();
    }

    if (this.shouldCreatePanel('live-webcams')) {
      this.ctx.panels['live-webcams'] = new LiveWebcamsPanel();
    }

    this.createPanel('events', () => new TechEventsPanel('events', () => this.ctx.allNews));
    this.createPanel('service-status', () => new ServiceStatusPanel());

    this.lazyPanel('tech-readiness', () =>
      import('@/components/TechReadinessPanel').then(m => {
        const p = new m.TechReadinessPanel();
        void p.refresh();
        return p;
      }),
    );

    this.createPanel('macro-signals', () => new MacroSignalsPanel());
    this.createPanel('etf-flows', () => new ETFFlowsPanel());
    this.createPanel('stablecoins', () => new StablecoinPanel());

    if (this.ctx.isDesktopApp) {
      const runtimeConfigPanel = new RuntimeConfigPanel({ mode: 'alert' });
      this.ctx.panels['runtime-config'] = runtimeConfigPanel;
    }

    this.createPanel('insights', () => new InsightsPanel());

    // Global Giving panel (all variants)
    this.lazyPanel('giving', () =>
      import('@/components/GivingPanel').then(m => new m.GivingPanel()),
    );

    // Happy variant panels (lazy-loaded — only relevant for happy variant)
    if (SITE_VARIANT === 'happy') {
      this.lazyPanel('positive-feed', () =>
        import('@/components/PositiveNewsFeedPanel').then(m => {
          const p = new m.PositiveNewsFeedPanel();
          this.ctx.positivePanel = p;
          return p;
        }),
      );

      this.lazyPanel('counters', () =>
        import('@/components/CountersPanel').then(m => {
          const p = new m.CountersPanel();
          p.startTicking();
          this.ctx.countersPanel = p;
          return p;
        }),
      );

      this.lazyPanel('progress', () =>
        import('@/components/ProgressChartsPanel').then(m => {
          const p = new m.ProgressChartsPanel();
          this.ctx.progressPanel = p;
          return p;
        }),
      );

      this.lazyPanel('breakthroughs', () =>
        import('@/components/BreakthroughsTickerPanel').then(m => {
          const p = new m.BreakthroughsTickerPanel();
          this.ctx.breakthroughsPanel = p;
          return p;
        }),
      );

      this.lazyPanel('spotlight', () =>
        import('@/components/HeroSpotlightPanel').then(m => {
          const p = new m.HeroSpotlightPanel();
          p.onLocationRequest = (lat: number, lon: number) => {
            this.ctx.map?.setCenter(lat, lon, 4);
            this.ctx.map?.flashLocation(lat, lon, 3000);
          };
          this.ctx.heroPanel = p;
          return p;
        }),
      );

      this.lazyPanel('digest', () =>
        import('@/components/GoodThingsDigestPanel').then(m => {
          const p = new m.GoodThingsDigestPanel();
          this.ctx.digestPanel = p;
          return p;
        }),
      );

      this.lazyPanel('species', () =>
        import('@/components/SpeciesComebackPanel').then(m => {
          const p = new m.SpeciesComebackPanel();
          this.ctx.speciesPanel = p;
          return p;
        }),
      );

      this.lazyPanel('renewable', () =>
        import('@/components/RenewableEnergyPanel').then(m => {
          const p = new m.RenewableEnergyPanel();
          this.ctx.renewablePanel = p;
          return p;
        }),
      );
    }

    const defaultOrder = Object.keys(DEFAULT_PANELS).filter(k => k !== 'map');
    const activePanelKeys = Object.keys(this.ctx.panelSettings).filter(k => k !== 'map');
    const bottomSet = this.getSavedBottomSet();
    const savedOrder = this.getSavedPanelOrder();
    this.bottomSetMemory = bottomSet;
    const effectiveUltraWide = this.getEffectiveUltraWide();
    this.wasUltraWide = effectiveUltraWide;

    const hasSavedOrder = savedOrder.length > 0;
    let allOrder: string[];

    if (hasSavedOrder) {
      const valid = savedOrder.filter(k => activePanelKeys.includes(k));
      const missing = activePanelKeys.filter(k => !valid.includes(k));

      missing.forEach(k => {
        if (k === 'monitors') return;
        const defaultIdx = defaultOrder.indexOf(k);
        if (defaultIdx === -1) { valid.push(k); return; }
        let inserted = false;
        for (let i = defaultIdx + 1; i < defaultOrder.length; i++) {
          const afterIdx = valid.indexOf(defaultOrder[i]!);
          if (afterIdx !== -1) { valid.splice(afterIdx, 0, k); inserted = true; break; }
        }
        if (!inserted) valid.push(k);
      });

      const monitorsIdx = valid.indexOf('monitors');
      if (monitorsIdx !== -1) valid.splice(monitorsIdx, 1);
      if (SITE_VARIANT !== 'happy') valid.push('monitors');
      allOrder = valid;
    } else {
      allOrder = [...defaultOrder];

      if (SITE_VARIANT !== 'happy') {
        const liveNewsIdx = allOrder.indexOf('live-news');
        if (liveNewsIdx > 0) {
          allOrder.splice(liveNewsIdx, 1);
          allOrder.unshift('live-news');
        }

        const webcamsIdx = allOrder.indexOf('live-webcams');
        if (webcamsIdx !== -1 && webcamsIdx !== allOrder.indexOf('live-news') + 1) {
          allOrder.splice(webcamsIdx, 1);
          const afterNews = allOrder.indexOf('live-news') + 1;
          allOrder.splice(afterNews, 0, 'live-webcams');
        }
      }

      if (this.ctx.isDesktopApp) {
        const runtimeIdx = allOrder.indexOf('runtime-config');
        if (runtimeIdx > 1) {
          allOrder.splice(runtimeIdx, 1);
          allOrder.splice(1, 0, 'runtime-config');
        } else if (runtimeIdx === -1) {
          allOrder.splice(1, 0, 'runtime-config');
        }
      }
    }

    this.resolvedPanelOrder = allOrder;

    const sidebarOrder = effectiveUltraWide
      ? allOrder.filter(k => !this.bottomSetMemory.has(k))
      : allOrder;
    const bottomOrder = effectiveUltraWide
      ? allOrder.filter(k => this.bottomSetMemory.has(k))
      : [];

    sidebarOrder.forEach((key: string) => {
      const panel = this.ctx.panels[key];
      if (panel && !panel.getElement().parentElement) {
        const el = panel.getElement();
        this.makeDraggable(el, key);
        panelsGrid.appendChild(el);
      }
    });

    // "+" Add Panel block at the end of the grid
    const addPanelBlock = document.createElement('button');
    addPanelBlock.className = 'add-panel-block';
    addPanelBlock.setAttribute('aria-label', t('components.panel.addPanel'));
    const addIcon = document.createElement('span');
    addIcon.className = 'add-panel-block-icon';
    addIcon.textContent = '+';
    const addLabel = document.createElement('span');
    addLabel.className = 'add-panel-block-label';
    addLabel.textContent = t('components.panel.addPanel');
    addPanelBlock.appendChild(addIcon);
    addPanelBlock.appendChild(addLabel);
    addPanelBlock.addEventListener('click', () => {
      this.ctx.unifiedSettings?.open('panels');
    });
    panelsGrid.appendChild(addPanelBlock);

    const bottomGrid = document.getElementById('mapBottomGrid');
    if (bottomGrid) {
      bottomOrder.forEach(key => {
        const panel = this.ctx.panels[key];
        if (panel && !panel.getElement().parentElement) {
          const el = panel.getElement();
          this.makeDraggable(el, key);
          this.insertByOrder(bottomGrid, el, key);
        }
      });
    }

    window.addEventListener('resize', this.handleWindowResize);

    this.ctx.map.onTimeRangeChanged((range) => {
      this.ctx.currentTimeRange = range;
      this.applyTimeRangeFilterDebounced();
    });

    this.applyPanelSettings();
    this.applyInitialUrlState();
    this.updateWorkbenchChrome();

    if (import.meta.env.DEV) {
      const configured = new Set(Object.keys(DEFAULT_PANELS).filter(k => k !== 'map'));
      const created = new Set(Object.keys(this.ctx.panels));
      const extra = [...created].filter(k => !configured.has(k) && k !== 'deduction' && k !== 'runtime-config');
      if (extra.length) console.warn('[PanelLayout] Panels created but not in DEFAULT_PANELS:', extra);
    }
  }

  private setupAnalysisNav(): void {
    const navButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-analysis-action]'));
    navButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const actionId = button.dataset.analysisAction;
        if (!actionId) return;
        this.handleAnalysisNavAction(actionId, navButtons, button);
      });
    });
  }

  private handleAnalysisNavAction(actionId: string, buttons: HTMLButtonElement[], activeButton: HTMLButtonElement): void {
    const action = ANALYSIS_NAV_ACTIONS.find((item) => item.id === actionId);
    if (!action) return;

    buttons.forEach((button) => {
      button.classList.toggle('active', button === activeButton);
    });

    if (action.layers?.length) {
      this.enableMapLayers(action.layers);
    }

    action.panelCalls?.forEach((panelCall) => {
      this.callPanelMethod(panelCall.panelId, panelCall.method, panelCall.args ?? []);
    });

    this.focusPanel(action.panelId);
  }

  private enableMapLayers(layers: Array<keyof MapLayers>): void {
    let changed = false;
    layers.forEach((layer) => {
      if (!this.ctx.mapLayers[layer]) {
        this.ctx.mapLayers[layer] = true;
        changed = true;
      }
    });

    if (!changed) return;
    this.ctx.map?.setLayers(this.ctx.mapLayers);
    saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
    void this.callbacks.loadAllData();
  }

  private callPanelMethod(panelId: string, method: string, args: unknown[]): void {
    const panelRecord = this.ctx.panels[panelId] as unknown as Record<string, unknown> | undefined;
    const fn = panelRecord?.[method];
    if (typeof fn === 'function') {
      fn.apply(panelRecord, args);
      return;
    }
    enqueuePanelCall(panelId, method, args);
  }

  private focusPanel(panelId: string): void {
    if (panelId === 'map') {
      const mapSection = document.getElementById('mapSection');
      if (!mapSection) return;
      mapSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      mapSection.classList.add('panel-flash-outline');
      window.setTimeout(() => mapSection.classList.remove('panel-flash-outline'), 1200);
      return;
    }

    const config = this.ctx.panelSettings[panelId];
    if (config && !config.enabled) {
      config.enabled = true;
      saveToStorage(STORAGE_KEYS.panels, this.ctx.panelSettings);
      this.applyPanelSettings();
    }

    this.focusPanelElement(panelId, 18);
  }

  private focusPanelElement(panelId: string, remainingAttempts: number): void {
    const panel = this.ctx.panels[panelId];
    const el = panel?.getElement() ?? document.querySelector<HTMLElement>(`[data-panel="${panelId}"]`);
    if (!el) {
      if (remainingAttempts <= 0) return;
      window.setTimeout(() => this.focusPanelElement(panelId, remainingAttempts - 1), 140);
      return;
    }
    const owningSheet = this.resolveSheetForPanel(panelId);
    if (owningSheet) {
      this.setActiveSheet(owningSheet);
    }
    this.selectPanelForWorkbench(panelId, { syncSheet: false });
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('panel-flash-outline');
    el.focus({ preventScroll: true });
    window.setTimeout(() => el.classList.remove('panel-flash-outline'), 1200);
  }

  private applyTimeRangeFilterToNewsPanels(): void {
    Object.entries(this.ctx.newsByCategory).forEach(([category, items]) => {
      const panel = this.ctx.newsPanels[category];
      if (!panel) return;
      const filtered = this.filterItemsByTimeRange(items);
      if (filtered.length === 0 && items.length > 0) {
        panel.renderFilteredEmpty(`No items in ${this.getTimeRangeLabel()}`);
        return;
      }
      panel.renderNews(filtered);
    });
  }

  private filterItemsByTimeRange(items: import('@/types').NewsItem[], range: import('@/components').TimeRange = this.ctx.currentTimeRange): import('@/types').NewsItem[] {
    if (range === 'all') return items;
    const ranges: Record<string, number> = {
      '1h': 60 * 60 * 1000, '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000, '48h': 48 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000, 'all': Infinity,
    };
    const cutoff = Date.now() - (ranges[range] ?? Infinity);
    return items.filter((item) => {
      const ts = item.pubDate instanceof Date ? item.pubDate.getTime() : new Date(item.pubDate).getTime();
      return Number.isFinite(ts) ? ts >= cutoff : true;
    });
  }

  private getTimeRangeLabel(): string {
    const labels: Record<string, string> = {
      '1h': 'یک ساعت اخیر', '6h': '۶ ساعت اخیر',
      '24h': '۲۴ ساعت اخیر', '48h': '۴۸ ساعت اخیر',
      '7d': '۷ روز اخیر', 'all': 'کل بازه',
    };
    return labels[this.ctx.currentTimeRange] ?? '۷ روز اخیر';
  }

  private applyInitialUrlState(): void {
    if (!this.ctx.initialUrlState || !this.ctx.map) return;

    const { view, zoom, lat, lon, timeRange, layers } = this.ctx.initialUrlState;
    const hasExplicitCenter = lat !== undefined && lon !== undefined;
    const applyExactViewport = (): void => {
      if (lat === undefined || lon === undefined || !this.ctx.map) return;
      const effectiveZoom = zoom ?? this.ctx.map.getState().zoom;
      if (effectiveZoom <= 2) {
        this.ctx.map.setWorldCopies(true);
      }
      this.ctx.map.setCenter(lat, lon, effectiveZoom);
    };

    if (view && !hasExplicitCenter) {
      this.ctx.map.setView(view);
    }

    if (timeRange) {
      this.ctx.map.setTimeRange(timeRange);
    }

    if (layers) {
      this.ctx.mapLayers = layers;
      saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
      this.ctx.map.setLayers(layers);
    }

    if (hasExplicitCenter) {
      applyExactViewport();
      // DeckGL/MapLibre may still complete an internal preset/global flyTo during
      // the first render tick. Re-apply the exact shared viewport once bootstrap
      // settles so post-auth deep links remain stable.
      window.setTimeout(() => {
        applyExactViewport();
      }, 900);
    } else if (!view && zoom !== undefined) {
      this.ctx.map.setZoom(zoom);
    }

    const regionSelect = document.getElementById('regionSelect') as HTMLSelectElement;
    const currentView = this.ctx.map.getState().view;
    if (regionSelect && currentView) {
      regionSelect.value = currentView;
    }
  }

  private getSavedPanelOrder(): string[] {
    try {
      const saved = localStorage.getItem(this.ctx.PANEL_ORDER_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((v: unknown) => typeof v === 'string') as string[];
    } catch {
      return [];
    }
  }

  savePanelOrder(): void {
    const grid = document.getElementById('panelsGrid');
    const bottomGrid = document.getElementById('mapBottomGrid');
    if (!grid || !bottomGrid) return;

    const sidebarIds = Array.from(grid.children)
      .map((el) => (el as HTMLElement).dataset.panel)
      .filter((key): key is string => !!key);

    const bottomIds = Array.from(bottomGrid.children)
      .map((el) => (el as HTMLElement).dataset.panel)
      .filter((key): key is string => !!key);

    const allOrder = this.buildUnifiedOrder(sidebarIds, bottomIds);
    this.resolvedPanelOrder = allOrder;
    localStorage.setItem(this.ctx.PANEL_ORDER_KEY, JSON.stringify(allOrder));
    localStorage.setItem(this.ctx.PANEL_ORDER_KEY + '-bottom-set', JSON.stringify(Array.from(this.bottomSetMemory)));
  }

  private buildUnifiedOrder(sidebarIds: string[], bottomIds: string[]): string[] {
    const presentIds = [...sidebarIds, ...bottomIds];
    const uniqueIds: string[] = [];
    const seen = new Set<string>();

    presentIds.forEach((id) => {
      if (seen.has(id)) return;
      seen.add(id);
      uniqueIds.push(id);
    });

    const previousOrder = new Map<string, number>();
    this.resolvedPanelOrder.forEach((id, index) => {
      if (seen.has(id) && !previousOrder.has(id)) {
        previousOrder.set(id, index);
      }
    });
    uniqueIds.forEach((id, index) => {
      if (!previousOrder.has(id)) {
        previousOrder.set(id, this.resolvedPanelOrder.length + index);
      }
    });

    const edges = new Map<string, Set<string>>();
    const indegree = new Map<string, number>();
    uniqueIds.forEach((id) => {
      edges.set(id, new Set());
      indegree.set(id, 0);
    });

    const addConstraints = (ids: string[]) => {
      for (let i = 1; i < ids.length; i++) {
        const prev = ids[i - 1]!;
        const next = ids[i]!;
        if (prev === next || !seen.has(prev) || !seen.has(next)) continue;
        const nextIds = edges.get(prev);
        if (!nextIds || nextIds.has(next)) continue;
        nextIds.add(next);
        indegree.set(next, (indegree.get(next) ?? 0) + 1);
      }
    };

    addConstraints(sidebarIds);
    addConstraints(bottomIds);

    const compareIds = (a: string, b: string) =>
      (previousOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (previousOrder.get(b) ?? Number.MAX_SAFE_INTEGER);

    const available = uniqueIds
      .filter((id) => (indegree.get(id) ?? 0) === 0)
      .sort(compareIds);
    const merged: string[] = [];

    while (available.length > 0) {
      const current = available.shift()!;
      merged.push(current);

      edges.get(current)?.forEach((next) => {
        const nextIndegree = (indegree.get(next) ?? 0) - 1;
        indegree.set(next, nextIndegree);
        if (nextIndegree === 0) {
          available.push(next);
        }
      });
      available.sort(compareIds);
    }

    return merged.length === uniqueIds.length
      ? merged
      : uniqueIds.sort(compareIds);
  }

  private getSavedBottomSet(): Set<string> {
    try {
      const saved = localStorage.getItem(this.ctx.PANEL_ORDER_KEY + '-bottom-set');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed.filter((v: unknown) => typeof v === 'string'));
        }
      }
    } catch { /* ignore */ }
    try {
      const legacy = localStorage.getItem(this.ctx.PANEL_ORDER_KEY + '-bottom');
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed)) {
          const bottomIds = parsed.filter((v: unknown) => typeof v === 'string') as string[];
          const set = new Set(bottomIds);
          // Merge old sidebar + bottom into unified PANEL_ORDER_KEY
          const sidebarOrder = this.getSavedPanelOrder();
          const seen = new Set(sidebarOrder);
          const unified = [...sidebarOrder];
          for (const id of bottomIds) {
            if (!seen.has(id)) { unified.push(id); seen.add(id); }
          }
          localStorage.setItem(this.ctx.PANEL_ORDER_KEY, JSON.stringify(unified));
          localStorage.setItem(this.ctx.PANEL_ORDER_KEY + '-bottom-set', JSON.stringify([...set]));
          localStorage.removeItem(this.ctx.PANEL_ORDER_KEY + '-bottom');
          return set;
        }
      }
    } catch { /* ignore */ }
    return new Set();
  }

  private getEffectiveUltraWide(): boolean {
    const mapSection = document.getElementById('mapSection');
    const mapEnabled = !mapSection?.classList.contains('hidden');
    return window.innerWidth >= 1600 && mapEnabled;
  }

  private insertByOrder(grid: HTMLElement, el: HTMLElement, key: string): void {
    const idx = this.resolvedPanelOrder.indexOf(key);
    if (idx === -1) { grid.appendChild(el); return; }
    for (let i = idx + 1; i < this.resolvedPanelOrder.length; i++) {
      const nextKey = this.resolvedPanelOrder[i]!;
      const nextEl = grid.querySelector(`[data-panel="${CSS.escape(nextKey)}"]`);
      if (nextEl) { grid.insertBefore(el, nextEl); return; }
    }
    grid.appendChild(el);
  }

  private wasUltraWide = false;

  public ensureCorrectZones(): void {
    const effectiveUltraWide = this.getEffectiveUltraWide();

    if (effectiveUltraWide === this.wasUltraWide) return;
    this.wasUltraWide = effectiveUltraWide;

    const grid = document.getElementById('panelsGrid');
    const bottomGrid = document.getElementById('mapBottomGrid');
    if (!grid || !bottomGrid) return;

    if (!effectiveUltraWide) {
      const panelsInBottom = Array.from(bottomGrid.querySelectorAll('.panel')) as HTMLElement[];
      panelsInBottom.forEach(panelEl => {
        const id = panelEl.dataset.panel;
        if (!id) return;
        this.insertByOrder(grid, panelEl, id);
      });
    } else {
      this.bottomSetMemory.forEach(id => {
        const el = grid.querySelector(`[data-panel="${CSS.escape(id)}"]`);
        if (el) {
          this.insertByOrder(bottomGrid, el as HTMLElement, id);
        }
      });
    }
    this.updateWorkbenchChrome();
  }

  private attachRelatedAssetHandlers(panel: NewsPanel): void {
    panel.setRelatedAssetHandlers({
      onRelatedAssetClick: (asset) => this.handleRelatedAssetClick(asset),
      onRelatedAssetsFocus: (assets) => this.ctx.map?.highlightAssets(assets),
      onRelatedAssetsClear: () => this.ctx.map?.highlightAssets(null),
    });
  }

  private handleRelatedAssetClick(asset: RelatedAsset): void {
    if (!this.ctx.map) return;

    switch (asset.type) {
      case 'pipeline':
        this.ctx.map.enableLayer('pipelines');
        this.ctx.mapLayers.pipelines = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerPipelineClick(asset.id);
        break;
      case 'cable':
        this.ctx.map.enableLayer('cables');
        this.ctx.mapLayers.cables = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerCableClick(asset.id);
        break;
      case 'datacenter':
        this.ctx.map.enableLayer('datacenters');
        this.ctx.mapLayers.datacenters = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerDatacenterClick(asset.id);
        break;
      case 'base':
        this.ctx.map.enableLayer('bases');
        this.ctx.mapLayers.bases = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerBaseClick(asset.id);
        break;
      case 'nuclear':
        this.ctx.map.enableLayer('nuclear');
        this.ctx.mapLayers.nuclear = true;
        saveToStorage(STORAGE_KEYS.mapLayers, this.ctx.mapLayers);
        this.ctx.map.triggerNuclearClick(asset.id);
        break;
    }
  }

  private lazyPanel<T extends { getElement(): HTMLElement }>(
    key: string,
    loader: () => Promise<T>,
    setup?: (panel: T) => void,
    lockedFeatures?: string[],
  ): void {
    if (!this.shouldCreatePanel(key)) return;
    loader().then(async (panel) => {
      this.ctx.panels[key] = panel as unknown as import('@/components/Panel').Panel;
      if (lockedFeatures) {
        (panel as unknown as import('@/components/Panel').Panel).showLocked(lockedFeatures);
      } else {
        await replayPendingCalls(key, panel);
        if (setup) setup(panel);
      }
      const el = panel.getElement();
      this.makeDraggable(el, key);

      const bottomGrid = document.getElementById('mapBottomGrid');
      if (bottomGrid && this.getEffectiveUltraWide() && this.bottomSetMemory.has(key)) {
        this.insertByOrder(bottomGrid, el, key);
        this.updateWorkbenchChrome();
        return;
      }

      const grid = document.getElementById('panelsGrid');
      if (!grid) return;
      this.insertByOrder(grid, el, key);
      this.updateWorkbenchChrome();
    }).catch((err) => {
      console.error(`[panel] failed to lazy-load "${key}"`, err);
    });
  }

  private makeDraggable(el: HTMLElement, key: string): void {
    el.dataset.panel = key;
    el.tabIndex = 0;
    el.setAttribute('role', 'group');
    let isDragging = false;
    let dragStarted = false;
    let startX = 0;
    let startY = 0;
    let rafId = 0;
    const DRAG_THRESHOLD = 8;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (el.dataset.resizing === 'true') return;
      if (
        target.classList?.contains('panel-resize-handle') ||
        target.closest?.('.panel-resize-handle') ||
        target.classList?.contains('panel-col-resize-handle') ||
        target.closest?.('.panel-col-resize-handle')
      ) return;
      if (target.closest('button, a, input, select, textarea, .panel-content')) return;

      isDragging = true;
      dragStarted = false;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      if (!dragStarted) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx < DRAG_THRESHOLD && dy < DRAG_THRESHOLD) return;
        dragStarted = true;
        el.classList.add('dragging');
      }
      const cx = e.clientX;
      const cy = e.clientY;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        this.handlePanelDragMove(el, cx, cy);
        rafId = 0;
      });
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (dragStarted) {
        el.classList.remove('dragging');
        const isInBottom = !!el.closest('.map-bottom-grid');
        if (isInBottom) {
          this.bottomSetMemory.add(key);
        } else {
          this.bottomSetMemory.delete(key);
        }
        this.savePanelOrder();
      }
      dragStarted = false;
    };

    el.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    this.panelDragCleanupHandlers.push(() => {
      el.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      isDragging = false;
      dragStarted = false;
      el.classList.remove('dragging');
    });
  }

  private handlePanelDragMove(dragging: HTMLElement, clientX: number, clientY: number): void {
    const grid = document.getElementById('panelsGrid');
    const bottomGrid = document.getElementById('mapBottomGrid');
    if (!grid || !bottomGrid) return;

    dragging.style.pointerEvents = 'none';
    const target = document.elementFromPoint(clientX, clientY);
    dragging.style.pointerEvents = '';

    if (!target) return;

    // Check if we are over a grid or a panel inside a grid
    const targetGrid = (target.closest('.panels-grid') || target.closest('.map-bottom-grid')) as HTMLElement | null;
    const targetPanel = target.closest('.panel') as HTMLElement | null;

    if (!targetGrid && !targetPanel) return;

    const currentTargetGrid = targetGrid || (targetPanel ? targetPanel.parentElement as HTMLElement : null);
    if (!currentTargetGrid || (currentTargetGrid !== grid && currentTargetGrid !== bottomGrid)) return;

    if (targetPanel && targetPanel !== dragging && !targetPanel.classList.contains('hidden')) {
      const targetRect = targetPanel.getBoundingClientRect();
      const draggingRect = dragging.getBoundingClientRect();

      const children = Array.from(currentTargetGrid.children);
      const dragIdx = children.indexOf(dragging);
      const targetIdx = children.indexOf(targetPanel);

      const sameRow = Math.abs(draggingRect.top - targetRect.top) < 30;
      const targetMid = sameRow
        ? targetRect.left + targetRect.width / 2
        : targetRect.top + targetRect.height / 2;
      const cursorPos = sameRow ? clientX : clientY;

      if (dragIdx === -1) {
        // Moving from one grid to another
        if (cursorPos < targetMid) {
          currentTargetGrid.insertBefore(dragging, targetPanel);
        } else {
          currentTargetGrid.insertBefore(dragging, targetPanel.nextSibling);
        }
      } else {
        // Reordering within same grid
        if (dragIdx < targetIdx) {
          if (cursorPos > targetMid) {
            currentTargetGrid.insertBefore(dragging, targetPanel.nextSibling);
          }
        } else {
          if (cursorPos < targetMid) {
            currentTargetGrid.insertBefore(dragging, targetPanel);
          }
        }
      }
    } else if (currentTargetGrid !== dragging.parentElement) {
      // Dragging over an empty or near-empty grid zone
      currentTargetGrid.appendChild(dragging);
    }
  }

  getLocalizedPanelName(panelKey: string, fallback: string): string {
    if (panelKey === 'runtime-config') {
      return t('modals.runtimeConfig.title');
    }
    const key = panelKey.replace(/-([a-z])/g, (_match, group: string) => group.toUpperCase());
    const lookup = `panels.${key}`;
    const localized = t(lookup);
    return localized === lookup ? fallback : localized;
  }

  getAllSourceNames(): string[] {
    const sources = new Set<string>();
    Object.values(FEEDS).forEach(feeds => {
      if (feeds) feeds.forEach(f => sources.add(f.name));
    });
    INTEL_SOURCES.forEach(f => sources.add(f.name));
    return Array.from(sources).sort((a, b) => a.localeCompare(b));
  }
}
