import { Panel } from './Panel';

const PROMPT_TEMPLATES = [
  {
    title: 'تحلیل جنگ روایت',
    prompt: 'با تکیه بر داده‌های خبری ۲۴ ساعت اخیر، مهم‌ترین شکاف‌های روایی، سوگیری‌های ایدئولوژیک و تکنیک‌های رسانه‌ای را استخراج کن و خروجی را به‌صورت جدول «ادعا، منبع، شواهد مخالف، سطح اطمینان» ارائه بده.',
  },
  {
    title: 'ارزیابی تاب‌آوری ملی',
    prompt: 'برای کشور هدف، شاخص‌های تاب‌آوری ملی، اقتصادی، نظامی و شناختی را با وزن‌دهی شفاف محاسبه کن و سناریوهای خوش‌بینانه/پایه/بدبینانه ۳۰ روزه ارائه بده.',
  },
  {
    title: 'هشدار مدیریت بحران',
    prompt: 'بر اساس سیگنال‌های امنیتی، اجتماعی و اقتصادی، ۵ ریسک اولویت‌دار را معرفی کن و برای هرکدام برنامه اقدام ۷۲ ساعته سازگار با حقوق بشر و قوانین بین‌المللی پیشنهاد بده.',
  },
];

export class QadrAssistantPanel extends Panel {
  constructor() {
    super({ id: 'qadr-assistant', title: 'چت‌بات راهنمای QADR110', className: 'panel-wide' });
    this.renderPanel();
  }

  private renderPanel(): void {
    const cards = PROMPT_TEMPLATES.map((item, idx) => `
      <article class="qadr-assistant-card">
        <h4>${idx + 1}. ${item.title}</h4>
        <textarea readonly class="qadr-assistant-prompt">${item.prompt}</textarea>
        <button class="qadr-copy-prompt" data-prompt="${encodeURIComponent(item.prompt)}">کپی پرامپت</button>
      </article>
    `).join('');

    this.setContent(`
      <div class="qadr-assistant" style="direction:rtl;text-align:right;display:grid;gap:12px;line-height:1.8">
        <p>این پنل برای مهندسی پرامپت، هدایت تحلیل‌های OSINT، سیاست‌گذاری و تصمیم‌سازی چندمدلی طراحی شده است. می‌توانید پرامپت‌ها را مستقیم در OpenRouter، Ollama یا vLLM استفاده کنید.</p>
        ${cards}
        <div>
          <strong>اتصالات پیشنهادی:</strong>
          <ul style="margin:6px 0 0;padding-inline-start:18px;">
            <li>OpenRouter برای تحلیل چندمدلی پیشرفته</li>
            <li>Ollama/vLLM برای پردازش محلی و پایدار</li>
            <li>ربات Telegram/Bale برای دریافت هشدار و گزارش</li>
          </ul>
        </div>
      </div>
    `);

    this.content.querySelectorAll<HTMLButtonElement>('.qadr-copy-prompt').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const encoded = btn.dataset.prompt || '';
        const text = decodeURIComponent(encoded);
        try {
          await navigator.clipboard.writeText(text);
          btn.textContent = 'کپی شد ✓';
          setTimeout(() => { btn.textContent = 'کپی پرامپت'; }, 1200);
        } catch {
          btn.textContent = 'عدم دسترسی به کلیپ‌بورد';
          setTimeout(() => { btn.textContent = 'کپی پرامپت'; }, 1200);
        }
      });
    });
  }
}
