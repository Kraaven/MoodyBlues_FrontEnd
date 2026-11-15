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

/** Where the camera should sit to see all of `object`, without moving the camera. */
export function framePose(
  object: THREE.Object3D,
  fovDegrees: number,
  options: { padding?: number; direction?: THREE.Vector3; fill?: number } = {},
): { position: [number, number, number]; target: [number, number, number]; distance: number; radius: number } | null {
  const box = new THREE.Box3().setFromObject(object, true);
  if (box.isEmpty()) return null;
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 0.05);
  // `fill` is the shorter side of the area the 3D is shown in, as a share of the canvas height. The
  // camera's field of view is spread over the whole canvas, so a view that uses only part of it sees
  // only that part of the angle, and the sphere has to fit inside it.
  const half = Math.atan(Math.tan((fovDegrees * Math.PI) / 360) * Math.max(0.05, options.fill ?? 1));
  const distance = (radius / Math.sin(half)) * (options.padding ?? 1.15);
  const direction = (options.direction?.clone() ?? new THREE.Vector3(1, 0.7, 1.2)).normalize();
  const position = center.clone().addScaledVector(direction, distance);
  return { position: [position.x, position.y, position.z], target: [center.x, center.y, center.z], distance, radius };
}

/** Points the camera at an object so it fills the view, and moves the orbit target with it. */
export function frameObject(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3 | null,
  object: THREE.Object3D,
  options: { padding?: number; direction?: THREE.Vector3 } = {},
): boolean {
  let direction = options.direction;
  if (!direction) {
    // Keep looking from where the camera already is.
    const center = target ?? new THREE.Box3().setFromObject(object, true).getCenter(new THREE.Vector3());
    direction = camera.position.clone().sub(center);
    if (direction.lengthSq() < 1e-6) direction.set(1, 0.6, 1);
  }
  const pose = framePose(object, camera.fov, { padding: options.padding, direction });
  if (!pose) return false;

  camera.position.set(...pose.position);
  camera.near = Math.max(0.01, pose.distance / 1000);
  camera.far = Math.max(1000, pose.distance * 20);
  camera.lookAt(...pose.target);
  camera.updateProjectionMatrix();
  target?.set(...pose.target);
  return true;
}
