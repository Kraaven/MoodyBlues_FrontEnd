import { describe, expect, it } from 'vitest';
import { HEADER_SIZE, LogLevel, parseReplay, ReplayFormatError, ReplayObjectKind, type ReplayTrack } from './replayFile';
import { toStrictFloat32Times } from './replayTracks';
import { nextLogTime, previousLogTime } from '../../studio/logNav';
import { buildReplay } from './testReplay';

/** Checks tangent * segment length against the expected slopes, within one step of the value grid. */
function expectTangents(track: ReplayTrack, ins: number[], outs: number[], grid: number) {
  const dim = track.dimension;
  const n = track.times.length;
  for (let k = 0; k < n; k++) {
    for (let c = 0; c < dim; c++) {
      const i = k * dim + c;
      const inDt = k > 0 ? track.times[k] - track.times[k - 1] : 0;
      const outDt = k < n - 1 ? track.times[k + 1] - track.times[k] : 0;
      expect(Math.abs((track.inTangents[i] - (k > 0 ? ins[i] : 0)) * inDt)).toBeLessThanOrEqual(1 / grid);
      expect(Math.abs((track.outTangents[i] - (k < n - 1 ? outs[i] : 0)) * outDt)).toBeLessThanOrEqual(1 / grid);
    }
  }
}

describe('parseReplay', () => {
  it('reads objects, events, logs and tracks', () => {
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
      tracks: [{ objectId: 1, channel: 0, times: [0, 30, 75], values: [0, 0, 0, 1, 0, 0, 2, 0, 0] }],
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

  it('round-trips position, rotation and scale tracks within the quantization grid', () => {
    const sqrtHalf = Math.SQRT1_2;
    const replay = parseReplay(
      buildReplay({
        objects: [
          { id: 1, kind: 0 },
          { id: 2, kind: 0 },
        ],
        tracks: [
          // Out of order on purpose: the builder sorts by (object, channel) like the writer.
          { objectId: 2, channel: 2, times: [0, 1], values: [1, 1, 1, 2, 3, 4], inTangents: [0, 0, 0, 1, 2, 3], outTangents: [1, 2, 3, 0, 0, 0] },
          {
            objectId: 1,
            channel: 1,
            times: [0.0001, 0.5, 3.25],
            values: [0, 0, 0, 1, 0, sqrtHalf, 0, sqrtHalf, 0.12345, -0.6789, 0.3, 0.6],
            inTangents: [0, 0, 0, 0, 0.1, 0.2, 0.3, 0.4, -1, -2, -3, -4],
            outTangents: [0.5, 0.25, 0.125, 0, 0.7, 0, 0, 0, 0, 0, 0, 0],
          },
          { objectId: 1, channel: 0, times: [0, 0.5, 1.5], values: [0, 0, 0, -12.3456, 7.891, 0.0003, 100.5, -200.25, 3], inTangents: [0, 0, 0, 2.5, -3.5, 0.001, 0, 0, 0], outTangents: [24.6912, -15.782, 0.0006, 0, 0, 0, 0, 0, 0] },
        ],
      }),
    );

    const position = replay.objectsById.get(1)!.position!;
    expect(position.dimension).toBe(3);
    expect(Array.from(position.times)).toEqual([0, 0.5, 1.5]);
    [0, 0, 0, -12.3456, 7.891, 0.0003, 100.5, -200.25, 3].forEach((v, i) => expect(position.values[i]).toBeCloseTo(v, 3));
    // Tangents are quantized as slope * segment length, so compare the value change they contribute over their segment.
    expectTangents(position, [0, 0, 0, 2.5, -3.5, 0.001, 0, 0, 0], [24.6912, -15.782, 0.0006, 0, 0, 0, 0, 0, 0], 1e4);

    const rotation = replay.objectsById.get(1)!.rotation!;
    expect(rotation.dimension).toBe(4);
    expect(Array.from(rotation.times)).toEqual([0.0001, 0.5, 3.25]);
    [0, 0, 0, 1, 0, sqrtHalf, 0, sqrtHalf, 0.12345, -0.6789, 0.3, 0.6].forEach((v, i) => expect(Math.abs(rotation.values[i] - v)).toBeLessThanOrEqual(1 / 32768));
    expectTangents(rotation, [0, 0, 0, 0, 0.1, 0.2, 0.3, 0.4, -1, -2, -3, -4], [0.5, 0.25, 0.125, 0, 0.7, 0, 0, 0, 0, 0, 0, 0], 32768);
    

    const scale = replay.objectsById.get(2)!.scale!;
    expect(Array.from(scale.times)).toEqual([0, 1]);
    expect(Array.from(scale.values)).toEqual([1, 1, 1, 2, 3, 4]);
    expect(Array.from(scale.inTangents)).toEqual([0, 0, 0, 1, 2, 3]);
    expect(Array.from(scale.outTangents)).toEqual([1, 2, 3, 0, 0, 0]);
    expect(replay.objectsById.get(2)!.position).toBeUndefined();
  });

  it('decodes varints and zigzag deltas across 32 bits, negatives and zero', () => {
    // Times past 2^32 ticks (1e6 s), values past 2^32 steps (1e9 m), and deltas that go back down.
    const times = [0, 1e6, 1e6 + 0.0001, 2e6];
    const xs = [0, 1e9, -1e9, 0.0001];
    const replay = parseReplay(
      buildReplay({
        objects: [{ id: 300, kind: 0 }],
        tracks: [{ objectId: 300, channel: 0, times, values: xs.flatMap((x) => [x, 5, -1 - x]) }],
      }),
    );
    const track = replay.objectsById.get(300)!.position!;
    expect(Array.from(track.times)).toEqual(times);
    expect(Array.from(track.values)).toEqual(xs.flatMap((x) => [Math.fround(x), 5, Math.fround(-1 - x)]));
  });

  it('rejects a track whose varint runs past 8 bytes', () => {
    const tooLong = [1, 0, ...new Array(9).fill(0x80), 0];
    expect(() => parseReplay(buildReplay({ rawTrackData: tooLong, trackCount: 1 }))).toThrow(/longer than 8 bytes/);
  });

  it('rejects damaged track data', () => {
    const good = { objects: [{ id: 1, kind: 0 }], tracks: [{ objectId: 1, channel: 0 as const, times: [0, 1], values: [0, 0, 0, 1, 1, 1] }] };
    const bytes = (trackCount?: number) => Array.from(new Uint8Array(buildReplay({ ...good, trackCount }).slice(HEADER_SIZE + 20)));

    expect(() => parseReplay(buildReplay({ rawTrackData: [1, 3, 1, 0], trackCount: 1 }))).toThrow(/unknown channel 3/);
    expect(() => parseReplay(buildReplay({ rawTrackData: [1, 0, 0], trackCount: 1 }))).toThrow(/no keys/);
    expect(() => parseReplay(buildReplay({ rawTrackData: [1, 0, 200, 1], trackCount: 1 }))).toThrow(/more keys than the file holds/);
    expect(() => parseReplay(buildReplay({ objects: good.objects, tracks: [{ ...good.tracks[0], times: [1, 1] }] }))).toThrow(/do not increase/);
    expect(() => parseReplay(buildReplay({ objects: good.objects, tracks: [good.tracks[0], good.tracks[0]] }))).toThrow(/duplicated or out of order/);
    expect(() => parseReplay(buildReplay({ rawTrackData: [2, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0], trackCount: 2 }))).toThrow(/duplicated or out of order/);
    expect(() => parseReplay(buildReplay({ ...good, trackCount: 2 }))).toThrow(/ends mid-value/);
    expect(() => parseReplay(buildReplay({ rawTrackData: [...bytes(), 0], trackCount: 1 }))).toThrow(/unexpected bytes/);
    expect(() => parseReplay(buildReplay({ rawTrackData: bytes().slice(0, -1), trackCount: 1 }))).toThrow(/ends mid-value/);
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
