import { Panel } from './Panel';

const SOURCES = [
  'پایگاه‌های عمومی نشت داده و هشدار CERT',
  'فیدهای تهدیدپژوهی قانونی (OSINT امنیتی)',
  'داده‌های C2/TLP-compatible و IOC feeds',
  'دایرکتوری‌های تحقیقاتی قابل استناد و قانونی',
];

const USE_CASES = [
  'پایش نشتی داده سازمانی و هشدار زودهنگام',
  'کشف کمپین‌های فیشینگ/کلاهبرداری/جرایم سایبری',
  'تحلیل روایت‌های افراطی/خشونت‌زا برای پیشگیری',
  'تهیه گزارش‌های حقوق‌محور برای مدیریت بحران',
];

export class DarkwebDefensivePanel extends Panel {
  constructor() {
    super({ id: 'darkweb-defensive', title: 'رصد دفاعی DarkWeb/DarkNet', className: 'panel-wide' });
    this.renderContentSafe();
  }

  private renderContentSafe(): void {
    this.setContent(`
      <section style="direction:rtl;text-align:right;display:grid;gap:10px;line-height:1.85">
        <p><strong>چارچوب فعالیت:</strong> این ماژول صرفاً برای تحلیل تهدید، پیشگیری جرایم و حفاظت اطلاعات در چارچوب قوانین بین‌المللی و حقوق بشر طراحی شده است.</p>
        <div>
          <h4 style="margin:0 0 6px">منابع پیشنهادی (قانونی/تحقیقاتی)</h4>
          <ul style="margin:0;padding-inline-start:18px">${SOURCES.map((s) => `<li>${s}</li>`).join('')}</ul>
        </div>
        <div>
          <h4 style="margin:0 0 6px">کاربردهای عملیاتی</h4>
          <ul style="margin:0;padding-inline-start:18px">${USE_CASES.map((s) => `<li>${s}</li>`).join('')}</ul>
        </div>
        <p style="color:var(--text-secondary)">دسترسی یا راهنمایی برای نفوذ/اقدامات غیرقانونی ارائه نمی‌شود؛ تمرکز این بخش بر دفاع، هشدار، اصالت‌سنجی و سیاست‌گذاری مسئولانه است.</p>
      </section>
    `);
  }
}
