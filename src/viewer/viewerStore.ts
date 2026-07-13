import { create } from 'zustand';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type PanelId = 'materials' | 'textures' | 'statistics';

export interface MeshInfo {
  uuid: string;
  name: string;
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
}

interface ViewerState {
  gltf: GLTF | null;
  isLoading: boolean;
  error: string | null;
  fileSizeBytes: number | null;

  selectedUuid: string | null;
  activePanel: PanelId;
  wireframe: boolean;
  showSkeleton: boolean;
  showGrid: boolean;
  cameraResetToken: number;

  simplifyHierarchy: boolean;
  highlightedMaterialUuid: string | null;

  materials: THREE.Material[];
  textures: THREE.Texture[];
  meshes: MeshInfo[];
  skinnedMeshCount: number;

  clips: THREE.AnimationClip[];
  currentClipIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  seekRequest: number | null;

  setGltf: (gltf: GLTF | null) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setFileSizeBytes: (bytes: number | null) => void;
  selectNode: (uuid: string | null) => void;
  setActivePanel: (panel: PanelId) => void;
  toggleWireframe: () => void;
  toggleSkeleton: () => void;
  toggleGrid: () => void;
  requestCameraReset: () => void;
  toggleSimplifyHierarchy: () => void;
  setHighlightedMaterial: (uuid: string | null) => void;

  setInspection: (data: { materials: THREE.Material[]; textures: THREE.Texture[]; meshes: MeshInfo[]; skinnedMeshCount: number }) => void;

  setClips: (clips: THREE.AnimationClip[]) => void;
  setClipIndex: (index: number) => void;
  play: () => void;
  pause: () => void;
  requestSeek: (time: number) => void;
  clearSeekRequest: () => void;
  setPlaybackTime: (time: number, duration: number) => void;

  reset: () => void;
}

const initialState = {
  gltf: null,
  isLoading: false,
  error: null,
  fileSizeBytes: null,

  selectedUuid: null,
  activePanel: 'materials' as PanelId,
  wireframe: false,
  showSkeleton: false,
  showGrid: true,
  cameraResetToken: 0,

  simplifyHierarchy: true,
  highlightedMaterialUuid: null,

  materials: [],
  textures: [],
  meshes: [],
  skinnedMeshCount: 0,

  clips: [],
  currentClipIndex: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  seekRequest: null,
};

export const useViewerStore = create<ViewerState>((set) => ({
  ...initialState,

  setGltf: (gltf) => set({ gltf }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setFileSizeBytes: (fileSizeBytes) => set({ fileSizeBytes }),
  selectNode: (uuid) => set({ selectedUuid: uuid }),
  setActivePanel: (activePanel) => set({ activePanel }),
  toggleWireframe: () => set((s) => ({ wireframe: !s.wireframe })),
  toggleSkeleton: () => set((s) => ({ showSkeleton: !s.showSkeleton })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  requestCameraReset: () => set((s) => ({ cameraResetToken: s.cameraResetToken + 1 })),
  toggleSimplifyHierarchy: () => set((s) => ({ simplifyHierarchy: !s.simplifyHierarchy })),
  setHighlightedMaterial: (highlightedMaterialUuid) => set({ highlightedMaterialUuid }),

  setInspection: ({ materials, textures, meshes, skinnedMeshCount }) => set({ materials, textures, meshes, skinnedMeshCount }),

  setClips: (clips) => set({ clips, currentClipIndex: 0, currentTime: 0, duration: clips[0]?.duration ?? 0, isPlaying: false }),
  setClipIndex: (currentClipIndex) => set({ currentClipIndex, currentTime: 0, isPlaying: false }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  requestSeek: (seekRequest) => set({ seekRequest }),
  clearSeekRequest: () => set({ seekRequest: null }),
  setPlaybackTime: (currentTime, duration) => set({ currentTime, duration }),

  reset: () => set(initialState),
}));
