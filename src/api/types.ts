/** Backend API contracts (MoodyBlues_Backend: *Contracts.cs). camelCase JSON. */

/** The signed-in user: the answer of register, login and /auth/me. */
export interface UserResponse {
  userId: string;
  email: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAtUtc: string;
  sceneCount: number;
  /** Identifies the active ingest key ("mbk_" + 6 chars). */
  ingestKeyPrefix: string;
  ingestKeyCreatedAtUtc: string;
}

/** POST /api/projects/{id}/ingest-key: a new key. The previous one stopped working. */
export interface IngestKeyResponse {
  connectionString: string;
  ingestKeyPrefix: string;
  ingestKeyCreatedAtUtc: string;
}

export type SceneProcessingStatus = 'Pending' | 'Processing' | 'Ready' | 'Failed';

/** A scene in a project's list: its current version. */
export interface ProjectScene {
  sceneId: string;
  displayName: string | null;
  updatedAtUtc: string;
  latestHash: string;
  sizeBytes: number;
  processingStatus: SceneProcessingStatus;
  currentVersion: number;
}

export interface ProjectDetail {
  id: string;
  name: string;
  createdAtUtc: string;
  scenes: ProjectScene[];
  ingestKeyPrefix: string;
  ingestKeyCreatedAtUtc: string;
  /**
   * What the user pastes into Unity (`https://mbk_...@host`). Null only when the server cannot
   * decrypt the stored key (its secret changed); rotating gives a new one.
   */
  connectionString: string | null;
}

export interface SceneVersion {
  version: number;
  hash: string;
  uploadedAtUtc: string;
  isCurrent: boolean;
  sizeBytes: number;
  processingStatus: SceneProcessingStatus;
  errorMessage: string | null;
  skippedMeshCount: number;
  trackedObjectCount: number;
  sessionCount: number;
  sessionBytes: number;
}

export interface SceneDetail {
  projectId: string;
  sceneId: string;
  displayName: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  current: SceneVersion | null;
  archived: SceneVersion[];
  awaitingSceneSessionCount: number;
  totalBytes: number;
}

export interface DeleteResponse {
  deletedVersions: number;
  deletedSessions: number;
  freedBytes: number;
}

export type SessionStatus = 'Recording' | 'Queued' | 'Compiling' | 'Ready' | 'Failed' | 'WaitingForScene';

/**
 * The shape of a session over time, computed by the backend when it compiles the replay. Every
 * position is a fraction of the session, 0 to 1.
 */
export interface SessionActivity {
  /** Keyframe activity per equal time bucket (48), 0 to 1. */
  bins: number[];
  errors: number[];
  warnings: number[];
  spawns: number[];
  /** [start, end] spans with no data. */
  gaps: [number, number][];
}

export interface SessionSummary {
  id: string;
  sceneId: string;
  sceneHash: string;
  createdAtUtc: string;
  status: SessionStatus;
  endedCleanly: boolean;
  durationSeconds: number;
  objectCount: number;
  spawnCount: number;
  keyframeCount: number;
  replaySizeBytes: number;
  rawLogSizeBytes: number;
  /** Null while the version it was recorded in has not been uploaded. */
  sceneVersion: number | null;
  errorMessage: string | null;
  infoLogCount: number;
  warningLogCount: number;
  errorLogCount: number;
  /** Null until the replay is built. */
  activity: SessionActivity | null;
  isPublic: boolean;
  shareToken: string | null;
}

export interface SessionDetail {
  id: string;
  projectId: string;
  sceneId: string;
  sceneHash: string;
  createdAtUtc: string;
  lastActivityUtc: string;
  status: SessionStatus;
  endedCleanly: boolean;
  connectionCount: number;
  durationSeconds: number;
  objectCount: number;
  spawnCount: number;
  keyframeCount: number;
  replaySizeBytes: number;
  rawLogSizeBytes: number;
  deltaPromotions: number;
  hardClamps: number;
  droppedEvents: number;
  rotationWidenings: number;
  compilerVersion: number;
  compiledAtUtc: string | null;
  errorMessage: string | null;
  infoLogCount: number;
  warningLogCount: number;
  errorLogCount: number;
  /** Null until the replay is built. */
  activity: SessionActivity | null;
  isPublic: boolean;
  shareToken: string | null;
}

/** A session's public link state. The token is stable while public and replaced by a reset. */
export interface SharingResponse {
  isPublic: boolean;
  shareToken: string | null;
}

/** What an anonymous visitor gets for a share link. The session's own share fields are not meaningful there. */
export interface SharedSessionResponse {
  session: SessionDetail;
  projectName: string;
  sceneName: string;
  sceneVersion: number | null;
}

/** Statuses that can still change on their own, so lists showing them keep refreshing. */
export const CHANGING_STATUSES: ReadonlySet<SessionStatus> = new Set(['Recording', 'Queued', 'Compiling', 'WaitingForScene']);
