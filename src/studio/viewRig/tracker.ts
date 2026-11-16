import * as THREE from 'three';
import { Spring3 } from './springs';

const SMOOTH_TIME = 0.2;

/**
 * Follow selected: the orbit target eases towards the object instead of being glued to it. What it
 * returns is how far the target moved this frame; the caller moves the camera by the same amount, so
 * whatever the user did with the orbit (angle, distance, a pan) is kept.
 */
export class ObjectTracker {
  private readonly spring = new Spring3();
  private readonly before = new THREE.Vector3();
  private readonly shift = new THREE.Vector3();
  private seeded = false;
  moving = false;

  reset(): void {
    this.seeded = false;
    this.moving = false;
  }

  step(goal: THREE.Vector3, target: THREE.Vector3, dt: number, reduced: boolean): THREE.Vector3 {
    if (!this.seeded) {
      this.spring.snap(target);
      this.seeded = true;
    }
    this.before.copy(this.spring.value);
    this.spring.step(goal, reduced ? 0 : SMOOTH_TIME, dt);
    this.moving = !this.spring.settled(goal, 1e-3);
    return this.shift.copy(this.spring.value).sub(this.before);
  }
}
