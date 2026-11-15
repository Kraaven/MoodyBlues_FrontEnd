import { describe, expect, it } from 'vitest';
import { HEADER_SIZE, LogLevel, parseReplay, ReplayFormatError, ReplayObjectKind } from './replayFile';
import { toStrictFloat32Times } from './replayTracks';
import { nextLogTime, previousLogTime } from '../../player/logNav';
import { buildReplay, HEADER_SIZE as TEST_HEADER_SIZE } from './testReplay';

describe('parseReplay', () => {
  it('reads objects, events, logs and joins tracks across blocks, dropping lead-ins', () => {
    const buffer = buildReplay({
      duration: 90,
      objects: [
        { id: 1, kind: ReplayObjectKind.Scene },
        { id: 10, kind: ReplayObjectKind.Spawned, template: 3, spawn: 5 },
        { id: 11, kind: ReplayObjectKind.SpawnedPart, template: 4, parent: 10, spawn: 5, del: 70 },
      ],
      events: [
        { time: 5, type: 1, objectId: 10, a: 3 },
        { time: 70, type: 2, objectId: 11 },
      ],
      logs: [
        { time: 1, level: 1, color: 0, text: 'hello' },
        { time: 2, level: 3, color: 2, text: 'naïve ✓' },
      ],
      blocks: [
        { start: 0, tracks: [{ objectId: 1, channel: 0, times: [0, 30], values: [0, 0, 0, 1, 0, 0] }] },
        { start: 60, tracks: [{ objectId: 1, channel: 0, leadIn: true, times: [30, 75], values: [1, 0, 0, 2, 0, 0] }] },
      ],
    });

    const replay = parseReplay(buffer);
    expect(replay.durationSeconds).toBe(90);
    expect(replay.endedCleanly).toBe(true);
    expect(replay.endReason).toBeNull();
    expect(replay.objects.map((o) => o.kind)).toEqual([0, 1, 2]);
    expect(replay.objectsById.get(11)?.initialParentObjectId).toBe(10);
    expect(replay.objectsById.get(11)?.deleteTime).toBe(70);
    expect(replay.events.map((e) => e.type)).toEqual(['Spawn', 'Delete']);
    expect(replay.logs).toEqual([
      { time: 1, level: LogLevel.Info, color: 0, text: 'hello' },
      { time: 2, level: LogLevel.Error, color: 2, text: 'naïve ✓' },
    ]);

    const track = replay.objectsById.get(1)?.position;
    expect(Array.from(track!.times)).toEqual([0, 30, 75]);
    expect(Array.from(track!.values)).toEqual([0, 0, 0, 1, 0, 0, 2, 0, 0]);
  });

  it('rejects other formats with a clear message', () => {
    expect(() => parseReplay(buildReplay({ version: 1 }))).toThrow(/format 1/);
    expect(() => parseReplay(new TextEncoder().encode('nope').buffer)).toThrow(ReplayFormatError);
  });

  it('rejects truncated files', () => {
    const full = buildReplay({ objects: [{ id: 1, kind: 0 }], logs: [{ time: 0, level: 1, color: 0, text: 'x' }] });
    expect(() => parseReplay(full.slice(0, 40))).toThrow(/header/);
    expect(() => parseReplay(full.slice(0, HEADER_SIZE + 10))).toThrow(ReplayFormatError);
  });

  it('rejects tables that point outside the file', () => {
    const buffer = buildReplay({ objects: [{ id: 1, kind: 0 }] });
    new DataView(buffer).setUint32(32, 1_000_000, true);
    expect(() => parseReplay(buffer)).toThrow(/object table/);
  });

  it('rejects a track that overruns its block', () => {
    const buffer = buildReplay({ blocks: [{ start: 0, tracks: [{ objectId: 1, channel: 0, times: [0], values: [0, 0, 0] }] }] });
    const v = new DataView(buffer);
    const blockOffset = v.getUint32(v.getUint32(40, true) + 8, true);
    v.setUint32(blockOffset + 8 + 4, 9999, true); // keyCount
    expect(() => parseReplay(buffer)).toThrow(/overruns/);
  });
});

describe('toStrictFloat32Times', () => {
  it('keeps times strictly increasing after float32 rounding', () => {
    const t = 3600 * 5;
    const out = toStrictFloat32Times(Float64Array.from([t, t + 1e-5, t + 2e-5]));
    expect(out[1]).toBeGreaterThan(out[0]);
    expect(out[2]).toBeGreaterThan(out[1]);
  });
});

describe('log navigation', () => {
  const logs = [
    { time: 1, level: LogLevel.Info, color: 0, text: '' },
    { time: 2, level: LogLevel.Error, color: 2, text: '' },
    { time: 3, level: LogLevel.Info, color: 0, text: '' },
  ];

  it('moves to the next and previous log, past the one under the playhead', () => {
    expect(nextLogTime(logs, 1)).toBe(2);
    expect(previousLogTime(logs, 2)).toBe(1);
    expect(nextLogTime(logs, 3)).toBe(3);
  });

  it('can skip to errors only', () => {
    expect(nextLogTime(logs, 0, true)).toBe(2);
    expect(previousLogTime(logs, 3, true)).toBe(2);
  });
});
describe('testReplay helper', () => {
  it('uses the same header size as the parser', () => {
    expect(TEST_HEADER_SIZE).toBe(HEADER_SIZE);
  });
});
