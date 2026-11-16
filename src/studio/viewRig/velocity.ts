import * as THREE from 'three';

/** Smoothing time of the velocity estimate, in seconds of recording. */
const TAU = 0.25;
/** A jump in recording time bigger than this between two samples is a seek, not playback. */
const MAX_STEP = 0.2;

/**
 * The velocity of something that moves with a recording, from its positions over recording time
 * only. The estimate is smoothed over recording time (not wall time), so it does not depend on the
 * frame rate or the speed; scrubbing backwards gives the same velocity as playing forwards, because
 * both the distance and the time step are negative. A paused clock keeps the last estimate, and a
 * seek restarts the measurement from the new position without touching the estimate, so nothing
 * lurches when the playhead is dragged.
 */
export class VelocityEstimator {
  readonly velocity = new THREE.Vector3();
  private readonly last = new THREE.Vector3();
  private readonly instant = new THREE.Vector3();
  private lastTime = 0;
  private started = false;

  /** The next sample is not continuous with the last. */
  rebase(): void {
    this.started = false;
  }

  /** Forget everything, the estimate included. */
  reset(): void {
    this.started = false;
    this.velocity.set(0, 0, 0);
  }

  update(time: number, position: THREE.Vector3): void {
    if (!this.started) {
      this.started = true;
    } else {
      const dt = time - this.lastTime;
      if (Math.abs(dt) >= 1e-5 && Math.abs(dt) <= MAX_STEP) {
        this.instant.copy(position).sub(this.last).divideScalar(dt);
        this.velocity.lerp(this.instant, 1 - Math.exp(-Math.abs(dt) / TAU));
      } else if (Math.abs(dt) > MAX_STEP) {
        // A seek; the estimate stays, the measurement restarts from here.
      } else {
        return;
      }
    }
    this.lastTime = time;
    this.last.copy(position);
  }
}
