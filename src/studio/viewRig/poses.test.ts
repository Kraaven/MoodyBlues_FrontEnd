import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { chasePose, chooseSide, FALLBACK_PLAYER, firstPersonNear, followDistance, headingOf, headingVector, playerSizeFromBox, restPose, sidePose, travelDirection, type PlayerSize, type PoseGoal } from './poses';

const goal = (): PoseGoal => ({ position: new THREE.Vector3(), target: new THREE.Vector3() });
/** A 2 m player whose origin is its centre: its feet are at y = 0. */
const player = new THREE.Vector3(2, 1, -3);
const size: PlayerSize = { height: 2, drop: 1 };

describe('headings', () => {
  it('0 is +Z and grows towards +X', () => {
    expect(headingVector(0).toArray()).toEqual([0, 0, 1]);
    expect(headingVector(Math.PI / 2).x).toBeCloseTo(1);
    expect(headingOf(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(headingOf(0.01, 0.01)).toBeNull();
  });
});

describe('followDistance', () => {
  it('is 3.2 player heights behind (at least 4 m) and 3.8 in front', () => {
    expect(followDistance('behind', size)).toBeCloseTo(6.4);
    expect(followDistance('behind', { height: 1, drop: 0.5 })).toBe(4);
    expect(followDistance('front', size)).toBeCloseTo(7.6);
  });
});

describe('firstPersonNear', () => {
  it('is 18% of the player height by default, about 0.32 m for a 1.8 m player', () => {
    expect(firstPersonNear(null, FALLBACK_PLAYER)).toBeCloseTo(0.324);
    expect(firstPersonNear(null, size)).toBeCloseTo(0.36);
  });

  it('never goes under 5 cm, and the setting wins when there is one', () => {
    expect(firstPersonNear(null, { height: 0.1, drop: 0 })).toBe(0.05);
    expect(firstPersonNear(0.8, size)).toBe(0.8);
    expect(firstPersonNear(0.01, size)).toBe(0.01);
  });
});

describe('playerSizeFromBox', () => {
  it('reads the height and how far the origin is above the feet', () => {
    const s = playerSizeFromBox(new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 2, 0.3)), 1.1);
    expect(s.height).toBe(2);
    expect(s.drop).toBeCloseTo(1.1);
  });

  it('falls back for an empty or tiny box, and caps a huge one', () => {
    expect(playerSizeFromBox(new THREE.Box3(), 0)).toBe(FALLBACK_PLAYER);
    expect(playerSizeFromBox(new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(0.1, 0.1, 0.1)), 0)).toBe(FALLBACK_PLAYER);
    expect(playerSizeFromBox(new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(1, 50, 1)), 0).height).toBe(4);
  });
});

describe('chasePose', () => {
  it('stands behind the heading, with the camera well above the feet, aiming at the upper body', () => {
    const p = chasePose(player, size, 0, 0, 6.4, goal());
    expect(p.position.x).toBeCloseTo(2);
    expect(p.position.z).toBeCloseTo(-3 - 6.4);
    expect(p.position.y).toBeCloseTo(0.55 * 6.4);
    // 0.8 of the height above the feet (y = 0).
    expect(p.target.y).toBeCloseTo(1.6);
    expect(p.target.z).toBeGreaterThan(-3);
  });

  it('rises and looks down more when the camera looks down, drops and tilts up when it looks up', () => {
    const level = chasePose(player, size, 0, 0, 6.4, goal());
    const down = chasePose(player, size, 0, -0.6, 6.4, goal());
    const up = chasePose(player, size, 0, 0.6, 6.4, goal());
    expect(down.position.y).toBeGreaterThan(level.position.y);
    expect(down.target.y).toBeLessThan(level.target.y);
    expect(up.position.y).toBeLessThan(level.position.y);
    expect(up.target.y).toBeGreaterThan(level.target.y);
    // Modest: the height changes by 25% at the most.
    expect(down.position.y).toBeCloseTo(level.position.y * 1.25, 5);
    expect(up.position.y).toBeCloseTo(level.position.y * 0.75, 5);
    const steeper = chasePose(player, size, 0, -1.5, 6.4, goal());
    expect(steeper.position.y).toBeCloseTo(down.position.y, 5);
  });

  it('scales with the distance', () => {
    const near = chasePose(player, size, 0, 0, 4, goal());
    const far = chasePose(player, size, 0, 0, 8, goal());
    expect(far.position.z).toBeLessThan(near.position.z);
    expect(far.position.y).toBeCloseTo(near.position.y * 2, 5);
  });
});

describe('travelDirection', () => {
  it('is the facing when still and the movement when moving', () => {
    expect(travelDirection(0, 0, 1)).toBe(1);
    expect(travelDirection(0.05, 0, 1)).toBe(1);
    expect(travelDirection(5, 0, 0)).toBeCloseTo(Math.PI / 2);
  });

  it('turns the short way round', () => {
    const h = travelDirection(-5, -0.01, Math.PI - 0.1);
    expect(Math.abs(h)).toBeGreaterThan(Math.PI / 2);
  });
});

describe('chooseSide', () => {
  it('keeps the side the viewer is on and flips only when it is clearly on the other', () => {
    // Heading 0: side +1 is +X.
    expect(chooseSide(1, 0, 3, 0)).toBe(1);
    expect(chooseSide(1, 0, 3, 3)).toBe(1);
    expect(chooseSide(1, 0, -3, 0)).toBe(-1);
    expect(chooseSide(1, 0, -0.5, 3)).toBe(1);
    expect(chooseSide(-1, 0, -3, 0)).toBe(-1);
  });

  it('keeps the viewer on its world side when the direction of travel reverses', () => {
    // The player turns round (heading PI): the viewer, still on +X, is now on the -1 side.
    expect(chooseSide(1, Math.PI, 3, 0)).toBe(-1);
  });

  it('keeps the previous side with no offset', () => {
    expect(chooseSide(-1, 0, 0, 0)).toBe(-1);
  });
});

describe('sidePose', () => {
  const still = new THREE.Vector3();

  it('stands to the side, three quarters, when still', () => {
    const p = sidePose(player, size, still, 0, 1, 7.6, goal());
    const offset = p.position.clone().sub(player);
    expect(offset.x).toBeGreaterThan(6);
    expect(offset.z).toBeGreaterThan(0);
    expect(offset.z).toBeLessThan(offset.x);
    expect(p.target.x).toBeCloseTo(player.x);
    expect(p.target.z).toBeCloseTo(player.z);
  });

  it('is on the other side with the other sign', () => {
    const p = sidePose(player, size, still, 0, -1, 4, goal());
    expect(p.position.x).toBeLessThan(player.x);
  });

  it('looks ahead of a moving player, more the faster, and clamps', () => {
    const slow = sidePose(player, size, new THREE.Vector3(0, 0, 1), 0, 1, 4, goal());
    const fast = sidePose(player, size, new THREE.Vector3(0, 0, 3), 0, 1, 4, goal());
    const absurd = sidePose(player, size, new THREE.Vector3(0, 0, 100), 0, 1, 4, goal());
    expect(slow.target.z).toBeGreaterThan(player.z);
    expect(fast.target.z).toBeGreaterThan(slow.target.z);
    // Capped so the player stays inside the frame: 22% of the distance.
    expect(absurd.target.z - player.z).toBeCloseTo(0.22 * 4, 5);
    expect(fast.target.z - player.z).toBeLessThanOrEqual(0.22 * 4 + 1e-9);
  });

  it('moves the viewer towards the front as the player speeds up', () => {
    const still0 = sidePose(player, size, still, 0, 1, 4, goal());
    const fast = sidePose(player, size, new THREE.Vector3(0, 0, 4), 0, 1, 4, goal());
    expect(fast.position.z - player.z).toBeGreaterThan(still0.position.z - player.z);
  });
});

describe('restPose', () => {
  it('is the chase pose for Behind and the still side pose for Front, at their own distances', () => {
    const behind = restPose('behind', player, size, 0.3, -0.2, goal());
    const expected = chasePose(player, size, 0.3, -0.2, followDistance('behind', size), goal());
    expect(behind.position.distanceTo(expected.position)).toBe(0);
    const front = restPose('front', player, size, 0.3, 0, goal());
    const still = sidePose(player, size, new THREE.Vector3(), 0.3, 1, followDistance('front', size), goal());
    expect(front.position.distanceTo(still.position)).toBe(0);
  });
});
