/**
 * Entry point for the standalone channel management window (Tauri desktop).
 * Web version uses index.html?live-channels=1 and main.ts instead.
 */
import './styles/main.css';
import { initI18n } from '@/services/i18n';
import { prepareDesktopShellState } from '@/services/desktop-shell-store';
import {
  registerDesktopWindowStatePersistence,
  restoreCurrentDesktopWindowState,
} from '@/services/desktop-window-state';
import { applyStoredTheme } from '@/utils/theme-manager';
import { applyFont } from '@/services/font-settings';
import { initLiveChannelsWindow } from '@/live-channels-window';
import { migrateLegacyBrandStorage } from '@/utils/qadr-branding';

async function main(): Promise<void> {
  migrateLegacyBrandStorage();
  await prepareDesktopShellState();
  await restoreCurrentDesktopWindowState();
  registerDesktopWindowStatePersistence();
  applyStoredTheme();
  applyFont();
  await initI18n();
  initLiveChannelsWindow();
}

void main().catch(console.error);
