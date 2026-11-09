import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const DRACO_DECODER_PATH = '/decoders/draco/';
const BASIS_TRANSCODER_PATH = '/decoders/basis/';

export type Progress = (received: number, total: number | null) => void;

/**
 * Parses one scene version's GLB (already downloaded). Inactive GameObjects (`extras.isHidden`)
 * start hidden. Downloading is the caller's job, so this module stays free of the API client.
 */
export async function parseSceneGltf(renderer: THREE.WebGLRenderer, buffer: ArrayBuffer): Promise<GLTF> {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH);
  const ktx2 = new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_PATH).detectSupport(renderer);
  loader.setDRACOLoader(draco);
  loader.setKTX2Loader(ktx2);

  try {
    const gltf = await new Promise<GLTF>((resolve, reject) => loader.parse(buffer, '', resolve, reject));
    gltf.scene.traverse((node) => {
      if (node.userData?.isHidden === true) node.visible = false;
    });
    return gltf;
  } finally {
    draco.dispose();
    ktx2.dispose();
  }
}

/** Frees the GPU resources of a loaded scene graph. */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

/** Points the camera at an object so it fills the view, and moves the orbit target with it. */
export function frameObject(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3 | null,
  object: THREE.Object3D,
  options: { padding?: number; direction?: THREE.Vector3 } = {},
): boolean {
  const box = new THREE.Box3().setFromObject(object, true);
  if (box.isEmpty()) return false;
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 0.05);
  const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * (options.padding ?? 1.15);

  const direction = options.direction?.clone() ?? camera.position.clone().sub(target ?? center);
  if (direction.lengthSq() < 1e-6) direction.set(1, 0.6, 1);
  direction.normalize();

  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(0.01, distance / 1000);
  camera.far = Math.max(1000, distance * 20);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  target?.copy(center);
  return true;
}
