import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';

const AUTH_STATE_VERSION = 1;
const SESSION_COOKIE_NAME = 'qadr110_session';
const TRUST_COOKIE_NAME = 'qadr110_trusted_device';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const DEFAULT_ISSUER = process.env.QADR_AUTH_ISSUER?.trim() || 'QADR110';

function resolveAuthStateFile() {
  return path.resolve(process.cwd(), process.env.QADR_AUTH_STATE_FILE || '.qadr-auth-state.json');
}

function resolvePrimaryUsername() {
  return process.env.QADR_LOGIN_USERNAME?.trim() || 'Hojjat';
}

function resolvePrimaryPassword() {
  return process.env.QADR_LOGIN_PASSWORD || 'Mojtaba';
}

function nowIso() {
  return new Date().toISOString();
}

function randomToken(size = 32) {
  return crypto.randomBytes(size).toString('base64url');
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function defaultAuthState() {
  return {
    version: AUTH_STATE_VERSION,
    cookieSecret: randomToken(48),
    totp: null,
    trustedDevices: {},
    pendingChallenge: null,
    pendingEnrollment: null,
  };
}

function writeAuthState(state) {
  const filePath = resolveAuthStateFile();
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
}

function loadAuthState() {
  const filePath = resolveAuthStateFile();
  let state = defaultAuthState();

  if (fs.existsSync(filePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        state = {
          ...state,
          ...parsed,
          trustedDevices: {
            ...state.trustedDevices,
            ...(parsed.trustedDevices && typeof parsed.trustedDevices === 'object' ? parsed.trustedDevices : {}),
          },
        };
      }
    } catch {
      state = defaultAuthState();
    }
  }

  let mutated = false;
  if (!state.cookieSecret || typeof state.cookieSecret !== 'string') {
    state.cookieSecret = randomToken(48);
    mutated = true;
  }
  if (!state.version || state.version !== AUTH_STATE_VERSION) {
    state.version = AUTH_STATE_VERSION;
    mutated = true;
  }

  const now = Date.now();
  for (const [deviceId, record] of Object.entries(state.trustedDevices || {})) {
    if (!record || typeof record !== 'object') {
      delete state.trustedDevices[deviceId];
      mutated = true;
      continue;
    }
    if (typeof record.expiresAt !== 'string' || Number.isNaN(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= now) {
      delete state.trustedDevices[deviceId];
      mutated = true;
    }
  }

  if (state.pendingChallenge?.expiresAt && Date.parse(state.pendingChallenge.expiresAt) <= now) {
    state.pendingChallenge = null;
    mutated = true;
  }
  if (state.pendingEnrollment?.expiresAt && Date.parse(state.pendingEnrollment.expiresAt) <= now) {
    state.pendingEnrollment = null;
    mutated = true;
  }

  if (mutated) writeAuthState(state);
  return state;
}

function timingSafeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ''), 'utf8');
  const rightBuffer = Buffer.from(String(right ?? ''), 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyPrimaryCredentials(username, password) {
  return timingSafeEquals(username?.trim(), resolvePrimaryUsername()) && timingSafeEquals(password, resolvePrimaryPassword());
}

function parseCookieHeader(cookieHeader) {
  const jar = {};
  for (const part of String(cookieHeader || '').split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) continue;
    jar[rawKey] = decodeURIComponent(rawValue.join('=') || '');
  }
  return jar;
}

function serializeCookie(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  segments.push(`Path=${options.path || '/'}`);
  if (options.httpOnly) segments.push('HttpOnly');
  if (options.secure) segments.push('Secure');
  if (options.sameSite) segments.push(`SameSite=${options.sameSite}`);
  if (typeof options.maxAge === 'number') segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.expires instanceof Date) segments.push(`Expires=${options.expires.toUTCString()}`);
  return segments.join('; ');
}

function signPayload(payload, cookieSecret) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', cookieSecret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifySignedPayload(token, cookieSecret, expectedKind) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [encodedPayload, signature] = token.split('.');
  const expectedSignature = crypto.createHmac('sha256', cookieSecret).update(encodedPayload).digest('base64url');
  const signatureBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload || payload.kind !== expectedKind) return null;
    if (payload.exp && Date.parse(payload.exp) <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function isSecureRequest(hostHeader) {
  const host = String(hostHeader || '').toLowerCase();
  return !host.includes('localhost') && !host.includes('127.0.0.1');
}

function buildCookieOptions(hostHeader, overrides = {}) {
  return {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(hostHeader),
    path: '/',
    ...overrides,
  };
}

function clearCookie(name, hostHeader) {
  return serializeCookie(name, '', {
    ...buildCookieOptions(hostHeader),
    expires: new Date(0),
    maxAge: 0,
  });
}

function createTotp(secretBase32) {
  return new OTPAuth.TOTP({
    issuer: DEFAULT_ISSUER,
    label: resolvePrimaryUsername(),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

function buildTrustedDeviceRecord(request) {
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS).toISOString();
  return {
    id: randomToken(18),
    createdAt,
    expiresAt,
    label: String(request?.headers?.['user-agent'] || 'QADR client').slice(0, 160),
    lastUsedAt: createdAt,
  };
}

function issueSessionCookie(hostHeader, cookieSecret, rememberSession) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (rememberSession ? THIRTY_DAYS_MS : TWELVE_HOURS_MS));
  const token = signPayload({
    kind: 'session',
    user: resolvePrimaryUsername(),
    issuedAt: now.toISOString(),
    exp: expiresAt.toISOString(),
  }, cookieSecret);
  return serializeCookie(SESSION_COOKIE_NAME, token, {
    ...buildCookieOptions(hostHeader),
    maxAge: rememberSession ? THIRTY_DAYS_MS / 1000 : undefined,
    expires: rememberSession ? expiresAt : undefined,
  });
}

function issueTrustedDeviceCookie(hostHeader, cookieSecret, record) {
  const token = signPayload({
    kind: 'trusted-device',
    id: record.id,
    issuedAt: record.createdAt,
    exp: record.expiresAt,
  }, cookieSecret);
  return serializeCookie(TRUST_COOKIE_NAME, token, {
    ...buildCookieOptions(hostHeader),
    maxAge: THIRTY_DAYS_MS / 1000,
    expires: new Date(record.expiresAt),
  });
}

export function getAuthSessionFromRequest(request) {
  const state = loadAuthState();
  const cookies = parseCookieHeader(request.headers.cookie);
  const sessionPayload = verifySignedPayload(cookies[SESSION_COOKIE_NAME], state.cookieSecret, 'session');
  const trustedPayload = verifySignedPayload(cookies[TRUST_COOKIE_NAME], state.cookieSecret, 'trusted-device');
  const trustedRecord = trustedPayload?.id ? state.trustedDevices?.[trustedPayload.id] || null : null;

  if (trustedRecord) {
    trustedRecord.lastUsedAt = nowIso();
    writeAuthState(state);
  }

  return {
    authenticated: Boolean(sessionPayload),
    username: sessionPayload?.user || null,
    totpConfigured: Boolean(state.totp?.secretBase32),
    trustedDevice: Boolean(trustedRecord),
  };
}

export async function handleAuthRequest(nodeRequest, request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const hostHeader = nodeRequest.headers.host || '';

  if (pathname === '/api/auth/session' && request.method === 'GET') {
    const session = getAuthSessionFromRequest(nodeRequest);
    return Response.json({
      ok: true,
      ...session,
    });
  }

  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    const headers = new Headers();
    headers.append('Set-Cookie', clearCookie(SESSION_COOKIE_NAME, hostHeader));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers,
    });
  }

  if (pathname !== '/api/auth/login' && pathname !== '/api/auth/verify-2fa') {
    return null;
  }

  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Malformed JSON body.' }, { status: 400 });
  }

  const state = loadAuthState();
  const cookies = parseCookieHeader(nodeRequest.headers.cookie);
  const trustedPayload = verifySignedPayload(cookies[TRUST_COOKIE_NAME], state.cookieSecret, 'trusted-device');
  const trustedRecord = trustedPayload?.id ? state.trustedDevices?.[trustedPayload.id] || null : null;

  if (pathname === '/api/auth/login' && request.method === 'POST') {
    const username = String(payload.username || '').trim();
    const password = String(payload.password || '');
    const rememberSession = Boolean(payload.rememberSession);
    const trustDeviceRequested = Boolean(payload.trustDevice);

    if (!verifyPrimaryCredentials(username, password)) {
      return Response.json({ ok: false, error: 'اطلاعات ورود صحیح نیست.' }, { status: 401 });
    }

    if (trustedRecord && Date.parse(trustedRecord.expiresAt) > Date.now()) {
      trustedRecord.lastUsedAt = nowIso();
      writeAuthState(state);
      const headers = new Headers();
      headers.append('Set-Cookie', issueSessionCookie(hostHeader, state.cookieSecret, rememberSession));
      return new Response(JSON.stringify({
        ok: true,
        status: 'authenticated',
        username: resolvePrimaryUsername(),
        trustedDevice: true,
      }), {
        status: 200,
        headers,
      });
    }

    if (!state.totp?.secretBase32) {
      const secret = new OTPAuth.Secret({ size: 20 });
      const totp = createTotp(secret.base32);
      const qrCodeDataUrl = await QRCode.toDataURL(totp.toString(), {
        margin: 1,
        width: 216,
        color: {
          dark: '#eff6ff',
          light: '#05070b',
        },
      });

      state.pendingEnrollment = {
        secretBase32: secret.base32,
        rememberSession,
        trustDeviceRequested,
        issuedAt: nowIso(),
        expiresAt: new Date(Date.now() + TEN_MINUTES_MS).toISOString(),
      };
      writeAuthState(state);

      return Response.json({
        ok: true,
        status: 'enroll-2fa',
        qrCodeDataUrl,
        manualKey: secret.base32,
        issuer: DEFAULT_ISSUER,
        accountName: resolvePrimaryUsername(),
        expiresAt: state.pendingEnrollment.expiresAt,
      });
    }

    state.pendingChallenge = {
      id: randomToken(18),
      rememberSession,
      trustDeviceRequested,
      issuedAt: nowIso(),
      expiresAt: new Date(Date.now() + TEN_MINUTES_MS).toISOString(),
    };
    writeAuthState(state);

    return Response.json({
      ok: true,
      status: 'require-2fa',
      challengeId: state.pendingChallenge.id,
      expiresAt: state.pendingChallenge.expiresAt,
      trustedDevice: false,
    });
  }

  if (pathname === '/api/auth/verify-2fa' && request.method === 'POST') {
    const code = String(payload.code || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(code)) {
      return Response.json({ ok: false, error: 'کد ۲ عاملی باید ۶ رقم باشد.' }, { status: 400 });
    }

    const headers = new Headers();

    if (state.pendingEnrollment?.secretBase32) {
      const enrollmentTotp = createTotp(state.pendingEnrollment.secretBase32);
      const delta = enrollmentTotp.validate({ token: code, window: 1 });
      if (delta === null) {
        return Response.json({ ok: false, error: 'کد ۲ عاملی معتبر نیست.' }, { status: 401 });
      }

      state.totp = {
        secretBase32: state.pendingEnrollment.secretBase32,
        issuer: DEFAULT_ISSUER,
        accountName: resolvePrimaryUsername(),
        enrolledAt: nowIso(),
      };
      const rememberSession = Boolean(state.pendingEnrollment.rememberSession);
      const trustDeviceRequested = Boolean(state.pendingEnrollment.trustDeviceRequested);
      state.pendingEnrollment = null;

      headers.append('Set-Cookie', issueSessionCookie(hostHeader, state.cookieSecret, rememberSession));
      if (trustDeviceRequested) {
        const deviceRecord = buildTrustedDeviceRecord(nodeRequest);
        state.trustedDevices[deviceRecord.id] = deviceRecord;
        headers.append('Set-Cookie', issueTrustedDeviceCookie(hostHeader, state.cookieSecret, deviceRecord));
      }
      writeAuthState(state);

      return new Response(JSON.stringify({
        ok: true,
        status: 'authenticated',
        username: resolvePrimaryUsername(),
        totpConfigured: true,
      }), {
        status: 200,
        headers,
      });
    }

    if (!state.pendingChallenge?.id || payload.challengeId !== state.pendingChallenge.id) {
      return Response.json({ ok: false, error: 'درخواست تایید ۲ عاملی منقضی شده است.' }, { status: 410 });
    }

    if (!state.totp?.secretBase32) {
      return Response.json({ ok: false, error: 'تنظیمات ۲ عاملی کامل نیست.' }, { status: 409 });
    }

    const loginTotp = createTotp(state.totp.secretBase32);
    const delta = loginTotp.validate({ token: code, window: 1 });
    if (delta === null) {
      return Response.json({ ok: false, error: 'کد ۲ عاملی معتبر نیست.' }, { status: 401 });
    }

    const rememberSession = Boolean(state.pendingChallenge.rememberSession);
    const trustDeviceRequested = Boolean(state.pendingChallenge.trustDeviceRequested);
    state.pendingChallenge = null;

    headers.append('Set-Cookie', issueSessionCookie(hostHeader, state.cookieSecret, rememberSession));
    if (trustDeviceRequested) {
      const deviceRecord = buildTrustedDeviceRecord(nodeRequest);
      state.trustedDevices[deviceRecord.id] = deviceRecord;
      headers.append('Set-Cookie', issueTrustedDeviceCookie(hostHeader, state.cookieSecret, deviceRecord));
    }
    writeAuthState(state);

    return new Response(JSON.stringify({
      ok: true,
      status: 'authenticated',
      username: resolvePrimaryUsername(),
      totpConfigured: true,
    }), {
      status: 200,
      headers,
    });
  }

  return Response.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
}
