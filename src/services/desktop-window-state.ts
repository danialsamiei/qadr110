import { isDesktopRuntime } from './runtime';

type WindowStateModule = typeof import('@tauri-apps/plugin-window-state');

let pluginPromise: Promise<WindowStateModule | null> | null = null;
let persistenceRegistered = false;

async function getWindowStatePlugin(): Promise<WindowStateModule | null> {
  if (!isDesktopRuntime()) return null;
  if (!pluginPromise) {
    pluginPromise = import('@tauri-apps/plugin-window-state')
      .catch((error) => {
        console.warn('[desktop-window-state] Plugin unavailable', error);
        return null;
      });
  }
  return pluginPromise;
}

export async function restoreCurrentDesktopWindowState(): Promise<void> {
  const plugin = await getWindowStatePlugin();
  if (!plugin) return;
  try {
    await plugin.restoreStateCurrent(plugin.StateFlags.ALL);
  } catch (error) {
    console.warn('[desktop-window-state] Failed to restore current window state', error);
  }
}

export async function saveDesktopWindowState(): Promise<void> {
  const plugin = await getWindowStatePlugin();
  if (!plugin) return;
  try {
    await plugin.saveWindowState(plugin.StateFlags.ALL);
  } catch (error) {
    console.warn('[desktop-window-state] Failed to save window state', error);
  }
}

export function registerDesktopWindowStatePersistence(): void {
  if (!isDesktopRuntime() || typeof window === 'undefined' || persistenceRegistered) return;

  const persist = () => {
    void saveDesktopWindowState();
  };

  window.addEventListener('beforeunload', persist);
  window.addEventListener('pagehide', persist);
  persistenceRegistered = true;
}
