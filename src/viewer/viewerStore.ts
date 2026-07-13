import { create } from 'zustand';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface MeshInfo {
  uuid: string;
  name: string;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
}

export type RightPanelTab = 'inspector' | 'materials' | 'stats';

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

  leftPanelOpen: boolean;
  rightPanelTab: RightPanelTab | null;
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

  setInspection: (data: { materials: THREE.Material[]; textures: THREE.Texture[]; meshes: MeshInfo[]; skinnedMeshCount: number; staticCount: number; trackedCount: number; hiddenCount: number }) => void;

  setClips: (clips: THREE.AnimationClip[]) => void;
  setClipIndex: (index: number) => void;
  play: () => void;
  pause: () => void;
  requestSeek: (time: number) => void;
  clearSeekRequest: () => void;
  setPlaybackTime: (time: number, duration: number) => void;

  toggleLeftPanel: () => void;
  setRightPanelTab: (tab: RightPanelTab | null) => void;
  toggleNodeHidden: (uuid: string) => void;
  collapseAllPanels: () => void;

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

  leftPanelOpen: true,
  rightPanelTab: null as RightPanelTab | null,
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

  setInspection: ({ materials, textures, meshes, skinnedMeshCount, staticCount, trackedCount, hiddenCount }) =>
    set({ materials, textures, meshes, skinnedMeshCount, staticCount, trackedCount, hiddenCount }),

  setClips: (clips) => set({ clips, currentClipIndex: 0, currentTime: 0, duration: clips[0]?.duration ?? 0, isPlaying: false }),
  setClipIndex: (currentClipIndex) => set({ currentClipIndex, currentTime: 0, isPlaying: false }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  requestSeek: (seekRequest) => set({ seekRequest }),
  clearSeekRequest: () => set({ seekRequest: null }),
  setPlaybackTime: (currentTime, duration) => set({ currentTime, duration }),

  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  setRightPanelTab: (tab) => set((s) => ({ rightPanelTab: s.rightPanelTab === tab ? null : tab })),
  toggleNodeHidden: (uuid) =>
    set((s) => {
      const next = { ...s.hiddenNodes };
      if (next[uuid]) delete next[uuid];
      else next[uuid] = true;
      return { hiddenNodes: next };
    }),
  collapseAllPanels: () => set({ leftPanelOpen: false, rightPanelTab: null }),

  reset: () => set(initialState),
}));
