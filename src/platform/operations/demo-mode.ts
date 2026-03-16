export type DemoModeSource = 'env' | 'url' | 'storage' | 'off';

export interface DemoModeState {
  enabled: boolean;
  source: DemoModeSource;
}

const STORAGE_KEY = 'qadr110-demo-mode';

function readImportMetaFlag(): boolean {
  try {
    const raw = (import.meta as unknown as { env?: Record<string, unknown> }).env?.VITE_DEMO_MODE;
    if (raw === true) return true;
    if (typeof raw === 'string') {
      const normalized = raw.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
    }
  } catch {
    // ignore
  }
  return false;
}

function readProcessEnvFlag(): boolean {
  try {
    const raw = (typeof process !== 'undefined' ? process.env?.VITE_DEMO_MODE : undefined) as string | undefined;
    if (!raw) return false;
    const normalized = raw.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  } catch {
    return false;
  }
}

function readStorageFlag(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const normalized = raw.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  } catch {
    return false;
  }
}

function readUrlFlag(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const params = new URL(window.location.href).searchParams;
    const raw = params.get('demo');
    if (!raw) return false;
    const normalized = raw.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  } catch {
    return false;
  }
}

export function getDemoModeState(): DemoModeState {
  const envEnabled = readImportMetaFlag() || readProcessEnvFlag();
  if (envEnabled) return { enabled: true, source: 'env' };

  const urlEnabled = readUrlFlag();
  if (urlEnabled) return { enabled: true, source: 'url' };

  const storageEnabled = readStorageFlag();
  if (storageEnabled) return { enabled: true, source: 'storage' };

  return { enabled: false, source: 'off' };
}

export function isDemoModeEnabled(): boolean {
  return getDemoModeState().enabled;
}

export function setDemoModeEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (enabled) {
      localStorage.setItem(STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function initDemoModeFromUrl(): boolean {
  if (!readUrlFlag()) return false;
  const before = readStorageFlag();
  if (before) return false;
  setDemoModeEnabled(true);
  return true;
}

