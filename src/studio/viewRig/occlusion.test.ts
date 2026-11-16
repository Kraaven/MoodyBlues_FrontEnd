import { describe, expect, it } from 'vitest';
import { ARM_MARGIN, armShare, SideChooser, stepArm } from './occlusion';

describe('armShare', () => {
  it('is 1 with nothing in the way, or the obstacle beyond the view', () => {
    expect(armShare(null, 6)).toBe(1);
    expect(armShare(6 + ARM_MARGIN, 6)).toBe(1);
    expect(armShare(50, 6)).toBe(1);
  });

  it('stops a margin short of the obstacle', () => {
    expect(armShare(3.3, 6) * 6).toBeCloseTo(3.3 - ARM_MARGIN);
  });

  it('never comes closer than about a metre, or a fifth of the distance', () => {
    expect(armShare(0.1, 6) * 6).toBeCloseTo(1.2);
    expect(armShare(0, 20)).toBeCloseTo(0.2);
    expect(armShare(0, 0.5)).toBe(1);
  });
});

describe('stepArm', () => {
  it('comes in faster than it goes out', () => {
    const inward = stepArm(1, 0.4, 0.1);
    const outward = stepArm(0.4, 1, 0.1);
    expect(1 - inward).toBeGreaterThan(outward - 0.4);
  });

  it('does not depend on the frame rate', () => {
    let a = 0.4;
    for (let i = 0; i < 60; i++) a = stepArm(a, 1, 1 / 60);
    let b = 0.4;
    for (let i = 0; i < 6; i++) b = stepArm(b, 1, 1 / 6);
    expect(a).toBeCloseTo(b, 9);
  });

  it('does not overshoot', () => {
    expect(stepArm(1, 0.4, 5)).toBeGreaterThanOrEqual(0.4);
    expect(stepArm(0.4, 1, 5)).toBeLessThanOrEqual(1);
  });
});

describe('SideChooser', () => {
  it('stays while its side is clear, or both are blocked', () => {
    const c = new SideChooser();
    for (let i = 0; i < 300; i++) expect(c.update(1 / 60, false, false)).toBe(false);
    for (let i = 0; i < 300; i++) expect(c.update(1 / 60, true, true)).toBe(false);
  });

  it('changes once its side has stayed blocked a moment while the other is clear', () => {
    const c = new SideChooser();
    let changed = -1;
    for (let i = 0; i < 120 && changed < 0; i++) if (c.update(1 / 60, true, false)) changed = i;
    expect(changed).toBeGreaterThan(15);
    expect(changed).toBeLessThan(30);
  });

  it('ignores a gap that flickers', () => {
    const c = new SideChooser();
    for (let i = 0; i < 300; i++) expect(c.update(1 / 60, i % 10 < 8, i % 10 >= 8)).toBe(false);
  });

  it('does not change again straight away', () => {
    const c = new SideChooser();
    let changes = 0;
    for (let i = 0; i < 240; i++) if (c.update(1 / 60, true, false)) changes++;
    // In four seconds: at 0.35 s, then no more often than every 1.5 s.
    expect(changes).toBe(3);
  });
});
