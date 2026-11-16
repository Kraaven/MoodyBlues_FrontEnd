import * as THREE from 'three';
import { FALLBACK_PLAYER, playerSizeFromBox, type PlayerSize } from './poses';
import type { ReplayObject, ReplayTrack } from '../../viewer/replay/replayFile';

/** A track with more than one key that does not stay on its first value. */
function varies(track: ReplayTrack | undefined): boolean {
  if (!track || track.times.length < 2) return false;
  const { dimension, values } = track;
  for (let i = dimension; i < values.length; i++) if (Math.abs(values[i] - values[i % dimension]) > 1e-6) return true;
  return false;
}

/** Whether the recording moves or turns this object at any point. */
export function objectMoves(obj: ReplayObject | undefined): boolean {
  return Boolean(obj) && (varies(obj?.position) || varies(obj?.rotation));
}

/**
 * The node a camera's view follows: "the player", the top-most tracked ancestor (a node with an
 * ObjectID) that the recording actually moves, never the scene root. A camera on a free-standing
 * rig, or one that nothing above it moves, is followed itself.
 */
export function resolveFollowTarget(camera: THREE.Object3D, root: THREE.Object3D, moves: (objectId: number) => boolean): THREE.Object3D {
  let found: THREE.Object3D = camera;
  for (let n = camera.parent; n && n !== root; n = n.parent) {
    const id = n.userData?.objectId;
    if (typeof id === 'number' && moves(id)) found = n;
  }
  return found;
}

const box = new THREE.Box3();
const part = new THREE.Box3();

/** The size of a follow target: the bounds of its visible meshes (descendants included), measured where it stands now. */
export function measurePlayer(node: THREE.Object3D): PlayerSize {
  node.updateWorldMatrix(true, true);
  box.makeEmpty();
  const visit = (n: THREE.Object3D) => {
    if (!n.visible) return;
    const mesh = n as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (mesh.geometry.boundingBox) box.union(part.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld));
    }
    for (const child of n.children) visit(child);
  };
  visit(node);
  return box.isEmpty() ? FALLBACK_PLAYER : playerSizeFromBox(box, node.getWorldPosition(new THREE.Vector3()).y);
}
