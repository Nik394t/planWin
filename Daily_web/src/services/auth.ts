import { importPortableSnapshot, snapshotUpdatedAt } from '../domain/exchange';
import type { DailySnapshot } from '../domain/types';
import { authHeaders, postJson, requestJson } from './api';

const sessionKey = 'daily-web-auth-session';

export interface AuthUser {
  id: string;
  login: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

interface AuthPayload {
  ok: boolean;
  token?: string;
  user?: AuthUser;
  snapshot?: unknown;
  snapshotUpdatedAt?: string | null;
  source?: string;
  error?: string;
}

export interface AuthResult {
  session: AuthSession;
  snapshot: DailySnapshot | null;
  snapshotUpdatedAt: string | null;
  source: string | null;
}

function serializeSession(session: AuthSession): string {
  return JSON.stringify(session);
}

export function readStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(sessionKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (!parsed?.token || !parsed.user?.id) {
      return null;
    }
    return parsed as AuthSession;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: AuthSession): void {
  localStorage.setItem(sessionKey, serializeSession(session));
}

export function clearStoredSession(): void {
  localStorage.removeItem(sessionKey);
}

function parseAuthResult(payload: AuthPayload): AuthResult | null {
  if (!payload.ok || !payload.token || !payload.user) {
    return null;
  }
  return {
    session: {
      token: payload.token,
      user: payload.user,
    },
    snapshot: payload.snapshot ? importPortableSnapshot(payload.snapshot) : null,
    snapshotUpdatedAt: payload.snapshotUpdatedAt ?? null,
    source: payload.source ?? null,
  };
}

export async function signUpWithPassword(input: {
  login: string;
  password: string;
  displayName?: string;
  snapshot?: DailySnapshot;
}): Promise<AuthResult> {
  const { response, data } = await postJson<AuthPayload>('/api/auth/signup', {
    login: input.login,
    password: input.password,
    displayName: input.displayName,
    snapshot: input.snapshot,
    snapshotUpdatedAt: input.snapshot ? snapshotUpdatedAt(input.snapshot) : null,
  });

  if (!response.ok || !data) {
    throw new Error(data?.error || 'signup_failed');
  }

  const result = parseAuthResult(data);
  if (!result) {
    throw new Error('signup_failed');
  }
  writeStoredSession(result.session);
  return result;
}

export async function signInWithPassword(input: {
  login: string;
  password: string;
  snapshot?: DailySnapshot;
}): Promise<AuthResult> {
  const { response, data } = await postJson<AuthPayload>('/api/auth/login', {
    login: input.login,
    password: input.password,
    snapshot: input.snapshot,
    snapshotUpdatedAt: input.snapshot ? snapshotUpdatedAt(input.snapshot) : null,
  });

  if (!response.ok || !data) {
    throw new Error(data?.error || 'login_failed');
  }

  const result = parseAuthResult(data);
  if (!result) {
    throw new Error('login_failed');
  }
  writeStoredSession(result.session);
  return result;
}

export async function restoreSession(session: AuthSession): Promise<AuthResult> {
  const { response, data } = await requestJson<AuthPayload>('/api/auth/session', {
    headers: authHeaders(session.token),
  });

  if (!response.ok || !data) {
    clearStoredSession();
    throw new Error(data?.error || 'session_failed');
  }

  const result = parseAuthResult({ ...data, token: session.token });
  if (!result) {
    clearStoredSession();
    throw new Error('session_failed');
  }

  writeStoredSession(result.session);
  return result;
}

export async function logout(session: AuthSession | null): Promise<void> {
  if (!session) {
    clearStoredSession();
    return;
  }
  try {
    await postJson('/api/auth/logout', {}, {
      headers: authHeaders(session.token),
    });
  } finally {
    clearStoredSession();
  }
}

export async function syncCloudSnapshot(session: AuthSession, snapshot: DailySnapshot): Promise<boolean> {
  const { response } = await postJson<{ ok: boolean }>('/api/account/snapshot', {
    snapshot,
    snapshotUpdatedAt: snapshotUpdatedAt(snapshot),
  }, {
    method: 'PUT',
    headers: authHeaders(session.token),
  });

  return response.ok;
}
