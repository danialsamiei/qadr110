import { t } from '@/services/i18n';
import { Panel } from './Panel';

type HubSection = {
  id: string;
  title: string;
  summary: string;
  chips: string[];
  panelTargets: Array<{ panelId: string; label: string }>;
};

function getHubSections(): HubSection[] {
  return [
    {
      id: 'overview',
      title: t('components.analysisHub.sections.overview.title'),
      summary: t('components.analysisHub.sections.overview.summary'),
      chips: [
        t('components.analysisHub.sections.overview.chips.0'),
        t('components.analysisHub.sections.overview.chips.1'),
        t('components.analysisHub.sections.overview.chips.2'),
      ],
      panelTargets: [
        { panelId: 'strategic-risk', label: t('components.analysisHub.links.strategicRisk') },
        { panelId: 'cii', label: t('components.analysisHub.links.cii') },
      ],
    },
    {
      id: 'posture',
      title: t('components.analysisHub.sections.posture.title'),
      summary: t('components.analysisHub.sections.posture.summary'),
      chips: [
        t('components.analysisHub.sections.posture.chips.0'),
        t('components.analysisHub.sections.posture.chips.1'),
        t('components.analysisHub.sections.posture.chips.2'),
      ],
      panelTargets: [
        { panelId: 'strategic-posture', label: t('components.analysisHub.links.posturePanel') },
        { panelId: 'intel', label: t('components.analysisHub.links.intelFeed') },
      ],
    },
    {
      id: 'flights',
      title: t('components.analysisHub.sections.flights.title'),
      summary: t('components.analysisHub.sections.flights.summary'),
      chips: [
        t('components.analysisHub.sections.flights.chips.0'),
        t('components.analysisHub.sections.flights.chips.1'),
        t('components.analysisHub.sections.flights.chips.2'),
      ],
      panelTargets: [
        { panelId: 'map', label: t('components.analysisHub.links.mainMap') },
        { panelId: 'airline-intel', label: t('components.analysisHub.links.aviationIntel') },
      ],
    },
    {
      id: 'trends',
      title: t('components.analysisHub.sections.trends.title'),
      summary: t('components.analysisHub.sections.trends.summary'),
      chips: [
        t('components.analysisHub.sections.trends.chips.0'),
        t('components.analysisHub.sections.trends.chips.1'),
        t('components.analysisHub.sections.trends.chips.2'),
      ],
      panelTargets: [
        { panelId: 'insights', label: t('components.analysisHub.links.insights') },
        { panelId: 'gdelt-intel', label: t('components.analysisHub.links.gdelt') },
      ],
    },
    {
      id: 'reports',
      title: t('components.analysisHub.sections.reports.title'),
      summary: t('components.analysisHub.sections.reports.summary'),
      chips: [
        t('components.analysisHub.sections.reports.chips.0'),
        t('components.analysisHub.sections.reports.chips.1'),
        t('components.analysisHub.sections.reports.chips.2'),
      ],
      panelTargets: [
        { panelId: 'qadr-monitoring-hub', label: t('components.analysisHub.links.analysisHub') },
        { panelId: 'persian-analysis', label: t('components.analysisHub.links.persianAnalysis') },
      ],
    },
    {
      id: 'filters',
      title: t('components.analysisHub.sections.filters.title'),
      summary: t('components.analysisHub.sections.filters.summary'),
      chips: [
        t('components.analysisHub.sections.filters.chips.0'),
        t('components.analysisHub.sections.filters.chips.1'),
        t('components.analysisHub.sections.filters.chips.2'),
      ],
      panelTargets: [
        { panelId: 'monitors', label: t('components.analysisHub.links.myMonitors') },
        { panelId: 'live-news', label: t('components.analysisHub.links.liveNews') },
      ],
    },
  ];
}

export class QadrMonitoringHubPanel extends Panel {
  constructor() {
    super({ id: 'qadr-monitoring-hub', title: t('panels.analysisHub'), className: 'panel-wide' });
    this.renderHub();
    this.bindInteractions();
  }

  private renderHub(): void {
    const sections = getHubSections();
    const sectionCards = sections.map((section) => {
      const chips = section.chips.map((chip) => `<span class="hub-chip">${chip}</span>`).join('');
      const links = section.panelTargets
        .map((target) => `<button class="hub-link" type="button" data-panel-target="${target.panelId}">${target.label}</button>`)
        .join('');

      return `
        <article class="hub-card" data-hub-section="${section.id}" data-title="${section.title}">
          <header class="hub-card-header">
            <h4>${section.title}</h4>
            <div class="hub-chips">${chips}</div>
          </header>
          <p>${section.summary}</p>
          <div class="hub-links">${links}</div>
        </article>
      `;
    }).join('');

    this.setContent(`
      <section class="analysis-hub" dir="rtl" lang="fa">
        <header class="analysis-hub-header">
          <div>
            <h3>${t('components.analysisHub.title')}</h3>
            <p>${t('components.analysisHub.subtitle')}</p>
          </div>
          <label class="hub-search-wrap" aria-label="${t('components.analysisHub.searchLabel')}">
            <span>${t('components.analysisHub.searchLabel')}</span>
            <input id="analysisHubSearch" type="search" placeholder="${t('components.analysisHub.searchPlaceholder')}" autocomplete="off" />
          </label>
        </header>

        <div class="hub-disclaimer" role="note" aria-live="polite">⚠️ ${t('components.analysisHub.disclaimer')}</div>

        <nav class="hub-quick-nav" aria-label="${t('components.analysisHub.searchLabel')}">
          ${sections.map((section) => `<button type="button" class="hub-nav-btn" data-nav-section="${section.id}">${section.title}</button>`).join('')}
        </nav>

        <div class="hub-grid" id="analysisHubGrid">${sectionCards}</div>
      </section>
    `);
  }

  private bindInteractions(): void {
    const root = this.getElement();
    if (!root) return;

    const searchInput = root.querySelector<HTMLInputElement>('#analysisHubSearch');
    const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-hub-section]'));

    searchInput?.addEventListener('input', () => {
      const query = (searchInput.value || '').trim();
      cards.forEach((card) => {
        const title = card.dataset.title || '';
        const text = card.innerText || '';
        const visible = !query || title.includes(query) || text.includes(query);
        card.style.display = visible ? '' : 'none';
      });
    });

    root.querySelectorAll<HTMLElement>('[data-nav-section]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sectionId = btn.dataset.navSection;
        const target = sectionId ? root.querySelector<HTMLElement>(`[data-hub-section="${sectionId}"]`) : null;
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    root.querySelectorAll<HTMLElement>('[data-panel-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const panelId = btn.dataset.panelTarget;
        if (!panelId) return;
        const panelEl = document.querySelector<HTMLElement>(`[data-panel="${panelId}"]`);
        if (!panelEl) return;
        panelEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        panelEl.classList.add('panel-flash-outline');
        window.setTimeout(() => panelEl.classList.remove('panel-flash-outline'), 1200);
      });
    });
  }
}
