import { LogLevel, type ReplayLog } from '../viewer/replay/replayFile';

/** Index of the last log at or before `time` (logs are sorted by time), or -1. */
export function lastIndexAtOrBefore(logs: readonly { time: number }[], time: number): number {
  let lo = 0;
  let hi = logs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (logs[mid].time <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

// A small tolerance so pressing "next" while parked on a log moves past it.
const EPSILON = 0.005;

export function nextLogTime(logs: readonly ReplayLog[], time: number, errorsOnly = false): number {
  for (let i = lastIndexAtOrBefore(logs, time + EPSILON) + 1; i < logs.length; i++) {
    if (!errorsOnly || logs[i].level === LogLevel.Error) return logs[i].time;
  }
  return time;
}

export function previousLogTime(logs: readonly ReplayLog[], time: number, errorsOnly = false): number {
  for (let i = lastIndexAtOrBefore(logs, time - EPSILON); i >= 0; i--) {
    if (!errorsOnly || logs[i].level === LogLevel.Error) return logs[i].time;
  }
  return time;
}
