import { Panel } from './Panel';

const MONITOR_STREAMS = [
  { title: 'World Monitor', desc: 'نمای یکپارچه ژئوپلیتیک، اقتصاد، امنیت، انرژی و زیرساخت.' },
  { title: 'World Medias Monitor', desc: 'رصد جنگ روایت، سوگیری رسانه‌ای، جریان ترند و اصالت‌سنجی خبر.' },
  { title: 'World Conflicts Monitor', desc: 'پایش تنش‌ها، مناقشه‌ها، علائم تشدید و سناریوهای کاهش تنش.' },
  { title: 'World Cognitive War Monitor', desc: 'تحلیل عملیات شناختی، الگوهای اثرگذاری و پدافند ادراکی.' },
  { title: 'World National & Universal Resilience Monitor', desc: 'شاخص‌های تاب‌آوری ملی/منطقه‌ای/جهانی برای DSS و ESS.' },
];

const DSS_ESS_TOOLS = [
  'ماتریس تصمیم‌یار (DSS) با وزن‌دهی شاخص‌ها',
  'داشبورد مدیریتی ESS برای سطح راهبردی',
  'تحلیل سناریو: خوش‌بینانه/پایه/بدبینانه',
  'نقشه راه اقدام 24/72 ساعته',
  'تحلیل شکاف داده و اعتبار منبع',
  'گزارش‌ساز سیاستی برای Workbooks/Notebooks',
];

export class WorldMonitoringHubPanel extends Panel {
  constructor() {
    super({ id: 'world-monitoring-hub', title: 'سامانه یکپارچه DSS / ESS', className: 'panel-wide' });
    this.renderHub();
  }

  private renderHub(): void {
    const streams = MONITOR_STREAMS.map((s) => `
      <li><strong>${s.title}</strong><div>${s.desc}</div></li>
    `).join('');
    const tools = DSS_ESS_TOOLS.map((t) => `<li>${t}</li>`).join('');

    this.setContent(`
      <section style="direction:rtl;text-align:right;display:grid;gap:12px;line-height:1.85">
        <p>این هاب برای یکپارچه‌سازی رصد جهانی، رسانه‌ای، تعارضات، جنگ شناختی و تاب‌آوری با رویکرد تصمیم‌یار (DSS) و سیستم پشتیبان مدیران ارشد (ESS) طراحی شده است.</p>
        <div>
          <h4 style="margin:0 0 8px">هسته‌های مانیتورینگ</h4>
          <ul style="margin:0;padding-inline-start:18px;display:grid;gap:8px">${streams}</ul>
        </div>
        <div>
          <h4 style="margin:0 0 8px">ابزارهای عملیاتی DSS/ESS</h4>
          <ul style="margin:0;padding-inline-start:18px;display:grid;gap:6px">${tools}</ul>
        </div>
      </section>
    `);
  }
}
