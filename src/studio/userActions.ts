import { isLocked } from '../share/shareSettings';
import type { Playback } from './playback';
import { useStudio } from './studioStore';

/**
 * What the person watching does to the clock: the scrub bar, the skip buttons, a click on a log,
 * the seek keys, the speed menu. On a share link the owner can lock these, and every one of them
 * comes through here so none can slip past. The page's own moves (the intro, the start time) use
 * the {@link Playback} directly.
 */

/** Moves the playhead, unless the owner locked seeking. */
export function seekByUser(playback: Playback, time: number): void {
  if (isLocked(useStudio.getState().share, 'seeking')) return;
  playback.seek(time);
}

/** Changes the speed, unless the owner locked it. */
export function setSpeedByUser(playback: Playback, speed: number): void {
  if (isLocked(useStudio.getState().share, 'speed')) return;
  playback.setSpeed(speed);
}
