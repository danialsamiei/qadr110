export type QadrDesktopWindowState = 'open' | 'minimized' | 'closed';
export type QadrDesktopWindowStatus = 'off' | 'limited' | 'loading' | 'ready';

export interface QadrDesktopWindowRecord {
  id: string;
  title: string;
  state: QadrDesktopWindowState;
  status: QadrDesktopWindowStatus;
  minimizable?: boolean;
  closable?: boolean;
  kind?: 'custom';
}

const STORAGE_KEY = 'qadr110-desktop-custom-windows';

type Listener = () => void;

const records = new Map<string, QadrDesktopWindowRecord>();
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function loadStoredState(): Record<string, Pick<QadrDesktopWindowRecord, 'state' | 'status'>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Pick<QadrDesktopWindowRecord, 'state' | 'status'>>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveStoredState(): void {
  try {
    const payload = Object.fromEntries(
      Array.from(records.entries()).map(([id, value]) => [
        id,
        {
          state: value.state,
          status: value.status,
        },
      ]),
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
}

export function registerDesktopWindow(record: QadrDesktopWindowRecord): QadrDesktopWindowRecord {
  const stored = loadStoredState()[record.id];
  const merged: QadrDesktopWindowRecord = {
    kind: 'custom',
    minimizable: true,
    closable: true,
    ...record,
    ...(stored ?? {}),
  };
  const current = records.get(record.id);
  if (current && JSON.stringify(current) === JSON.stringify(merged)) {
    return current;
  }
  records.set(record.id, merged);
  saveStoredState();
  emit();
  return merged;
}

export function updateDesktopWindow(
  id: string,
  patch: Partial<QadrDesktopWindowRecord>,
): QadrDesktopWindowRecord | null {
  const current = records.get(id);
  if (!current) return null;
  const next = { ...current, ...patch };
  if (JSON.stringify(current) === JSON.stringify(next)) {
    return current;
  }
  records.set(id, next);
  saveStoredState();
  emit();
  return next;
}

export function setDesktopWindowState(id: string, state: QadrDesktopWindowState): QadrDesktopWindowRecord | null {
  return updateDesktopWindow(id, { state });
}

export function getDesktopWindow(id: string): QadrDesktopWindowRecord | null {
  return records.get(id) ?? null;
}

export function listDesktopWindows(): QadrDesktopWindowRecord[] {
  return Array.from(records.values());
}

export function subscribeDesktopWindows(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
