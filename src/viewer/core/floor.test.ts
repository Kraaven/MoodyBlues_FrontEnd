import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { estimateFloor, planGround, sampleFloor } from './floor';
import { visibleBox } from './gltf';

function plane(size: number, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

describe('estimateFloor', () => {
  it('takes the dominant height, not the lowest, and counts only samples near it', () => {
    const heights = [0, 0.001, 0, 0, 0.002, -1.8, 13, NaN];
    const { floorY, share } = estimateFloor(heights, 0.05, -5);
    expect(floorY).toBeCloseTo(0, 2);
    expect(share).toBeCloseTo(5 / 8);
  });

  it('falls back when nothing was hit', () => {
    expect(estimateFloor([NaN, NaN], 0.05, 3)).toEqual({ floorY: 3, share: 0 });
  });

  it('prefers the lower bucket on a tie', () => {
    expect(estimateFloor([5, 5, 0, 0], 0.1, 0).floorY).toBeCloseTo(0);
  });
});

describe('planGround', () => {
  const base = { floorY: 0, minY: -1.8, radius: 50, center: { x: 1, z: 2 }, footprint: { x: 80, z: 60 } };

  it('keeps a catcher when the floor is only part of the footprint, both just below the floor', () => {
    const plan = planGround({ ...base, share: 0.35 });
    expect(plan.floorY).toBe(0);
    expect(plan.catcher).toBe(true);
    expect(plan.gridY).toBeLessThan(0);
    expect(plan.gridY).toBeGreaterThan(-0.5);
    expect(plan.depthBias).toBe(1);
    expect(plan.extent).toBeCloseTo(80 * 1.4);
  });

  it('drops the catcher when the floor covers nearly everything', () => {
    expect(planGround({ ...base, share: 0.95 }).catcher).toBe(false);
  });

  it('uses the lowest point when no bucket holds a meaningful share', () => {
    const plan = planGround({ ...base, share: 0.05 });
    expect(plan.floorY).toBe(-1.8);
    expect(plan.gridY).toBeLessThan(-1.8);
  });
});

describe('sampleFloor', () => {
  it('finds a ground plane under a hidden node that would pull a bounding box down', () => {
    const root = new THREE.Group();
    const stray = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    stray.position.set(0, -50, 0);
    stray.visible = false;
    root.add(plane(40, 2), stray);
    const box = visibleBox(root);
    expect(box.min.y).toBeCloseTo(2);
    const { floorY, share } = sampleFloor(root, box, 20);
    expect(floorY).toBeCloseTo(2, 3);
    expect(share).toBe(1);
  });

  it('reports a small share for objects standing in empty space', () => {
    const root = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1));
    post.position.set(0, 1.5, 0);
    const far = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1));
    far.position.set(30, 1.5, 30);
    root.add(post, far);
    const box = visibleBox(root);
    expect(sampleFloor(root, box, 25).share).toBeLessThan(0.15);
  });

  it('finds the ground of a Playground-like layout with clouds far outside it', () => {
    const root = new THREE.Group();
    root.add(plane(100, 0));
    // A dip below the ground, and a bump above part of it.
    const dip = plane(10, -1.8);
    dip.position.x = 20;
    root.add(dip);
    // Clouds high up, spread over 170 x 190 m, mostly beyond the ground.
    for (const [x, z] of [[-80, -90], [80, -90], [-80, 90], [80, 90], [0, 95], [-85, 0], [85, 0]]) {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(8, 8, 6));
      cloud.position.set(x, 45, z);
      root.add(cloud);
    }
    const box = visibleBox(root);
    expect(box.max.x - box.min.x).toBeGreaterThan(160);
    const estimate = sampleFloor(root, box, box.getBoundingSphere(new THREE.Sphere()).radius);
    expect(estimate.floorY).toBeCloseTo(0, 1);
    expect(estimate.share).toBeGreaterThan(0.15);
    expect(estimate.share).toBeLessThan(0.9);
    expect(estimate.footprint.x).toBeLessThan(130);

    const plan = planGround({ floorY: estimate.floorY, share: estimate.share, minY: box.min.y, radius: 120, center: estimate.center, footprint: estimate.footprint });
    expect(plan.floorY).toBeCloseTo(0, 1);
    expect(plan.gridY).toBeLessThan(0);
    expect(plan.gridY).toBeGreaterThan(-0.5);
    expect(plan.catcher).toBe(true);
  });
});
