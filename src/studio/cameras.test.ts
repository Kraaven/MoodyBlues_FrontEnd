import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cameraForward, frustumSegments, gizmoDepth, listCameras } from './cameras';

/** The exported shape of the sample scene: Player > CameraPivot > Main Camera (turned 180 degrees about Y by the exporter). */
function sampleRig() {
  const player = new THREE.Object3D();
  player.position.set(0, 1.1, -4);
  const pivot = new THREE.Object3D();
  pivot.position.set(0, 0.7, 0);
  const camera = new THREE.PerspectiveCamera();
  camera.name = 'Main Camera';
  camera.quaternion.set(0, 1, 0, 0);
  camera.userData = { objectId: 1460, invertLook: true, camera: { index: 0, tag: 'MainCamera' } };
  const flipped = new THREE.Object3D();
  flipped.name = 'Main Camera-flipped';
  flipped.quaternion.set(0, -1, 0, 0);
  player.add(pivot);
  pivot.add(camera);
  camera.add(flipped);
  player.updateWorldMatrix(false, true);
  return { player, camera, flipped };
}

describe('cameraForward', () => {
  it('is the node -Z, which the exporter turned to Unity forward (+Z in the sample)', () => {
    const { camera } = sampleRig();
    const f = cameraForward(camera);
    expect(f.x).toBeCloseTo(0);
    expect(f.y).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(1);
  });

  it('follows the parents', () => {
    const { player, camera } = sampleRig();
    player.rotation.y = Math.PI / 2;
    player.updateWorldMatrix(false, true);
    const f = cameraForward(camera);
    expect(f.x).toBeCloseTo(1);
    expect(f.z).toBeCloseTo(0);
  });

  it('is the plain -Z for a node that was not turned', () => {
    const node = new THREE.Object3D();
    node.updateWorldMatrix(true, false);
    expect(cameraForward(node).z).toBeCloseTo(-1);
  });
});

describe('listCameras', () => {
  it('lists cameras by index and ignores nodes without the extras', () => {
    const root = new THREE.Group();
    const a = new THREE.Object3D();
    a.userData = { objectId: 7, camera: { index: 1, tag: 'Untagged' } };
    a.name = 'Side';
    const b = new THREE.Object3D();
    b.userData = { objectId: 3, camera: { index: 0, tag: 'MainCamera' } };
    const plain = new THREE.PerspectiveCamera();
    plain.userData = { objectId: 9 };
    root.add(a, plain, b);
    expect(listCameras(root).map((c) => [c.id, c.index, c.name])).toEqual([
      [3, 0, 'Camera 0'],
      [7, 1, 'Side'],
    ]);
  });

  it('is empty without extras', () => {
    expect(listCameras(new THREE.Group())).toEqual([]);
  });
});

describe('gizmo', () => {
  it('is 12% of the follow distance with a camera focused, between 0.2 and 0.7 m', () => {
    expect(gizmoDepth(500, 5)).toBeCloseTo(0.6);
    expect(gizmoDepth(500, 1)).toBe(0.2);
    expect(gizmoDepth(500, 40)).toBe(0.7);
  });

  it('is 1% of the scene radius in the free camera, between 0.25 and 1.5 m', () => {
    expect(gizmoDepth(100, null)).toBeCloseTo(1);
    expect(gizmoDepth(1, null)).toBe(0.25);
    expect(gizmoDepth(10_000, null)).toBe(1.5);
  });

  it('draws a frustum that opens along -Z', () => {
    const lines = frustumSegments(1, 90, 2);
    expect(lines.length % 6).toBe(0);
    for (let i = 0; i < lines.length; i += 3) expect(lines[i + 2]).toBeLessThanOrEqual(0);
    // The far corner of a 90 degree frustum one metre deep is one metre up, two across.
    expect(Array.from(lines.slice(3, 6))).toEqual([expect.closeTo(-2), expect.closeTo(1), -1]);
  });
});
