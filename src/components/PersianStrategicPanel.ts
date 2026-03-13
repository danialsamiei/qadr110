import { Panel } from './Panel';

export class PersianStrategicPanel extends Panel {
  constructor() {
    super({ id: 'persian-analysis', title: 'تحلیل راهبردی فارسی', className: 'panel-wide' });
    this.renderContent();
  }

  private renderContent(): void {
    this.setContent(`
      <div style="display:grid;gap:10px;text-align:right;direction:rtl;line-height:1.8">
        <section>
          <strong>بخش ویژه غرب آسیا (خاورمیانه)</strong>
          <div>پایش سناریوهای نبرد ایران، وضعیت تنگه هرمز، خلیج فارس، نفت، طلا و فلزات گران‌بها، و بورس‌های بین‌المللی.</div>
        </section>
        <section>
          <strong>تاب‌آوری کشورها</strong>
          <ul style="margin:6px 0 0;padding-inline-start:18px;">
            <li>تاب‌آوری ملی</li>
            <li>تاب‌آوری اقتصادی</li>
            <li>تاب‌آوری نظامی</li>
            <li>تاب‌آوری شناختی</li>
          </ul>
        </section>
        <section>
          <strong>طیف حمایت بین‌المللی</strong>
          <div>از «حمایت از جبهه مقاومت» تا «مخالفت بین‌المللی» در یک طیف پیوسته قابل رصد.</div>
          <div style="font-family:monospace">حمایت کامل ███████░░░ مخالفت</div>
        </section>
        <section>
          <strong>منابع چندزبانه تحلیل</strong>
          <div>فارسی، عربی، عبری، ترکی، چینی، روسی، ارمنی، اسپانیایی، فرانسوی و آلمانی.</div>
        </section>
        <section>
          <strong>تحلیل روند + پیش‌بینی سناریو</strong>
          <div>نمودارهای روند با پرچم رویدادهای مهم، بک‌تست (Backtest) و پیش‌بینی (Forecast) برای سناریوهای خوش‌بینانه/پایه/بدبینانه.</div>
          <div style="font-family:monospace">سناریو بدبینانه ▁▂▃▅▇ | پایه ▁▃▄▅▆ | خوش‌بینانه ▁▂▄▆█</div>
        </section>
        <section>
          <strong>منوهای پیشرفته داده</strong>
          <div>اتصال تحلیلی به داده‌های ژئوپلیتیک و Polymarket برای سنجش احتمال رخدادها و اثرات بازار.</div>
        </section>
      </div>
    `);
  }
}
