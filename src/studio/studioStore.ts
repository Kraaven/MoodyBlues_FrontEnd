import { create } from 'zustand';
import type * as THREE from 'three';
import type { ReplayPlayer } from '../viewer/replay/ReplayPlayer';

/**
 * What the 3D studio shares between the Stage (which holds the scene, takes the clicks and runs the
 * replay) and the windows (which list and describe it).
 *
 * `root` is what is on screen: the shared master graph when inspecting a scene version (read only),
 * or the replay's own copy of it when a session plays. Selection is by node; during a replay it is
 * also kept by ObjectID, because the node behind an ID can change (a spawn appearing, a pooled clone
 * being reused).
 */
export interface ViewSettings {
  grid: boolean;
  shadows: boolean;
  wireframe: boolean;
  axes: boolean;
  fov: number;
  /** The lights the Unity scene exported. Off by default: the viewer's own lighting reads better and costs less. */
  sceneLights: boolean;
  /** A small frustum drawn at each camera the Unity scene exported. */
  cameraGizmos: boolean;
  /** How Follow frames the player: a chase camera behind and above, or side-on leading where they move. */
  followStyle: FollowStyle;
  /** First person's near clip plane in metres, for a camera that sits inside the player's body. Null: automatic, scaled to the player's height. */
  firstPersonNear: number | null;
}

/** How the view stays on a focused camera: through its lens, or chasing the player it belongs to. */
export type CameraMode = 'firstPerson' | 'follow';
export type FollowStyle = 'behind' | 'front';

const SETTINGS_KEY = 'moodyblues.view.v1';
const DEFAULT_SETTINGS: ViewSettings = {
  grid: true,
  shadows: true,
  wireframe: false,
  axes: false,
  fov: 45,
  sceneLights: false,
  cameraGizmos: true,
  followStyle: 'behind',
  firstPersonNear: null,
};

function readSettings(): ViewSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ViewSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function storeSettings(settings: ViewSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* not remembered */
  }
}

interface StudioState {
  root: THREE.Object3D | null;
  master: THREE.Object3D | null;
  renderer: THREE.WebGLRenderer | null;
  player: ReplayPlayer | null;
  selected: THREE.Object3D | null;
  /** The ObjectID of the selection, when it has one. */
  selectedId: number | null;
  follow: boolean;
  /**
   * The ObjectID of the exported camera the view stays on, or null for the free camera. While set,
   * the orbit target follows that camera so the user can still orbit and zoom around it. Exclusive
   * with `follow` (the selected object).
   */
  focusCameraId: number | null;
  /** How the focused camera is viewed. Kept when switching cameras; reset to 'follow' when a scene attaches. */
  cameraMode: CameraMode;
  /** The recording's opening move is running: the camera is not followed until it ends. */
  introRunning: boolean;
  /** Bumped to run the intro again; `introFromStart` says it begins at 0 and plays (the button) rather than where the link started. */
  introRequest: number;
  introFromStart: boolean;
  /**
   * 'waiting' holds a recording's intro at the whole-scene overview until it is 'open' (the welcome
   * card of a shared link, until Play). Owners' pages never close it.
   */
  introGate: 'open' | 'waiting';
  settings: ViewSettings;
  /** A material picked in the Materials window, shown in its details. */
  materialId: string | null;
  frameAllRequest: number;
  frameSelectedRequest: number;
  shortcutsOpen: boolean;
  attach: (scene: { root: THREE.Object3D; master: THREE.Object3D; renderer: THREE.WebGLRenderer; player: ReplayPlayer | null } | null) => void;
  /** Select a node (from a click in the view, or a window). */
  select: (node: THREE.Object3D | null) => void;
  /** Select by ObjectID (a replay's hierarchy); the node is looked up now and kept current while it plays. */
  selectId: (id: number | null) => void;
  /** The replay changed which node is behind the selected ID. */
  resolveSelected: (node: THREE.Object3D | null) => void;
  setFollow: (follow: boolean) => void;
  /** Focus an exported camera (null: the free camera). The view rig glides to it. */
  setFocusCamera: (id: number | null) => void;
  /** Focus `id` and view it in `mode` (the two buttons on a camera row). */
  setCameraMode: (id: number, mode: CameraMode) => void;
  setIntroRunning: (running: boolean) => void;
  setIntroGate: (gate: 'open' | 'waiting') => void;
  replayIntro: () => void;
  setSetting: <K extends keyof ViewSettings>(key: K, value: ViewSettings[K]) => void;
  setMaterial: (id: string | null) => void;
  frameAll: () => void;
  frameSelected: () => void;
  setShortcutsOpen: (open: boolean) => void;
}

function idOf(node: THREE.Object3D | null, player: ReplayPlayer | null): number | null {
  if (!node) return null;
  if (player) return player.objectIdOf(node);
  for (let n: THREE.Object3D | null = node; n; n = n.parent) if (typeof n.userData?.objectId === 'number') return n.userData.objectId as number;
  return null;
}

export const useStudio = create<StudioState>((set, get) => ({
  root: null,
  master: null,
  renderer: null,
  player: null,
  selected: null,
  selectedId: null,
  follow: false,
  focusCameraId: null,
  cameraMode: 'follow',
  introRunning: false,
  introRequest: 0,
  introFromStart: false,
  introGate: 'open',
  settings: readSettings(),
  materialId: null,
  frameAllRequest: 0,
  frameSelectedRequest: 0,
  shortcutsOpen: false,
  attach: (scene) => {
    const previousId = get().selectedId;
    if (!scene) {
      set({ root: null, master: null, renderer: null, player: null, selected: null, follow: false, focusCameraId: null, introRunning: false, introFromStart: false });
      return;
    }
    // Keep the selection across scene and session when the same object exists in both.
    const node = previousId !== null ? (scene.player?.getObject(previousId) ?? findById(scene.root, previousId)) : null;
    // A new scene or recording starts on the free camera; a recording's intro picks the main camera.
    set({ ...scene, selected: node ?? null, selectedId: node ? previousId : null, follow: node ? get().follow : false, focusCameraId: null, cameraMode: 'follow', introRunning: false });
  },
  select: (selected) => {
    const selectedId = idOf(selected, get().player);
    set({ selected, selectedId, follow: selected ? get().follow : false });
  },
  selectId: (selectedId) => {
    const { player, root } = get();
    const selected = selectedId === null ? null : (player?.getObject(selectedId) ?? (root ? findById(root, selectedId) : null) ?? null);
    set({ selectedId, selected, follow: selectedId === null ? false : get().follow });
  },
  resolveSelected: (node) => {
    if (node !== get().selected) set({ selected: node });
  },
  setFollow: (follow) => set(follow ? { follow, focusCameraId: null } : { follow }),
  setFocusCamera: (id) =>
    set((s) => ({ focusCameraId: id, follow: id === null ? s.follow : false })),
  setCameraMode: (id, cameraMode) =>
    set({ focusCameraId: id, cameraMode, follow: false }),
  setIntroRunning: (introRunning) => set({ introRunning }),
  setIntroGate: (introGate) => set({ introGate }),
  replayIntro: () => set((s) => ({ introRequest: s.introRequest + 1, introFromStart: true })),
  setSetting: (key, value) => {
    const settings = { ...get().settings, [key]: value };
    storeSettings(settings);
    set({ settings });
  },
  setMaterial: (materialId) => set({ materialId }),
  frameAll: () => set((s) => ({ frameAllRequest: s.frameAllRequest + 1 })),
  frameSelected: () => set((s) => ({ frameSelectedRequest: s.frameSelectedRequest + 1 })),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
}));

function findById(root: THREE.Object3D, id: number): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((n) => {
    if (!found && n.userData?.objectId === id) found = n;
  });
  return found;
}
