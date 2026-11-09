/**
 * The Stage's transition clock (DESIGN.md 4.4): one progress value drives the camera, the stage
 * dim and the drift together. Pure maths, no three.js and no React, so it is unit-tested alone.
 */

/** A camera pose plus the two stage properties that move with it. */
export interface Pose {
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
  /** Stage opacity behind the DOM, 0 to 1. */
  dim: number;
  /** How much of the slow orbit drift is applied, 0 to 1. */
  drift: number;
}

const KEYS: (keyof Pose)[] = ['px', 'py', 'pz', 'tx', 'ty', 'tz', 'fov', 'dim', 'drift'];

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out = { ...a };
  for (const key of KEYS) out[key] = a[key] + (b[key] - a[key]) * t;
  return out;
}

/** A CSS-style cubic-bezier easing, solved for x with Newton's method and bisection as a fallback. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-6) return sampleY(t);
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const value = sampleX(t);
      if (Math.abs(value - x) < 1e-6) break;
      if (value < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

/** The `--ease-out-soft` token. */
export const EASE_SOFT = cubicBezier(0.2, 0.8, 0.2, 1);

/**
 * Moves from the pose the camera is actually in to a new one. Starting again mid-way continues from
 * wherever it is now, so an interrupted transition never snaps (DESIGN.md 4.4).
 */
export class PoseTransition {
  private from: Pose;
  private to: Pose;
  private current: Pose;
  private elapsed = 0;
  private duration = 0;

  constructor(initial: Pose) {
    this.from = initial;
    this.to = initial;
    this.current = initial;
  }

  /** The pose right now. */
  get pose(): Pose {
    return this.current;
  }

  /** Eased progress, 0 to 1. This is the value written to `--view-p`. */
  get progress(): number {
    return this.duration <= 0 ? 1 : EASE_SOFT(Math.min(1, this.elapsed / this.duration));
  }

  get done(): boolean {
    return this.duration <= 0 || this.elapsed >= this.duration;
  }

  /** Begin moving to `to`. A duration of 0 jumps there (reduced motion, first view). */
  start(to: Pose, durationMs: number): void {
    this.from = this.current;
    this.to = to;
    this.elapsed = 0;
    this.duration = Math.max(0, durationMs) / 1000;
    if (this.duration === 0) this.current = to;
  }

  advance(dtSeconds: number): Pose {
    if (this.done) {
      this.current = this.to;
      return this.current;
    }
    this.elapsed = Math.min(this.duration, this.elapsed + Math.max(0, dtSeconds));
    // Land exactly: `from + (to - from) * 1` can miss `to` by a rounding error.
    this.current = this.elapsed >= this.duration ? this.to : lerpPose(this.from, this.to, this.progress);
    return this.current;
  }
}
