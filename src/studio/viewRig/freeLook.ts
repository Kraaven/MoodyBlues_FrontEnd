import { Spring } from './springs';

export const MAX_YAW = (60 * Math.PI) / 180;
export const MAX_PITCH = (40 * Math.PI) / 180;
/** Roughly how long the view takes to settle back (the spring's own settling is about three times this). */
const RETURN_SMOOTH_TIME = 0.2;

/**
 * First person's "free look, springs back": the viewer can turn the view a little away from the
 * recorded one while dragging, within a limit; on release it eases back. Angles are relative to the
 * recorded view (yaw about the world's up, pitch about the camera's own right).
 */
export class FreeLook {
  readonly yaw = new Spring();
  readonly pitch = new Spring();
  held = false;

  /** A drag of (dx, dy) in radians of view: dragging right turns the view left, as if grabbing the world. */
  drag(dx: number, dy: number): void {
    this.held = true;
    this.yaw.snap(Math.min(MAX_YAW, Math.max(-MAX_YAW, this.yaw.value + dx)));
    this.pitch.snap(Math.min(MAX_PITCH, Math.max(-MAX_PITCH, this.pitch.value + dy)));
  }

  release(): void {
    this.held = false;
  }

  /** Ease back while not held. */
  step(dt: number): void {
    if (this.held) return;
    this.yaw.step(0, RETURN_SMOOTH_TIME, dt);
    this.pitch.step(0, RETURN_SMOOTH_TIME, dt);
    if (this.settled) {
      this.yaw.snap(0);
      this.pitch.snap(0);
    }
  }

  /** Back on the recorded view and not being dragged. */
  get settled(): boolean {
    return !this.held && this.yaw.settled(0, 1e-3) && this.pitch.settled(0, 1e-3);
  }
}
