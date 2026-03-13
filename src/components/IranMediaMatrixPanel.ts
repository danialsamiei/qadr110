import { Panel } from './Panel';

type MediaGroup = { title: string; items: Array<{ name: string; url: string; tag: string }> };

const GROUPS: MediaGroup[] = [
  {
    title: 'رسانه‌های حکومتی/رسمی ایران',
    items: [
      { name: 'IRIB News', url: 'https://www.iribnews.ir', tag: 'حکومتی' },
      { name: 'خبرگزاری ایرنا', url: 'https://www.irna.ir', tag: 'رسمی' },
      { name: 'خبرگزاری فارس', url: 'https://www.farsnews.ir', tag: 'حکومتی' },
      { name: 'تلوبیون', url: 'https://www.telewebion.com', tag: 'پخش زنده' },
      { name: 'آپارات', url: 'https://www.aparat.com', tag: 'ویدئو' },
    ],
  },
  {
    title: 'رسانه‌های مستقل/تحلیلی فارسی',
    items: [
      { name: 'ایسنا', url: 'https://www.isna.ir', tag: 'مستقل' },
      { name: 'خبرآنلاین', url: 'https://www.khabaronline.ir', tag: 'تحلیلی' },
      { name: 'دنیای اقتصاد', url: 'https://donya-e-eqtesad.com', tag: 'اقتصادی' },
    ],
  },
  {
    title: 'رسانه‌های برون‌مرزی/اپوزیسیون',
    items: [
      { name: 'Iran International', url: 'https://www.iranintl.com', tag: 'برون‌مرزی' },
      { name: 'BBC Persian', url: 'https://www.bbc.com/persian', tag: 'برون‌مرزی' },
      { name: 'Radio Farda', url: 'https://www.radiofarda.com', tag: 'اپوزیسیون' },
      { name: 'VOA Persian', url: 'https://ir.voanews.com', tag: 'برون‌مرزی' },
    ],
  },
];

export class IranMediaMatrixPanel extends Panel {
  constructor() {
    super({ id: 'iran-media-matrix', title: 'ماتریس رسانه‌ای ایران (درون/برون‌مرزی)', className: 'panel-wide' });
    this.renderPanel();
  }

  private renderPanel(): void {
    const html = GROUPS.map((g) => `
      <section>
        <h4 style="margin:0 0 6px">${g.title}</h4>
        <ul style="margin:0;padding-inline-start:18px;display:grid;gap:5px">
          ${g.items.map((i) => `<li><a href="${i.url}" target="_blank" rel="noopener">${i.name}</a> <small style="opacity:.75">(${i.tag})</small></li>`).join('')}
        </ul>
      </section>
    `).join('');

    this.setContent(`
      <div style="direction:rtl;text-align:right;display:grid;gap:12px;line-height:1.8">
        <p>این پنل برای رصد علمی و حرفه‌ای جریان روایت، سوگیری سیاسی-ایدئولوژیک و مقایسه پوشش رسانه‌ای در بلوک‌های مختلف طراحی شده است.</p>
        ${html}
      </div>
    `);
  }
}
