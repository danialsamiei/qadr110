import type { AppContext, AppModule } from '@/app/app-context';
import { openExternalUrl } from '@/services/desktop-opener';
import { invokeTauri } from '@/services/tauri-bridge';
import { trackUpdateShown, trackUpdateClicked, trackUpdateDismissed } from '@/services/analytics';
import { escapeHtml } from '@/utils/sanitize';
import { getDismissed, setDismissed } from '@/utils/cross-domain-storage';

interface DesktopRuntimeInfo {
  os: string;
  arch: string;
}

type UpdaterOutcome = 'no_update' | 'update_available' | 'open_failed' | 'fetch_failed';
type DesktopBuildVariant = 'full' | 'tech' | 'finance';
type UpdateCandidate = {
  version: string;
  releaseUrl: string;
  install?: () => Promise<void>;
  source: 'plugin' | 'manual';
};

const DESKTOP_BUILD_VARIANT: DesktopBuildVariant = (
  import.meta.env.VITE_VARIANT === 'tech' || import.meta.env.VITE_VARIANT === 'finance'
    ? import.meta.env.VITE_VARIANT
    : 'full'
);

export class DesktopUpdater implements AppModule {
  private ctx: AppContext;
  private updateCheckIntervalId: ReturnType<typeof setInterval> | null = null;
  private readonly UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  init(): void {
    this.setupUpdateChecks();
  }

  destroy(): void {
    if (this.updateCheckIntervalId) {
      clearInterval(this.updateCheckIntervalId);
      this.updateCheckIntervalId = null;
    }
  }

  private setupUpdateChecks(): void {
    if (!this.ctx.isDesktopApp || this.ctx.isDestroyed) return;

    setTimeout(() => {
      if (this.ctx.isDestroyed) return;
      void this.checkForUpdate();
    }, 5000);

    if (this.updateCheckIntervalId) {
      clearInterval(this.updateCheckIntervalId);
    }
    this.updateCheckIntervalId = setInterval(() => {
      if (this.ctx.isDestroyed) return;
      void this.checkForUpdate();
    }, this.UPDATE_CHECK_INTERVAL_MS);
  }

  private logUpdaterOutcome(outcome: UpdaterOutcome, context: Record<string, unknown> = {}): void {
    const logger = outcome === 'open_failed' || outcome === 'fetch_failed'
      ? console.warn
      : console.info;
    logger('[updater]', outcome, context);
  }

  private getDesktopBuildVariant(): DesktopBuildVariant {
    return DESKTOP_BUILD_VARIANT;
  }

  private async checkForUpdate(): Promise<void> {
    const pluginCandidate = await this.checkForPluginUpdate();
    if (pluginCandidate) {
      await this.presentUpdate(pluginCandidate);
      return;
    }

    await this.checkForReleaseUpdate();
  }

  private async presentUpdate(candidate: UpdateCandidate): Promise<void> {
    const dismissKey = `qadr110-update-dismissed-${candidate.version}`;
    if (getDismissed(dismissKey)) {
      this.logUpdaterOutcome('update_available', {
        current: __APP_VERSION__,
        remote: candidate.version,
        source: candidate.source,
        dismissed: true,
      });
      return;
    }

    this.logUpdaterOutcome('update_available', {
      current: __APP_VERSION__,
      remote: candidate.version,
      source: candidate.source,
      dismissed: false,
    });
    trackUpdateShown(__APP_VERSION__, candidate.version);
    await this.showUpdateToast(candidate.version, candidate.releaseUrl, candidate.install);
  }

  private async checkForPluginUpdate(): Promise<UpdateCandidate | null> {
    if (!this.ctx.isDesktopApp) return null;

    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check({ timeout: 8000 });
      if (!update) {
        this.logUpdaterOutcome('no_update', { current: __APP_VERSION__, source: 'plugin' });
        return null;
      }

      return {
        version: update.version,
        releaseUrl: this.resolvePluginReleaseUrl(update.rawJson),
        install: async () => {
          await update.downloadAndInstall();
        },
        source: 'plugin',
      };
    } catch (error) {
      this.logUpdaterOutcome('fetch_failed', {
        provider: 'plugin-updater',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private resolvePluginReleaseUrl(rawJson: Record<string, unknown>): string {
    const directUrl = rawJson.url;
    if (typeof directUrl === 'string' && directUrl) {
      return directUrl;
    }
    return 'https://github.com/danialsamiei/qadr110/releases/latest';
  }

  private async checkForReleaseUpdate(): Promise<void> {
    try {
      const res = await fetch('https://api.alefba.dev/api/version', {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        this.logUpdaterOutcome('fetch_failed', { status: res.status });
        return;
      }
      const data = await res.json();
      const remote = data.version as string;
      if (!remote) {
        this.logUpdaterOutcome('fetch_failed', { reason: 'missing_remote_version' });
        return;
      }

      const current = __APP_VERSION__;
      if (!this.isNewerVersion(remote, current)) {
        this.logUpdaterOutcome('no_update', { current, remote });
        return;
      }

      const releaseUrl = typeof data.url === 'string' && data.url
        ? data.url
        : 'https://github.com/danialsamiei/qadr110/releases/latest';
      await this.presentUpdate({
        version: remote,
        releaseUrl,
        source: 'manual',
      });
    } catch (error) {
      this.logUpdaterOutcome('fetch_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private isNewerVersion(remote: string, current: string): boolean {
    const r = remote.split('.').map(Number);
    const c = current.split('.').map(Number);
    for (let i = 0; i < Math.max(r.length, c.length); i++) {
      const rv = r[i] ?? 0;
      const cv = c[i] ?? 0;
      if (rv > cv) return true;
      if (rv < cv) return false;
    }
    return false;
  }

  private mapDesktopDownloadPlatform(os: string, arch: string): string | null {
    const normalizedOs = os.toLowerCase();
    const normalizedArch = arch.toLowerCase()
      .replace('amd64', 'x86_64')
      .replace('x64', 'x86_64')
      .replace('arm64', 'aarch64');

    if (normalizedOs === 'windows') {
      return normalizedArch === 'x86_64' ? 'windows-msi' : null;
    }

    if (normalizedOs === 'macos' || normalizedOs === 'darwin') {
      if (normalizedArch === 'aarch64') return 'macos-arm64';
      if (normalizedArch === 'x86_64') return 'macos-x64';
      return null;
    }

    if (normalizedOs === 'linux') {
      if (normalizedArch === 'x86_64') return 'linux-appimage';
      if (normalizedArch === 'aarch64') return 'linux-appimage-arm64';
      return null;
    }

    return null;
  }

  private async resolveUpdateDownloadUrl(releaseUrl: string): Promise<string> {
    try {
      const runtimeInfo = await invokeTauri<DesktopRuntimeInfo>('get_desktop_runtime_info');
      const platform = this.mapDesktopDownloadPlatform(runtimeInfo.os, runtimeInfo.arch);
      if (platform) {
        const variant = this.getDesktopBuildVariant();
        return `https://api.alefba.dev/api/download?platform=${platform}&variant=${variant}`;
      }
    } catch {
      // Silent fallback to release page when desktop runtime info is unavailable.
    }
    return releaseUrl;
  }

  private async showUpdateToast(
    version: string,
    releaseUrl: string,
    installUpdate?: () => Promise<void>,
  ): Promise<void> {
    const existing = document.querySelector<HTMLElement>('.update-toast');
    if (existing?.dataset.version === version) return;
    existing?.remove();

    const url = await this.resolveUpdateDownloadUrl(releaseUrl);

    const toast = document.createElement('div');
    toast.className = 'update-toast';
    toast.dataset.version = version;
    toast.innerHTML = `
      <div class="update-toast-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </div>
      <div class="update-toast-body">
        <div class="update-toast-title">Update Available</div>
        <div class="update-toast-detail">v${escapeHtml(__APP_VERSION__)} \u2192 v${escapeHtml(version)}</div>
      </div>
      <button class="update-toast-action" data-action="download">${installUpdate ? 'نصب' : 'دانلود'}</button>
      <button class="update-toast-dismiss" data-action="dismiss" aria-label="Dismiss">\u00d7</button>
    `;

    const dismissToast = (persistDismissal = true) => {
      if (persistDismissal) {
        setDismissed(`qadr110-update-dismissed-${version}`);
      }
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    };

    const actionButton = toast.querySelector<HTMLButtonElement>('.update-toast-action');
    const dismissButton = toast.querySelector<HTMLButtonElement>('.update-toast-dismiss');
    const detail = toast.querySelector<HTMLElement>('.update-toast-detail');

    const setBusy = (busy: boolean) => {
      actionButton?.toggleAttribute('disabled', busy);
      dismissButton?.toggleAttribute('disabled', busy);
      toast.dataset.busy = busy ? '1' : '0';
    };

    toast.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'download') {
        trackUpdateClicked(version);
        if (installUpdate) {
          setBusy(true);
          void installUpdate()
            .then(() => {
              setDismissed(`qadr110-update-dismissed-${version}`);
              if (actionButton) {
                actionButton.textContent = 'نصب شد';
                actionButton.disabled = true;
              }
              if (detail) {
                detail.textContent = 'به‌روزرسانی نصب شد؛ برنامه را دوباره اجرا کنید.';
              }
              setTimeout(() => dismissToast(false), 1600);
            })
            .catch((error) => {
              this.logUpdaterOutcome('open_failed', {
                url,
                provider: 'plugin-updater',
                error: error instanceof Error ? error.message : String(error),
              });
              void openExternalUrl(url).catch((openError) => {
                this.logUpdaterOutcome('open_failed', {
                  url,
                  error: openError instanceof Error ? openError.message : String(openError),
                });
              });
              dismissToast();
            });
          return;
        }

        void openExternalUrl(url).catch((error) => {
          this.logUpdaterOutcome('open_failed', { url, error: error instanceof Error ? error.message : String(error) });
        });
        dismissToast();
      } else if (action === 'dismiss') {
        trackUpdateDismissed(version);
        dismissToast();
      }
    });

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('visible'));
    });
  }
}
