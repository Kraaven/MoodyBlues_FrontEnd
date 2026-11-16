import type * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fetchSceneBytes } from '../prefetch/sceneFetch';
import { parseSceneGltf, type Progress } from '../viewer/core/gltf';

/**
 * Loads and parses one scene version's GLB (the optimized file once the backend has built
 * it) from `url`, which already selects the version. Bytes come from the persistent scene cache
 * or an in-flight prefetch when there is one (see prefetch/sceneFetch.ts). This is the only
 * place that joins the API to the viewer core.
 */
export async function loadSceneGltf(
  renderer: THREE.WebGLRenderer,
  url: string,
  onProgress?: Progress,
  signal?: AbortSignal,
): Promise<GLTF> {
  const buffer = await fetchSceneBytes(url, onProgress, signal);
  return parseSceneGltf(renderer, buffer);
}
