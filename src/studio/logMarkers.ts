import type { ReplayLog } from '../viewer/replay/replayFile';

/** One timeline marker: a run of logs that land in the same pixel bin. */
export interface LogBin {
  key: number;
  /** Position along the rail, 0-1 (the most severe log's time). */
  fraction: number;
  count: number;
  /** Index into the logs array of the most severe log (the earliest of equals). */
  worst: number;
  first: number;
  last: number;
}

/**
 * Bins time-sorted logs into `binPx`-wide pixel bins, so the DOM holds at most width / binPx markers.
 * A bin is represented by its most severe log.
 */
export function binLogs(logs: readonly ReplayLog[], total: number, width: number, binPx: number): LogBin[] {
  if (total <= 0 || width <= 0 || binPx <= 0) return [];
  const out: LogBin[] = [];
  let current: LogBin | null = null;
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const fraction = Math.min(1, Math.max(0, log.time / total));
    const key = Math.floor((fraction * width) / binPx);
    if (current && current.key === key) {
      current.count++;
      current.last = i;
      if (log.level > logs[current.worst].level) {
        current.worst = i;
        current.fraction = fraction;
      }
      continue;
    }
    current = { key, fraction, count: 1, worst: i, first: i, last: i };
    out.push(current);
  }
  return out;
}
