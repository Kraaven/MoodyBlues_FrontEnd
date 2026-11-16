import * as THREE from 'three';

/** How much of a material's see-through share becomes lost opacity; glass is never fully clear. */
const OPACITY_PER_TRANSMISSION = 0.65;
const MIN_OPACITY = 0.2;

const originals = new WeakMap<THREE.Material, { transmission: number; opacity: number; transparent: boolean }>();

/**
 * KHR_materials_transmission makes three.js render the whole scene a second time into a buffer the
 * glass refracts, for every frame the glass is on screen. For a viewer that is far too much for a
 * window or a pond, so the displayed materials become plain blended transparency instead: the
 * transmission goes to zero and the opacity falls with it. The original values are kept for the
 * inspector ({@link originalTransmission}). Materials are shared with replay copies, so doing this
 * once on the loaded master covers both.
 */
export function flattenTransmission(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const physical = material as THREE.MeshPhysicalMaterial | undefined;
      if (!physical?.isMeshPhysicalMaterial || physical.transmission <= 0 || originals.has(physical)) continue;
      originals.set(physical, { transmission: physical.transmission, opacity: physical.opacity, transparent: physical.transparent });
      physical.opacity = Math.max(MIN_OPACITY, 1 - physical.transmission * OPACITY_PER_TRANSMISSION) * physical.opacity;
      physical.transmission = 0;
      physical.transparent = true;
      physical.depthWrite = false;
      physical.needsUpdate = true;
    }
  });
}

/** What the file said before {@link flattenTransmission}, for the Materials window; null if untouched. */
export function originalTransmission(material: THREE.Material): { transmission: number; opacity: number; transparent: boolean } | null {
  return originals.get(material) ?? null;
}
