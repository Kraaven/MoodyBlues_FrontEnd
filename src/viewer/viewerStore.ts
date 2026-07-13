import { create } from 'zustand';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface MeshInfo {
  uuid: string;
  name: string;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
}

export type PanelType = 'hierarchy' | 'inspector' | 'materials' | 'stats' | 'settings';

interface ViewerState {
  gltf: GLTF | null;
  isLoading: boolean;
  error: string | null;
  fileSizeBytes: number | null;

  selectedUuid: string | null;
  wireframe: boolean;
  showSkeleton: boolean;
  showGrid: boolean;
  cameraResetToken: number;

  highlightedMaterialUuid: string | null;

  materials: THREE.Material[];
  textures: THREE.Texture[];
  meshes: MeshInfo[];
  skinnedMeshCount: number;
  staticCount: number;
  trackedCount: number;
  hiddenCount: number;

  clips: THREE.AnimationClip[];
  currentClipIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  seekRequest: number | null;

  openPanels: Record<PanelType, boolean>;
  hiddenNodes: Record<string, true>;

  setGltf: (gltf: GLTF | null) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setFileSizeBytes: (bytes: number | null) => void;
  selectNode: (uuid: string | null) => void;
  toggleWireframe: () => void;
  toggleSkeleton: () => void;
  toggleGrid: () => void;
  requestCameraReset: () => void;
  setHighlightedMaterial: (uuid: string | null) => void;

  setInspection: (data: { materials: THREE.Material[]; textures: THREE.Texture[]; meshes: MeshInfo[]; skinnedMeshCount: number; staticCount: number; trackedCount: number; hiddenCount: number; preHiddenUuids: string[] }) => void;

  setClips: (clips: THREE.AnimationClip[]) => void;
  setClipIndex: (index: number) => void;
  play: () => void;
  pause: () => void;
  requestSeek: (time: number) => void;
  clearSeekRequest: () => void;
  setPlaybackTime: (time: number, duration: number) => void;

  togglePanel: (panel: PanelType) => void;
  toggleNodeHidden: (uuid: string) => void;

  reset: () => void;
}

const initialState = {
  gltf: null,
  isLoading: false,
  error: null,
  fileSizeBytes: null,

  selectedUuid: null,
  wireframe: false,
  showSkeleton: false,
  showGrid: true,
  cameraResetToken: 0,

  highlightedMaterialUuid: null,

  materials: [],
  textures: [],
  meshes: [],
  skinnedMeshCount: 0,
  staticCount: 0,
  trackedCount: 0,
  hiddenCount: 0,

  clips: [],
  currentClipIndex: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  seekRequest: null,

  openPanels: { hierarchy: false, inspector: false, materials: false, stats: false, settings: false } as Record<PanelType, boolean>,
  hiddenNodes: {} as Record<string, true>,
};

export const useViewerStore = create<ViewerState>((set) => ({
  ...initialState,

  setGltf: (gltf) => set({ gltf }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setFileSizeBytes: (fileSizeBytes) => set({ fileSizeBytes }),
  selectNode: (uuid) => set({ selectedUuid: uuid }),
  toggleWireframe: () => set((s) => ({ wireframe: !s.wireframe })),
  toggleSkeleton: () => set((s) => ({ showSkeleton: !s.showSkeleton })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  requestCameraReset: () => set((s) => ({ cameraResetToken: s.cameraResetToken + 1 })),
  setHighlightedMaterial: (highlightedMaterialUuid) => set({ highlightedMaterialUuid }),

  setInspection: ({ materials, textures, meshes, skinnedMeshCount, staticCount, trackedCount, hiddenCount, preHiddenUuids }) => {
    const hiddenNodes: Record<string, true> = {};
    for (const uuid of preHiddenUuids) hiddenNodes[uuid] = true;
    set({ materials, textures, meshes, skinnedMeshCount, staticCount, trackedCount, hiddenCount, hiddenNodes });
  },

  setClips: (clips) => set({ clips, currentClipIndex: 0, currentTime: 0, duration: clips[0]?.duration ?? 0, isPlaying: false }),
  setClipIndex: (currentClipIndex) => set({ currentClipIndex, currentTime: 0, isPlaying: false }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  requestSeek: (seekRequest) => set({ seekRequest }),
  clearSeekRequest: () => set({ seekRequest: null }),
  setPlaybackTime: (currentTime, duration) => set({ currentTime, duration }),

  togglePanel: (panel) => set((s) => ({ openPanels: { ...s.openPanels, [panel]: !s.openPanels[panel] } })),
  toggleNodeHidden: (uuid) =>
    set((s) => {
      const next = { ...s.hiddenNodes };
      if (next[uuid]) delete next[uuid];
      else next[uuid] = true;
      return { hiddenNodes: next };
    }),

  reset: () => set(initialState),
}));
