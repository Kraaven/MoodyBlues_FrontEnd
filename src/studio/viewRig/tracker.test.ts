import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ObjectTracker } from './tracker';

describe('ObjectTracker', () => {
  it('eases the target to the object, moving it by the returned shift each frame', () => {
    const tracker = new ObjectTracker();
    const target = new THREE.Vector3(0, 0, 0);
    const goal = new THREE.Vector3(5, 0, 0);
    const first = tracker.step(goal, target, 1 / 60, false).clone();
    expect(first.x).toBeGreaterThan(0);
    expect(first.x).toBeLessThan(1);
    target.add(first);
    for (let i = 0; i < 300; i++) target.add(tracker.step(goal, target, 1 / 60, false));
    expect(target.x).toBeCloseTo(5, 2);
    expect(tracker.moving).toBe(false);
  });

  it('cuts under reduced motion and starts afresh after reset()', () => {
    const tracker = new ObjectTracker();
    const target = new THREE.Vector3();
    target.add(tracker.step(new THREE.Vector3(3, 0, 0), target, 1 / 60, true));
    expect(target.x).toBe(3);
    tracker.reset();
    const elsewhere = new THREE.Vector3(-10, 0, 0);
    expect(tracker.step(new THREE.Vector3(-10, 0, 0), elsewhere, 1 / 60, false).length()).toBe(0);
  });
});
