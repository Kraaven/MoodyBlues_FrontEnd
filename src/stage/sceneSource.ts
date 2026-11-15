import type * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { downloadWithProgress, sceneFilePath } from '../api/queries';
import { parseSceneGltf, type Progress } from '../viewer/core/gltf';

/**
 * Downloads and parses one scene version's GLB (the optimized file once the backend has built
 * it). `hash` selects the version; a session passes the hash it was recorded in. This is the only
 * place that joins the API to the viewer core.
 */
export async function loadSceneGltf(
  renderer: THREE.WebGLRenderer,
  developerId: string,
  sceneId: string,
  hash: string | undefined,
  onProgress?: Progress,
  signal?: AbortSignal,
): Promise<GLTF> {
  const buffer = await downloadWithProgress(sceneFilePath(developerId, sceneId, hash), onProgress, signal);
  return parseSceneGltf(renderer, buffer);
}
