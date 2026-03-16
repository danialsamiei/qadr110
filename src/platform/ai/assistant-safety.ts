export type AssistantSafetyCategory =
  | 'offensive-cyber'
  | 'weaponization'
  | 'kinetic-targeting'
  | 'intrusion'
  | 'allowed';

export interface AssistantSafetyAssessment {
  allowed: boolean;
  category: AssistantSafetyCategory;
  reason?: string;
  redirect?: string;
}

const OFFENSIVE_PATTERNS: Array<{ category: Exclude<AssistantSafetyCategory, 'allowed'>; patterns: RegExp[]; reason: string; redirect: string }> = [
  {
    category: 'offensive-cyber',
    patterns: [
      /\bexploit\b/i,
      /\bpersistence\b/i,
      /\bpayload\b/i,
      /\bcredential theft\b/i,
      /\brce\b/i,
      /\bprivilege escalation\b/i,
      /\bmalware\b/i,
      /\bphishing kit\b/i,
      /اکسپلویت/i,
      /بدافزار/i,
      /نفوذ/i,
    ],
    reason: 'راهنمای تهاجمی سایبری یا تسهیل‌کننده نفوذ در این سامانه مجاز نیست.',
    redirect: 'اگر هدفت دفاعی است، سؤال را به کشف، کاهش ریسک، سخت‌سازی، راستی‌آزمایی یا پاسخ incident بازنویسی کن.',
  },
  {
    category: 'weaponization',
    patterns: [
      /\bweapon\b/i,
      /\bdetonate\b/i,
      /\bmissile strike\b/i,
      /\bimprovised explosive\b/i,
      /ساخت (?:سلاح|مواد انفجاری)/i,
      /حمله موشکی/i,
    ],
    reason: 'راهنمای ساخت سلاح یا عملیات آسیب‌رسان در این سامانه پشتیبانی نمی‌شود.',
    redirect: 'می‌توانم به‌جای آن درباره پیامدها، سناریوهای دفاعی، حفاظت زیرساخت و تاب‌آوری توضیح بدهم.',
  },
  {
    category: 'kinetic-targeting',
    patterns: [
      /\btarget selection\b/i,
      /\bkill chain\b/i,
      /\bstrike package\b/i,
      /انتخاب هدف/i,
      /زنجیره کشتار/i,
    ],
    reason: 'هدف‌گیری یا برنامه‌ریزی اقدام کینتیکی خارج از دامنه مجاز این سامانه است.',
    redirect: 'در صورت نیاز می‌توانم ریسک، هشدار زودهنگام، پیامدهای منطقه‌ای و گزینه‌های دفاع غیرتهاجمی را تحلیل کنم.',
  },
  {
    category: 'intrusion',
    patterns: [
      /\bbypass\b/i,
      /\bevade\b/i,
      /\blateral movement\b/i,
      /\bpassword spray\b/i,
      /دور زدن/i,
      /حرکت جانبی/i,
    ],
    reason: 'گردش‌کارهای bypass، evasion یا دسترسی غیرمجاز مجاز نیستند.',
    redirect: 'سؤال را به دفاع، کشف، logging، segmentation، backup یا hardening تغییر بده تا پاسخ بدهم.',
  },
];

export function evaluateAssistantSafety(query: string): AssistantSafetyAssessment {
  const normalized = query.trim();
  if (!normalized) {
    return { allowed: true, category: 'allowed' };
  }

  for (const candidate of OFFENSIVE_PATTERNS) {
    if (candidate.patterns.some((pattern) => pattern.test(normalized))) {
      return {
        allowed: false,
        category: candidate.category,
        reason: candidate.reason,
        redirect: candidate.redirect,
      };
    }
  }

  return { allowed: true, category: 'allowed' };
}
