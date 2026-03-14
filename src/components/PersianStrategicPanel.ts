import { t } from '@/services/i18n';
import { Panel } from './Panel';

export class PersianStrategicPanel extends Panel {
  constructor() {
    super({ id: 'persian-analysis', title: t('panels.persianAnalysis'), className: 'panel-wide' });
    this.renderContent();
  }

  private renderContent(): void {
    const resilienceItems = [
      t('components.persianAnalysis.resilienceItems.0'),
      t('components.persianAnalysis.resilienceItems.1'),
      t('components.persianAnalysis.resilienceItems.2'),
      t('components.persianAnalysis.resilienceItems.3'),
    ];

    this.setContent(`
      <div style="display:grid;gap:10px;text-align:right;direction:rtl;line-height:1.8">
        <div style="border:1px solid var(--yellow);background:rgba(255,193,7,0.08);border-radius:10px;padding:8px 10px;color:var(--yellow);font-size:12px">
          ⚠️ ${t('components.persianAnalysis.disclaimer')}
        </div>
        <section>
          <strong>${t('components.persianAnalysis.regionalTitle')}</strong>
          <div>${t('components.persianAnalysis.regionalBody')}</div>
        </section>
        <section>
          <strong>${t('components.persianAnalysis.resilienceTitle')}</strong>
          <ul style="margin:6px 0 0;padding-inline-start:18px;">
            ${resilienceItems.map((item) => `<li>${item}</li>`).join('')}
          </ul>
        </section>
        <section>
          <strong>${t('components.persianAnalysis.narrativeTitle')}</strong>
          <div>${t('components.persianAnalysis.narrativeBody')}</div>
        </section>
        <section>
          <strong>${t('components.persianAnalysis.trendsTitle')}</strong>
          <div>${t('components.persianAnalysis.trendsBody')}</div>
          <div style="font-family:monospace">روند تاریخی ▁▂▃▅▇ | بازه مرجع ▁▃▄▅▆ | بازه اخیر ▁▂▄▆█</div>
        </section>
        <section>
          <strong>${t('components.persianAnalysis.scenarioTitle')}</strong>
          <div>${t('components.persianAnalysis.scenarioBody')}</div>
        </section>
      </div>
    `);
  }
}
