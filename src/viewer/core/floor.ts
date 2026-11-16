import * as THREE from 'three';

/** The floor bucket must hold at least this share of the samples to count as the scene's floor. */
const MIN_FLOOR_SHARE = 0.15;
/** At this share the floor covers the whole sampled footprint and needs no shadow catcher. */
const FULL_FLOOR_SHARE = 0.9;
/** Samples per side of the grid of downward rays. */
const SAMPLES = 16;
/** A surface counts as floor when its normal points this far up. */
const FLOOR_NORMAL_Y = 0.3;

interface FloorEstimate {
  /** The dominant height of what the rays hit from above. */
  floorY: number;
  /** The share of all samples that hit at that height (clouds and roofs high above do not count against it). */
  share: number;
  /** Where the samples at floor height are, on XZ; the whole sampled area when there are none. */
  center: { x: number; z: number };
  footprint: { x: number; z: number };
}

/**
 * The dominant height among `heights` (NaN where a ray hit nothing): the fullest bucket of
 * `bucket` metres, averaged. The mode, not the minimum, so a pit or a stray vertex under the scene
 * does not pull the floor down. `share` is the fraction of samples within two buckets of it. With no
 * hits the floor is `fallbackY` and the share 0.
 */
export function estimateFloor(heights: ArrayLike<number>, bucket: number, fallbackY: number): { floorY: number; share: number } {
  const counts = new Map<number, { n: number; sum: number }>();
  for (let i = 0; i < heights.length; i++) {
    const y = heights[i];
    if (Number.isNaN(y)) continue;
    const key = Math.round(y / bucket);
    const entry = counts.get(key);
    if (entry) {
      entry.n++;
      entry.sum += y;
    } else {
      counts.set(key, { n: 1, sum: y });
    }
  }
  let best: { n: number; sum: number } | null = null;
  let bestKey = 0;
  for (const [key, entry] of counts) {
    // Ties go to the lower bucket: the ground, not the roof.
    if (!best || entry.n > best.n || (entry.n === best.n && key < bestKey)) {
      best = entry;
      bestKey = key;
    }
  }
  if (!best) return { floorY: fallbackY, share: 0 };
  const floorY = best.sum / best.n;
  let near = 0;
  for (let i = 0; i < heights.length; i++) if (Math.abs(heights[i] - floorY) <= bucket * 2) near++;
  return { floorY, share: near / heights.length };
}

/** Where the floor is drawn: the grid, and the plane that catches shadows where the scene has no ground of its own. */
export interface GroundPlan {
  floorY: number;
  /** Height of the grid and the catcher: just below the floor, so the scene's own ground hides them. */
  gridY: number;
  /** Draw the invisible shadow-catching plane. Off only when the floor covers the whole footprint. */
  catcher: boolean;
  /** Side of the shadow catcher, sized to the floor-level footprint. */
  extent: number;
  centerX: number;
  centerZ: number;
  /** Which way the grid's depth is nudged: away from the camera (1) under a ground, toward it (-1) over one. */
  depthBias: 1 | -1;
}

/**
 * Decides how the floor is drawn from the estimate. If the floor bucket holds a meaningful share of
 * the samples it is the floor (the scene's ground, even when clouds or roofs make the bounds far
 * wider); otherwise the lowest visible point is. The grid and the catcher sit just below it, so
 * where the scene has ground it hides them and elsewhere the catcher still takes shadows and the
 * grid shows. The catcher is dropped only when the floor covers nearly everything sampled.
 */
export function planGround(input: {
  floorY: number;
  /** Share of samples at the floor height. */
  share: number;
  /** The lowest point of the visible meshes. */
  minY: number;
  radius: number;
  center: { x: number; z: number };
  footprint: { x: number; z: number };
}): GroundPlan {
  const { share, radius, center, footprint } = input;
  const floorY = share >= MIN_FLOOR_SHARE ? input.floorY : input.minY;
  const offset = Math.max(radius * 0.002, 0.005);
  return {
    floorY,
    gridY: floorY - offset,
    catcher: share < FULL_FLOOR_SHARE,
    extent: Math.max(footprint.x, footprint.z, radius * 0.5) * 1.4,
    centerX: center.x,
    centerZ: center.z,
    depthBias: 1,
  };
}

function sampleXZ(bounds: THREE.Box3, i: number, j: number): THREE.Vector2 {
  return new THREE.Vector2(
    bounds.min.x + ((i + 0.5) / SAMPLES) * (bounds.max.x - bounds.min.x),
    bounds.min.z + ((j + 0.5) / SAMPLES) * (bounds.max.z - bounds.min.z),
  );
}

/** The meshes that are drawn: every parent visible, nothing skinned (those move). With their world boxes. */
function visibleMeshes(root: THREE.Object3D): { mesh: THREE.Mesh; box: THREE.Box3 }[] {
  const found: { mesh: THREE.Mesh; box: THREE.Box3 }[] = [];
  root.updateWorldMatrix(true, true);
  const visit = (node: THREE.Object3D, isRoot: boolean) => {
    if (!isRoot && !node.visible) return;
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh && mesh.geometry) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (mesh.geometry.boundingBox) found.push({ mesh, box: mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld) });
    }
    for (const child of node.children) visit(child, false);
  };
  visit(root, true);
  return found;
}

/**
 * Finds the floor of a scene by dropping a grid of rays through its visible meshes and taking the
 * lowest upward-facing surface under each, then the dominant height of those. `bounds` is the box of
 * the visible meshes. Uses bounds trees where the geometries have them.
 */
export function sampleFloor(root: THREE.Object3D, bounds: THREE.Box3, radius: number): FloorEstimate {
  const meshes = visibleMeshes(root);
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = true;
  const down = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const margin = Math.max(radius * 0.05, 0.1);
  raycaster.far = bounds.max.y - bounds.min.y + margin * 2;

  const heights = new Float32Array(SAMPLES * SAMPLES).fill(NaN);
  for (let i = 0; i < SAMPLES; i++) {
    for (let j = 0; j < SAMPLES; j++) {
      const { x, y: z } = sampleXZ(bounds, i, j);
      origin.set(x, bounds.max.y + margin, z);
      raycaster.set(origin, down);
      let lowest = Infinity;
      for (const { mesh, box } of meshes) {
        if (x < box.min.x || x > box.max.x || z < box.min.z || z > box.max.z) continue;
        for (const hit of raycaster.intersectObject(mesh, false)) {
          if (!hit.face) continue;
          normal.copy(hit.face.normal).transformDirection(mesh.matrixWorld);
          if (normal.y > FLOOR_NORMAL_Y && hit.point.y < lowest) lowest = hit.point.y;
        }
      }
      if (lowest !== Infinity) heights[i * SAMPLES + j] = lowest;
    }
  }

  const bucket = Math.max(radius * 0.004, 0.01);
  const { floorY, share } = estimateFloor(heights, bucket, bounds.min.y);
  // Where the floor-level samples are: the catcher is centred and sized on them, not on clouds far out.
  const at = new THREE.Box2();
  for (let i = 0; i < SAMPLES; i++) {
    for (let j = 0; j < SAMPLES; j++) {
      if (Math.abs(heights[i * SAMPLES + j] - floorY) <= bucket * 2) at.expandByPoint(sampleXZ(bounds, i, j));
    }
  }
  if (at.isEmpty()) at.set(new THREE.Vector2(bounds.min.x, bounds.min.z), new THREE.Vector2(bounds.max.x, bounds.max.z));
  const size = at.getSize(new THREE.Vector2());
  const middle = at.getCenter(new THREE.Vector2());
  // Samples are cell centres, so the span they cover is one cell short.
  const cellX = (bounds.max.x - bounds.min.x) / SAMPLES;
  const cellZ = (bounds.max.z - bounds.min.z) / SAMPLES;
  return { floorY, share, center: { x: middle.x, z: middle.y }, footprint: { x: size.x + cellX, z: size.y + cellZ } };
}
