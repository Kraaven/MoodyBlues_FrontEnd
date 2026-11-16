import * as THREE from 'three';

/** A camera the Unity scene exported: a node with `extras.camera` (GLTFLoader puts extras in `userData`). */
export interface CameraInfo {
  /** The node's ObjectID, the key the replay and the studio store use. */
  id: number;
  /** 0 is the camera tagged MainCamera, then by depth. */
  index: number;
  tag: string;
  name: string;
  node: THREE.Object3D;
}

export const MAIN_CAMERA_TAG = 'MainCamera';

/** Every exported camera under `root`, in the order Unity numbered them. Empty for an export that predates the camera extras. */
export function listCameras(root: THREE.Object3D): CameraInfo[] {
  const found: CameraInfo[] = [];
  root.traverse((node) => {
    const extra = node.userData?.camera as { index?: unknown; tag?: unknown } | undefined;
    const id = node.userData?.objectId;
    if (!extra || typeof extra.index !== 'number' || typeof id !== 'number') return;
    found.push({ id, index: extra.index, tag: typeof extra.tag === 'string' ? extra.tag : '', name: node.name || `Camera ${extra.index}`, node });
  });
  return found.sort((a, b) => a.index - b.index);
}

const FORWARD = new THREE.Vector3(0, 0, -1);
const worldQuaternion = new THREE.Quaternion();

/**
 * The direction a camera node looks in, in world space. glTF cameras look down their local -Z. The
 * exporter turns every Camera node 180 degrees about Y (UnityGLTF's InvertDirection, `invertLook`) so
 * that -Z is Unity's forward, and puts a counter-turned `<name>-flipped` child under it; the replay's
 * rotations include that turn. So the node's own -Z is the look direction, and the child is not used.
 * Call after the node's matrices are current (`updateWorldMatrix(true, false)`).
 */
export function cameraForward(node: THREE.Object3D, out = new THREE.Vector3()): THREE.Vector3 {
  node.getWorldQuaternion(worldQuaternion);
  return out.copy(FORWARD).applyQuaternion(worldQuaternion);
}

/**
 * The depth of a camera's gizmo, in metres. With a camera focused it is sized by how far the view
 * stands from the player (a close follow must not be crossed by a big frustum): 12% of that distance,
 * between 0.2 and 0.7 m. With the free camera it is 1% of the scene's radius, 0.25 to 1.5 m, so it
 * stays readable in an overview.
 */
export function gizmoDepth(sceneRadius: number, followDistance: number | null): number {
  if (followDistance !== null) return Math.min(0.7, Math.max(0.2, followDistance * 0.12));
  return Math.min(1.5, Math.max(0.25, sceneRadius * 0.01));
}

/**
 * Line segments (pairs of points, local space, looking down -Z) of a camera frustum `depth` long: the
 * four edges from the apex to the far rectangle, the rectangle, and a small triangle over its top edge
 * so the camera's up is readable.
 */
export function frustumSegments(depth: number, fovDegrees: number, aspect: number): Float32Array {
  const h = Math.tan((fovDegrees * Math.PI) / 360) * depth;
  const w = h * aspect;
  const z = -depth;
  const corners: [number, number][] = [
    [-w, h],
    [w, h],
    [w, -h],
    [-w, -h],
  ];
  const points: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = corners[i];
    const [nx, ny] = corners[(i + 1) % 4];
    points.push(0, 0, 0, x, y, z); // apex to corner
    points.push(x, y, z, nx, ny, z); // far edge
  }
  const peak = h * 1.35;
  points.push(-w * 0.35, h, z, 0, peak, z, 0, peak, z, w * 0.35, h, z);
  return new Float32Array(points);
}
