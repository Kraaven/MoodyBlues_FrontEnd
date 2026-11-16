import { describe, expect, it } from 'vitest';
import { AngleSpring, Spring, wrapAngle } from './springs';

describe('Spring', () => {
  it('reaches the goal without overshooting', () => {
    const s = new Spring(0);
    let max = 0;
    for (let i = 0; i < 300; i++) max = Math.max(max, s.step(1, 0.3, 1 / 60));
    expect(max).toBeLessThanOrEqual(1 + 1e-9);
    expect(s.value).toBeCloseTo(1, 3);
  });

  it('does not depend on the frame rate', () => {
    const a = new Spring(0);
    const b = new Spring(0);
    a.step(2, 0.4, 0.5);
    for (let i = 0; i < 30; i++) b.step(2, 0.4, 0.5 / 30);
    expect(b.value).toBeCloseTo(a.value, 9);
    expect(b.velocity).toBeCloseTo(a.velocity, 9);
  });

  it('snaps with a smooth time of zero and holds still with no time passing', () => {
    const s = new Spring(0);
    s.step(1, 0.3, 0);
    expect(s.value).toBe(0);
    s.step(1, 0, 0.016);
    expect(s.value).toBe(1);
  });
});

describe('AngleSpring', () => {
  it('wraps angles into (-PI, PI]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
  });

  it('takes the short way round and never snaps across the half turn', () => {
    const s = new AngleSpring(3);
    let previous = s.value;
    let largest = 0;
    for (let i = 0; i < 120; i++) {
      s.step(-3, 0.3, 1 / 60);
      largest = Math.max(largest, Math.abs(s.value - previous));
      previous = s.value;
    }
    expect(largest).toBeLessThan(0.2);
    expect(Math.abs(wrapAngle(s.value + 3))).toBeLessThan(1e-2);
  });

  it('turns smoothly through an exact reversal', () => {
    const s = new AngleSpring(0);
    let previous = 0;
    for (let i = 0; i < 60; i++) {
      s.step(Math.PI, 0.35, 1 / 60);
      expect(Math.abs(s.value - previous)).toBeLessThan(0.2);
      previous = s.value;
    }
  });
});
