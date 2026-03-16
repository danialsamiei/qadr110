import type { QueryNormalizationResult } from './contracts';

const TERM_MAP: Array<{
  canonical: string;
  variants: string[];
  expansions: string[];
}> = [
  {
    canonical: 'تاب‌آوری',
    variants: ['تاب اوری', 'تاب‌آوری', 'تاباوری', 'resilience'],
    expansions: ['تاب‌آوری', 'resilience', 'پایداری', 'continuity'],
  },
  {
    canonical: 'تحریم',
    variants: ['تحریم', 'sanction', 'sanctions'],
    expansions: ['تحریم', 'sanctions', 'trade restriction', 'financial pressure'],
  },
  {
    canonical: 'روایت',
    variants: ['روایت', 'narrative', 'میدان ادراکی'],
    expansions: ['روایت', 'narrative', 'media framing', 'cognitive domain'],
  },
  {
    canonical: 'زیرساخت',
    variants: ['زیرساخت', 'infrastructure', 'critical infrastructure'],
    expansions: ['زیرساخت', 'infrastructure', 'critical infrastructure', 'lifeline systems'],
  },
  {
    canonical: 'مرز',
    variants: ['مرز', 'border', 'frontier'],
    expansions: ['مرز', 'border', 'crossing', 'frontier dynamics'],
  },
  {
    canonical: 'اطلاعات نادرست',
    variants: ['اطلاعات نادرست', 'misinformation', 'disinformation'],
    expansions: ['misinformation', 'disinformation', 'اطلاعات نادرست', 'influence operation'],
  },
  {
    canonical: 'اقتصاد',
    variants: ['اقتصاد', 'economic', 'macroeconomic'],
    expansions: ['اقتصاد', 'economic', 'macroeconomic', 'market resilience'],
  },
];

function normalizeArabicChars(value: string): string {
  return value
    .replace(/[يى]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function detectLanguage(value: string): QueryNormalizationResult['language'] {
  const hasFa = /[\u0600-\u06ff]/.test(value);
  const hasLatin = /[a-z]/i.test(value);
  if (hasFa && hasLatin) return 'mixed';
  return hasFa ? 'fa' : 'en';
}

export function normalizePersianIntelligenceQuery(query: string): QueryNormalizationResult {
  const normalizedQuery = normalizeArabicChars(query);
  const expanded = new Set<string>([normalizedQuery]);
  const terminologyMatches: string[] = [];

  for (const term of TERM_MAP) {
    if (term.variants.some((variant) => normalizedQuery.includes(normalizeArabicChars(variant)))) {
      terminologyMatches.push(term.canonical);
      term.expansions.forEach((expansion) => expanded.add(normalizeArabicChars(expansion)));
    }
  }

  const words = normalizedQuery.split(' ').filter(Boolean);
  if (words.length > 2) {
    expanded.add(words.slice(0, 4).join(' '));
  }

  return {
    normalizedQuery,
    expandedQueries: [...expanded].slice(0, 8),
    language: detectLanguage(normalizedQuery),
    terminologyMatches,
  };
}
