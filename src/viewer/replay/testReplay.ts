import { HEADER_SIZE } from './replayFile';

interface TestTrack {
  objectId: number;
  channel: 0 | 1 | 2;
  times: number[];
  values: number[];
  /** Slopes in value per second; zero when omitted. */
  inTangents?: number[];
  outTangents?: number[];
}

interface TestFile {
  version?: number;
  duration?: number;
  objects?: { id: number; kind: number; template?: number; parent?: number; spawn?: number; del?: number }[];
  events?: { time: number; type: number; objectId: number; a?: number }[];
  logs?: { time: number; level: number; color: number; text: string }[];
  tracks?: TestTrack[];
  /** Replaces the encoded track section, to build damaged files. The header's track count is then `trackCount`. */
  rawTrackData?: number[];
  trackCount?: number;
}

const TIME_SCALE = 10000;
const VALUE_SCALE = [10000, 32768, 10000];
/** Writers clamp every quantized integer to this so deltas stay inside JS safe integers. */
const QUANT_LIMIT = 2 ** 46;

const quantize = (x: number, scale: number) => Math.max(-QUANT_LIMIT, Math.min(QUANT_LIMIT, Math.round(x * scale)));

/** Unsigned LEB128, low 7 bits first, by division so it works past 32 bits. */
function writeVarint(out: number[], value: number) {
  while (value >= 128) {
    out.push((value % 128) + 128);
    value = Math.floor(value / 128);
  }
  out.push(value);
}

const writeZigzag = (out: number[], x: number) => writeVarint(out, x >= 0 ? x * 2 : -x * 2 - 1);

function writeTrack(out: number[], t: TestTrack) {
  const dim = t.channel === 1 ? 4 : 3;
  const n = t.times.length;
  writeVarint(out, t.objectId);
  out.push(t.channel);
  writeVarint(out, n);

  let last = 0;
  for (const time of t.times) {
    const q = quantize(time, TIME_SCALE);
    writeZigzag(out, q - last);
    last = q;
  }
  for (let c = 0; c < dim; c++) {
    last = 0;
    for (let k = 0; k < n; k++) {
      const q = quantize(t.values[k * dim + c], VALUE_SCALE[t.channel]);
      writeZigzag(out, q - last);
      last = q;
    }
  }
  // Tangents are stored as slope * segment length, on the value grid, with the segment length taken from the decoded times.
  const decoded = t.times.map((time) => quantize(time, TIME_SCALE) / TIME_SCALE);
  for (let c = 0; c < dim; c++) {
    for (let k = 0; k < n; k++) {
      if (k > 0) writeZigzag(out, quantize((t.inTangents?.[k * dim + c] ?? 0) * (decoded[k] - decoded[k - 1]), VALUE_SCALE[t.channel]));
      if (k < n - 1) writeZigzag(out, quantize((t.outTangents?.[k * dim + c] ?? 0) * (decoded[k + 1] - decoded[k]), VALUE_SCALE[t.channel]));
    }
  }
}

/** Writes a replay file the way the backend's ReplayFileWriter does (format 3), for the unit tests. */
export function buildReplay(f: TestFile): ArrayBuffer {
  const objects = f.objects ?? [];
  const events = f.events ?? [];
  const logs = f.logs ?? [];
  const tracks = [...(f.tracks ?? [])].sort((a, b) => a.objectId - b.objectId || a.channel - b.channel);
  const encoder = new TextEncoder();
  const texts = logs.map((l) => encoder.encode(l.text));
  const stringLength = texts.reduce((n, t) => n + t.length, 0);
  const paddedStrings = Math.ceil(stringLength / 4) * 4;

  const trackBytes = f.rawTrackData ?? [];
  if (!f.rawTrackData) for (const t of tracks) writeTrack(trackBytes, t);

  const objectTable = HEADER_SIZE;
  const eventTable = objectTable + objects.length * 20;
  const logTable = eventTable + events.length * 16;
  const stringData = logTable + logs.length * 20;
  const trackData = stringData + paddedStrings;
  const total = trackData + trackBytes.length;

  const buffer = new ArrayBuffer(total);
  const v = new DataView(buffer);
  const u8 = new Uint8Array(buffer);
  u8.set(encoder.encode('MBRP'), 0);
  v.setUint16(4, f.version ?? 3, true);
  v.setUint16(6, 1, true);
  v.setFloat64(8, f.duration ?? 10, true);
  v.setUint32(20, objects.length, true);
  v.setUint32(24, events.length, true);
  v.setUint32(28, f.trackCount ?? tracks.length, true);
  v.setUint32(32, objectTable, true);
  v.setUint32(36, eventTable, true);
  v.setUint32(40, trackData, true);
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
  u8.set(trackBytes, trackData);
  return buffer;
}
