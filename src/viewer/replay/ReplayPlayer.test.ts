import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { parseReplay, ReplayObjectKind } from './replayFile';
import { ReplayPlayer } from './ReplayPlayer';
import { buildReplay } from './testReplay';

function node(id: number | null, name: string): THREE.Object3D {
  const n = new THREE.Group();
  n.name = name;
  if (id !== null) n.userData.objectId = id;
  return n;
}

/** root > [mover > child, still (flat track), parked (never recorded), hopper (reparented), lamp (a light)] */
function scene() {
  const root = node(null, 'root');
  const mover = node(1, 'mover');
  const child = node(5, 'child');
  const still = node(2, 'still');
  const parked = node(3, 'parked');
  const hopper = node(4, 'hopper');
  const lamp = new THREE.PointLight();
  lamp.userData.objectId = 6;
  mover.add(child);
  root.add(mover, still, parked, hopper, lamp);
  still.position.set(9, 9, 9);
  return { root, mover, child, still, parked, hopper, lamp };
}

const replay = () =>
  parseReplay(
    buildReplay({
      duration: 10,
      objects: [1, 2, 3, 4, 5, 6].filter((id) => id !== 3).map((id) => ({ id, kind: ReplayObjectKind.Scene })),
      events: [{ time: 5, type: 5, objectId: 4, a: 1 }],
      blocks: [
        {
          start: 0,
          tracks: [
            { objectId: 1, channel: 0, times: [0, 10], values: [0, 0, 0, 10, 0, 0] },
            { objectId: 2, channel: 0, times: [0, 10], values: [1, 2, 3, 1, 2, 3] },
          ],
        },
      ],
    }),
  );

describe('ReplayPlayer static nodes', () => {
  it('keeps animated and reparented nodes updating, freezes the rest, and applies flat tracks once', () => {
    const s = scene();
    const player = new ReplayPlayer(s.root, replay());

    expect(s.mover.matrixAutoUpdate).toBe(true);
    expect(s.hopper.matrixAutoUpdate).toBe(true);
    expect(s.still.matrixAutoUpdate).toBe(false);
    expect(s.parked.matrixAutoUpdate).toBe(false);
    expect(s.child.matrixAutoUpdate).toBe(false);
    // The flat track's value was written to the node and baked into its matrix.
    expect(s.still.position.toArray()).toEqual([1, 2, 3]);
    expect(new THREE.Vector3().setFromMatrixPosition(s.still.matrix).toArray()).toEqual([1, 2, 3]);
    player.dispose();
  });

  it('moves the children of an animated parent while their own matrix is frozen', () => {
    const s = scene();
    s.child.position.set(0, 1, 0);
    const player = new ReplayPlayer(s.root, replay());
    player.playing = false;
    player.seek(10);
    s.root.updateMatrixWorld(true);
    expect(s.mover.position.x).toBeCloseTo(10);
    expect(s.child.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([expect.closeTo(10), expect.closeTo(1), expect.closeTo(0)]);
    player.dispose();
  });

  it('leaves unrecorded visibility alone and lets scene lights be switched', () => {
    const s = scene();
    const player = new ReplayPlayer(s.root, replay());
    player.setSceneLights(false);
    expect(s.lamp.visible).toBe(false);
    player.setSceneLights(true);
    expect(s.lamp.visible).toBe(true);
    player.dispose();
  });
});
