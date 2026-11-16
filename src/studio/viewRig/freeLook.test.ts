import { describe, expect, it } from 'vitest';
import { FreeLook, MAX_PITCH, MAX_YAW } from './freeLook';

describe('FreeLook', () => {
  it('turns with the drag and stops at the limits', () => {
    const look = new FreeLook();
    look.drag(0.5, -0.2);
    expect(look.yaw.value).toBeCloseTo(0.5);
    expect(look.pitch.value).toBeCloseTo(-0.2);
    look.drag(10, 10);
    expect(look.yaw.value).toBe(MAX_YAW);
    expect(look.pitch.value).toBe(MAX_PITCH);
    look.drag(-100, -100);
    expect(look.yaw.value).toBe(-MAX_YAW);
    expect(look.pitch.value).toBe(-MAX_PITCH);
  });

  it('holds while dragged, then eases back to the recorded view within about a second', () => {
    const look = new FreeLook();
    look.drag(MAX_YAW, MAX_PITCH);
    for (let i = 0; i < 120; i++) look.step(1 / 60);
    expect(look.yaw.value).toBe(MAX_YAW);
    look.release();
    expect(look.settled).toBe(false);
    for (let i = 0; i < 60; i++) look.step(1 / 60);
    expect(Math.abs(look.yaw.value)).toBeLessThan(0.05);
    for (let i = 0; i < 60; i++) look.step(1 / 60);
    expect(look.yaw.value).toBe(0);
    expect(look.settled).toBe(true);
  });
});
