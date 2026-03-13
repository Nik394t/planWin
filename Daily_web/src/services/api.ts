const localhostHosts = new Set(['localhost', '127.0.0.1']);
const runtimeApiStorageKey = 'daily-web-cloud-api-base';

function normalizeApiBase(value: string | null | undefined): string | null {
  const clean = value?.trim();
  if (!clean) {
    return null;
  }
  try {
    const url = new URL(clean);
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function readRuntimeApiBase(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const query = new URLSearchParams(window.location.search).get('api');
  const fromQuery = normalizeApiBase(query);
  if (fromQuery) {
    window.localStorage.setItem(runtimeApiStorageKey, fromQuery);
    return fromQuery;
  }

  return normalizeApiBase(window.localStorage.getItem(runtimeApiStorageKey));
}

export function setRuntimeApiBase(value: string | null): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const normalized = normalizeApiBase(value);
  if (normalized) {
    window.localStorage.setItem(runtimeApiStorageKey, normalized);
  } else {
    window.localStorage.removeItem(runtimeApiStorageKey);
  }
  window.dispatchEvent(new CustomEvent('daily-api-base-changed', { detail: normalized }));
  return normalized;
}

export function getApiBase(): string | null {
  const explicit = normalizeApiBase(
    import.meta.env.VITE_CLOUD_API_BASE_URL?.trim() ||
      import.meta.env.VITE_PUSH_API_BASE_URL?.trim(),
  );
  if (explicit) {
    return explicit;
  }
  if (typeof window === 'undefined') {
    return null;
  }
  const runtime = readRuntimeApiBase();
  if (runtime) {
    return runtime;
  }
  if (localhostHosts.has(window.location.hostname)) {
    return 'http://localhost:8787';
  }
  if (window.location.hostname.endsWith('github.io')) {
    return null;
  }
  return window.location.origin;
}

export function hasApiBase(): boolean {
  return Boolean(getApiBase());
}

export function buildApiUrl(path: string): string | null {
  const base = getApiBase();
  if (!base) {
    return null;
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function authHeaders(token?: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function mergeHeaders(base: HeadersInit | undefined, extra: HeadersInit): Headers {
  const headers = new Headers(base ?? {});
  new Headers(extra).forEach((value, key) => headers.set(key, value));
  return headers;
}

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<{ response: Response; data: T | null }> {
  const url = buildApiUrl(path);
  if (!url) {
    throw new Error('api_not_configured');
  }

  const response = await fetch(url, init);
  const text = await response.text();
  if (!text.trim()) {
    return { response, data: null };
  }

  try {
    return {
      response,
      data: JSON.parse(text) as T,
    };
  } catch {
    return { response, data: null };
  }
}

export async function postJson<T>(path: string, body: unknown, init: RequestInit = {}): Promise<{ response: Response; data: T | null }> {
  return requestJson<T>(path, {
    ...init,
    method: init.method ?? 'POST',
    headers: mergeHeaders(init.headers, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
}
