const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8765';

const TOKEN_STORAGE_KEY = 'moodyblues.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function extractErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  if (!text) {
    return res.statusText || `Request failed (${res.status})`;
  }

  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') {
      return parsed;
    }
    if (parsed && typeof parsed === 'object' && 'title' in parsed) {
      return String((parsed as { title: unknown }).title);
    }
    return text;
  } catch {
    return text;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth) {
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new ApiError(res.status, await extractErrorMessage(res));
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown, auth = true) => request<T>(path, { method: 'POST', body, auth }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
};

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

/** Sanitizes a display name into something safe to use as a filename. */
function toSafeFilename(name: string, extension: string): string {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9 _.-]/g, '-') || 'scene';
  return cleaned.toLowerCase().endsWith(extension) ? cleaned : `${cleaned}${extension}`;
}

/**
 * Downloads a scene's `.glb` (the same authenticated file the viewer fetches -- optimized once
 * ready, otherwise the raw upload) by streaming it into a blob and triggering a client-side save,
 * since the endpoint requires a Bearer token that a plain `<a href>` can't attach.
 */
export async function downloadSceneFile(developerId: string, sceneId: string, suggestedName: string): Promise<void> {
  const token = getToken();
  const res = await fetch(apiUrl(`/api/scenes/${encodeURIComponent(developerId)}/${encodeURIComponent(sceneId)}/file`), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!res.ok) {
    throw new ApiError(res.status, await extractErrorMessage(res));
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = toSafeFilename(suggestedName, '.glb');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export { API_BASE_URL };
