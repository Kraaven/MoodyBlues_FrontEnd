import { create } from 'zustand';
import type { Pose } from './transition';

/** What the Stage is drawing. */
export type StageContent = 'none' | 'trace' | 'demo' | 'scene' | 'studio';

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

/** One uploaded version of a scene: exactly what the backend keys its GLB by. */
export interface SceneRef {
  developerId: string;
  sceneId: string;
  hash: string;
}

/** What a view asks of the Stage (DESIGN.md 4.3). */
export interface StageView {
  id: string;
  content: StageContent;
  /** Where the camera rests. Omit to leave it where it is. */
  pose?: CameraPose;
  /** Slow orbit drift with pointer parallax (the rig drives the camera). */
  drift?: boolean;
  /** Stage opacity behind the DOM, 0 to 1. */
  dim?: number;
  /** Transition length; defaults to 600. */
  durationMs?: number;
  /** The scene version to show, for `scene` and `replay` content. */
  scene?: SceneRef;
  /**
   * `rig`: the Stage drives the camera. `free`: orbit controls drive it once the transition ends.
   * Free needs a StageSurface to take the pointer.
   */
  control?: 'rig' | 'free';
  /** With free control: turn slowly while the user is idle. */
  idleOrbit?: boolean;
  /** With free control: the wheel zooms. Off for previews on scrolling pages. */
  zoom?: boolean;
}

export type StageStatus = 'ok' | 'lost' | 'unsupported';

export interface LoadingState {
  label: string;
  received: number;
  /** Null when the server did not say. */
  total: number | null;
}

export interface SceneState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: unknown;
  /** Bumped by Retry so the same scene is requested again. */
  attempt: number;
}

/** What a loaded scene version contains, measured once it is in the Stage; read by the pages. */
export interface SceneSummary {
  /** sceneKey() of the version it describes. */
  key: string;
  nodes: number;
  meshes: number;
  materials: number;
  textures: number;
  triangles: number;
  vertices: number;
}

export interface StageStats {
  fps: number;
  avgMs: number;
  maxMs: number;
  calls: number;
  triangles: number;
  lines: number;
  points: number;
  geometries: number;
  textures: number;
  quality: number;
}

/** Pixels of the viewport that the 3D should not use, so it centres in what is left. */
export interface Inset {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const NO_INSET: Inset = { left: 0, right: 0, top: 0, bottom: 0 };

/** The identity of a scene version, as the scene cache and the summaries key it. */
export function refKey(ref: SceneRef): string {
  return `${ref.developerId}/${ref.sceneId}/${ref.hash}`;
}
export const DEFAULT_CAMERA: Required<CameraPose> = { position: [0, 9, 30], target: [0, -1, 0], fov: 50 };

interface StageState {
  view: StageView;
  /** The pose to move to, and a counter that changes whenever a view asks for one. */
  pose: Pose;
  poseVersion: number;
  durationMs: number;
  status: StageStatus;
  /** Downloads in progress, by name (the scene and the replay can load together). */
  loading: Record<string, LoadingState>;
  scene: SceneState;
  /** Measured contents of scene versions loaded in this tab, by sceneKey. */
  summaries: Record<string, SceneSummary>;
  setSummary: (summary: SceneSummary) => void;
  /**
   * The scene version the camera was last framed on. A view that shows the same scene again (a scene
   * turning into one of its sessions) keeps the camera where the user left it instead of re-framing.
   * Cleared when the Stage goes back to the Trace.
   */
  framedKey: string | null;
  /** The share of the canvas the scene was framed for (see regionFill). A big change re-frames. */
  framedFill: number;
  /** The element that takes the pointer for orbit and picking. Null when no view has placed one. */
  surface: HTMLElement | null;
  inset: Inset;
  /** Whether the camera should glide to the new inset (a view change) or jump (scrolling, resizing). */
  insetSmooth: boolean;
  statsEnabled: boolean;
  stats: StageStats | null;
  /** Fraction of the Trace's curves being drawn; 1 until frames run long. */
  traceQuality: number;
  /** Debug toggles (DESIGN.md 9.6). */
  debug: { wireframe: boolean; axes: boolean; bounds: boolean; showHidden: boolean; fog: boolean };
  setView: (view: StageView) => void;
  /** Move the camera to a new pose without changing anything else about the view. */
  setCameraPose: (camera: CameraPose, durationMs?: number) => void;
  setStatus: (status: StageStatus) => void;
  setLoading: (key: string, loading: LoadingState | null) => void;
  setSceneState: (state: Partial<SceneState>) => void;
  setFramedKey: (key: string | null, fill?: number) => void;
  retryScene: () => void;
  setSurface: (surface: HTMLElement | null) => void;
  setInset: (inset: Inset, smooth?: boolean) => void;
  setStatsEnabled: (enabled: boolean) => void;
  setStats: (stats: StageStats) => void;
  setDebug: (patch: Partial<StageState['debug']>) => void;
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

/**
 * How much of the canvas the 3D is shown in, for framing: the shorter side of the free region as a
 * share of the canvas height (1 when the view uses the whole window and it is wider than tall).
 */
export function regionFill(width: number, height: number, inset: Inset): number {
  const w = Math.max(1, width - inset.left - inset.right);
  const h = Math.max(1, height - inset.top - inset.bottom);
  return Math.min(w, h) / height;
}

const NONE: StageView = { id: 'none', content: 'none' };

export const useStage = create<StageState>((set, get) => ({
  view: NONE,
  pose: toPose(DEFAULT_CAMERA, 1, false),
  poseVersion: 0,
  durationMs: 600,
  status: 'ok',
  loading: {},
  scene: { status: 'idle', error: null, attempt: 0 },
  summaries: {},
  setSummary: (summary) => set({ summaries: { ...get().summaries, [summary.key]: summary } }),
  framedKey: null,
  framedFill: 1,
  surface: null,
  inset: NO_INSET,
  insetSmooth: false,
  statsEnabled: false,
  stats: null,
  traceQuality: 1,
  debug: { wireframe: false, axes: false, bounds: false, showHidden: false, fog: true },

  setView: (view) => {
    const previous = get();
    // A view with no pose leaves the camera alone but may still change dim and drift.
    const base = previous.pose;
    const next: Pose = view.pose
      ? toPose(view.pose, view.dim ?? 1, view.drift ?? false)
      : { ...base, dim: view.dim ?? base.dim, drift: view.drift === undefined ? base.drift : view.drift ? 1 : 0 };
    set({
      view,
      pose: next,
      poseVersion: previous.poseVersion + 1,
      durationMs: view.durationMs ?? 600,
      framedKey: view.content === 'trace' || view.content === 'demo' ? null : previous.framedKey,
    });
  },
  setCameraPose: (camera, durationMs = 900) => {
    const { pose, view, poseVersion } = get();
    set({ pose: toPose(camera, pose.dim, view.drift ?? false), poseVersion: poseVersion + 1, durationMs });
  },
  setStatus: (status) => set({ status }),
  setLoading: (key, loading) => {
    const next = { ...get().loading };
    if (loading) next[key] = loading;
    else delete next[key];
    set({ loading: next });
  },
  setSceneState: (state) => set({ scene: { ...get().scene, ...state } }),
  setFramedKey: (framedKey, framedFill = get().framedFill) => set({ framedKey, framedFill }),
  retryScene: () => set({ scene: { status: 'idle', error: null, attempt: get().scene.attempt + 1 } }),
  setSurface: (surface) => set({ surface }),
  setInset: (inset, smooth = false) => {
    const now = get().inset;
    if (now.left === inset.left && now.right === inset.right && now.top === inset.top && now.bottom === inset.bottom) return;
    set({ inset, insetSmooth: smooth });
  },
  setStatsEnabled: (statsEnabled) => set({ statsEnabled }),
  setStats: (stats) => set({ stats }),
  setDebug: (patch) => set({ debug: { ...get().debug, ...patch } }),
}));

/** Used by a view's cleanup: only clears the Stage if no other view has taken over. */
export function releaseStageView(id: string): void {
  if (useStage.getState().view.id === id) useStage.getState().setView({ ...NONE, dim: 1 });
}

/**
 * Whether a scene loaded for `key` should fly the camera to a new framing: always the first time,
 * and again when the part of the window it is shown in has changed a lot (a small card growing into
 * the full viewer). Otherwise the camera stays where the user left it.
 */
export function needsFraming(key: string, fill: number): boolean {
  const { framedKey, framedFill } = useStage.getState();
  return framedKey !== key || Math.abs(Math.log(fill / Math.max(0.01, framedFill))) > 0.3;
}

// Development only: lets the console and the dev scripts inspect the Stage (`__stage.getState()`).
if (import.meta.env.DEV) (window as unknown as { __stage: typeof useStage }).__stage = useStage;
