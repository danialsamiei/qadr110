export type ReleaseNoteSection = {
  title: string;
  items: string[];
};

export type ReleaseNoteLink = {
  label: string;
  url: string;
};

export type ReleaseNoteEntry = {
  version: string;
  date: string;
  title: string;
  summary: string;
  deployment: string[];
  sections: ReleaseNoteSection[];
  links: ReleaseNoteLink[];
};

export const CURRENT_RELEASE: ReleaseNoteEntry = {
  version: '2026.03.16',
  date: '2026-03-16',
  title: 'Upstream sync, NRC rollout, and production refresh',
  summary: 'QADR110 روی آخرین upstream همگام شد و حالا هم ماژول‌های جدید NRC/CSRC و هم پنل‌های عملیاتی فعال‌شده‌ی تحلیل رسانه، ترافیک و سایبر را در همان استقرار production نشان می‌دهد.',
  deployment: [
    'Production URL: https://qadr.alefba.dev',
    'Origin host: http://192.168.1.225:3000',
    'Tunnel: cloudflared alefba-ubuntu -> localhost:3000',
  ],
  sections: [
    {
      title: 'Upstream from GitHub',
      items: [
        'National Resilience Coefficient (NRC) با امتیازدهی شش‌دامنه‌ای، heatmap و پنل analytics به نسخه production اضافه شد.',
        'ماژول CSRC برای ارزیابی شناختی-اجتماعی به همراه داده‌ها و map-layer مرتبط وارد شاخه استقرار شد.',
        'مستندات architecture review و technical debt از upstream جدید به پروژه اضافه شد.',
      ],
    },
    {
      title: 'Operational surfaces enabled',
      items: [
        'منوی تحلیلی بالای داشبورد حالا رسانه، Pipeline، Telegram، Instagram، X، Aparat، Telewebion، GDELT، NetBlocks، GoogleTrends، ترافیک، سایبر، IXP، DSS و ESS را به پنل‌های واقعی وصل می‌کند.',
        'پنل Maritime Traffic و مسیرهای تمرکز روی Airline Intelligence برای رصد هوایی و دریایی در استقرار production فعال است.',
        'پنل‌های ایران‌محور مانند Media Pipelines، Iran Media Matrix و Infra/Traffic/Cyber روی layout اصلی build شده‌اند و در dashboard دیده می‌شوند.',
      ],
    },
    {
      title: 'Release operations',
      items: [
        'Change Log داخل خود سامانه به‌صورت پنل مستقل اضافه شد تا اپراتور بدون خروج از UI release notes را ببیند.',
        'CHANGELOG.md در ریشه repo اضافه شد و از README لینک شده تا تاریخچه‌ی همین استقرار در GitHub هم قابل رجوع باشد.',
        'برای release server همچنان dist production به‌صورت محلی build و به Ubuntu upload می‌شود، چون build مستقیم Vite روی host ممکن است segfault بدهد.',
      ],
    },
  ],
  links: [
    { label: 'GitHub Repository', url: 'https://github.com/danialsamiei/qadr110' },
    { label: 'GitHub Release Note', url: 'https://github.com/danialsamiei/qadr110/blob/h2q9xv-codex/final-qadr110-handoff/docs/production-release-2026-03-16.md' },
    { label: 'Handoff PR', url: 'https://github.com/danialsamiei/qadr110/pull/17' },
  ],
};
