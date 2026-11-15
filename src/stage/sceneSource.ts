import type * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { downloadWithProgress } from '../api/queries';
import { parseSceneGltf, type Progress } from '../viewer/core/gltf';

/**
 * Downloads and parses one scene version's GLB (the optimized file once the backend has built
 * it) from `url`, which already selects the version. This is the only
 * place that joins the API to the viewer core.
 */
export async function loadSceneGltf(
  renderer: THREE.WebGLRenderer,
  url: string,
  onProgress?: Progress,
  signal?: AbortSignal,
): Promise<GLTF> {
  const buffer = await downloadWithProgress(url, onProgress, signal);
  return parseSceneGltf(renderer, buffer);
}
