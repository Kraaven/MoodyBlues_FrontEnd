/**
 * Parser for the MoodyBlues replay file ("MBRP", format version 3), produced by the backend's
 * Compiler/ReplayFileWriter.cs. That file's doc comment is the authoritative layout; this parser
 * follows it field for field. All values are little-endian.
 *
 * The file holds, per object, cubic Hermite keys for position / rotation / scale (already in
 * glTF space, so they apply directly to the scene GLB's nodes), a time-sorted list of lifecycle
 * events (spawn, delete, show, hide, reparent) and session markers, and the developer logs
 * written with MoodyBluesLog.
 *
 * The keys are one track section at the end of the file: per (object, channel) a run of
 * LEB128 varints holding quantized, delta-coded times and values and segment-scaled tangents. The
 * whole file is decoded in one pass.
 *
 * Every offset and count is checked against the file size, so a damaged file fails with a clear
 * ReplayFormatError instead of reading garbage.
 */

const REPLAY_FORMAT_VERSION = 3;

export class ReplayFormatError extends Error {}

export const ReplayObjectKind = {
  /** In the scene GLB from the start (includes prefab templates). */
  Scene: 0,
  /** Created during the session; the viewer clones its template. */
  Spawned: 1,
  /** A descendant of a spawned object: the clone's copy of its template node. */
  SpawnedPart: 2,
} as const;
export type ReplayObjectKind = (typeof ReplayObjectKind)[keyof typeof ReplayObjectKind];

const ReplayChannel = {
  Position: 0,
  Rotation: 1,
  Scale: 2,
} as const;
type ReplayChannel = (typeof ReplayChannel)[keyof typeof ReplayChannel];

type ReplayEventType = 'Spawn' | 'Delete' | 'Show' | 'Hide' | 'Reparent' | 'Connected' | 'Disconnected' | 'SessionEnded' | 'DataGap';

const EVENT_TYPES: Record<number, ReplayEventType> = {
  1: 'Spawn',
  2: 'Delete',
  3: 'Show',
  4: 'Hide',
  5: 'Reparent',
  16: 'Connected',
  17: 'Disconnected',
  18: 'SessionEnded',
  19: 'DataGap',
};

export interface ReplayEvent {
  /** Seconds since the start of the session. */
  time: number;
  type: ReplayEventType;
  /** Reason code for Disconnected / SessionEnded. */
  aux: number;
  objectId: number;
  /** Spawn: template object id. Reparent: new parent id (0 = scene root). Connected: connection index. */
  a: number;
  /** Spawn: parent object id (0 = scene root). */
  b: number;
}

export const LogLevel = {
  Info: 1,
  Warning: 2,
  Error: 3,
} as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/** One developer log written with MoodyBluesLog in Unity. */
export interface ReplayLog {
  /** Seconds since the start of the session. */
  time: number;
  level: LogLevel;
  /** Unity LogColor index, 0-63. See {@link logColorHex}. */
  color: number;
  text: string;
}

/**
 * Hex colours for Unity's LogColor values 0-15, in enum order: Gray, White, Red, Orange, Yellow,
 * Lime, Green, Teal, Cyan, Sky, Blue, Indigo, Violet, Pink, Rose, Brown. Indices 16-63 are
 * reserved and drawn as gray.
 */
const LOG_COLORS: readonly string[] = [
  '#a1a1aa',
  '#fafafa',
  '#f87171',
  '#fb923c',
  '#facc15',
  '#a3e635',
  '#4ade80',
  '#2dd4bf',
  '#22d3ee',
  '#38bdf8',
  '#60a5fa',
  '#818cf8',
  '#a78bfa',
  '#f472b6',
  '#fb7185',
  '#b08968',
];

export function logColorHex(color: number): string {
  return LOG_COLORS[color] ?? LOG_COLORS[0];
}

/** A Hermite curve: per key a time, a value and in/out slopes (units per second). */
export interface ReplayTrack {
  dimension: 3 | 4;
  /** Seconds since session start, strictly increasing. */
  times: Float64Array;
  values: Float32Array;
  inTangents: Float32Array;
  outTangents: Float32Array;
}

export interface ReplayObject {
  objectId: number;
  kind: ReplayObjectKind;
  /** Spawned: the template it was cloned from. Spawned part: its template node. */
  templateObjectId: number;
  /** Parent at the start of the object's life (0 = scene root). */
  initialParentObjectId: number;
  /** Spawn time in session seconds, or -1 for scene objects. */
  spawnTime: number;
  /** Time the object (or an ancestor) was deleted, or -1. */
  deleteTime: number;
  position?: ReplayTrack;
  rotation?: ReplayTrack;
  scale?: ReplayTrack;
}

export interface Replay {
  durationSeconds: number;
  endedCleanly: boolean;
  hasHardClamps: boolean;
  ignoredUnknownObjects: boolean;
  /** 0-3 = Unity SessionEndReason; null if the session ended without EndSession. */
  endReason: number | null;
  connectionCount: number;
  totalKeyCount: number;
  deltaPromotions: number;
  hardClamps: number;
  droppedEvents: number;
  objects: ReplayObject[];
  objectsById: Map<number, ReplayObject>;
  events: ReplayEvent[];
  /** Developer logs, sorted by time. */
  logs: ReplayLog[];
}

export const HEADER_SIZE = 80;
const OBJECT_ENTRY_SIZE = 20;
const EVENT_ENTRY_SIZE = 16;
const LOG_ENTRY_SIZE = 20;

/** Key times are stored as whole multiples of 1/TIME_SCALE seconds. */
const TIME_SCALE = 10000;
/** Quantization per channel: integer steps per value unit (position, rotation, scale). Tangents use the same grid. */
const VALUE_SCALE = [10000, 32768, 10000] as const;
/** The longest varint the format allows: 8 bytes = 56 bits, inside a JS safe integer after arithmetic decoding. */
const MAX_VARINT_BYTES = 8;

/** Reads LEB128 varints from the track section. Arithmetic only: values reach 2^48, past 32-bit bitwise ops. */
class VarintReader {
  private readonly bytes: Uint8Array;
  p: number;

  constructor(bytes: Uint8Array, start: number) {
    this.bytes = bytes;
    this.p = start;
  }

  get atEnd(): boolean {
    return this.p >= this.bytes.length;
  }

  byte(): number {
    if (this.p >= this.bytes.length) throw new ReplayFormatError('The replay file is damaged: the track data ends mid-value.');
    return this.bytes[this.p++];
  }

  /** Unsigned LEB128: 7 bits per byte, low group first, high bit = more bytes follow. */
  varint(): number {
    let value = 0;
    let scale = 1;
    for (let i = 0; i < MAX_VARINT_BYTES; i++) {
      const byte = this.byte();
      value += (byte & 0x7f) * scale;
      if (byte < 0x80) return value;
      scale *= 128;
    }
    throw new ReplayFormatError('The replay file is damaged: a track value is longer than 8 bytes.');
  }

  /** Zigzag-decoded varint: 0, -1, 1, -2, 2 ... are stored as 0, 1, 2, 3, 4 ... */
  zigzag(): number {
    const u = this.varint();
    return u % 2 === 0 ? u / 2 : -(u + 1) / 2;
  }
}

function readTrack(reader: VarintReader, channel: ReplayChannel, keyCount: number): ReplayTrack {
  const dim: 3 | 4 = channel === ReplayChannel.Rotation ? 4 : 3;
  const times = new Float64Array(keyCount);
  const values = new Float32Array(keyCount * dim);
  const inTangents = new Float32Array(keyCount * dim);
  const outTangents = new Float32Array(keyCount * dim);

  let q = 0;
  for (let k = 0; k < keyCount; k++) {
    q += reader.zigzag();
    times[k] = q / TIME_SCALE;
    if (k > 0 && times[k] <= times[k - 1]) throw new ReplayFormatError('The replay file is damaged: a track\'s key times do not increase.');
  }

  const valueScale = VALUE_SCALE[channel];
  for (let c = 0; c < dim; c++) {
    q = 0;
    for (let k = 0; k < keyCount; k++) {
      q += reader.zigzag();
      values[k * dim + c] = q / valueScale;
    }
  }

  // A tangent is stored as the value change it contributes over its own segment (slope * dt).
  // The first key's in-tangent and the last key's out-tangent bound no segment and stay 0.
  for (let c = 0; c < dim; c++) {
    for (let k = 0; k < keyCount; k++) {
      if (k > 0) inTangents[k * dim + c] = reader.zigzag() / valueScale / (times[k] - times[k - 1]);
      if (k < keyCount - 1) outTangents[k * dim + c] = reader.zigzag() / valueScale / (times[k + 1] - times[k]);
    }
  }

  return { dimension: dim, times, values, inTangents, outTangents };
}

export function parseReplay(buffer: ArrayBuffer): Replay {
  const size = buffer.byteLength;
  const view = new DataView(buffer);

  /** Throws unless [offset, offset + length) lies inside the file. */
  const need = (offset: number, length: number, what: string) => {
    if (!Number.isFinite(offset) || offset < 0 || length < 0 || offset + length > size) {
      throw new ReplayFormatError(`The replay file is damaged: ${what} lies outside the file.`);
    }
  };

  if (size < 4 || String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)) !== 'MBRP') {
    throw new ReplayFormatError('This is not a MoodyBlues replay file.');
  }
  need(0, HEADER_SIZE, 'the header');

  const version = view.getUint16(4, true);
  if (version !== REPLAY_FORMAT_VERSION) {
    throw new ReplayFormatError(
      `This replay uses format ${version}; this viewer reads format ${REPLAY_FORMAT_VERSION}. Rebuild the replay from the session's menu.`,
    );
  }

  const flags = view.getUint16(6, true);
  const durationSeconds = view.getFloat64(8, true);
  const objectCount = view.getUint32(20, true);
  const eventCount = view.getUint32(24, true);
  const trackCount = view.getUint32(28, true);
  const objectTableOffset = view.getUint32(32, true);
  const eventTableOffset = view.getUint32(36, true);
  const trackDataOffset = view.getUint32(40, true);
  const endReasonByte = view.getUint8(60);
  const logCount = view.getUint32(64, true);
  const logTableOffset = view.getUint32(68, true);
  const stringDataOffset = view.getUint32(72, true);
  const stringDataLength = view.getUint32(76, true);

  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) throw new ReplayFormatError('The replay file is damaged: invalid duration.');
  need(objectTableOffset, objectCount * OBJECT_ENTRY_SIZE, 'the object table');
  need(eventTableOffset, eventCount * EVENT_ENTRY_SIZE, 'the event table');
  need(logTableOffset, logCount * LOG_ENTRY_SIZE, 'the log table');
  need(stringDataOffset, stringDataLength, 'the log text');
  need(trackDataOffset, 0, 'the track data');

  const objects: ReplayObject[] = [];
  const objectsById = new Map<number, ReplayObject>();
  for (let i = 0; i < objectCount; i++) {
    const o = objectTableOffset + i * OBJECT_ENTRY_SIZE;
    const kind = view.getUint8(o + 2);
    const obj: ReplayObject = {
      objectId: view.getUint16(o, true),
      kind: (kind <= 2 ? kind : ReplayObjectKind.Scene) as ReplayObjectKind,
      templateObjectId: view.getUint16(o + 4, true),
      initialParentObjectId: view.getUint16(o + 6, true),
      spawnTime: view.getFloat64(o + 8, true),
      deleteTime: view.getFloat32(o + 16, true),
    };
    objects.push(obj);
    objectsById.set(obj.objectId, obj);
  }

  const events: ReplayEvent[] = [];
  for (let i = 0; i < eventCount; i++) {
    const o = eventTableOffset + i * EVENT_ENTRY_SIZE;
    const type = EVENT_TYPES[view.getUint8(o + 8)];
    if (!type) continue; // forward compatibility: ignore event types this viewer doesn't know
    events.push({
      time: view.getFloat64(o, true),
      type,
      aux: view.getUint8(o + 9),
      objectId: view.getUint16(o + 10, true),
      a: view.getUint16(o + 12, true),
      b: view.getUint16(o + 14, true),
    });
  }

  const logs: ReplayLog[] = [];
  const decoder = new TextDecoder('utf-8');
  for (let i = 0; i < logCount; i++) {
    const o = logTableOffset + i * LOG_ENTRY_SIZE;
    const level = view.getUint8(o + 8);
    const textOffset = view.getUint32(o + 12, true);
    const textLength = view.getUint32(o + 16, true);
    if (textOffset + textLength > stringDataLength) throw new ReplayFormatError('The replay file is damaged: a log points outside the log text.');
    logs.push({
      time: view.getFloat64(o, true),
      level: (level >= 1 && level <= 3 ? level : LogLevel.Info) as LogLevel,
      color: view.getUint8(o + 9),
      text: decoder.decode(new Uint8Array(buffer, stringDataOffset + textOffset, textLength)),
    });
  }

  const reader = new VarintReader(new Uint8Array(buffer), trackDataOffset);
  let lastTrackKey = -1;
  for (let t = 0; t < trackCount; t++) {
    const objectId = reader.varint();
    const channel = reader.byte();
    if (channel > ReplayChannel.Scale) throw new ReplayFormatError(`The replay file is damaged: unknown channel ${channel}.`);
    const trackKey = objectId * 4 + channel;
    if (trackKey <= lastTrackKey) throw new ReplayFormatError('The replay file is damaged: tracks are duplicated or out of order.');
    lastTrackKey = trackKey;
    const keyCount = reader.varint();
    if (keyCount === 0) throw new ReplayFormatError('The replay file is damaged: a track has no keys.');
    // Every key costs at least one byte per time, value and tangent, so a count past that is a lie (and would allocate garbage).
    const dim = channel === ReplayChannel.Rotation ? 4 : 3;
    if (keyCount * (1 + 3 * dim) - 2 * dim > size - reader.p) throw new ReplayFormatError('The replay file is damaged: a track has more keys than the file holds.');

    const track = readTrack(reader, channel as ReplayChannel, keyCount);
    const obj = objectsById.get(objectId);
    if (!obj) continue;
    if (channel === ReplayChannel.Position) obj.position = track;
    else if (channel === ReplayChannel.Rotation) obj.rotation = track;
    else obj.scale = track;
  }
  if (!reader.atEnd) throw new ReplayFormatError('The replay file is damaged: unexpected bytes after the last track.');

  return {
    durationSeconds,
    endedCleanly: (flags & 1) !== 0,
    hasHardClamps: (flags & 2) !== 0,
    ignoredUnknownObjects: (flags & 4) !== 0,
    endReason: endReasonByte === 255 ? null : endReasonByte,
    connectionCount: view.getUint16(62, true),
    totalKeyCount: view.getUint32(44, true),
    deltaPromotions: view.getUint32(48, true),
    hardClamps: view.getUint32(52, true),
    droppedEvents: view.getUint32(56, true),
    objects,
    objectsById,
    events,
    logs,
  };
}
