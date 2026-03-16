import { CURRENT_RELEASE } from '@/content/release-notes';
import { Panel } from './Panel';

export class ReleaseNotesPanel extends Panel {
  constructor() {
    super({ id: 'release-notes', title: 'Change Log / یادداشت انتشار', className: 'panel-wide' });
    this.renderView();
  }

  private renderView(): void {
    const sectionMarkup = CURRENT_RELEASE.sections.map((section) => `
      <article style="border:1px solid var(--border-color);border-radius:14px;padding:14px;background:var(--bg-secondary)">
        <h4 style="margin:0 0 10px;font-size:14px">${section.title}</h4>
        <ul style="margin:0;padding:0 18px 0 0;display:grid;gap:8px">
          ${section.items.map((item) => `<li>${item}</li>`).join('')}
        </ul>
      </article>
    `).join('');

    const deploymentMarkup = CURRENT_RELEASE.deployment
      .map((item) => `<span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid var(--border-color);background:var(--bg-tertiary)">${item}</span>`)
      .join('');

    const linksMarkup = CURRENT_RELEASE.links
      .map((link) => `<a href="${link.url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border-radius:10px;border:1px solid var(--border-color);text-decoration:none;color:var(--text-primary);background:var(--bg-secondary)">${link.label}</a>`)
      .join('');

    this.setContent(`
      <section style="direction:rtl;text-align:right;display:grid;gap:14px;line-height:1.8">
        <header style="display:grid;gap:8px">
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <strong style="font-size:15px">${CURRENT_RELEASE.title}</strong>
            <span style="padding:4px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent-strong)">v${CURRENT_RELEASE.version}</span>
            <span style="padding:4px 8px;border-radius:999px;border:1px solid var(--border-color)">${CURRENT_RELEASE.date}</span>
          </div>
          <p style="margin:0">${CURRENT_RELEASE.summary}</p>
        </header>

        <div style="display:flex;flex-wrap:wrap;gap:8px">${deploymentMarkup}</div>

        <div style="display:grid;gap:12px">${sectionMarkup}</div>

        <footer style="display:flex;flex-wrap:wrap;gap:8px">${linksMarkup}</footer>
      </section>
    `);
  }
}
