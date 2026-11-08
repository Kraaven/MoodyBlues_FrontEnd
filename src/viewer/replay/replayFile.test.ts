import { describe, expect, it } from 'vitest';
import { HEADER_SIZE, LogLevel, parseReplay, ReplayFormatError, ReplayObjectKind } from './replayFile';
import { toStrictFloat32Times } from './replayTracks';
import { nextLogTime, previousLogTime } from '../../player/logNav';

interface TestTrack {
  objectId: number;
  channel: 0 | 1 | 2;
  leadIn?: boolean;
  times: number[];
  values: number[];
}

interface TestFile {
  version?: number;
  duration?: number;
  objects?: { id: number; kind: number; template?: number; parent?: number; spawn?: number; del?: number }[];
  events?: { time: number; type: number; objectId: number; a?: number }[];
  logs?: { time: number; level: number; color: number; text: string }[];
  blocks?: { start: number; tracks: TestTrack[] }[];
}

/** Writes a replay file the way the backend's ReplayFileWriter does (format 2). */
function buildReplay(f: TestFile): ArrayBuffer {
  const objects = f.objects ?? [];
  const events = f.events ?? [];
  const logs = f.logs ?? [];
  const blocks = f.blocks ?? [];
  const encoder = new TextEncoder();
  const texts = logs.map((l) => encoder.encode(l.text));
  const stringLength = texts.reduce((n, t) => n + t.length, 0);
  const paddedStrings = Math.ceil(stringLength / 4) * 4;

  const blockBytes = blocks.map((b) => {
    let size = 8;
    for (const t of b.tracks) {
      const dim = t.channel === 1 ? 4 : 3;
      size += 8 + t.times.length * 4 + t.times.length * dim * 4 * 3;
    }
    const buf = new ArrayBuffer(size);
    const v = new DataView(buf);
    v.setUint32(0, b.tracks.length, true);
    let p = 8;
    for (const t of b.tracks) {
      const dim = t.channel === 1 ? 4 : 3;
      const n = t.times.length;
      v.setUint16(p, t.objectId, true);
      v.setUint8(p + 2, t.channel);
      v.setUint8(p + 3, t.leadIn ? 1 : 0);
      v.setUint32(p + 4, n, true);
      p += 8;
      for (const time of t.times) {
        v.setFloat32(p, time - b.start, true);
        p += 4;
      }
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < n * dim; i++) {
          v.setFloat32(p, pass === 0 ? t.values[i] : 0, true);
          p += 4;
        }
      }
    }
    return new Uint8Array(buf);
  });

  const objectTable = HEADER_SIZE;
  const eventTable = objectTable + objects.length * 20;
  const logTable = eventTable + events.length * 16;
  const stringData = logTable + logs.length * 20;
  const blockIndex = stringData + paddedStrings;
  let blockStart = blockIndex + blocks.length * 16;
  const total = blockStart + blockBytes.reduce((n, b) => n + b.length, 0);

  const buffer = new ArrayBuffer(total);
  const v = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  u8.set(encoder.encode('MBRP'), 0);
  v.setUint16(4, f.version ?? 2, true);
  v.setUint16(6, 1, true);
  v.setFloat64(8, f.duration ?? 10, true);
  v.setFloat32(16, 60, true);
  v.setUint32(20, objects.length, true);
  v.setUint32(24, events.length, true);
  v.setUint32(28, blocks.length, true);
  v.setUint32(32, objectTable, true);
  v.setUint32(36, eventTable, true);
  v.setUint32(40, blockIndex, true);
  v.setUint8(60, 255);
  v.setUint16(62, 1, true);
  v.setUint32(64, logs.length, true);
  v.setUint32(68, logTable, true);
  v.setUint32(72, stringData, true);
  v.setUint32(76, stringLength, true);

  objects.forEach((o, i) => {
    const p = objectTable + i * 20;
    v.setUint16(p, o.id, true);
    v.setUint8(p + 2, o.kind);
    v.setUint16(p + 4, o.template ?? 0, true);
    v.setUint16(p + 6, o.parent ?? 0, true);
    v.setFloat64(p + 8, o.spawn ?? -1, true);
    v.setFloat32(p + 16, o.del ?? -1, true);
  });
  events.forEach((e, i) => {
    const p = eventTable + i * 16;
    v.setFloat64(p, e.time, true);
    v.setUint8(p + 8, e.type);
    v.setUint16(p + 10, e.objectId, true);
    v.setUint16(p + 12, e.a ?? 0, true);
  });
  let textOffset = 0;
  logs.forEach((l, i) => {
    const p = logTable + i * 20;
    v.setFloat64(p, l.time, true);
    v.setUint8(p + 8, l.level);
    v.setUint8(p + 9, l.color);
    v.setUint32(p + 12, textOffset, true);
    v.setUint32(p + 16, texts[i].length, true);
    u8.set(texts[i], stringData + textOffset);
    textOffset += texts[i].length;
  });
  blocks.forEach((b, i) => {
    const p = blockIndex + i * 16;
    v.setFloat64(p, b.start, true);
    v.setUint32(p + 8, blockStart, true);
    v.setUint32(p + 12, blockBytes[i].length, true);
    u8.set(blockBytes[i], blockStart);
    blockStart += blockBytes[i].length;
  });
  return buffer;
}

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
