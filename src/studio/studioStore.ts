import { create } from 'zustand';
import type * as THREE from 'three';
import type { ReplayPlayer } from '../viewer/replay/ReplayPlayer';
import { canSelect, isLocked, viewSettingsOf, type LockKey, type ShareSettings } from '../share/shareSettings';
import { DEFAULT_VIEW_SETTINGS, type CameraMode, type ViewSettings } from './viewSettings';

/**
 * What the 3D studio shares between the Stage (which holds the scene, takes the clicks and runs the
 * replay) and the windows (which list and describe it).
 *
 * `root` is what is on screen: the shared master graph when inspecting a scene version (read only),
 * or the replay's own copy of it when a session plays. Selection is by node; during a replay it is
 * also kept by ObjectID, because the node behind an ID can change (a spawn appearing, a pooled clone
 * being reused).
 *
 * On a share link `share` holds the owner's settings for the visitor, and every action that would
 * change a locked value (or select when selecting is off) does nothing, whichever control or key
 * asked. In the owner's studio `share` is null and nothing is restricted.
 */
const SETTINGS_KEY = 'moodyblues.view.v1';
function readSettings(): ViewSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_VIEW_SETTINGS;
    // Only the keys that still exist: a stored `wireframe` or `axes` from an older version is dropped.
    const stored = JSON.parse(raw) as Record<string, unknown>;
    const known = Object.fromEntries(Object.entries(stored).filter(([k]) => k in DEFAULT_VIEW_SETTINGS));
    return { ...DEFAULT_VIEW_SETTINGS, ...known };
  } catch {
    return DEFAULT_VIEW_SETTINGS;
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
  /** What the owner of a shared link allows its visitor; null in the owner's own studio. */
  share: ShareSettings | null;
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
  /** The intro's own move to a camera, which no lock applies to. */
  startOnCamera: (id: number | null, mode: CameraMode) => void;
  /** A share link was opened: its settings apply, and the owner's remembered view settings are left alone. */
  enterShare: (share: ShareSettings) => void;
  leaveShare: () => void;
  setIntroRunning: (running: boolean) => void;
  setIntroGate: (gate: 'open' | 'waiting') => void;
  replayIntro: () => void;
  setSetting: <K extends keyof ViewSettings>(key: K, value: ViewSettings[K]) => void;
  setMaterial: (id: string | null) => void;
  frameAll: () => void;
  frameSelected: () => void;
  setShortcutsOpen: (open: boolean) => void;
}

function framingBlocked(s: Pick<StudioState, 'share' | 'focusCameraId'>): boolean {
  return s.focusCameraId !== null && isLocked(s.share, 'cameraTarget');
}

/** Whether the owner locked a value; false in the owner's studio. */
export function useLocked(key: LockKey): boolean {
  return useStudio((s) => isLocked(s.share, key));
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
  share: null,
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
    if (selected && !canSelect(get().share)) return;
    const selectedId = idOf(selected, get().player);
    set({ selected, selectedId, follow: selected ? get().follow : false });
  },
  selectId: (selectedId) => {
    if (selectedId !== null && !canSelect(get().share)) return;
    const { player, root } = get();
    const selected = selectedId === null ? null : (player?.getObject(selectedId) ?? (root ? findById(root, selectedId) : null) ?? null);
    set({ selectedId, selected, follow: selectedId === null ? false : get().follow });
  },
  resolveSelected: (node) => {
    if (node !== get().selected) set({ selected: node });
  },
  setFollow: (follow) => {
    // Following the selection leaves the focused camera, which a locked target forbids.
    if (follow && isLocked(get().share, 'cameraTarget')) return;
    set(follow ? { follow, focusCameraId: null } : { follow });
  },
  setFocusCamera: (id) => {
    if (isLocked(get().share, 'cameraTarget')) return;
    set((s) => ({ focusCameraId: id, follow: id === null ? s.follow : false }));
  },
  setCameraMode: (id, mode) => {
    const { share, focusCameraId, cameraMode } = get();
    // A locked target keeps the camera that is focused (and the free camera has no mode to set); a locked mode keeps how it is viewed.
    const focus = isLocked(share, 'cameraTarget') ? focusCameraId : id;
    if (focus === null) return;
    const next = isLocked(share, 'cameraMode') ? cameraMode : mode;
    if (focus === focusCameraId && next === cameraMode) return;
    set({ focusCameraId: focus, cameraMode: next, follow: false });
  },
  startOnCamera: (focusCameraId, cameraMode) => set({ focusCameraId, cameraMode, follow: false }),
  enterShare: (share) => set({ share, settings: viewSettingsOf(share) }),
  leaveShare: () => set({ share: null, settings: readSettings() }),
  setIntroRunning: (introRunning) => set({ introRunning }),
  setIntroGate: (introGate) => set({ introGate }),
  replayIntro: () => {
    // The intro restarts the recording from its beginning.
    if (isLocked(get().share, 'seeking')) return;
    set((s) => ({ introRequest: s.introRequest + 1, introFromStart: true }));
  },
  setSetting: (key, value) => {
    // Every view setting is locked under its own name.
    if (isLocked(get().share, key)) return;
    const settings = { ...get().settings, [key]: value };
    // A visitor's tweaks stay in the page: the owner's remembered settings are theirs alone.
    if (!get().share) storeSettings(settings);
    set({ settings });
  },
  setMaterial: (materialId) => set({ materialId }),
  // Framing leaves a focused camera for the free one, which a locked target forbids.
  frameAll: () => {
    if (framingBlocked(get())) return;
    set((s) => ({ frameAllRequest: s.frameAllRequest + 1 }));
  },
  frameSelected: () => {
    if (framingBlocked(get())) return;
    set((s) => ({ frameSelectedRequest: s.frameSelectedRequest + 1 }));
  },
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
}));

function findById(root: THREE.Object3D, id: number): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((n) => {
    if (!found && n.userData?.objectId === id) found = n;
  });
  return found;
}
