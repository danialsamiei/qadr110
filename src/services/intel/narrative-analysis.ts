import type { ClusteredEvent, NewsItem } from '@/types';

export type SupportedNarrativeLanguage = 'fa' | 'ar' | 'he' | 'tr' | 'zh' | 'ru' | 'hy' | 'es' | 'fr' | 'de' | 'en';
export type PoliticalBloc = 'western' | 'resistance' | 'eurasian' | 'regional' | 'non-aligned';

export interface SourceBackedEvidence {
  source: string;
  url: string;
  claim: string;
  language: SupportedNarrativeLanguage;
  confidence: number;
}

export interface BlocNarrativeView {
  bloc: PoliticalBloc;
  avgPolarity: number;
  framingWeight: number;
  propagandaIntensity: number;
  confidence: number;
  sourceCount: number;
}

export interface NarrativeMetrics {
  narrativePolarity: number;
  framingShift: number;
  propagandaIntensity: number;
}

export interface EventNarrativeAnalysis {
  eventId: string;
  title: string;
  alignedNarrative: string;
  metrics: NarrativeMetrics;
  blocs: BlocNarrativeView[];
  evidence: SourceBackedEvidence[];
  confidence: number;
}

const SUPPORTED_LANGS = new Set<SupportedNarrativeLanguage>(['fa', 'ar', 'he', 'tr', 'zh', 'ru', 'hy', 'es', 'fr', 'de', 'en']);

const BLOC_HINTS: Record<PoliticalBloc, string[]> = {
  western: ['reuters', 'ap', 'bbc', 'dw', 'france24', 'cnn', 'fox', 'nato', 'eu', 'guardian'],
  resistance: ['fars', 'al mayadeen', 'almanar', 'tasnim', 'press tv', 'almasirah', 'hamas', 'hezbollah'],
  eurasian: ['xinhua', 'global times', 'tass', 'ria', 'sputnik', 'rt', 'kremlin', 'cctv'],
  regional: ['al jazeera', 'hurriyet', 'haaretz', 'times of israel', 'anadolu', 'arab news'],
  'non-aligned': [],
};

const PROPAGANDA_CUES = ['existential', 'traitor', 'regime', 'martyr', 'liberation', 'genocide', 'annihilation', 'disinformation', 'fake news'];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeArabicScript(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ی')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function normalizePersian(text: string): string {
  return text
    .replace(/ك/g, 'ک')
    .replace(/ي/g, 'ی')
    .replace(/[\u06F0-\u06F9]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

function detectLanguage(text: string, hint?: string): SupportedNarrativeLanguage {
  if (hint && SUPPORTED_LANGS.has(hint as SupportedNarrativeLanguage)) return hint as SupportedNarrativeLanguage;
  if (/[\u0600-\u06FF]/.test(text)) return /[\u06A9\u06AF\u06CC\u067E\u0698\u0686]/.test(text) ? 'fa' : 'ar';
  if (/[\u0590-\u05FF]/.test(text)) return 'he';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
  if (/[\u0400-\u04FF]/.test(text)) return 'ru';
  if (/[\u0530-\u058F]/.test(text)) return 'hy';
  if (/[çğıİöşü]/i.test(text)) return 'tr';
  if (/[ñ¿¡]/i.test(text)) return 'es';
  if (/[àâæçéèêëîïôœùûüÿ]/i.test(text)) return 'fr';
  if (/[äöüß]/i.test(text)) return 'de';
  return 'en';
}

function normalizeByLanguage(text: string, lang: SupportedNarrativeLanguage): string {
  const nfc = text.normalize('NFKC').toLowerCase();
  if (lang === 'fa') return normalizeWhitespace(normalizePersian(normalizeArabicScript(nfc)));
  if (lang === 'ar') return normalizeWhitespace(normalizeArabicScript(nfc));
  if (lang === 'he') return normalizeWhitespace(nfc.replace(/[\u0591-\u05C7]/g, ''));
  if (lang === 'tr') return normalizeWhitespace(nfc.replace(/ı/g, 'i'));
  return normalizeWhitespace(nfc);
}

function inferPoliticalBloc(item: NewsItem): PoliticalBloc {
  const hay = `${item.source} ${item.title}`.toLowerCase();
  for (const [bloc, hints] of Object.entries(BLOC_HINTS) as Array<[PoliticalBloc, string[]]>) {
    if (hints.some((h) => hay.includes(h))) return bloc;
  }
  return 'non-aligned';
}

function lexicalPolarity(text: string): number {
  const positive = ['agreement', 'ceasefire', 'aid', 'cooperation', 'stability', 'dialogue', 'growth'];
  const negative = ['attack', 'sanction', 'conflict', 'strike', 'threat', 'crisis', 'war'];
  const lc = text.toLowerCase();
  const p = positive.reduce((acc, t) => acc + (lc.includes(t) ? 1 : 0), 0);
  const n = negative.reduce((acc, t) => acc + (lc.includes(t) ? 1 : 0), 0);
  if (p === 0 && n === 0) return 0;
  return Math.max(-1, Math.min(1, (p - n) / (p + n)));
}

function propagandaScore(item: NewsItem, normalizedText: string): number {
  const cueHits = PROPAGANDA_CUES.reduce((acc, cue) => acc + (normalizedText.includes(cue) ? 1 : 0), 0);
  const sourceBoost = inferPoliticalBloc(item) === 'non-aligned' ? 0.08 : 0.2;
  return clamp01(sourceBoost + Math.min(0.6, cueHits * 0.15));
}

function confidenceFromItem(item: NewsItem, lang: SupportedNarrativeLanguage): number {
  const hasGeo = item.lat != null && item.lon != null;
  const tierBoost = item.tier ? Math.max(0, (5 - item.tier) * 0.1) : 0.25;
  const langBoost = SUPPORTED_LANGS.has(lang) ? 0.1 : 0;
  return clamp01(0.35 + tierBoost + langBoost + (hasGeo ? 0.1 : 0));
}

function alignNarrative(items: Array<{ normalizedTitle: string }>): string {
  const tokenCount = new Map<string, number>();
  for (const item of items) {
    const tokens = item.normalizedTitle.split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 4);
    const seen = new Set(tokens);
    for (const token of seen) tokenCount.set(token, (tokenCount.get(token) ?? 0) + 1);
  }
  return Array.from(tokenCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([t]) => t)
    .join(' · ');
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((acc, v) => acc + ((v - mean) ** 2), 0) / values.length;
}

export function buildNarrativeAnalysis(news: NewsItem[], clusters: ClusteredEvent[] = []): EventNarrativeAnalysis[] {
  const clusterMap = new Map<string, NewsItem[]>();
  if (clusters.length > 0) {
    for (const c of clusters) clusterMap.set(c.id, c.allItems);
  } else {
    clusterMap.set('all-news', news.slice(0, 40));
  }

  const analyses: EventNarrativeAnalysis[] = [];
  for (const [eventId, itemsRaw] of clusterMap.entries()) {
    const items = itemsRaw.slice(0, 18);
    if (items.length < 3) continue;

    const processed = items.map((item) => {
      const lang = detectLanguage(item.title, item.lang);
      const normalizedTitle = normalizeByLanguage(item.title, lang);
      const bloc = inferPoliticalBloc(item);
      const polarity = lexicalPolarity(normalizedTitle);
      const propaganda = propagandaScore(item, normalizedTitle);
      const confidence = confidenceFromItem(item, lang);
      return { item, lang, normalizedTitle, bloc, polarity, propaganda, confidence };
    });

    const byBloc = new Map<PoliticalBloc, typeof processed>();
    for (const p of processed) {
      const arr = byBloc.get(p.bloc) ?? [];
      arr.push(p);
      byBloc.set(p.bloc, arr);
    }

    const blocViews: BlocNarrativeView[] = Array.from(byBloc.entries()).map(([bloc, list]) => ({
      bloc,
      sourceCount: list.length,
      avgPolarity: list.reduce((a, b) => a + b.polarity, 0) / list.length,
      framingWeight: Math.min(100, list.length * 12),
      propagandaIntensity: Math.round((list.reduce((a, b) => a + b.propaganda, 0) / list.length) * 100),
      confidence: list.reduce((a, b) => a + b.confidence, 0) / list.length,
    })).sort((a, b) => b.sourceCount - a.sourceCount);

    const overallPolarity = processed.reduce((a, b) => a + b.polarity, 0) / processed.length;
    const framingShift = Math.min(100, Math.round(Math.sqrt(variance(blocViews.map((x) => x.avgPolarity))) * 130));
    const propagandaIntensity = Math.round((processed.reduce((a, b) => a + b.propaganda, 0) / processed.length) * 100);
    const evidence = processed
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map((p) => ({
        source: p.item.source,
        url: p.item.link,
        claim: p.item.title,
        language: p.lang,
        confidence: p.confidence,
      }));

    analyses.push({
      eventId,
      title: items[0]?.title ?? 'Event Narrative',
      alignedNarrative: alignNarrative(processed),
      metrics: {
        narrativePolarity: overallPolarity,
        framingShift,
        propagandaIntensity,
      },
      blocs: blocViews,
      evidence,
      confidence: processed.reduce((a, b) => a + b.confidence, 0) / processed.length,
    });
  }

  return analyses
    .sort((a, b) => b.metrics.framingShift - a.metrics.framingShift)
    .slice(0, 8);
}
