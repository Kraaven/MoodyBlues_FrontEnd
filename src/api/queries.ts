import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiJson, ApiError } from './client';
import {
  CHANGING_STATUSES,
  type DeleteResponse,
  type IngestKeyResponse,
  type ProjectDetail,
  type ProjectSummary,
  type SceneDetail,
  type SessionDetail,
  type SessionSummary,
  type SharedSessionResponse,
  type SharingResponse,
} from './types';

/**
 * Server state, through TanStack Query: cached per resource, refreshed in
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
const scenePath = (projectId: string, sceneId: string) => `/api/projects/${enc(projectId)}/scenes/${enc(sceneId)}`;

export const keys = {
  projects: ['projects'] as const,
  project: (projectId: string) => ['project', projectId] as const,
  scene: (projectId: string, sceneId: string) => ['scene', projectId, sceneId] as const,
  sessions: (projectId: string, sceneId: string, filter: SessionFilter) => ['sessions', projectId, sceneId, filter] as const,
  sceneSessions: (projectId: string, sceneId: string) => ['sessions', projectId, sceneId] as const,
  session: (sessionId: string) => ['session', sessionId] as const,
  shared: (token: string) => ['share', token] as const,
};

type SessionFilter = { version: number } | { awaitingScene: true };

const FAST_POLL_MS = 5_000;
const SLOW_POLL_MS = 30_000;

// ---- Projects ---------------------------------------------------------------------------------

/** Query options for the project list, shared by the hook and the background prefetcher. */
export function projectsQuery() {
  return { queryKey: keys.projects, queryFn: () => apiJson<ProjectSummary[]>('/api/projects') };
}

export function useProjects() {
  return useQuery(projectsQuery());
}

/** Query options for one project, shared by the hook and by pages that load several at once. */
export function projectQuery(projectId: string) {
  return { queryKey: keys.project(projectId), queryFn: () => apiJson<ProjectDetail>(`/api/projects/${enc(projectId)}`) };
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    ...projectQuery(projectId ?? ''),
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

export function useRotateIngestKey(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiJson<IngestKeyResponse>(`/api/projects/${enc(projectId)}/ingest-key`, { method: 'POST' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.project(projectId) });
      void client.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

// ---- Scenes -----------------------------------------------------------------------------------

export function useScene(projectId: string | undefined, sceneId: string | undefined) {
  return useQuery({
    queryKey: keys.scene(projectId ?? '', sceneId ?? ''),
    queryFn: () => apiJson<SceneDetail>(scenePath(projectId!, sceneId!)),
    enabled: Boolean(projectId && sceneId),
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

function invalidateScene(client: QueryClient, projectId: string, sceneId: string) {
  void client.invalidateQueries({ queryKey: keys.scene(projectId, sceneId) });
  void client.invalidateQueries({ queryKey: keys.sceneSessions(projectId, sceneId) });
  void client.invalidateQueries({ queryKey: ['project'] });
  void client.invalidateQueries({ queryKey: keys.projects });
}

export function useRenameScene(projectId: string, sceneId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) =>
      apiJson<unknown>(scenePath(projectId, sceneId), { method: 'PATCH', body: { displayName } }),
    onSuccess: () => invalidateScene(client, projectId, sceneId),
  });
}

export function useDeleteScene(projectId: string, sceneId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiJson<DeleteResponse>(scenePath(projectId, sceneId), { method: 'DELETE' }),
    onSuccess: () => {
      client.removeQueries({ queryKey: keys.scene(projectId, sceneId) });
      client.removeQueries({ queryKey: keys.sceneSessions(projectId, sceneId) });
      void client.invalidateQueries({ queryKey: ['project'] });
      void client.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

export function useDeleteVersion(projectId: string, sceneId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (version: number) =>
      apiJson<DeleteResponse>(`${scenePath(projectId, sceneId)}/versions/${version}`, { method: 'DELETE' }),
    onSuccess: () => invalidateScene(client, projectId, sceneId),
  });
}

export function useDeleteArchive(projectId: string, sceneId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiJson<DeleteResponse>(`${scenePath(projectId, sceneId)}/archive`, { method: 'DELETE' }),
    onSuccess: () => invalidateScene(client, projectId, sceneId),
  });
}

/** The URL path of a scene version's GLB (no hash = current version). */
export function sceneFilePath(projectId: string, sceneId: string, hash?: string): string {
  return `${scenePath(projectId, sceneId)}/file${hash ? `?hash=${enc(hash)}` : ''}`;
}

// ---- Sessions ---------------------------------------------------------------------------------

/** Query options for a scene's sessions in one version, or those waiting for a scene. */
export function sessionsQuery(projectId: string, sceneId: string, filter: SessionFilter) {
  return {
    queryKey: keys.sessions(projectId, sceneId, filter),
    queryFn: () => {
      const query = 'version' in filter ? `?version=${filter.version}` : '?awaitingScene=true';
      return apiJson<SessionSummary[]>(`${scenePath(projectId, sceneId)}/sessions${query}`);
    },
  };
}

export function useSessions(projectId: string | undefined, sceneId: string | undefined, filter: SessionFilter | null) {
  return useQuery({
    ...sessionsQuery(projectId ?? '', sceneId ?? '', filter ?? { version: 0 }),
    enabled: Boolean(projectId && sceneId && filter),
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

/** An anonymous visitor's view of a public session. A bad, private or reset token is a 404. */
export function useSharedSession(token: string | undefined) {
  return useQuery({
    queryKey: keys.shared(token ?? ''),
    queryFn: () => apiJson<SharedSessionResponse>(`/api/share/${enc(token!)}`),
    enabled: Boolean(token),
    refetchInterval: (query) => {
      const status = query.state.data?.session.status;
      return status && CHANGING_STATUSES.has(status) ? 4_000 : false;
    },
  });
}

/** Writes a sharing change into the session's detail and refreshes the lists that show the Public badge. */
function applySharing(client: QueryClient, sessionId: string, sharing: SharingResponse) {
  client.setQueryData<SessionDetail>(keys.session(sessionId), (old) => (old ? { ...old, ...sharing } : old));
  void client.invalidateQueries({ queryKey: keys.session(sessionId) });
  void client.invalidateQueries({ queryKey: ['sessions'] });
}

export function useSetSharing(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (isPublic: boolean) => apiJson<SharingResponse>(`/api/sessions/${enc(sessionId)}/sharing`, { method: 'PUT', body: { isPublic } }),
    onSuccess: (sharing) => applySharing(client, sessionId, sharing),
  });
}

/** Replaces the share token: the old link stops working at once. */
export function useResetShare(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiJson<SharingResponse>(`/api/sessions/${enc(sessionId)}/sharing/reset`, { method: 'POST' }),
    onSuccess: (sharing) => applySharing(client, sessionId, sharing),
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

/** A finished download and the response headers that decide whether it may be cached. */
export interface Download {
  buffer: ArrayBuffer;
  /** True when the server marked this exact response as never changing (a final scene revision). */
  immutable: boolean;
}

/**
 * Downloads a binary resource with progress (bytes received, total if the server sent it).
 * `priority: 'low'` is for background fetches.
 */
export async function downloadResource(
  path: string,
  onProgress?: (received: number, total: number | null) => void,
  signal?: AbortSignal,
  priority?: 'low' | 'high' | 'auto',
): Promise<Download> {
  const res = await apiFetch(path, { signal, priority });
  const immutable = (res.headers.get('Cache-Control') ?? '').includes('immutable');
  // The scene and the replay are served compressed: Content-Length is then the wire size, while the stream we read
  // is already decoded, so the backend states the decoded size separately.
  const decoded = res.headers.get('X-MoodyBlues-Decoded-Length');
  const lengthHeader = res.headers.get('Content-Length');
  const total = decoded ? Number(decoded) : lengthHeader && !res.headers.get('Content-Encoding') ? Number(lengthHeader) : null;
  if (!res.body || !onProgress) return { buffer: await res.arrayBuffer(), immutable };

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
  return { buffer: out.buffer, immutable };
}

export async function downloadWithProgress(
  path: string,
  onProgress?: (received: number, total: number | null) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  return (await downloadResource(path, onProgress, signal)).buffer;
}

/** Saves an authenticated download to disk (through fetch, so a refresh can happen first if needed). */
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
