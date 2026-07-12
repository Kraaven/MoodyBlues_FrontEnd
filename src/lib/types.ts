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
