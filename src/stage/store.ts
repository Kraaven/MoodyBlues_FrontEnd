import { create } from 'zustand';
import type { Pose } from './transition';

/** What the Stage is drawing (DESIGN.md 4.2). `scene` and `replay` arrive with later phases. */
export type StageContent = 'none' | 'trace';

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

/** What a view asks of the Stage (DESIGN.md 4.3). */
export interface StageView {
  id: string;
  content: StageContent;
  /** Where the camera rests. Omit to leave it where it is. */
  pose?: CameraPose;
  /** Slow orbit drift with pointer parallax. */
  drift?: boolean;
  /** Stage opacity behind the DOM, 0 to 1. */
  dim?: number;
  /** Transition length; defaults to 600. */
  durationMs?: number;
}

export type StageStatus = 'ok' | 'lost' | 'unsupported';

export interface LoadingState {
  label: string;
  received: number;
  /** Null when the server did not say. */
  total: number | null;
}

export interface StageStats {
  fps: number;
  avgMs: number;
  maxMs: number;
  calls: number;
  triangles: number;
  lines: number;
  points: number;
  quality: number;
}

export const DEFAULT_CAMERA: Required<CameraPose> = { position: [0, 9, 30], target: [0, -1, 0], fov: 50 };

interface StageState {
  view: StageView;
  /** The pose to move to, and a counter that changes whenever a view asks for one. */
  pose: Pose;
  poseVersion: number;
  durationMs: number;
  status: StageStatus;
  loading: LoadingState | null;
  statsEnabled: boolean;
  stats: StageStats | null;
  /** Fraction of the Trace's curves being drawn; 1 until frames run long. */
  traceQuality: number;
  setView: (view: StageView) => void;
  setStatus: (status: StageStatus) => void;
  setLoading: (loading: LoadingState | null) => void;
  setStatsEnabled: (enabled: boolean) => void;
  setStats: (stats: StageStats) => void;
}

export function toPose(camera: CameraPose, dim: number, drift: boolean): Pose {
  const fov = camera.fov ?? DEFAULT_CAMERA.fov;
  return {
    px: camera.position[0],
    py: camera.position[1],
    pz: camera.position[2],
    tx: camera.target[0],
    ty: camera.target[1],
    tz: camera.target[2],
    fov,
    dim,
    drift: drift ? 1 : 0,
  };
}

const NONE: StageView = { id: 'none', content: 'none' };

export const useStage = create<StageState>((set, get) => ({
  view: NONE,
  pose: toPose(DEFAULT_CAMERA, 1, false),
  poseVersion: 0,
  durationMs: 600,
  status: 'ok',
  loading: null,
  statsEnabled: false,
  stats: null,
  traceQuality: 1,

  setView: (view) => {
    const previous = get();
    // A view with no pose leaves the camera alone but may still change dim and drift.
    const base = previous.pose;
    const next: Pose = view.pose
      ? toPose(view.pose, view.dim ?? 1, view.drift ?? false)
      : { ...base, dim: view.dim ?? base.dim, drift: view.drift === undefined ? base.drift : view.drift ? 1 : 0 };
    set({ view, pose: next, poseVersion: previous.poseVersion + 1, durationMs: view.durationMs ?? 600 });
  },
  setStatus: (status) => set({ status }),
  setLoading: (loading) => set({ loading }),
  setStatsEnabled: (statsEnabled) => set({ statsEnabled }),
  setStats: (stats) => set({ stats }),
}));

/** Used by a view's cleanup: only clears the Stage if no other view has taken over. */
export function releaseStageView(id: string): void {
  if (useStage.getState().view.id === id) useStage.getState().setView({ ...NONE, dim: 1 });
}
