import { create } from 'zustand';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type PanelId = 'hierarchy' | 'materials' | 'textures' | 'geometry' | 'animations' | 'settings';

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

  selectedUuid: string | null;
  activePanel: PanelId;
  wireframe: boolean;
  showSkeleton: boolean;
  showGrid: boolean;

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
  selectNode: (uuid: string | null) => void;
  setActivePanel: (panel: PanelId) => void;
  toggleWireframe: () => void;
  toggleSkeleton: () => void;
  toggleGrid: () => void;

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

  selectedUuid: null,
  activePanel: 'hierarchy' as PanelId,
  wireframe: false,
  showSkeleton: false,
  showGrid: true,

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
  selectNode: (uuid) => set({ selectedUuid: uuid }),
  setActivePanel: (activePanel) => set({ activePanel }),
  toggleWireframe: () => set((s) => ({ wireframe: !s.wireframe })),
  toggleSkeleton: () => set((s) => ({ showSkeleton: !s.showSkeleton })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),

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
