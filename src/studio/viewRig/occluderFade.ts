import * as THREE from 'three';
import { adoptSurface, originalOfMaterial } from '../../viewer/core/mbSurface';

/** How see-through a blocking mesh gets (its opacity share) and how long it takes to get there and back, in seconds. */
export const FADE_OPACITY = 0.2;
export const FADE_IN = 0.25;
export const FADE_OUT = 0.4;
/** At most this many meshes fade at once: a view in a thicket should not clone every leaf. */
export const MAX_FADED = 6;

type Materials = THREE.Material | THREE.Material[];

/** The file's materials of meshes that currently wear a fading copy, for the inspector and the debug toggles. */
const originals = new WeakMap<THREE.Mesh, Materials>();

/**
 * A mesh's own materials as the GLB described them: never the temporary copies used while it fades
 * or is highlighted, nor the game look's lightmap variants (`originalOfMaterial`).
 */
export function originalMaterials(mesh: THREE.Mesh): THREE.Material[] {
  const materials = originals.get(mesh) ?? mesh.material;
  return (Array.isArray(materials) ? materials : [materials]).map((m) => (m ? originalOfMaterial(m) : m));
}

interface Faded {
  mesh: THREE.Mesh;
  original: Materials;
  copies: THREE.Material[];
  /** Each original's opacity, which the fade multiplies. */
  opacity: number[];
  /** 1 untouched, FADE_OPACITY fully faded. */
  alpha: number;
  blocking: boolean;
}

/**
 * Lets the view see through the meshes that block it. Materials are shared (between meshes, and
 * between the cached master scene and the replay's copy), so a faded mesh never has its material
 * changed: it gets its own transparent copies, swapped in for the fade and swapped back, and
 * disposed, once it is solid again. The copies follow the original's wireframe flag, which the
 * debug toggles set on the originals.
 */
export class OccluderFade {
  private readonly faded = new Map<THREE.Mesh, Faded>();

  /** The meshes blocking the view right now (the first {@link MAX_FADED}); others fade back in. */
  set(blockers: readonly THREE.Mesh[]): void {
    for (const f of this.faded.values()) f.blocking = false;
    for (let i = 0; i < blockers.length && i < MAX_FADED; i++) {
      const mesh = blockers[i];
      const f = this.faded.get(mesh) ?? this.start(mesh);
      if (f) f.blocking = true;
    }
  }

  /** Moves every fade on by `dt`. True while any is still changing, so the next frame is needed. */
  step(dt: number): boolean {
    let animating = false;
    for (const f of [...this.faded.values()]) {
      const goal = f.blocking ? FADE_OPACITY : 1;
      const rate = (1 - FADE_OPACITY) / (f.blocking ? FADE_IN : FADE_OUT);
      const step = rate * dt;
      f.alpha = f.alpha < goal ? Math.min(goal, f.alpha + step) : Math.max(goal, f.alpha - step);
      if (f.alpha >= 1 && !f.blocking) {
        this.restore(f);
        animating = true;
        continue;
      }
      this.apply(f);
      if (f.alpha !== goal) animating = true;
    }
    return animating;
  }

  /** Everything solid again, at once. */
  clear(): void {
    for (const f of [...this.faded.values()]) this.restore(f);
  }

  private start(mesh: THREE.Mesh): Faded | null {
    if (!mesh.material) return null;
    const original = mesh.material;
    const list = Array.isArray(original) ? original : [original];
    const copies = list.map((m) => {
      const copy = m.clone();
      adoptSurface(m, copy);
      copy.transparent = true;
      copy.depthWrite = false;
      copy.needsUpdate = true;
      return copy;
    });
    const f: Faded = { mesh, original, copies, opacity: list.map((m) => m.opacity), alpha: 1, blocking: true };
    mesh.material = Array.isArray(original) ? copies : copies[0];
    originals.set(mesh, original);
    this.faded.set(mesh, f);
    return f;
  }

  private apply(f: Faded): void {
    const list = Array.isArray(f.original) ? f.original : [f.original];
    f.copies.forEach((copy, i) => {
      copy.opacity = f.opacity[i] * f.alpha;
      const wire = (list[i] as THREE.Material & { wireframe?: boolean }).wireframe;
      if (wire !== undefined) (copy as THREE.Material & { wireframe: boolean }).wireframe = wire;
    });
  }

  private restore(f: Faded): void {
    f.mesh.material = f.original;
    originals.delete(f.mesh);
    for (const copy of f.copies) copy.dispose();
    this.faded.delete(f.mesh);
  }
}
