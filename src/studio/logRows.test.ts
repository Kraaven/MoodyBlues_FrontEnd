import { describe, expect, it } from 'vitest';
import { LogLevel, type Replay } from '../viewer/replay/replayFile';
import { buildLogRows } from './logRows';

const replay = (logs: { time: number; level: LogLevel; color: number; text: string }[]) => ({ logs }) as unknown as Replay;

describe('buildLogRows', () => {
  it('splits a log into a title and detail and keeps the replay order and index', () => {
    const rows = buildLogRows(replay([{ time: 1.5, level: LogLevel.Warning, color: 0, text: 'Door stuck\nat frame 12\nretrying' }]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 0, time: 1.5, level: LogLevel.Warning, title: 'Door stuck', detail: 'at frame 12\nretrying' });
    expect(rows[0].search).toBe('door stuck\nat frame 12\nretrying');
  });

  it('names an empty log and gives a one-line log no detail', () => {
    const rows = buildLogRows(replay([{ time: 0, level: LogLevel.Info, color: 0, text: '' }, { time: 2, level: LogLevel.Info, color: 0, text: 'hello' }]));
    expect(rows[0].title).toBe('(empty)');
    expect(rows[1].detail).toBeNull();
    expect(rows[1].id).toBe(1);
  });
});
