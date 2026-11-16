import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildBoundsTrees, disposeBoundsTree } from './bvh';

describe('bounds trees', () => {
  it('are built once per shared geometry, answer raycasts, and go with the geometry', () => {
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const a = new THREE.Mesh(geometry);
    const b = new THREE.Mesh(geometry);
    b.position.x = 10;
    const root = new THREE.Group().add(a, b);
    root.updateMatrixWorld(true);

    buildBoundsTrees(root);
    const tree = (geometry as unknown as { boundsTree?: object }).boundsTree;
    expect(tree).toBeDefined();
    buildBoundsTrees(root);
    expect((geometry as unknown as { boundsTree?: object }).boundsTree).toBe(tree);

    const raycaster = new THREE.Raycaster(new THREE.Vector3(10, 5, 0), new THREE.Vector3(0, -1, 0));
    raycaster.firstHitOnly = true;
    const hits = raycaster.intersectObject(root, true);
    expect(hits).toHaveLength(1);
    expect(hits[0].object).toBe(b);
    expect(hits[0].point.y).toBeCloseTo(1);

    disposeBoundsTree(geometry);
    expect((geometry as unknown as { boundsTree?: object }).boundsTree).toBeUndefined();
  });
});
