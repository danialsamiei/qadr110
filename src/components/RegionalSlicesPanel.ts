import { Panel } from './Panel';

const COUNTRY_SLICES: Record<string, string[]> = {
  ایران: ['تهران', 'اصفهان', 'خوزستان', 'آذربایجان شرقی', 'خراسان رضوی', 'فارس'],
  اسرائیل: ['تل‌آویو', 'اورشلیم', 'حیفا', 'بئرشبع'],
  عراق: ['بغداد', 'بصره', 'اربیل', 'موصل'],
  روسیه: ['مسکو', 'سن‌پترزبورگ', 'تاتارستان', 'قفقاز شمالی'],
  ترکیه: ['استانبول', 'آنکارا', 'ازمیر', 'غازی‌آنتپ'],
  امارات: ['ابوظبی', 'دبی', 'شارجه'],
  بحرین: ['منامه', 'محرق'],
  قطر: ['دوحه', 'الریان'],
  کویت: ['کویت‌سیتی', 'حوالی'],
  یمن: ['صنعا', 'عدن', 'الحدیده'],
  عربستان: ['ریاض', 'جده', 'دمام', 'مکه'],
  لبنان: ['بیروت', 'طرابلس', 'بقاع'],
};

export class RegionalSlicesPanel extends Panel {
  constructor() {
    super({ id: 'regional-slices', title: 'برش‌های منطقه‌ای/شهری/استانی', className: 'panel-wide' });
    this.renderSlices();
  }

  private renderSlices(): void {
    const sections = Object.entries(COUNTRY_SLICES).map(([country, slices]) => `
      <div>
        <strong>${country}</strong>
        <div style="margin-top:4px;opacity:.9">${slices.join(' • ')}</div>
      </div>
    `).join('');

    this.setContent(`<div style="direction:rtl;text-align:right;display:grid;gap:10px;line-height:1.8">${sections}</div>`);
  }
}
