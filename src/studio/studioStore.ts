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
}

const SETTINGS_KEY = 'moodyblues.view.v1';
const DEFAULT_SETTINGS: ViewSettings = { grid: true, shadows: true, wireframe: false, axes: false, fov: 45 };

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
  settings: readSettings(),
  materialId: null,
  frameAllRequest: 0,
  frameSelectedRequest: 0,
  shortcutsOpen: false,
  attach: (scene) => {
    const previousId = get().selectedId;
    if (!scene) {
      set({ root: null, master: null, renderer: null, player: null, selected: null, follow: false });
      return;
    }
    // Keep the selection across scene and session when the same object exists in both.
    const node = previousId !== null ? (scene.player?.getObject(previousId) ?? findById(scene.root, previousId)) : null;
    set({ ...scene, selected: node ?? null, selectedId: node ? previousId : null, follow: node ? get().follow : false });
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
  setFollow: (follow) => set({ follow }),
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

export function findById(root: THREE.Object3D, id: number): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((n) => {
    if (!found && n.userData?.objectId === id) found = n;
  });
  return found;
}
