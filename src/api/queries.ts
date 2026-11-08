import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiJson, ApiError } from './client';
import {
  CHANGING_STATUSES,
  type DeleteResponse,
  type ProjectDetail,
  type ProjectSummary,
  type SceneDetail,
  type SessionDetail,
  type SessionSummary,
} from './types';

/**
 * Server state, through TanStack Query (DESIGN.md Section 15): cached per resource, refreshed in
 * the background, polled only while something can change (and never in a hidden tab, which is
 * TanStack's default), and invalidated by the mutations that change it.
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

const enc = encodeURIComponent;
const scenePath = (developerId: string, sceneId: string) => `/api/scenes/${enc(developerId)}/${enc(sceneId)}`;

export const keys = {
  projects: ['projects'] as const,
  project: (projectId: string) => ['project', projectId] as const,
  scene: (developerId: string, sceneId: string) => ['scene', developerId, sceneId] as const,
  sessions: (developerId: string, sceneId: string, filter: SessionFilter) => ['sessions', developerId, sceneId, filter] as const,
  sceneSessions: (developerId: string, sceneId: string) => ['sessions', developerId, sceneId] as const,
  session: (sessionId: string) => ['session', sessionId] as const,
};

export type SessionFilter = { version: number } | { awaitingScene: true };

const FAST_POLL_MS = 5_000;
const SLOW_POLL_MS = 30_000;

// ---- Projects ---------------------------------------------------------------------------------

export function useProjects() {
  return useQuery({ queryKey: keys.projects, queryFn: () => apiJson<ProjectSummary[]>('/api/projects') });
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: keys.project(projectId ?? ''),
    queryFn: () => apiJson<ProjectDetail>(`/api/projects/${enc(projectId!)}`),
    enabled: Boolean(projectId),
    refetchInterval: 15_000,
  });
}

export function useCreateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiJson<ProjectSummary>('/api/projects', { method: 'POST', body: { name } }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.projects }),
  });
}

// ---- Scenes -----------------------------------------------------------------------------------

export function useScene(developerId: string | undefined, sceneId: string | undefined) {
  return useQuery({
    queryKey: keys.scene(developerId ?? '', sceneId ?? ''),
    queryFn: () => apiJson<SceneDetail>(scenePath(developerId!, sceneId!)),
    enabled: Boolean(developerId && sceneId),
    // A processing version, or sessions waiting for an upload, can change without the user.
    refetchInterval: (query) => {
      const scene = query.state.data;
      if (!scene) return false;
      const processing = [scene.current, ...scene.archived].some(
        (v) => v && (v.processingStatus === 'Pending' || v.processingStatus === 'Processing'),
      );
      return processing || scene.awaitingSceneSessionCount > 0 ? FAST_POLL_MS : SLOW_POLL_MS;
    },
  });
}

function invalidateScene(client: QueryClient, developerId: string, sceneId: string) {
  void client.invalidateQueries({ queryKey: keys.scene(developerId, sceneId) });
  void client.invalidateQueries({ queryKey: keys.sceneSessions(developerId, sceneId) });
  void client.invalidateQueries({ queryKey: ['project'] });
  void client.invalidateQueries({ queryKey: keys.projects });
}

export function useRenameScene(developerId: string, sceneId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) =>
      apiJson<unknown>(scenePath(developerId, sceneId), { method: 'PATCH', body: { displayName } }),
    onSuccess: () => invalidateScene(client, developerId, sceneId),
  });
}

export function useDeleteScene(developerId: string, sceneId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiJson<DeleteResponse>(scenePath(developerId, sceneId), { method: 'DELETE' }),
    onSuccess: () => {
      client.removeQueries({ queryKey: keys.scene(developerId, sceneId) });
      client.removeQueries({ queryKey: keys.sceneSessions(developerId, sceneId) });
      void client.invalidateQueries({ queryKey: ['project'] });
      void client.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useDeleteVersion(developerId: string, sceneId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (version: number) =>
      apiJson<DeleteResponse>(`${scenePath(developerId, sceneId)}/versions/${version}`, { method: 'DELETE' }),
    onSuccess: () => invalidateScene(client, developerId, sceneId),
  });
}

export function useDeleteArchive(developerId: string, sceneId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiJson<DeleteResponse>(`${scenePath(developerId, sceneId)}/archive`, { method: 'DELETE' }),
    onSuccess: () => invalidateScene(client, developerId, sceneId),
  });
}

/** The URL path of a scene version's GLB (no hash = current version). */
export function sceneFilePath(developerId: string, sceneId: string, hash?: string): string {
  return `${scenePath(developerId, sceneId)}/file${hash ? `?hash=${enc(hash)}` : ''}`;
}

// ---- Sessions ---------------------------------------------------------------------------------

export function useSessions(developerId: string | undefined, sceneId: string | undefined, filter: SessionFilter | null) {
  return useQuery({
    queryKey: keys.sessions(developerId ?? '', sceneId ?? '', filter ?? { version: 0 }),
    queryFn: () => {
      const query = filter && 'version' in filter ? `?version=${filter.version}` : '?awaitingScene=true';
      return apiJson<SessionSummary[]>(`${scenePath(developerId!, sceneId!)}/sessions${query}`);
    },
    enabled: Boolean(developerId && sceneId && filter),
    refetchInterval: (query) =>
      query.state.data?.some((s) => CHANGING_STATUSES.has(s.status)) ? FAST_POLL_MS : SLOW_POLL_MS,
  });
}

export function useSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: keys.session(sessionId ?? ''),
    queryFn: () => apiJson<SessionDetail>(`/api/sessions/${enc(sessionId!)}`),
    enabled: Boolean(sessionId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && CHANGING_STATUSES.has(status) ? 4_000 : false;
    },
  });
}

function invalidateSessions(client: QueryClient, sessionId: string) {
  void client.invalidateQueries({ queryKey: keys.session(sessionId) });
  void client.invalidateQueries({ queryKey: ['sessions'] });
  void client.invalidateQueries({ queryKey: ['scene'] });
}

export function useRecompileSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => apiJson<void>(`/api/sessions/${enc(sessionId)}/recompile`, { method: 'POST' }),
    onSuccess: (_data, sessionId) => invalidateSessions(client, sessionId),
  });
}

export function useDeleteSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => apiJson<void>(`/api/sessions/${enc(sessionId)}`, { method: 'DELETE' }),
    onSuccess: (_data, sessionId) => {
      client.removeQueries({ queryKey: keys.session(sessionId) });
      invalidateSessions(client, sessionId);
    },
  });
}

/** Downloads a binary resource with progress (bytes received, total if the server sent it). */
export async function downloadWithProgress(
  path: string,
  onProgress?: (received: number, total: number | null) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const res = await apiFetch(path, { signal });
  const lengthHeader = res.headers.get('Content-Length');
  // With Content-Encoding the header is the compressed size, not what we will receive.
  const total = lengthHeader && !res.headers.get('Content-Encoding') ? Number(lengthHeader) : null;
  if (!res.body || !onProgress) return res.arrayBuffer();

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress(received, total);
  }

  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

/** Saves an authenticated download to disk (a plain link cannot carry the JWT). */
export async function saveDownload(path: string, filename: string): Promise<void> {
  const res = await apiFetch(path);
  const url = URL.createObjectURL(await res.blob());
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}
