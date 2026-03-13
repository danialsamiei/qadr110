export type MediaLean = 'government' | 'independent' | 'opposition';
export type Platform = 'telegram' | 'instagram' | 'x' | 'web';

export interface MediaSource {
  name: string;
  country: 'IR' | 'IL';
  lean: MediaLean;
  platform: Platform;
  url: string;
}

export interface PipelineDef {
  id: string;
  title: string;
  countries: Array<'IR' | 'IL'>;
  platforms: Platform[];
  cadence: 'realtime' | 'semi_realtime' | 'batch';
  objective: string;
  sources: MediaSource[];
}

export const MEDIA_PIPELINES: PipelineDef[] = [
  {
    id: 'ir-mainstream-gov',
    title: 'پایپلاین رسانه‌های حکومتی ایران',
    countries: ['IR'],
    platforms: ['telegram', 'web', 'x'],
    cadence: 'semi_realtime',
    objective: 'رصد روایت رسمی، مواضع حاکمیتی و سیگنال‌های سیاستی',
    sources: [
      { name: 'IRIB News', country: 'IR', lean: 'government', platform: 'web', url: 'https://www.iribnews.ir' },
      { name: 'IRNA', country: 'IR', lean: 'government', platform: 'web', url: 'https://www.irna.ir' },
      { name: 'Fars', country: 'IR', lean: 'government', platform: 'web', url: 'https://www.farsnews.ir' },
      { name: 'Telewebion', country: 'IR', lean: 'government', platform: 'web', url: 'https://www.telewebion.com' },
    ],
  },
  {
    id: 'ir-independent-opposition',
    title: 'پایپلاین رسانه‌های مستقل/اپوزیسیون ایران',
    countries: ['IR'],
    platforms: ['telegram', 'instagram', 'x', 'web'],
    cadence: 'semi_realtime',
    objective: 'تحلیل شکاف روایت داخلی/برون‌مرزی و بررسی تناقض‌های رسانه‌ای',
    sources: [
      { name: 'BBC Persian', country: 'IR', lean: 'opposition', platform: 'web', url: 'https://www.bbc.com/persian' },
      { name: 'Iran International', country: 'IR', lean: 'opposition', platform: 'web', url: 'https://www.iranintl.com' },
      { name: 'Radio Farda', country: 'IR', lean: 'opposition', platform: 'web', url: 'https://www.radiofarda.com' },
      { name: 'ISNA', country: 'IR', lean: 'independent', platform: 'web', url: 'https://www.isna.ir' },
      { name: 'Aparat', country: 'IR', lean: 'independent', platform: 'web', url: 'https://www.aparat.com' },
    ],
  },
  {
    id: 'il-mainstream-spectrum',
    title: 'پایپلاین طیف رسانه‌ای اسرائیل',
    countries: ['IL'],
    platforms: ['telegram', 'x', 'web'],
    cadence: 'semi_realtime',
    objective: 'پایش رسانه‌های رسمی، جریان اصلی و منتقد برای تحلیل تنش/درگیری',
    sources: [
      { name: 'The Times of Israel', country: 'IL', lean: 'independent', platform: 'web', url: 'https://www.timesofisrael.com' },
      { name: 'Haaretz', country: 'IL', lean: 'independent', platform: 'web', url: 'https://www.haaretz.com' },
      { name: 'Jerusalem Post', country: 'IL', lean: 'independent', platform: 'web', url: 'https://www.jpost.com' },
      { name: 'Kan News', country: 'IL', lean: 'government', platform: 'web', url: 'https://www.kan.org.il' },
    ],
  },
  {
    id: 'cross-platform-narrative-diff',
    title: 'پایپلاین مقایسه روایت IR/IL چندپلتفرمی',
    countries: ['IR', 'IL'],
    platforms: ['telegram', 'instagram', 'x', 'web'],
    cadence: 'realtime',
    objective: 'کشف اختلاف روایت، استاندارد دوگانه، و تغییرات ناگهانی در framing',
    sources: [],
  },
];

export function pipelineStats(): { totalPipelines: number; totalSources: number } {
  const totalSources = MEDIA_PIPELINES.reduce((sum, p) => sum + p.sources.length, 0);
  return { totalPipelines: MEDIA_PIPELINES.length, totalSources };
}
