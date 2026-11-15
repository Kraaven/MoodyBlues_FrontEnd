import { sceneFilePath } from '../api/queries';
import type { SceneRef } from '../stage/store';

/**
 * Where the studio's data comes from. An owner is signed in and reaches everything by project,
 * scene and session ids (`sessionId` is null when only a scene version is being inspected); a
 * share is an anonymous visitor holding a public link's token, which reaches one session, its
 * replay and its scene file, and nothing else.
 */
export type StudioSource = { kind: 'owner'; projectId: string; sceneId: string; sessionId: string | null } | { kind: 'share'; token: string };

const enc = encodeURIComponent;

/** The replay download, or null when no session is open. */
export function replayPath(source: StudioSource): string | null {
  if (source.kind === 'share') return `/api/share/${enc(source.token)}/replay`;
  return source.sessionId ? `/api/sessions/${enc(source.sessionId)}/replay` : null;
}

/** The GLB of a scene version. A share serves only the version its session was recorded in. */
export function sceneRef(source: StudioSource, sceneId: string, hash: string): SceneRef {
  if (source.kind === 'share') return { url: `/api/share/${enc(source.token)}/scene`, hash };
  return { url: sceneFilePath(source.projectId, sceneId, hash), hash };
}
