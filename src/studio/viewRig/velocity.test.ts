import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VelocityEstimator } from './velocity';

/** A player walking along +X at `speed` m/s, sampled at `hz`. */
function walk(est: VelocityEstimator, from: number, to: number, speed: number, hz = 60) {
  const step = (to - from) / Math.abs(to - from) / hz;
  for (let t = from; Math.abs(t - to) > 1e-9; t += step) est.update(t, new THREE.Vector3(speed * t, 0, 0));
  est.update(to, new THREE.Vector3(speed * to, 0, 0));
}

describe('VelocityEstimator', () => {
  it('converges on the recorded velocity', () => {
    const est = new VelocityEstimator();
    walk(est, 0, 3, 2);
    expect(est.velocity.x).toBeCloseTo(2, 2);
    expect(est.velocity.z).toBeCloseTo(0, 5);
  });

  it('gives the same velocity when scrubbing backwards', () => {
    const est = new VelocityEstimator();
    walk(est, 3, 0, 2);
    expect(est.velocity.x).toBeCloseTo(2, 2);
  });

  it('does not depend on the frame rate', () => {
    const a = new VelocityEstimator();
    const b = new VelocityEstimator();
    walk(a, 0, 2, 3, 30);
    walk(b, 0, 2, 3, 120);
    expect(a.velocity.x).toBeCloseTo(b.velocity.x, 1);
  });

  it('keeps its estimate while paused', () => {
    const est = new VelocityEstimator();
    walk(est, 0, 2, 2);
    for (let i = 0; i < 10; i++) est.update(2, new THREE.Vector3(4, 0, 0));
    expect(est.velocity.x).toBeCloseTo(2, 2);
  });

  it('does not lurch on a seek: the estimate stays and measuring restarts from the new place', () => {
    const est = new VelocityEstimator();
    walk(est, 0, 2, 2);
    est.update(30, new THREE.Vector3(500, 0, 9));
    expect(est.velocity.x).toBeCloseTo(2, 2);
    est.update(30 + 1 / 60, new THREE.Vector3(500 + 2 / 60, 0, 9));
    expect(est.velocity.x).toBeCloseTo(2, 1);
    expect(est.velocity.z).toBeCloseTo(0, 1);
  });

  it('measures afresh after rebase(), and from nothing after reset()', () => {
    const est = new VelocityEstimator();
    walk(est, 0, 2, 2);
    est.rebase();
    est.update(0.5, new THREE.Vector3(100, 0, 0));
    expect(est.velocity.x).toBeCloseTo(2, 2);
    est.reset();
    expect(est.velocity.length()).toBe(0);
  });
});
