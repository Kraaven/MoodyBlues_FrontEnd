import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { apiUrl, getToken } from '../lib/api';

const DRACO_DECODER_PATH = '/decoders/draco/';
const BASIS_TRANSCODER_PATH = '/decoders/basis/';

export async function fetchSceneArrayBuffer(developerId: string, sceneId: string): Promise<ArrayBuffer> {
  const token = getToken();
  const res = await fetch(apiUrl(`/api/scenes/${encodeURIComponent(developerId)}/${encodeURIComponent(sceneId)}/file`), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!res.ok) {
    throw new Error(`Failed to download scene (${res.status})`);
  }

  return res.arrayBuffer();
}

/** Builds a GLTFLoader wired up with self-hosted Draco (geometry) and KTX2/Basis Universal (texture) decoders. */
export function createGltfLoader(renderer: THREE.WebGLRenderer): GLTFLoader {
  const loader = new GLTFLoader();

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
  loader.setDRACOLoader(dracoLoader);

  const ktx2Loader = new KTX2Loader();
  ktx2Loader.setTranscoderPath(BASIS_TRANSCODER_PATH);
  ktx2Loader.detectSupport(renderer);
  loader.setKTX2Loader(ktx2Loader);

  return loader;
}

export function parseGlb(loader: GLTFLoader, buffer: ArrayBuffer): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    loader.parse(buffer, '', resolve, reject);
  });
}
