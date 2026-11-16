import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { hideOwnMeshes } from './ownBody';

/** Player > Body, and Player > CameraPivot > Main Camera > flipped > the camera prop's cylinder. */
function rig() {
  const player = new THREE.Object3D();
  const body = new THREE.Mesh();
  const pivot = new THREE.Object3D();
  const camera = new THREE.PerspectiveCamera();
  const flipped = new THREE.Object3D();
  const prop = new THREE.Mesh();
  player.add(body, pivot);
  pivot.add(camera);
  camera.add(flipped);
  flipped.add(prop);
  return { camera, body, prop };
}

describe('hideOwnMeshes', () => {
  it("takes the camera's own prop out of the picture and leaves the player's body", () => {
    const { camera, body, prop } = rig();
    const view = new THREE.PerspectiveCamera();
    const restore = hideOwnMeshes(camera);
    expect(prop.layers.test(view.layers)).toBe(false);
    expect(body.layers.test(view.layers)).toBe(true);
    restore();
    expect(prop.layers.test(view.layers)).toBe(true);
  });

  it('puts back whatever layers a mesh had', () => {
    const { camera, prop } = rig();
    prop.layers.enable(3);
    const before = prop.layers.mask;
    hideOwnMeshes(camera)();
    expect(prop.layers.mask).toBe(before);
  });
});
