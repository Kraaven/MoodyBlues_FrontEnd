import * as THREE from 'three';
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';

// Every mesh in the app raycasts through its bounds tree when it has one and falls back to three's
// own triangle loop when it does not (skinned and morphing meshes, the viewer's helpers).
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/**
 * drei carries its own, older copy of three-mesh-bvh whose type augmentation of `BufferGeometry`
 * wins over ours; the tree is stored through this view so it keeps the version pinned here.
 */
type WithTree = { boundsTree?: MeshBVH };

/**
 * Builds a bounds tree for every static mesh geometry under `root`, once. Geometries are shared (a
 * replay's copy of a scene uses the same ones), so a geometry that already has a tree is skipped.
 * Skinned and morphing meshes deform on the CPU side of a raycast, which a tree built for the
 * rest pose cannot follow.
 */
export function buildBoundsTrees(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    const geometry = mesh.geometry;
    if (!geometry || geometry.boundsTree || !geometry.attributes.position) return;
    if (geometry.morphAttributes && Object.keys(geometry.morphAttributes).length > 0) return;
    (geometry as WithTree).boundsTree = new MeshBVH(geometry);
  });
}

/** Drops a geometry's bounds tree; called with the geometry's own disposal. */
export function disposeBoundsTree(geometry: THREE.BufferGeometry): void {
  (geometry as WithTree).boundsTree = undefined;
}
