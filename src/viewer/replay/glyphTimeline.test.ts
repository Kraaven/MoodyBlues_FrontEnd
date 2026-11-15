import { describe, expect, it } from 'vitest';
import { computeGlyphTimeline, GLYPH_BINS } from './glyphTimeline';
import { parseReplay } from './replayFile';
import { buildReplay } from './testReplay';

const keys = (times: number[]) => ({ objectId: 1, channel: 0 as const, times, values: times.flatMap(() => [0, 0, 0]) });

function replayOf(duration: number, extra: Parameters<typeof buildReplay>[0] = {}) {
  return parseReplay(buildReplay({ duration, objects: [{ id: 1, kind: 0 }], ...extra }));
}

describe('computeGlyphTimeline', () => {
  it('puts activity where the keyframes are', () => {
    const replay = replayOf(100, { blocks: [{ start: 0, tracks: [keys([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])] }] });
    const { activity } = computeGlyphTimeline(replay);
    expect(activity).toHaveLength(GLYPH_BINS);
    expect(activity[0]).toBe(1);
    expect(activity.slice(10).every((v) => v === 0)).toBe(true);
  });

  it('places logs by level as fractions of the session', () => {
    const replay = replayOf(200, {
      logs: [
        { time: 50, level: 3, color: 2, text: 'boom' },
        { time: 100, level: 2, color: 4, text: 'hmm' },
        { time: 150, level: 1, color: 0, text: 'fine' },
      ],
    });
    const t = computeGlyphTimeline(replay);
    expect(t.errors).toEqual([0.25]);
    expect(t.warnings).toEqual([0.5]);
  });

  it('marks spawns, and turns a disconnect followed by a reconnect into a gap', () => {
    const replay = replayOf(100, {
      objects: [
        { id: 1, kind: 0 },
        { id: 2, kind: 1, template: 1, spawn: 20, del: -1 },
      ],
      events: [
        { time: 20, type: 1, objectId: 2, a: 1 },
        { time: 40, type: 17, objectId: 0 },
        { time: 60, type: 16, objectId: 0, a: 1 },
      ],
    });
    const t = computeGlyphTimeline(replay);
    expect(t.spawns).toEqual([0.2]);
    expect(t.gaps).toEqual([[0.4, 0.6]]);
  });

  it('draws a data gap as a thin mark, and ignores the disconnect that simply ends the session', () => {
    const replay = replayOf(100, {
      events: [
        { time: 30, type: 19, objectId: 0 },
        { time: 100, type: 17, objectId: 0 },
      ],
    });
    const t = computeGlyphTimeline(replay);
    expect(t.gaps).toHaveLength(1);
    expect(t.gaps[0][0]).toBeCloseTo(0.3);
    expect(t.gaps[0][1] - t.gaps[0][0]).toBeLessThan(0.02);
  });

  it('copes with an empty session', () => {
    const t = computeGlyphTimeline(replayOf(0));
    expect(t.errors).toEqual([]);
    expect(t.activity.every((v) => v === 0)).toBe(true);
  });
});
