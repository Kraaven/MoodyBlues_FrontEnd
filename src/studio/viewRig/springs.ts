import * as THREE from 'three';

/** An angle brought into (-PI, PI]. */
export function wrapAngle(angle: number): number {
  const turn = Math.PI * 2;
  let a = (angle + Math.PI) % turn;
  if (a <= 0) a += turn;
  return a - Math.PI;
}

/**
 * A critically damped spring: it reaches its goal without overshoot, and the closed-form step gives
 * the same result however the time is cut into frames (one step of 1 s equals sixty of 1/60 s).
 * `smoothTime` is roughly how long it takes to close most of the gap; 0 snaps.
 */
export class Spring {
  value: number;
  velocity = 0;

  constructor(value = 0) {
    this.value = value;
  }

  step(goal: number, smoothTime: number, dt: number): number {
    if (smoothTime <= 1e-4) {
      this.snap(goal);
      return this.value;
    }
    if (dt <= 0) return this.value;
    const omega = 2 / smoothTime;
    const decay = Math.exp(-omega * dt);
    const gap = this.value - goal;
    const carry = this.velocity + omega * gap;
    this.value = goal + (gap + carry * dt) * decay;
    this.velocity = (this.velocity - omega * carry * dt) * decay;
    return this.value;
  }

  snap(value: number): void {
    this.value = value;
    this.velocity = 0;
  }

  settled(goal: number, tolerance: number): boolean {
    return Math.abs(this.value - goal) < tolerance && Math.abs(this.velocity) < tolerance;
  }
}

/** A spring on an angle: it takes the short way round, so a half turn never snaps or spins twice. */
export class AngleSpring extends Spring {
  override step(goal: number, smoothTime: number, dt: number): number {
    super.step(this.value + wrapAngle(goal - this.value), smoothTime, dt);
    if (Math.abs(this.value) > Math.PI * 4) this.value = wrapAngle(this.value);
    return this.value;
  }

  override settled(goal: number, tolerance: number): boolean {
    return Math.abs(wrapAngle(this.value - goal)) < tolerance && Math.abs(this.velocity) < tolerance;
  }
}

/** One spring per axis. */
export class Spring3 {
  readonly x = new Spring();
  readonly y = new Spring();
  readonly z = new Spring();
  /** The current value; read it, do not write it. */
  readonly value = new THREE.Vector3();

  step(goal: THREE.Vector3, smoothTime: number, dt: number): THREE.Vector3 {
    return this.value.set(this.x.step(goal.x, smoothTime, dt), this.y.step(goal.y, smoothTime, dt), this.z.step(goal.z, smoothTime, dt));
  }

  snap(to: THREE.Vector3): void {
    this.x.snap(to.x);
    this.y.snap(to.y);
    this.z.snap(to.z);
    this.value.copy(to);
  }

  settled(goal: THREE.Vector3, tolerance: number): boolean {
    return this.x.settled(goal.x, tolerance) && this.y.settled(goal.y, tolerance) && this.z.settled(goal.z, tolerance);
  }
}
