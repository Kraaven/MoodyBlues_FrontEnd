import type * as THREE from 'three';

/** A layer no camera renders. */
const HIDDEN_LAYER = 31;

/**
 * First person sits at the camera node, and the camera's own model hangs right there (the exporter
 * keeps Unity's camera prop under it): from inside, its lens and body fill the lens as a big
 * grey slab at a few centimetres to a metre, flickering with the head bob. So while the view is
 * through a camera, the meshes of that camera's own subtree are left out of the picture (moved to a
 * layer no camera draws, so nothing the replay animates, like visibility, is touched). The player's
 * body is not: seen from inside its single-sided skin does not draw, and it stays a presence at the
 * edge of the frame. Returns the function that puts them back.
 */
export function hideOwnMeshes(camera: THREE.Object3D): () => void {
  const saved: { mesh: THREE.Object3D; mask: number }[] = [];
  camera.traverse((node) => {
    if (!(node as THREE.Mesh).isMesh) return;
    saved.push({ mesh: node, mask: node.layers.mask });
    node.layers.set(HIDDEN_LAYER);
  });
  return () => {
    for (const { mesh, mask } of saved) mesh.layers.mask = mask;
  };
}
