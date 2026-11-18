import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { adoptSurface } from './mbSurface';
import { PALETTE } from './palette';

/** How strongly the selection glows (emissive intensity). Enough to read on a dark and a light surface. */
const TINT_INTENSITY = 0.55;

interface Tinted {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
  copy: THREE.Material | THREE.Material[];
}

type Emissive = THREE.Material & { emissive: THREE.Color; emissiveIntensity: number };
const hasEmissive = (m: THREE.Material): m is Emissive => 'emissive' in m && (m as Emissive).emissive instanceof THREE.Color;

/**
 * The simple tier's selection highlight: an amber emissive tint on the selected meshes, instead of
 * the outline pass (which needs a post-processing composer, a second render of the scene each
 * frame). Materials are shared between meshes, so each selected mesh wears its own tinted copy for as
 * long as it is selected, and gets its own material back (and the copy is disposed) on deselect. The
 * copies adopt the original's shader patch, so nothing else about them changes, and they report the
 * original to the inspector.
 */
export function SelectionTint({ object }: { object: THREE.Object3D | null }) {
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (!object) return;
    const tinted: Tinted[] = [];
    const tint = (material: THREE.Material): THREE.Material => {
      if (!hasEmissive(material)) return material;
      const copy = material.clone() as Emissive;
      adoptSurface(material, copy);
      copy.emissive.set(PALETTE.accent);
      copy.emissiveIntensity = TINT_INTENSITY;
      return copy;
    };
    object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const original = mesh.material;
      const copy = Array.isArray(original) ? original.map(tint) : tint(original);
      mesh.material = copy;
      tinted.push({ mesh, original, copy });
    });
    invalidate();
    return () => {
      for (const t of tinted) {
        // A fade may have replaced the copy meanwhile; it holds the copy as its original and restores it.
        if (t.mesh.material === t.copy) t.mesh.material = t.original;
        for (const m of Array.isArray(t.copy) ? t.copy : [t.copy]) if (!(Array.isArray(t.original) ? t.original : [t.original]).includes(m)) m.dispose();
      }
      invalidate();
    };
  }, [object, invalidate]);

  return null;
}
