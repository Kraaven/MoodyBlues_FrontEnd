/**
 * Fetch wrapper for the backend API (MoodyBlues_Backend/README.md). Adds the JWT, turns failures
 * into ApiError with the backend's own message, and reports a 401 to the auth layer, which signs
 * the user out (DESIGN.md Section 10).
 */

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8765';

const TOKEN_STORAGE_KEY = 'moodyblues.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode): the session lasts until the tab closes.
  }
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;

/** Registered by the auth provider: called once for any authenticated request that gets a 401. */
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
  auth?: boolean;
  signal?: AbortSignal;
}

/** Raw authenticated fetch: for binary downloads. Throws ApiError on failure. */
export async function apiFetch(path: string, { method = 'GET', body, auth = true, signal }: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Could not reach the MoodyBlues server. Check your connection and try again.');
  }

  if (res.status === 401 && token) {
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
