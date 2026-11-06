export interface AuthResponse {
  token: string;
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
}

export type SceneProcessingStatus = 'Pending' | 'Processing' | 'Ready' | 'Failed';

/** A scene as the backend reports it: the latest uploaded revision's hash, size and status. */
export interface ProjectScene {
  sceneId: string;
  displayName: string | null;
  updatedAtUtc: string;
  latestHash: string;
  sizeBytes: number;
  processingStatus: SceneProcessingStatus;
  revisionCount: number;
}

export interface ProjectDetail {
  id: string;
  name: string;
  developerId: string;
  createdAtUtc: string;
  scenes: ProjectScene[];
}

/** Recording: the game may still be streaming. Queued/Compiling: the replay is being built. */
export type SessionStatus = 'Recording' | 'Queued' | 'Compiling' | 'Ready' | 'Failed';

export interface SessionSummary {
  id: string;
  sceneId: string;
  /** The scene revision this session was recorded against; the viewer loads exactly that GLB. */
  sceneHash: string;
  createdAtUtc: string;
  status: SessionStatus;
  /** False when the game stopped streaming without EndSession (crash, kill, lost connection). */
  endedCleanly: boolean;
  durationSeconds: number;
  objectCount: number;
  spawnCount: number;
  keyframeCount: number;
  replaySizeBytes: number;
  rawLogSizeBytes: number;
}

export interface SessionDetail extends SessionSummary {
  developerId: string;
  lastActivityUtc: string;
  connectionCount: number;
  rawEventCount: number;
  deltaPromotions: number;
  /** Non-zero means some recorded transforms exceeded the configured ranges and are wrong. */
  hardClamps: number;
  droppedEvents: number;
  compilerVersion: number;
  compiledAtUtc: string | null;
  errorMessage: string | null;
}
