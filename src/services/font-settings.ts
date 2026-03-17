import { QADR_FONT_FAMILY_KEY, readBrandStorageItem } from '@/utils/qadr-branding';

export type FontFamily = 'mono' | 'system';

const STORAGE_KEY = QADR_FONT_FAMILY_KEY;
const EVENT_NAME = 'qadr110-font-changed';

const ALLOWED: FontFamily[] = ['mono', 'system'];

const SYSTEM_FONT_STACK =
  "'Vazirmatn', 'IRANSansX', 'Tahoma', 'Segoe UI', system-ui, sans-serif";

export function getFontFamily(): FontFamily {
  try {
    const raw = readBrandStorageItem(STORAGE_KEY);
    if (raw && ALLOWED.includes(raw as FontFamily)) return raw as FontFamily;
  } catch {
    // ignore
  }
  return 'system';
}

export function setFontFamily(font: FontFamily): void {
  const safe = ALLOWED.includes(font) ? font : 'system';
  try {
    localStorage.setItem(STORAGE_KEY, safe);
  } catch {
    // ignore
  }
  applyFont(safe);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { font: safe } }));
}

export function applyFont(font?: FontFamily): void {
  const resolved = font ?? getFontFamily();
  if (resolved === 'system') {
    document.documentElement.style.setProperty('--font-body', SYSTEM_FONT_STACK);
  } else {
    document.documentElement.style.removeProperty('--font-body');
  }
}

export function subscribeFontChange(cb: (font: FontFamily) => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as { font?: FontFamily } | undefined;
    cb(detail?.font ?? getFontFamily());
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
