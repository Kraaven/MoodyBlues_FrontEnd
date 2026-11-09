import { describe, expect, it } from 'vitest';
import { cubicBezier, EASE_SOFT, lerpPose, PoseTransition, type Pose } from './transition';

const pose = (overrides: Partial<Pose> = {}): Pose => ({ px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, fov: 50, dim: 1, drift: 0, ...overrides });

describe('cubicBezier', () => {
  it('starts at 0 and ends at 1', () => {
    expect(EASE_SOFT(0)).toBe(0);
    expect(EASE_SOFT(1)).toBe(1);
  });

  it('never goes backwards', () => {
    let previous = 0;
    for (let i = 1; i <= 200; i++) {
      const value = EASE_SOFT(i / 200);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = value;
    }
  });

  it('is the identity for a straight line', () => {
    const linear = cubicBezier(0.25, 0.25, 0.75, 0.75);
    for (const x of [0.1, 0.5, 0.9]) expect(linear(x)).toBeCloseTo(x, 4);
  });

  it('eases out: most of the move happens early', () => {
    expect(EASE_SOFT(0.3)).toBeGreaterThan(0.5);
  });
});

describe('lerpPose', () => {
  it('moves every field, including dim and drift', () => {
    const mid = lerpPose(pose({ px: 0, dim: 1, drift: 0 }), pose({ px: 10, dim: 0.2, drift: 1 }), 0.5);
    expect(mid.px).toBe(5);
    expect(mid.dim).toBeCloseTo(0.6);
    expect(mid.drift).toBe(0.5);
  });
});

describe('PoseTransition', () => {
  it('arrives exactly, and reports done', () => {
    const t = new PoseTransition(pose());
    t.start(pose({ px: 10 }), 600);
    expect(t.done).toBe(false);
    t.advance(0.3);
    expect(t.pose.px).toBeGreaterThan(0);
    expect(t.pose.px).toBeLessThan(10);
    t.advance(0.4);
    expect(t.done).toBe(true);
    expect(t.pose.px).toBe(10);
    expect(t.progress).toBe(1);
  });

  it('jumps when the duration is 0 (reduced motion, first view)', () => {
    const t = new PoseTransition(pose());
    t.start(pose({ px: 7 }), 0);
    expect(t.pose.px).toBe(7);
    expect(t.done).toBe(true);
  });

  it('does not snap when interrupted: the new move starts from where the camera is', () => {
    const t = new PoseTransition(pose());
    t.start(pose({ px: 100 }), 1000);
    t.advance(0.4);
    const before = t.pose.px;
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(100);

    t.start(pose({ px: -50 }), 1000);
    expect(t.pose.px).toBe(before); // no jump at the moment of interruption
    t.advance(0.001);
    expect(Math.abs(t.pose.px - before)).toBeLessThan(5); // and no jump on the next frame

    t.advance(2);
    expect(t.pose.px).toBe(-50);
  });

  it('restarts progress at 0 after an interruption', () => {
    const t = new PoseTransition(pose());
    t.start(pose({ px: 100 }), 1000);
    t.advance(0.9);
    t.start(pose({ px: 0 }), 1000);
    expect(t.progress).toBe(0);
  });

  it('ignores negative frame times', () => {
    const t = new PoseTransition(pose());
    t.start(pose({ px: 10 }), 1000);
    t.advance(0.2);
    const at = t.pose.px;
    t.advance(-5);
    expect(t.pose.px).toBe(at);
  });
});
