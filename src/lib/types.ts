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

export interface ProjectScene {
  sceneId: string;
  displayName: string | null;
  updatedAtUtc: string;
  sizeBytes: number;
  processingStatus: SceneProcessingStatus;
}

export interface ProjectDetail {
  id: string;
  name: string;
  developerId: string;
  createdAtUtc: string;
  scenes: ProjectScene[];
}

export type SessionStatus = 'Processing' | 'Ready' | 'Failed';

export interface SessionSummary {
  id: string;
  sceneId: string;
  createdAtUtc: string;
  durationSeconds: number;
  rawEventCount: number;
  keyframeCount: number;
  objectCount: number;
  animationSizeBytes: number;
  eventLogSizeBytes?: number;
  status: SessionStatus;
}

export interface SessionDetail extends SessionSummary {
  developerId: string;
  errorMessage: string | null;
}

/** One optimized animation channel -- exactly one of the three shapes below, per `type` (see AnimationOptimizer.cs). */
export type AnimationChannelType = 'constant' | 'linear' | 'keyframes';

export interface AnimationChannel {
  type: AnimationChannelType;
  /** Only set when type === 'constant'. */
  value?: number;
  /** Only set when type === 'linear'. */
  t0?: number;
  v0?: number;
  t1?: number;
  v1?: number;
  /** Only set when type === 'keyframes' -- dequantize with: min + (raw / 65535) * (max - min). */
  min?: number;
  max?: number;
  times?: number[];
  values?: number[];
}

export type AnimationLifecycleType = 'Spawn' | 'Show' | 'Hide' | 'Delete';

export interface AnimationLifecycleMoment {
  time: number;
  type: AnimationLifecycleType;
}

export interface AnimationObjectData {
  objectId: number;
  /** Null for objects present in the initial scene walk; set for runtime-spawned instances. */
  templateObjectId: number | null;
  /** Set for runtime-spawned instances (0 means scene root). */
  parentObjectId: number | null;
  channels: Record<string, AnimationChannel>;
  lifecycle: AnimationLifecycleMoment[];
}

export interface AnimationData {
  durationSeconds: number;
  objects: AnimationObjectData[];
}
