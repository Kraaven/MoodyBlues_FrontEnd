/** Backend API contracts (MoodyBlues_Backend: *Contracts.cs). camelCase JSON. */

export interface AuthResponse {
  userId: string;
  email: string;
}

export interface MeResponse {
  userId: string;
  email: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  developerId: string;
  createdAtUtc: string;
  sceneCount: number;
  /** Identifies the active ingest key ("mbk_" + 6 chars); null if the project has none yet. */
  ingestKeyPrefix: string | null;
  ingestKeyCreatedAtUtc: string | null;
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
  revisionCount: number;
  currentVersion: number;
}

export interface ProjectDetail {
  id: string;
  name: string;
  developerId: string;
  createdAtUtc: string;
  scenes: ProjectScene[];
  ingestKeyPrefix: string | null;
  ingestKeyCreatedAtUtc: string | null;
  /**
   * What the user pastes into Unity (`https://mbk_...@host`). Null when the project has no key,
   * or its key predates stored keys; rotating gives it one.
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
  developerId: string;
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
}

export interface SessionDetail {
  id: string;
  developerId: string;
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
  rawEventCount: number;
  keyframeCount: number;
  replaySizeBytes: number;
  rawLogSizeBytes: number;
  deltaPromotions: number;
  hardClamps: number;
  droppedEvents: number;
  compilerVersion: number;
  compiledAtUtc: string | null;
  errorMessage: string | null;
  infoLogCount: number;
  warningLogCount: number;
  errorLogCount: number;
}

/** Statuses that can still change on their own, so lists showing them keep refreshing. */
export const CHANGING_STATUSES: ReadonlySet<SessionStatus> = new Set(['Recording', 'Queued', 'Compiling', 'WaitingForScene']);
