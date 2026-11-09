/**
 * Writes a replay file the way the backend's ReplayFileWriter does (format 2). Used by the unit tests
 * and by the dev fixture generator (dev/make-fixture.ts), so it must stay free of runtime imports and
 * use only syntax Node can strip.
 */

/** Same value as HEADER_SIZE in replayFile.ts; a test asserts they match. */
export const HEADER_SIZE = 80;

export interface TestTrack {
  objectId: number;
  channel: 0 | 1 | 2;
  leadIn?: boolean;
  times: number[];
  values: number[];
  /** Slopes in value per second; zero when omitted. */
  inTangents?: number[];
  outTangents?: number[];
}

export interface TestFile {
  version?: number;
  duration?: number;
  objects?: { id: number; kind: number; template?: number; parent?: number; spawn?: number; del?: number }[];
  events?: { time: number; type: number; objectId: number; a?: number }[];
  logs?: { time: number; level: number; color: number; text: string }[];
  blocks?: { start: number; tracks: TestTrack[] }[];
}

export function buildReplay(f: TestFile): ArrayBuffer {
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
          const source = pass === 0 ? t.values : pass === 1 ? t.inTangents : t.outTangents;
          v.setFloat32(p, source?.[i] ?? 0, true);
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

