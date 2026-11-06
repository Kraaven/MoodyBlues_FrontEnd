import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { apiUrl, getToken } from '../lib/api';

const DRACO_DECODER_PATH = '/decoders/draco/';
const BASIS_TRANSCODER_PATH = '/decoders/basis/';

/**
 * Downloads a scene revision's GLB: the optimized file once the backend has produced it,
 * otherwise the raw upload. `hash` selects a revision (a session passes the hash it was recorded
 * against); without it the latest revision is returned.
 */
export async function fetchSceneArrayBuffer(developerId: string, sceneId: string, hash?: string): Promise<ArrayBuffer> {
  const token = getToken();
  const query = hash ? `?hash=${encodeURIComponent(hash)}` : '';
  const res = await fetch(apiUrl(`/api/scenes/${encodeURIComponent(developerId)}/${encodeURIComponent(sceneId)}/file${query}`), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!res.ok) {
    throw new Error(`Failed to download scene (${res.status})`);
  }

  return res.arrayBuffer();
}

export interface GltfLoaderBundle {
  loader: GLTFLoader;
  dracoLoader: DRACOLoader;
  ktx2Loader: KTX2Loader;
}

/** Builds a GLTFLoader wired up with self-hosted Draco (geometry) and KTX2/Basis Universal (texture) decoders. */
export function createGltfLoader(renderer: THREE.WebGLRenderer): GltfLoaderBundle {
  const loader = new GLTFLoader();

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
  loader.setDRACOLoader(dracoLoader);

  const ktx2Loader = new KTX2Loader();
  ktx2Loader.setTranscoderPath(BASIS_TRANSCODER_PATH);
  ktx2Loader.detectSupport(renderer);
  loader.setKTX2Loader(ktx2Loader);

  return { loader, dracoLoader, ktx2Loader };
}

/** Disposes GPU resources held by a loaded GLTF scene graph. */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!material) continue;
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        material.dispose();
      }
    }
  });
}

/** Disposes Draco/KTX2 worker pools created by createGltfLoader. */
export function disposeGltfLoaderBundle(bundle: GltfLoaderBundle): void {
  bundle.dracoLoader.dispose();
  bundle.ktx2Loader.dispose();
}

export function parseGlb(loader: GLTFLoader, buffer: ArrayBuffer): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    loader.parse(buffer, '', resolve, reject);
  });
}
