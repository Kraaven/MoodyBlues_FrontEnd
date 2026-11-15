import { describe, expect, it } from 'vitest';
import { LogLevel, type ReplayLog } from '../viewer/replay/replayFile';
import { binLogs } from './logMarkers';

const log = (time: number, level: ReplayLog['level'] = LogLevel.Info): ReplayLog => ({ time, level, color: 0, text: 't' });

describe('binLogs', () => {
  it('returns nothing without a size', () => {
    expect(binLogs([log(1)], 0, 100, 4)).toEqual([]);
    expect(binLogs([log(1)], 10, 0, 4)).toEqual([]);
  });

  it('keeps distant logs apart', () => {
    const bins = binLogs([log(0), log(5), log(10)], 10, 100, 4);
    expect(bins.map((b) => b.count)).toEqual([1, 1, 1]);
    expect(bins[2].fraction).toBe(1);
  });

  it('merges logs in the same bin and picks the most severe', () => {
    const logs = [log(0.9), log(1.0, LogLevel.Error), log(1.1, LogLevel.Warning), log(9)];
    const bins = binLogs(logs, 10, 100, 4);
    expect(bins).toHaveLength(2);
    expect(bins[0]).toMatchObject({ count: 3, worst: 1, first: 0, last: 2 });
    expect(bins[0].fraction).toBeCloseTo(0.1);
  });

  it('bounds the bin count for dense logs', () => {
    const logs = Array.from({ length: 5000 }, (_, i) => log(i / 500));
    expect(binLogs(logs, 10, 400, 4).length).toBeLessThanOrEqual(100);
  });
});
