import * as THREE from 'three';

/**
 * Binary event-log wire format (lifecycle events only, types 24–28).
 * Matches MoodyBlues.Backend/Protocol/EventLogEncoder.cs and ProtocolConstants.cs.
 */

const EVENT_TYPE = {
  TimeStamp: 24,
  ShowObject: 25,
  HideObject: 26,
  InstantiateObject: 27,
  DeleteObject: 28,
} as const;

const ENVELOPE_SIZE = 3;
const TIMESTAMP_SIZE = 9;
const INSTANTIATE_SIZE = 23;

const RANGE_POSITION = { min: -500, max: 500 };
const RANGE_SCALE = { min: -1, max: 10 };
const RANGE_QUAT = { min: -0.70711, max: 0.70711 };

export type SessionEventType = 'Spawn' | 'Show' | 'Hide' | 'Delete';

export interface SessionLifecycleEvent {
  type: SessionEventType;
  time: number;
  objectId: number;
}

export interface SessionInstantiateEvent {
  type: 'Spawn';
  time: number;
  objectId: number;
  templateObjectId: number;
  parentObjectId: number;
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: THREE.Vector3;
}

export type SessionEvent = SessionLifecycleEvent | SessionInstantiateEvent;

function dequantize(raw: number, bits: number, min: number, max: number): number {
  const maxInt = (1 << bits) - 1;
  const t = raw / maxInt;
  return min + t * (max - min);
}

function decodeScalar16(data: DataView, offset: number, min: number, max: number): number {
  return dequantize(data.getUint16(offset, true), 16, min, max);
}

function decodeVector3_16(data: DataView, offset: number, range: { min: number; max: number }): THREE.Vector3 {
  return new THREE.Vector3(
    decodeScalar16(data, offset, range.min, range.max),
    decodeScalar16(data, offset + 2, range.min, range.max),
    decodeScalar16(data, offset + 4, range.min, range.max),
  );
}

function decodeQuatSmallestThree(data: DataView, offset: number, range: { min: number; max: number }): THREE.Quaternion {
  const packed = data.getUint32(offset, true);
  const droppedIndex = packed & 0b11;
  const components = [0, 0, 0, 0];
  let shift = 2;

  for (let idx = 0; idx < 4; idx++) {
    if (idx === droppedIndex) continue;
    const raw = (packed >> shift) & 0x3ff;
    components[idx] = dequantize(raw, 10, range.min, range.max);
    shift += 10;
  }

  let sumOfSquares = 0;
  for (let idx = 0; idx < 4; idx++) {
    if (idx !== droppedIndex) sumOfSquares += components[idx] * components[idx];
  }
  components[droppedIndex] = Math.sqrt(Math.max(0, 1 - sumOfSquares));

  return new THREE.Quaternion(components[0], components[1], components[2], components[3]);
}

/** Parses the gzip-decoded binary event log into a sorted list of lifecycle events. */
export function parseEventLog(buffer: ArrayBuffer): SessionEvent[] {
  const data = new DataView(buffer);
  const events: SessionEvent[] = [];
  let offset = 0;
  let currentTime = 0;

  while (offset < buffer.byteLength) {
    const eventType = data.getUint8(offset);

    if (eventType === EVENT_TYPE.TimeStamp) {
      if (offset + TIMESTAMP_SIZE > buffer.byteLength) break;
      currentTime = data.getFloat64(offset + 1, true);
      offset += TIMESTAMP_SIZE;
      continue;
    }

    if (eventType === EVENT_TYPE.ShowObject || eventType === EVENT_TYPE.HideObject || eventType === EVENT_TYPE.DeleteObject) {
      if (offset + ENVELOPE_SIZE > buffer.byteLength) break;
      const objectId = data.getUint16(offset + 1, true);
      const type: SessionEventType =
        eventType === EVENT_TYPE.ShowObject ? 'Show'
          : eventType === EVENT_TYPE.HideObject ? 'Hide'
            : 'Delete';
      events.push({ type, time: currentTime, objectId });
      offset += ENVELOPE_SIZE;
      continue;
    }

    if (eventType === EVENT_TYPE.InstantiateObject) {
      if (offset + INSTANTIATE_SIZE > buffer.byteLength) break;
      const objectId = data.getUint16(offset + 1, true);
      const templateObjectId = data.getUint16(offset + 3, true);
      const parentObjectId = data.getUint16(offset + 5, true);
      const position = decodeVector3_16(data, offset + 7, RANGE_POSITION);
      const rotation = decodeQuatSmallestThree(data, offset + 13, RANGE_QUAT);
      const scale = decodeVector3_16(data, offset + 17, RANGE_SCALE);
      events.push({
        type: 'Spawn',
        time: currentTime,
        objectId,
        templateObjectId,
        parentObjectId,
        position,
        rotation,
        scale,
      });
      offset += INSTANTIATE_SIZE;
      continue;
    }

    // Unknown event type — stop parsing to avoid reading garbage.
    break;
  }

  events.sort((a, b) => a.time - b.time);
  return events;
}

/** Returns marker positions for the scrubber (Spawn/Delete only). */
export function getEventMarkers(events: SessionEvent[]): { time: number; type: 'Spawn' | 'Delete' }[] {
  return events
    .filter((e): e is SessionEvent & { type: 'Spawn' | 'Delete' } => e.type === 'Spawn' || e.type === 'Delete')
    .map((e) => ({ time: e.time, type: e.type }));
}
