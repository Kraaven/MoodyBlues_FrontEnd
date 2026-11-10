import type { Replay } from './replayFile';
import { LogLevel } from './replayFile';

/**
 * The shape of a session as a miniature timeline (DESIGN.md 7.6): where the motion is, and where the
 * errors, warnings, spawns and gaps fall. Every position is a fraction of the session, 0 to 1.
 */
export interface GlyphTimeline {
  /** Keyframe activity in equal buckets, each 0 to 1. */
  activity: number[];
  errors: number[];
  warnings: number[];
  spawns: number[];
  /** Spans with no data (disconnects, data gaps): [start, end]. */
  gaps: [number, number][];
}

export const GLYPH_BINS = 48;
/** A data gap is a moment, not a span; it is drawn this wide so it can be seen. */
const DATA_GAP_WIDTH = 0.006;

export function computeGlyphTimeline(replay: Replay, bins = GLYPH_BINS): GlyphTimeline {
  const total = replay.durationSeconds;
  const empty: GlyphTimeline = { activity: new Array<number>(bins).fill(0), errors: [], warnings: [], spawns: [], gaps: [] };
  if (!(total > 0)) return empty;

  const fraction = (seconds: number) => Math.min(1, Math.max(0, seconds / total));
  const counts = new Array<number>(bins).fill(0);
  for (const object of replay.objects) {
    for (const track of [object.position, object.rotation, object.scale]) {
      if (!track) continue;
      for (let i = 0; i < track.times.length; i++) counts[Math.min(bins - 1, Math.floor(fraction(track.times[i]) * bins))]++;
    }
  }
  const peak = Math.max(1, ...counts);
  // The square root keeps a few very busy moments from flattening everything else.
  const activity = counts.map((c) => Math.sqrt(c / peak));

  const errors: number[] = [];
  const warnings: number[] = [];
  for (const log of replay.logs) {
    if (log.level === LogLevel.Error) errors.push(fraction(log.time));
    else if (log.level === LogLevel.Warning) warnings.push(fraction(log.time));
  }

  const spawns: number[] = [];
  const gaps: [number, number][] = [];
  let down: number | null = null;
  for (const event of replay.events) {
    if (event.type === 'Spawn') spawns.push(fraction(event.time));
    else if (event.type === 'DataGap') gaps.push([fraction(event.time), Math.min(1, fraction(event.time) + DATA_GAP_WIDTH)]);
    // The disconnect that ends a session is its normal end, not a gap.
    else if (event.type === 'Disconnected' && event.time < total - 0.05) down = event.time;
    else if (event.type === 'Connected' && down !== null) {
      gaps.push([fraction(down), fraction(event.time)]);
      down = null;
    }
  }

  return { activity, errors, warnings, spawns, gaps };
}
