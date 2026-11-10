import { create } from 'zustand';
import type * as THREE from 'three';

/**
 * What the scene inspector shares between the Stage (which holds the loaded scene and takes the
 * clicks) and the panels (which list it). The scene graph here is the shared master from the scene
 * cache: the inspector reads it and never changes it.
 */
interface InspectorState {
  root: THREE.Object3D | null;
  /** The Stage's renderer, so a texture that a canvas cannot draw can be rendered to a thumbnail. */
  renderer: THREE.WebGLRenderer | null;
  selected: THREE.Object3D | null;
  showGrid: boolean;
  frameAllRequest: number;
  frameSelectedRequest: number;
  shortcutsOpen: boolean;
  attach: (root: THREE.Object3D | null, renderer: THREE.WebGLRenderer | null) => void;
  select: (node: THREE.Object3D | null) => void;
  toggleGrid: () => void;
  frameAll: () => void;
  frameSelected: () => void;
}

export const useInspector = create<InspectorState>((set) => ({
  root: null,
  renderer: null,
  selected: null,
  showGrid: true,
  frameAllRequest: 0,
  frameSelectedRequest: 0,
  shortcutsOpen: false,
  attach: (root, renderer) => set({ root, renderer, selected: null }),
  select: (selected) => set({ selected }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  frameAll: () => set((s) => ({ frameAllRequest: s.frameAllRequest + 1 })),
  frameSelected: () => set((s) => ({ frameSelectedRequest: s.frameSelectedRequest + 1 })),
}));
