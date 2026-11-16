import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { ReplayObject, ReplayTrack } from '../../viewer/replay/replayFile';
import { objectMoves, resolveFollowTarget } from './followTarget';

function track(values: number[], dimension: 3 | 4 = 3): ReplayTrack {
  const keys = values.length / dimension;
  return { dimension, times: Float64Array.from({ length: keys }, (_, i) => i), values: Float32Array.from(values), inTangents: new Float32Array(values.length), outTangents: new Float32Array(values.length) };
}

function node(name: string, id?: number) {
  const n = new THREE.Object3D();
  n.name = name;
  if (id !== undefined) n.userData.objectId = id;
  return n;
}

describe('objectMoves', () => {
  it('is true for a position or rotation track that changes', () => {
    expect(objectMoves({ position: track([0, 0, 0, 1, 0, 0]) } as ReplayObject)).toBe(true);
    expect(objectMoves({ rotation: track([0, 0, 0, 1, 0, 1, 0, 0], 4) } as ReplayObject)).toBe(true);
  });

  it('is false for nothing, one key, or a track that stays put', () => {
    expect(objectMoves(undefined)).toBe(false);
    expect(objectMoves({} as ReplayObject)).toBe(false);
    expect(objectMoves({ position: track([1, 2, 3]) } as ReplayObject)).toBe(false);
    expect(objectMoves({ position: track([1, 2, 3, 1, 2, 3]) } as ReplayObject)).toBe(false);
  });
});

describe('resolveFollowTarget', () => {
  function sample() {
    const root = node('root');
    const world = node('World', 1);
    const player = node('Player', 2);
    const pivot = node('CameraPivot', 3);
    const camera = node('Main Camera', 4);
    root.add(world);
    world.add(player);
    player.add(pivot);
    pivot.add(camera);
    return { root, world, player, pivot, camera };
  }

  it('is the top-most ancestor that moves, below the static world', () => {
    const { root, player, camera } = sample();
    expect(resolveFollowTarget(camera, root, (id) => id === 2 || id === 3)).toBe(player);
  });

  it('is a moving platform above the player when that moves too', () => {
    const { root, world, camera } = sample();
    expect(resolveFollowTarget(camera, root, () => true)).toBe(world);
  });

  it('falls back to the camera when nothing above it moves', () => {
    const { root, camera } = sample();
    expect(resolveFollowTarget(camera, root, () => false)).toBe(camera);
  });

  it('never picks the scene root, whatever its id', () => {
    const { root, camera } = sample();
    root.userData.objectId = 99;
    expect(resolveFollowTarget(camera, root, (id) => id === 99)).toBe(camera);
  });

  it('ignores moving ancestors without an ObjectID', () => {
    const { root, camera, pivot } = sample();
    delete pivot.userData.objectId;
    expect(resolveFollowTarget(camera, root, (id) => id === 3)).toBe(camera);
  });
});
