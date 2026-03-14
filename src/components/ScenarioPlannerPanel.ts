import { Panel } from './Panel';
import { runScenarioEngine, type ScenarioDefinition, type ScenarioEngineOutput } from '@/services/scenario-engine';
import { escapeHtml } from '@/utils/sanitize';

export class ScenarioPlannerPanel extends Panel {
  private onScenarioComputed?: (output: ScenarioEngineOutput, defs: Record<'baseline' | 'optimistic' | 'pessimistic', ScenarioDefinition>) => void;

  constructor() {
    super({
      id: 'scenario-planner',
      title: 'سناریوپرداز',
      className: 'panel-wide',
    });
    this.render();
    this.bindEvents();
    this.computeAndRender();
  }

  public setScenarioComputedHandler(handler: (output: ScenarioEngineOutput, defs: Record<'baseline' | 'optimistic' | 'pessimistic', ScenarioDefinition>) => void): void {
    this.onScenarioComputed = handler;
  }

  private bindEvents(): void {
    this.content.addEventListener('input', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.classList.contains('scenario-input')) return;
      this.computeAndRender();
    });
  }

  private getInputValue(id: string, fallback: string): string {
    const input = this.content.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-scenario-id="${id}"]`);
    return input?.value?.trim() || fallback;
  }

  private parseList(value: string): string[] {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }

  private toScenario(suffix: 'baseline' | 'optimistic' | 'pessimistic', defaults: { name: string; severity: ScenarioDefinition['severity']; durationDays: number }): ScenarioDefinition {
    const event = this.getInputValue(`event-${suffix}`, 'اختلال در مسیرهای دریایی منطقه‌ای');
    const actors = this.parseList(this.getInputValue(`actors-${suffix}`, 'ایران, امریکا, اتحادیه اروپا'));
    const constraints = this.parseList(this.getInputValue(`constraints-${suffix}`, 'تحریم, محدودیت بیمه, محدودیت بندری'));
    const durationDays = Number.parseInt(this.getInputValue(`duration-${suffix}`, String(defaults.durationDays)), 10);

    return {
      name: defaults.name,
      event,
      severity: defaults.severity,
      durationDays: Number.isFinite(durationDays) ? Math.max(1, durationDays) : defaults.durationDays,
      actors,
      constraints,
    };
  }

  private computeAndRender(): void {
    const defs = {
      baseline: this.toScenario('baseline', { name: 'پایه', severity: 'moderate', durationDays: 14 }),
      optimistic: this.toScenario('optimistic', { name: 'خوش‌بینانه', severity: 'low', durationDays: 10 }),
      pessimistic: this.toScenario('pessimistic', { name: 'بدبینانه', severity: 'severe', durationDays: 24 }),
    };

    const baselineOutput = runScenarioEngine(defs.baseline);
    const optimisticOutput = runScenarioEngine(defs.optimistic);
    const pessimisticOutput = runScenarioEngine(defs.pessimistic);

    const html = this.renderOutput(baselineOutput, optimisticOutput, pessimisticOutput);
    const outputEl = this.content.querySelector<HTMLElement>('.scenario-results');
    if (outputEl) {
      outputEl.innerHTML = html;
    }

    const mergedCountryRisk = baselineOutput.countryRiskIndex.map((country) => {
      const optimisticMatch = optimisticOutput.countryRiskIndex.find((c) => c.code === country.code);
      const pessimisticMatch = pessimisticOutput.countryRiskIndex.find((c) => c.code === country.code);
      return {
        ...country,
        optimistic: optimisticMatch?.optimistic ?? country.optimistic,
        pessimistic: pessimisticMatch?.pessimistic ?? country.pessimistic,
      };
    });

    this.onScenarioComputed?.({ ...baselineOutput, countryRiskIndex: mergedCountryRisk }, defs);
  }

  private render(): void {
    this.setContent(`
      <div class="scenario-planner">
        ${this.renderScenarioInputs('baseline', 'سناریوی پایه', 'moderate', 14)}
        ${this.renderScenarioInputs('optimistic', 'سناریوی خوش‌بینانه', 'low', 10)}
        ${this.renderScenarioInputs('pessimistic', 'سناریوی بدبینانه', 'severe', 24)}
        <div class="scenario-results"></div>
      </div>
    `);
  }

  private renderScenarioInputs(
    suffix: 'baseline' | 'optimistic' | 'pessimistic',
    title: string,
    severity: string,
    durationDays: number,
  ): string {
    return `
      <section class="scenario-block">
        <h4>${escapeHtml(title)}</h4>
        <label>رویداد</label>
        <textarea class="scenario-input" data-scenario-id="event-${suffix}">اختلال در تنگه راهبردی و شوک زنجیره تأمین</textarea>
        <div class="scenario-row">
          <div>
            <label>شدت</label>
            <input class="scenario-input" data-scenario-id="severity-${suffix}" value="${escapeHtml(severity)}" disabled />
          </div>
          <div>
            <label>مدت (روز)</label>
            <input class="scenario-input" data-scenario-id="duration-${suffix}" type="number" min="1" value="${durationDays}" />
          </div>
        </div>
        <label>بازیگران (کاما جدا)</label>
        <input class="scenario-input" data-scenario-id="actors-${suffix}" value="ایران, امریکا, چین, اتحادیه اروپا" />
        <label>محدودیت‌ها (کاما جدا)</label>
        <input class="scenario-input" data-scenario-id="constraints-${suffix}" value="تحریم, محدودیت بیمه, ریسک اعتباری, تاخیر بندری" />
      </section>
    `;
  }

  private renderOutput(
    baselineOutput: ScenarioEngineOutput,
    optimisticOutput: ScenarioEngineOutput,
    pessimisticOutput: ScenarioEngineOutput,
  ): string {
    const sectorRows = [
      { label: 'انرژی', b: baselineOutput.energy.baseline, o: optimisticOutput.energy.optimistic, p: pessimisticOutput.energy.pessimistic },
      { label: 'کشتیرانی', b: baselineOutput.shipping.baseline, o: optimisticOutput.shipping.optimistic, p: pessimisticOutput.shipping.pessimistic },
      { label: 'بازارهای مالی', b: baselineOutput.financialMarkets.baseline, o: optimisticOutput.financialMarkets.optimistic, p: pessimisticOutput.financialMarkets.pessimistic },
    ];

    const countryRows = baselineOutput.countryRiskIndex.slice(0, 6).map((country) => `
      <tr>
        <td>${escapeHtml(country.name)}</td>
        <td>${country.baseline}</td>
        <td>${country.optimistic}</td>
        <td>${country.pessimistic}</td>
      </tr>
    `).join('');

    const bars = sectorRows.map((row) => `
      <div class="scenario-bar-row">
        <span>${escapeHtml(row.label)}</span>
        <div class="scenario-bar-track">
          <div class="scenario-bar baseline" style="width:${row.b}%"></div>
          <div class="scenario-bar optimistic" style="width:${row.o}%"></div>
          <div class="scenario-bar pessimistic" style="width:${row.p}%"></div>
        </div>
      </div>
    `).join('');

    return `
      <section class="scenario-output">
        <h4>مقایسه اثرات زنجیره‌ای</h4>
        <table class="scenario-table">
          <thead><tr><th>بخش</th><th>پایه</th><th>خوش‌بینانه</th><th>بدبینانه</th></tr></thead>
          <tbody>
            ${sectorRows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.b}</td><td>${row.o}</td><td>${row.p}</td></tr>`).join('')}
          </tbody>
        </table>
        <div class="scenario-bars">${bars}</div>
        <h4>شاخص ریسک کشورها</h4>
        <table class="scenario-table">
          <thead><tr><th>کشور</th><th>پایه</th><th>خوش‌بینانه</th><th>بدبینانه</th></tr></thead>
          <tbody>${countryRows}</tbody>
        </table>
      </section>
    `;
  }
}
