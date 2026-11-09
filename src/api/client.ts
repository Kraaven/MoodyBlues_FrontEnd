/**
 * Fetch wrapper for the backend API (MoodyBlues_Backend/README.md).
 *
 * Auth is two httpOnly cookies the backend sets: a 15-minute access cookie and a refresh cookie
 * scoped to /auth. Script never sees either, so every request just sends credentials. A 401 on an
 * authenticated request triggers one POST /auth/refresh (shared by every request that failed at
 * the same moment) and a single retry; if the refresh fails too, the auth layer signs the user out
 * (DESIGN.md Section 10).
 *
 * Every request carries X-MoodyBlues-Client. The backend refuses state-changing requests without
 * it, which a cross-site form cannot add, so it doubles as CSRF protection.
 */

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8765';

const CLIENT_HEADER = 'X-MoodyBlues-Client';
const CLIENT_VALUE = 'dashboard';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;

/** Registered by the auth provider: called when a request gets a 401 that a refresh cannot fix. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function errorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  if (!text) return res.statusText || `Request failed (${res.status}).`;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      if (typeof record.detail === 'string') return record.detail;
      if (typeof record.title === 'string') return record.title;
    }
    return text;
  } catch {
    return text;
  }
}

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** False for sign-in, registration and the session probe: a 401 there is an answer, not an expiry. */
  auth?: boolean;
  signal?: AbortSignal;
}

const UNREACHABLE = 'Could not reach the MoodyBlues server. Check your connection and try again.';

function send(path: string, method: string, body: unknown, signal: AbortSignal | undefined): Promise<Response> {
  const headers: Record<string, string> = { [CLIENT_HEADER]: CLIENT_VALUE };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(apiUrl(path), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
    signal,
  });
}

let refreshing: Promise<boolean> | null = null;

/**
 * Exchanges the refresh cookie for a new pair. Concurrent callers share one request, because the
 * backend rotates the refresh token on every use.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= send('/auth/refresh', 'POST', undefined, undefined)
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Raw fetch with cookies: for binary downloads. Throws ApiError on failure. */
export async function apiFetch(path: string, { method = 'GET', body, auth = true, signal }: RequestOptions = {}): Promise<Response> {
  let res: Response;
  try {
    res = await send(path, method, body, signal);
    if (res.status === 401 && auth && (await refreshSession())) {
      res = await send(path, method, body, signal);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, UNREACHABLE);
  }

  if (res.status === 401 && auth) {
    onUnauthorized?.();
    throw new ApiError(401, 'Your session expired. Sign in again.');
  }

  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res;
}

export async function apiJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await apiFetch(path, options);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** A user-facing message for any thrown value. */
export function errorText(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof ApiError || err instanceof Error) return err.message || fallback;
  return fallback;
}
