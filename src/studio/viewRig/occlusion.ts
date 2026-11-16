/** How far short of an obstacle the view stops, in metres. */
export const ARM_MARGIN = 0.3;
/**
 * The view never comes in closer than this share of its distance, or this many metres if that is more
 * (and never more than the distance itself). Closer than that the player is shown through the
 * obstruction instead (see occluderFade.ts).
 */
const MIN_SHARE = 0.6;
const MIN_METRES = 3;
/** Seconds the arm takes to come in (fast: the view must not sit inside a wall) and to go back out (slow: no pumping). */
const IN_TIME = 0.08;
const OUT_TIME = 0.7;
/** The own side must be blocked this long, and the last switch this long ago, before Front changes side. */
const BLOCKED_FOR = 0.35;
const SWITCH_EVERY = 1.5;

/**
 * Spring arm: the share (0 to 1) of the view's distance to keep, given where a ray from what it looks
 * at toward where it would stand first hits something (null: nothing in the way).
 */
export function armShare(hit: number | null, distance: number): number {
  if (hit === null || distance < 1e-6) return 1;
  return Math.min(1, Math.max(armFloor(distance), (hit - ARM_MARGIN) / distance));
}

/** The smallest share of `distance` the arm may keep. */
export function armFloor(distance: number): number {
  return Math.min(1, Math.max(MIN_SHARE, MIN_METRES / distance));
}

/** The obstruction is closer than the arm may come in: the view stays at its floor and sees through what is in the way. */
export function armSqueezed(hit: number | null, distance: number): boolean {
  return hit !== null && distance >= 1e-6 && (hit - ARM_MARGIN) / distance < armFloor(distance);
}

/** Eases the share towards its goal: in quickly, out slowly, the same at any frame rate. */
export function stepArm(current: number, goal: number, dt: number): number {
  const time = goal < current ? IN_TIME : OUT_TIME;
  return goal + (current - goal) * Math.exp(-dt / time);
}

/**
 * Front's choice between its two sides when the tree is in the way: it keeps its side until that one
 * has been blocked for a moment while the other is clear, and then changes at most every few seconds,
 * so passing a trunk or a flickering gap never makes it swing back and forth. With both blocked it
 * stays (the arm pulls in instead).
 */
export class SideChooser {
  private blockedFor = 0;
  private sinceSwitch = Infinity;

  /** True when the side should change. */
  update(dt: number, ownBlocked: boolean, otherBlocked: boolean): boolean {
    this.sinceSwitch += dt;
    this.blockedFor = ownBlocked && !otherBlocked ? this.blockedFor + dt : 0;
    if (this.blockedFor >= BLOCKED_FOR && this.sinceSwitch >= SWITCH_EVERY) {
      this.blockedFor = 0;
      this.sinceSwitch = 0;
      return true;
    }
    return false;
  }

  reset(): void {
    this.blockedFor = 0;
    this.sinceSwitch = Infinity;
  }
}
