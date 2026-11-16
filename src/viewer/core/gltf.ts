import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { disposeBoundsTree } from './bvh';

const DRACO_DECODER_PATH = '/decoders/draco/';
const BASIS_TRANSCODER_PATH = '/decoders/basis/';

export type Progress = (received: number, total: number | null) => void;

/**
 * One loader per renderer, kept for the life of the app: the decoder workers and the transcoder
 * start once and are reused by every scene, instead of being built and torn down per parse.
 * Draco stays for scenes stored before the backend moved to meshopt; it goes when they are re-processed.
 */
const loaders = new WeakMap<THREE.WebGLRenderer, GLTFLoader>();

function loaderFor(renderer: THREE.WebGLRenderer): GLTFLoader {
  let loader = loaders.get(renderer);
  if (!loader) {
    loader = new GLTFLoader();
    loader.setDRACOLoader(new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH));
    loader.setKTX2Loader(new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_PATH).detectSupport(renderer));
    loader.setMeshoptDecoder(MeshoptDecoder);
    loaders.set(renderer, loader);
  }
  return loader;
}

/**
 * Parses one scene version's GLB (already downloaded). Inactive GameObjects (`extras.isHidden`)
 * start hidden. Downloading is the caller's job, so this module stays free of the API client.
 */
export async function parseSceneGltf(renderer: THREE.WebGLRenderer, buffer: ArrayBuffer): Promise<GLTF> {
  const loader = loaderFor(renderer);
  const gltf = await new Promise<GLTF>((resolve, reject) => loader.parse(buffer, '', resolve, reject));
  gltf.scene.traverse((node) => {
    if (node.userData?.isHidden === true) node.visible = false;
  });
  return gltf;
}

/** Frees the GPU resources of a loaded scene graph. */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry) {
      disposeBoundsTree(mesh.geometry);
      mesh.geometry.dispose();
    }
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

const meshBox = new THREE.Box3();

/**
 * The bounds of what can be seen under `object`: meshes whose whole chain of parents is visible.
 * `Box3.setFromObject` counts hidden nodes too, and a scene's inactive GameObjects (templates, cut
 * content) can sit far from what is drawn. `object` itself is always included.
 */
export function visibleBox(object: THREE.Object3D, box = new THREE.Box3()): THREE.Box3 {
  box.makeEmpty();
  object.updateWorldMatrix(true, true);
  const visit = (node: THREE.Object3D, isRoot: boolean) => {
    if (!isRoot && !node.visible) return;
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
        const instanced = mesh as THREE.InstancedMesh;
        if (!instanced.boundingBox) instanced.computeBoundingBox();
        if (instanced.boundingBox) box.union(meshBox.copy(instanced.boundingBox).applyMatrix4(node.matrixWorld));
      } else {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        if (mesh.geometry.boundingBox) box.union(meshBox.copy(mesh.geometry.boundingBox).applyMatrix4(node.matrixWorld));
      }
    }
    for (const child of node.children) visit(child, false);
  };
  visit(object, true);
  return box;
}

/** From where a whole scene is first shown: the viewer's side of it, a little above. */
export const FRAME_DIRECTION = new THREE.Vector3(1, 0.78, 1.15);

/** Where the camera should sit to see all of `object`, without moving the camera. */
export function framePose(
  object: THREE.Object3D,
  fovDegrees: number,
  options: { padding?: number; direction?: THREE.Vector3; fill?: number } = {},
): { position: [number, number, number]; target: [number, number, number]; distance: number; radius: number } | null {
  const box = visibleBox(object);
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
