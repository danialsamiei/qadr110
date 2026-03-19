type AuthSessionResponse = {
  ok: boolean;
  authenticated: boolean;
  username: string | null;
  totpConfigured: boolean;
  trustedDevice: boolean;
};

type LoginResponse =
  | {
    ok: true;
    status: 'authenticated';
    username: string;
    trustedDevice?: boolean;
    totpConfigured?: boolean;
  }
  | {
    ok: true;
    status: 'require-2fa';
    challengeId: string;
    expiresAt: string;
    trustedDevice: boolean;
  }
  | {
    ok: true;
    status: 'enroll-2fa';
    qrCodeDataUrl: string;
    manualKey: string;
    issuer: string;
    accountName: string;
    expiresAt: string;
  }
  | {
    ok: false;
    error: string;
  };

type VerifyResponse =
  | {
    ok: true;
    status: 'authenticated';
    username: string;
    totpConfigured: boolean;
  }
  | {
    ok: false;
    error: string;
  };

type AuthViewState = {
  challengeId: string | null;
  currentUsername: string;
  rememberSession: boolean;
  trustDevice: boolean;
  rememberUsername: boolean;
};

const REMEMBERED_USERNAME_KEY = 'qadr110-auth-remembered-username';
const LEGACY_ACCESS_KEY = 'qadr110-auth-ok';
const PENDING_URL_KEY = 'qadr110-auth-pending-url';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isLocalFallbackCandidate(): boolean {
  return location.hostname === 'localhost'
    || location.hostname === '127.0.0.1'
    || '__TAURI_INTERNALS__' in window
    || '__TAURI__' in window;
}

function rememberUsername(username: string, enabled: boolean): void {
  if (!enabled) {
    localStorage.removeItem(REMEMBERED_USERNAME_KEY);
    return;
  }
  localStorage.setItem(REMEMBERED_USERNAME_KEY, username.trim());
}

function getRememberedUsername(): string {
  return localStorage.getItem(REMEMBERED_USERNAME_KEY) || '';
}

function captureRequestedUrl(): void {
  try {
    const relativeUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    sessionStorage.setItem(PENDING_URL_KEY, relativeUrl);
  } catch {
    // ignore storage failures
  }
}

function restoreRequestedUrl(): void {
  try {
    const requested = sessionStorage.getItem(PENDING_URL_KEY);
    if (!requested) return;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (requested !== current) {
      history.replaceState(null, '', requested);
    }
    sessionStorage.removeItem(PENDING_URL_KEY);
  } catch {
    // ignore history/storage failures
  }
}

function ensureBootOverlay(): {
  overlay: HTMLElement;
  authShell: HTMLElement;
  progressText: HTMLElement;
  statusText: HTMLElement;
} {
  const overlay = document.getElementById('qadr-boot-overlay');
  const authShell = document.getElementById('qadr-auth-shell');
  const progressText = document.getElementById('qadr-boot-progress-value');
  const statusText = document.getElementById('qadr-boot-status-text');

  if (!(overlay instanceof HTMLElement)
    || !(authShell instanceof HTMLElement)
    || !(progressText instanceof HTMLElement)
    || !(statusText instanceof HTMLElement)) {
    throw new Error('QADR boot overlay is missing required elements.');
  }

  return { overlay, authShell, progressText, statusText };
}

function setBootStage(overlay: HTMLElement, stage: 'loading' | 'auth' | 'done'): void {
  overlay.dataset.stage = stage;
  overlay.classList.toggle('is-auth-visible', stage === 'auth');
  overlay.classList.toggle('is-complete', stage === 'done');
}

function setProgress(progressText: HTMLElement, value: number): void {
  progressText.textContent = `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function renderAuthShell(
  authShell: HTMLElement,
  content: string,
  stageClass: 'login' | 'verify' | 'enroll',
): void {
  authShell.hidden = false;
  authShell.className = `qadr-auth-shell qadr-auth-shell--${stageClass}`;
  authShell.innerHTML = content;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : 'درخواست ناموفق بود.';
    throw new Error(message);
  }
  return payload as T;
}

function showInlineError(authShell: HTMLElement, message: string): void {
  const errorEl = authShell.querySelector<HTMLElement>('[data-auth-error]');
  if (errorEl) errorEl.textContent = message;
}

function setBusyState(authShell: HTMLElement, busy: boolean): void {
  const submitButtons = authShell.querySelectorAll<HTMLButtonElement>('button[data-auth-submit]');
  submitButtons.forEach((button) => {
    button.disabled = busy;
    button.dataset.busy = busy ? '1' : '0';
  });
}

async function fallbackLegacyLogin(authShell: HTMLElement, viewState: AuthViewState): Promise<boolean> {
  return new Promise((resolve) => {
    renderAuthShell(authShell, `
      <div class="qadr-auth-card">
        <div class="qadr-auth-card__eyebrow">ورود محلی</div>
        <h2 class="qadr-auth-card__title">ورود به QADR110</h2>
        <p class="qadr-auth-card__subtitle">سرویس احراز هویت سرور در این محیط فعال نیست. برای توسعه محلی، ورود ساده‌ی فعلی استفاده می‌شود.</p>
        <label class="qadr-auth-field">
          <span>نام کاربری</span>
          <input id="qadr-auth-user" value="${getRememberedUsername()}" autocomplete="username" />
        </label>
        <label class="qadr-auth-field">
          <span>رمز عبور</span>
          <input id="qadr-auth-pass" type="password" autocomplete="current-password" />
        </label>
        <label class="qadr-auth-check">
          <input id="qadr-auth-remember-user" type="checkbox" ${getRememberedUsername() ? 'checked' : ''} />
          <span>نام کاربری مرا به خاطر بسپار</span>
        </label>
        <button data-auth-submit class="qadr-auth-submit">ورود</button>
        <div class="qadr-auth-error" data-auth-error></div>
      </div>
    `, 'login');

    const userInput = authShell.querySelector<HTMLInputElement>('#qadr-auth-user');
    const passInput = authShell.querySelector<HTMLInputElement>('#qadr-auth-pass');
    const rememberInput = authShell.querySelector<HTMLInputElement>('#qadr-auth-remember-user');
    const submitButton = authShell.querySelector<HTMLButtonElement>('button[data-auth-submit]');

    const attempt = (): void => {
      const username = userInput?.value.trim() || '';
      const password = passInput?.value || '';
      if (username !== 'Hojjat' || password !== 'Mojtaba') {
        showInlineError(authShell, 'اطلاعات ورود صحیح نیست.');
        return;
      }
      rememberUsername(username, Boolean(rememberInput?.checked));
      sessionStorage.setItem(LEGACY_ACCESS_KEY, '1');
      viewState.currentUsername = username;
      resolve(true);
    };

    submitButton?.addEventListener('click', attempt);
    passInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') attempt();
    });
    userInput?.focus();
  });
}

function buildLoginMarkup(username: string, rememberSession: boolean, trustDevice: boolean, rememberUser: boolean): string {
  return `
    <div class="qadr-auth-card">
      <div class="qadr-auth-card__eyebrow">ورود امن</div>
      <h2 class="qadr-auth-card__title">ورود به QADR110</h2>
      <p class="qadr-auth-card__subtitle">پس از پایان بارگذاری، با نام کاربری و رمز عبور وارد شوید. در صورت فعال بودن ۲ عاملی، کد Google Authenticator هم لازم خواهد بود.</p>
      <label class="qadr-auth-field">
        <span>نام کاربری</span>
        <input id="qadr-auth-user" value="${username}" autocomplete="username" />
      </label>
      <label class="qadr-auth-field">
        <span>رمز عبور</span>
        <input id="qadr-auth-pass" type="password" autocomplete="current-password" />
      </label>
      <div class="qadr-auth-checks">
        <label class="qadr-auth-check">
          <input id="qadr-auth-remember-session" type="checkbox" ${rememberSession ? 'checked' : ''} />
          <span>ورود این سیستم تا ۳۰ روز حفظ شود</span>
        </label>
        <label class="qadr-auth-check">
          <input id="qadr-auth-trust-device" type="checkbox" ${trustDevice ? 'checked' : ''} />
          <span>این سیستم تا ۳۰ روز بدون ۲FA معتبر بماند</span>
        </label>
        <label class="qadr-auth-check">
          <input id="qadr-auth-remember-user" type="checkbox" ${rememberUser ? 'checked' : ''} />
          <span>نام کاربری مرا به خاطر بسپار</span>
        </label>
      </div>
      <button data-auth-submit class="qadr-auth-submit">ادامه</button>
      <div class="qadr-auth-error" data-auth-error></div>
    </div>
  `;
}

function buildVerifyMarkup(username: string, challengeExpiresAt: string): string {
  const expiresLabel = new Date(challengeExpiresAt).toLocaleTimeString('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `
    <div class="qadr-auth-card">
      <div class="qadr-auth-card__eyebrow">تایید دومرحله‌ای</div>
      <h2 class="qadr-auth-card__title">کد Google Authenticator را وارد کنید</h2>
      <p class="qadr-auth-card__subtitle">برای حساب <strong>${username}</strong>، کد ۶ رقمی را تا قبل از ${expiresLabel} وارد کنید.</p>
      <label class="qadr-auth-field">
        <span>کد ۲ عاملی</span>
        <input id="qadr-auth-code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" />
      </label>
      <div class="qadr-auth-actions">
        <button data-auth-submit class="qadr-auth-submit">تایید و ورود</button>
        <button type="button" class="qadr-auth-link-btn" data-auth-back>بازگشت</button>
      </div>
      <div class="qadr-auth-error" data-auth-error></div>
    </div>
  `;
}

function buildEnrollMarkup(username: string, qrCodeDataUrl: string, manualKey: string): string {
  return `
    <div class="qadr-auth-card qadr-auth-card--enroll">
      <div class="qadr-auth-card__eyebrow">راه‌اندازی ۲FA</div>
      <h2 class="qadr-auth-card__title">Google Authenticator را برای ${username} فعال کنید</h2>
      <p class="qadr-auth-card__subtitle">این دستگاه اولین بار وارد می‌شود. QR را اسکن کنید یا کلید را دستی وارد کنید، سپس کد ۶ رقمی را برای تکمیل ورود بنویسید.</p>
      <div class="qadr-auth-enroll">
        <div class="qadr-auth-qr-wrap">
          <img src="${qrCodeDataUrl}" alt="QADR110 2FA QR" class="qadr-auth-qr" />
        </div>
        <div class="qadr-auth-secret">
          <span class="qadr-auth-secret__label">کلید دستی</span>
          <code class="qadr-auth-secret__value">${manualKey}</code>
        </div>
      </div>
      <label class="qadr-auth-field">
        <span>کد Google Authenticator</span>
        <input id="qadr-auth-code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" />
      </label>
      <div class="qadr-auth-actions">
        <button data-auth-submit class="qadr-auth-submit">فعال‌سازی و ورود</button>
      </div>
      <div class="qadr-auth-error" data-auth-error></div>
    </div>
  `;
}

function wireBackButton(authShell: HTMLElement, onBack: () => void): void {
  authShell.querySelector<HTMLElement>('[data-auth-back]')?.addEventListener('click', onBack);
}

export async function showAccessGate(): Promise<boolean> {
  const { overlay, authShell, progressText, statusText } = ensureBootOverlay();
  captureRequestedUrl();
  const viewState: AuthViewState = {
    challengeId: null,
    currentUsername: getRememberedUsername(),
    rememberSession: true,
    trustDevice: true,
    rememberUsername: Boolean(getRememberedUsername()),
  };

  setBootStage(overlay, 'loading');
  statusText.textContent = 'در حال آماده‌سازی محیط تحلیلی...';
  setProgress(progressText, 0);

  let progress = 0;
  const progressTimer = window.setInterval(() => {
    progress = Math.min(progress + (progress < 60 ? 7 : 4), 92);
    setProgress(progressText, progress);
  }, 90);

  const minimumLoader = wait(1400);
  let session: AuthSessionResponse | null = null;
  let fallbackMode = false;

  try {
    session = await fetchJson<AuthSessionResponse>('/api/auth/session', { method: 'GET' });
  } catch {
    fallbackMode = isLocalFallbackCandidate();
  } finally {
    await minimumLoader;
    window.clearInterval(progressTimer);
    setProgress(progressText, 100);
    statusText.textContent = 'بارگذاری کامل شد.';
  }

  await wait(220);

  if (session?.authenticated) {
    restoreRequestedUrl();
    setBootStage(overlay, 'done');
    await wait(260);
    overlay.remove();
    return true;
  }

  setBootStage(overlay, 'auth');
  statusText.textContent = fallbackMode
    ? 'ورود محلی فعال شد.'
    : 'ورود امن سامانه آماده است.';

  if (fallbackMode) {
    const allowed = await fallbackLegacyLogin(authShell, viewState);
    if (allowed) {
      restoreRequestedUrl();
      setBootStage(overlay, 'done');
      await wait(220);
      overlay.remove();
    }
    return allowed;
  }

  const renderPasswordStep = (): void => {
    renderAuthShell(authShell, buildLoginMarkup(
      viewState.currentUsername,
      viewState.rememberSession,
      viewState.trustDevice,
      viewState.rememberUsername,
    ), 'login');

    const userInput = authShell.querySelector<HTMLInputElement>('#qadr-auth-user');
    const passInput = authShell.querySelector<HTMLInputElement>('#qadr-auth-pass');
    const rememberSessionInput = authShell.querySelector<HTMLInputElement>('#qadr-auth-remember-session');
    const trustDeviceInput = authShell.querySelector<HTMLInputElement>('#qadr-auth-trust-device');
    const rememberUserInput = authShell.querySelector<HTMLInputElement>('#qadr-auth-remember-user');
    const submitButton = authShell.querySelector<HTMLButtonElement>('button[data-auth-submit]');

    const submit = async (): Promise<void> => {
      setBusyState(authShell, true);
      showInlineError(authShell, '');
      viewState.currentUsername = userInput?.value.trim() || '';
      viewState.rememberSession = Boolean(rememberSessionInput?.checked);
      viewState.trustDevice = Boolean(trustDeviceInput?.checked);
      viewState.rememberUsername = Boolean(rememberUserInput?.checked);
      rememberUsername(viewState.currentUsername, viewState.rememberUsername);

      try {
        const response = await fetchJson<LoginResponse>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            username: viewState.currentUsername,
            password: passInput?.value || '',
            rememberSession: viewState.rememberSession,
            trustDevice: viewState.trustDevice,
          }),
        });

        if (response.ok && response.status === 'authenticated') {
          restoreRequestedUrl();
          setBootStage(overlay, 'done');
          await wait(220);
          overlay.remove();
          resolveGate(true);
          return;
        }

        if (response.ok && response.status === 'require-2fa') {
          viewState.challengeId = response.challengeId;
          renderVerifyStep(response.expiresAt);
          return;
        }

        if (response.ok && response.status === 'enroll-2fa') {
          renderEnrollStep(response.qrCodeDataUrl, response.manualKey);
          return;
        }

        showInlineError(authShell, (response as { error?: string }).error || 'ورود ناموفق بود.');
      } catch (error) {
        showInlineError(authShell, error instanceof Error ? error.message : 'ورود ناموفق بود.');
      } finally {
        setBusyState(authShell, false);
      }
    };

    submitButton?.addEventListener('click', () => { void submit(); });
    passInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void submit();
      }
    });
    userInput?.focus();
  };

  const renderVerifyStep = (expiresAt: string): void => {
    renderAuthShell(authShell, buildVerifyMarkup(viewState.currentUsername, expiresAt), 'verify');
    const codeInput = authShell.querySelector<HTMLInputElement>('#qadr-auth-code');
    const submitButton = authShell.querySelector<HTMLButtonElement>('button[data-auth-submit]');
    wireBackButton(authShell, renderPasswordStep);

    const submit = async (): Promise<void> => {
      setBusyState(authShell, true);
      showInlineError(authShell, '');
      try {
        const response = await fetchJson<VerifyResponse>('/api/auth/verify-2fa', {
          method: 'POST',
          body: JSON.stringify({
            challengeId: viewState.challengeId,
            code: codeInput?.value || '',
          }),
        });
        if (!response.ok) {
          showInlineError(authShell, response.error);
          return;
        }
        restoreRequestedUrl();
        setBootStage(overlay, 'done');
        await wait(220);
        overlay.remove();
        resolveGate(true);
      } catch (error) {
        showInlineError(authShell, error instanceof Error ? error.message : 'تایید ناموفق بود.');
      } finally {
        setBusyState(authShell, false);
      }
    };

    submitButton?.addEventListener('click', () => { void submit(); });
    codeInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void submit();
      }
    });
    codeInput?.focus();
  };

  const renderEnrollStep = (qrCodeDataUrl: string, manualKey: string): void => {
    renderAuthShell(authShell, buildEnrollMarkup(viewState.currentUsername, qrCodeDataUrl, manualKey), 'enroll');
    const codeInput = authShell.querySelector<HTMLInputElement>('#qadr-auth-code');
    const submitButton = authShell.querySelector<HTMLButtonElement>('button[data-auth-submit]');

    const submit = async (): Promise<void> => {
      setBusyState(authShell, true);
      showInlineError(authShell, '');
      try {
        const response = await fetchJson<VerifyResponse>('/api/auth/verify-2fa', {
          method: 'POST',
          body: JSON.stringify({
            code: codeInput?.value || '',
          }),
        });
        if (!response.ok) {
          showInlineError(authShell, response.error);
          return;
        }
        restoreRequestedUrl();
        setBootStage(overlay, 'done');
        await wait(220);
        overlay.remove();
        resolveGate(true);
      } catch (error) {
        showInlineError(authShell, error instanceof Error ? error.message : 'فعالسازی ناموفق بود.');
      } finally {
        setBusyState(authShell, false);
      }
    };

    submitButton?.addEventListener('click', () => { void submit(); });
    codeInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void submit();
      }
    });
    codeInput?.focus();
  };

  let gateResolved = false;
  let gateResolver: ((value: boolean) => void) | null = null;
  const gatePromise = new Promise<boolean>((resolve) => {
    gateResolver = resolve;
  });

  const resolveGate = (value: boolean): void => {
    if (gateResolved) return;
    gateResolved = true;
    gateResolver?.(value);
  };

  renderPasswordStep();
  return gatePromise;
}
