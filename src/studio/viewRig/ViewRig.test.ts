import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { chasePose, followDistance, type PoseGoal } from './poses';
import { RETURN_DELAY, ViewRig, type RigInput } from './ViewRig';

const DT = 1 / 60;

/** A camera looking down +Z (heading 0), level, on a player at the origin. */
function setup(over: Partial<RigInput> = {}) {
  const rig = new ViewRig();
  const input: RigInput = {
    dt: DT,
    time: 0,
    reduced: false,
    focusId: 1,
    mode: 'follow',
    style: 'behind',
    player: new THREE.Vector3(0, 1, 0),
    eye: { position: new THREE.Vector3(0, 1.8, 0), quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), forward: new THREE.Vector3(0, 0, 1), fov: 70 },
    view: { position: new THREE.Vector3(10, 10, 10), target: new THREE.Vector3(0, 0, 0) },
    dragging: false,
    size: { height: 2, drop: 1 },
    fov: 45,
    ...over,
  };
  /** One frame: the rig writes, and the viewer/orbit hold what it wrote (as the camera does between frames). */
  const frame = (patch: Partial<RigInput> = {}) => {
    Object.assign(input, patch);
    const out = rig.update(input);
    input.view = { position: out.position.clone(), target: out.target.clone() };
    input.time += input.dt;
    return out;
  };
  return { rig, input, frame };
}

function settle(frame: ReturnType<typeof setup>['frame'], frames = 400) {
  let out = frame();
  for (let i = 0; i < frames; i++) out = frame();
  return out;
}

describe('ViewRig follow', () => {
  it('glides from where the camera is to the chase pose, without a cut', () => {
    const { frame } = setup();
    const first = frame();
    expect(first.position.distanceTo(new THREE.Vector3(10, 10, 10))).toBeLessThan(1);
    const end = settle(frame);
    const goal: PoseGoal = { position: new THREE.Vector3(), target: new THREE.Vector3() };
    chasePose(new THREE.Vector3(0, 1, 0), { height: 2, drop: 1 }, 0, 0, followDistance('behind', { height: 2, drop: 1 }), goal);
    expect(end.position.distanceTo(goal.position)).toBeLessThan(1e-2);
    expect(end.target.distanceTo(goal.target)).toBeLessThan(1e-2);
    expect(end.animating).toBe(false);
  });

  it('turns smoothly when the camera swings round 180 degrees', () => {
    const { frame, input } = setup();
    settle(frame);
    let previous = frame().position.clone();
    input.eye.forward.set(0, 0, -1);
    let largest = 0;
    for (let i = 0; i < 240; i++) {
      const p = frame().position;
      largest = Math.max(largest, p.distanceTo(previous));
      previous = p.clone();
    }
    // The viewer swings round at a walking pace of the rig, not in one jump.
    expect(largest).toBeLessThan(0.5);
    expect(previous.z).toBeGreaterThan(3.5);
  });

  it('keeps the user zoom and orbit as a nudge, and eases the angles (not the distance) back after the delay', () => {
    const { frame, input } = setup();
    const rest = settle(frame).position.clone();
    // The user drags: OrbitControls moves the camera about the target and dollies in.
    const sphere = new THREE.Spherical().setFromVector3(input.view.position.clone().sub(input.view.target));
    sphere.theta += 0.8;
    sphere.radius *= 0.5;
    input.view.position.setFromSpherical(sphere).add(input.view.target);
    const nudged = frame();
    expect(nudged.position.distanceTo(rest)).toBeGreaterThan(1);
    // Held for a while: stays.
    for (let i = 0; i < 60; i++) frame();
    expect(frame().position.distanceTo(rest)).toBeGreaterThan(1);
    // After the delay the angle returns, the zoomed distance stays.
    for (let i = 0; i < (RETURN_DELAY + 3) * 60; i++) frame();
    const back = frame();
    const offset = back.position.clone().sub(back.target);
    const restOffset = rest.clone().sub(back.target);
    expect(offset.length()).toBeCloseTo(restOffset.length() * 0.5, 1);
    const angle = Math.atan2(offset.x, offset.z) - Math.atan2(restOffset.x, restOffset.z);
    expect(Math.abs(angle)).toBeLessThan(0.02);
  });

  it('does not take its own movement for user input', () => {
    const { frame, input } = setup();
    settle(frame);
    // The player runs off; the rig moves, and the zoom stays 1.
    for (let i = 0; i < 300; i++) {
      input.player.z += 0.05;
      frame();
    }
    const out = frame();
    // The spring trails a runner by about its smooth time times the speed (3 m/s), not by a changed zoom.
    expect(out.position.clone().sub(out.target).length()).toBeLessThan(9);
    expect(out.position.z).toBeLessThan(input.player.z);
  });

  it('keeps asking for frames while the user holds a drag, and stops when settled', () => {
    const { frame } = setup();
    expect(frame().animating).toBe(true);
    expect(settle(frame).animating).toBe(false);
    expect(frame({ dragging: true }).animating).toBe(true);
  });

  it('cuts, rather than glides, under reduced motion', () => {
    const { frame } = setup({ reduced: true });
    const first = frame();
    const goal: PoseGoal = { position: new THREE.Vector3(), target: new THREE.Vector3() };
    chasePose(new THREE.Vector3(0, 1, 0), { height: 2, drop: 1 }, 0, 0, followDistance('behind', { height: 2, drop: 1 }), goal);
    expect(first.position.distanceTo(goal.position)).toBeLessThan(1e-6);
  });

  it('glides to another camera instead of cutting', () => {
    const { frame, input } = setup();
    const before = settle(frame).position.clone();
    input.player.set(20, 1, 0);
    const first = frame({ focusId: 2 });
    expect(first.position.distanceTo(before)).toBeLessThan(2);
  });
});

describe('ViewRig front', () => {
  it('stands to the side of where the player runs, and looks ahead', () => {
    const { frame, input } = setup({ style: 'front' });
    for (let i = 0; i < 400; i++) {
      input.player.x += 0.06;
      frame();
    }
    const out = frame();
    expect(out.target.x).toBeGreaterThan(input.player.x);
    // Square-on to a run along +X: the viewer is off to the side in Z, not behind.
    expect(Math.abs(out.position.z - input.player.z)).toBeGreaterThan(Math.abs(out.position.x - input.player.x));
  });

  it('keeps its side when the player turns round', () => {
    const { frame, input } = setup({ style: 'front' });
    for (let i = 0; i < 300; i++) {
      input.player.x += 0.06;
      frame();
    }
    const sideBefore = Math.sign(input.view.position.z - input.player.z);
    for (let i = 0; i < 600; i++) {
      input.player.x -= 0.06;
      frame();
    }
    expect(Math.sign(input.view.position.z - input.player.z)).toBe(sideBefore);
  });

  it('does not lurch on a seek', () => {
    const { frame, input } = setup({ style: 'front' });
    for (let i = 0; i < 300; i++) {
      input.player.x += 0.06;
      frame();
    }
    const before = input.view.position.clone();
    input.player.x += 0.06;
    input.time += 40;
    const out = frame();
    // Only the player's own step: the viewer has not swung round.
    expect(out.position.distanceTo(before)).toBeLessThan(0.5);
  });
});

describe('ViewRig first person', () => {
  it('glides into the camera over half a second, then sits on its position, rotation and fov', () => {
    const { frame, input } = setup({ mode: 'follow' });
    settle(frame);
    const follow = input.view.position.clone();
    const first = frame({ mode: 'firstPerson' });
    expect(first.firstPerson).toBeGreaterThan(0);
    expect(first.firstPerson).toBeLessThan(0.1);
    expect(first.position.distanceTo(follow)).toBeLessThan(0.5);
    expect(first.orbitEnabled).toBe(false);
    for (let i = 0; i < 20; i++) frame();
    const mid = frame();
    expect(mid.firstPerson).toBeGreaterThan(0.1);
    expect(mid.firstPerson).toBeLessThan(1);
    const end = settle(frame, 60);
    expect(end.firstPerson).toBe(1);
    expect(end.position.distanceTo(input.eye.position)).toBeLessThan(1e-6);
    expect(end.quaternion.angleTo(input.eye.quaternion)).toBeLessThan(1e-6);
    expect(end.fov).toBeCloseTo(70);
  });

  it('turns with the free look and springs back, and glides out when leaving', () => {
    const { rig, frame, input } = setup({ mode: 'firstPerson' });
    settle(frame, 60);
    rig.freeLook.drag(0.5, 0);
    const turned = frame();
    expect(turned.quaternion.angleTo(input.eye.quaternion)).toBeCloseTo(0.5, 3);
    rig.freeLook.release();
    for (let i = 0; i < 120; i++) frame();
    expect(frame().quaternion.angleTo(input.eye.quaternion)).toBeLessThan(1e-3);

    const leaving = frame({ mode: 'follow' });
    expect(leaving.firstPerson).toBeLessThan(1);
    expect(leaving.position.distanceTo(input.eye.position)).toBeLessThan(1);
    const end = settle(frame, 120);
    expect(end.firstPerson).toBe(0);
    expect(end.orbitEnabled).toBe(true);
    expect(end.fov).toBe(45);
  });
});

describe('ViewRig obstruction', () => {
  const distance = (out: { position: THREE.Vector3; target: THREE.Vector3 }) => out.position.distanceTo(out.target);

  it('Behind pulls in to just before a wall and eases back out when it is clear', () => {
    let wall: number | null = 3;
    const { frame } = setup({ probe: () => wall });
    const clear = distance(settle(setup().frame));
    for (let i = 0; i < 120; i++) frame();
    const blocked = distance(frame());
    expect(blocked).toBeLessThan(clear * 0.6);
    expect(blocked).toBeCloseTo(3 - 0.3, 0);
    wall = null;
    const first = distance(frame());
    expect(first - blocked).toBeLessThan(0.3);
    for (let i = 0; i < 400; i++) frame();
    expect(distance(frame())).toBeCloseTo(clear, 1);
  });

  it('Front goes round to the other side when its own is blocked and the other is clear', () => {
    const { frame, input } = setup({ style: 'front' });
    settle(frame);
    const sideBefore = Math.sign(input.view.position.x - input.player.x) || 1;
    // The probe is blocked on the viewer's side only.
    input.probe = (_from, to) => (Math.sign(to.x - input.player.x) === sideBefore ? 2 : null);
    for (let i = 0; i < 400; i++) frame();
    expect(Math.sign(input.view.position.x - input.player.x)).toBe(-sideBefore);
  });
});
