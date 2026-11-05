import * as THREE from 'three';
import type { AnimationChannel, AnimationLifecycleMoment, AnimationObjectData } from '../../lib/types';

const CHANNEL_KEY_NAMES: Record<string, 'position' | 'rotation' | 'scale' | null> = {
  posX: 'position', posY: 'position', posZ: 'position',
  rotX: 'rotation', rotY: 'rotation', rotZ: 'rotation', rotW: 'rotation',
  sclX: 'scale', sclY: 'scale', sclZ: 'scale',
};

const CHANNEL_AXIS: Record<string, 0 | 1 | 2 | 3> = {
  posX: 0, posY: 1, posZ: 2,
  rotX: 0, rotY: 1, rotZ: 2, rotW: 3,
  sclX: 0, sclY: 1, sclZ: 2,
};

/** Pre-resolved channel entry for zero-allocation per-frame sampling. */
export interface ChannelEntry {
  kind: 'position' | 'rotation' | 'scale';
  axis: 0 | 1 | 2 | 3;
  channel: AnimationChannel;
}

/** Builds a fixed channel list once per object (avoids Object.entries per frame). */
export function buildChannelEntries(object: AnimationObjectData): ChannelEntry[] {
  const entries: ChannelEntry[] = [];
  for (const [key, channel] of Object.entries(object.channels)) {
    const kind = CHANNEL_KEY_NAMES[key];
    const axis = CHANNEL_AXIS[key];
    if (!kind || axis === undefined) continue;
    entries.push({ kind, axis, channel });
  }
  return entries;
}

/** Dequantizes and interpolates a single channel at `time`, returning the float value. */
export function dequantizeChannel(channel: AnimationChannel, time: number): number {
  if (channel.type === 'constant') {
    return channel.value ?? 0;
  }

  if (channel.type === 'linear') {
    const t0 = channel.t0 ?? 0;
    const t1 = channel.t1 ?? 0;
    const v0 = channel.v0 ?? 0;
    const v1 = channel.v1 ?? 0;
    const span = t1 - t0;
    if (span <= 0) return v0;
    const t = Math.max(0, Math.min(1, (time - t0) / span));
    return v0 + (v1 - v0) * t;
  }

  // type === 'keyframes'
  const times = channel.times;
  const values = channel.values;
  const min = channel.min ?? 0;
  const max = channel.max ?? 1;
  if (!times || !values || times.length === 0) return min;

  const n = times.length;
  if (time <= times[0]) return dequantizeValue(values[0], min, max);
  if (time >= times[n - 1]) return dequantizeValue(values[n - 1], min, max);

  // Binary search for the surrounding pair
  let lo = 0, hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= time) lo = mid;
    else hi = mid;
  }

  const t = (time - times[lo]) / (times[hi] - times[lo]);
  const v0 = dequantizeValue(values[lo], min, max);
  const v1 = dequantizeValue(values[hi], min, max);
  return v0 + (v1 - v0) * t;
}

function dequantizeValue(raw: number, min: number, max: number): number {
  return min + (raw / 65535) * (max - min);
}

/** Samples all channels at `time` into caller-supplied scratch vectors (no allocation). */
export function sampleObjectTransformScratch(
  entries: ChannelEntry[],
  time: number,
  outPos: THREE.Vector3,
  outRot: THREE.Quaternion,
  outScl: THREE.Vector3,
): boolean {
  if (entries.length === 0) return false;

  outPos.set(0, 0, 0);
  outRot.set(0, 0, 0, 1);
  outScl.set(1, 1, 1);

  for (const { kind, axis, channel } of entries) {
    const value = dequantizeChannel(channel, time);
    if (kind === 'position') {
      if (axis === 0) outPos.x = value;
      else if (axis === 1) outPos.y = value;
      else outPos.z = value;
    } else if (kind === 'rotation') {
      if (axis === 0) outRot.x = value;
      else if (axis === 1) outRot.y = value;
      else if (axis === 2) outRot.z = value;
      else outRot.w = value;
    } else {
      if (axis === 0) outScl.x = value;
      else if (axis === 1) outScl.y = value;
      else outScl.z = value;
    }
  }

  outRot.normalize();
  return true;
}

/** Samples all channels for one object at `time` and applies them to `target`. Returns false if there are no channels to sample (object stays at its current transform). */
export function sampleObjectTransform(object: AnimationObjectData, target: THREE.Object3D, time: number): boolean {
  let hadAny = false;
  const pos = new THREE.Vector3();
  const rot = new THREE.Quaternion();
  const scl = new THREE.Vector3();

  for (const [key, channel] of Object.entries(object.channels)) {
    const kind = CHANNEL_KEY_NAMES[key];
    if (!kind) continue;
    const value = dequantizeChannel(channel, time);
    hadAny = true;

    if (kind === 'position') {
      if (key === 'posX') pos.x = value;
      else if (key === 'posY') pos.y = value;
      else if (key === 'posZ') pos.z = value;
    } else if (kind === 'rotation') {
      if (key === 'rotX') rot.x = value;
      else if (key === 'rotY') rot.y = value;
      else if (key === 'rotZ') rot.z = value;
      else if (key === 'rotW') rot.w = value;
    } else if (kind === 'scale') {
      if (key === 'sclX') scl.x = value;
      else if (key === 'sclY') scl.y = value;
      else if (key === 'sclZ') scl.z = value;
    }
  }

  if (!hadAny) return false;

  // Only apply what we have samples for -- rely on THREE's default for components not provided.
  target.position.copy(pos);
  target.quaternion.copy(rot);
  target.scale.copy(scl);
  return true;
}

/** Resolves the lifecycle state for one object at `time` by scanning its events linearly (lifecycle lists are expected to be small, tens of entries at most).
 *  `defaultAlive` should be true for scene objects (present from the start) and false for
 *  runtime-spawned objects (which only exist after their first Spawn event). */
export function resolveLifecycle(
  lifecycle: AnimationLifecycleMoment[],
  time: number,
  defaultAlive = true,
): { visible: boolean; alive: boolean } {
  let visible = defaultAlive;
  let alive = defaultAlive;

  for (const event of lifecycle) {
    if (event.time > time) break;
    switch (event.type) {
      case 'Spawn':
        alive = true;
        visible = true;
        break;
      case 'Delete':
        alive = false;
        visible = false;
        break;
      case 'Show':
        visible = true;
        break;
      case 'Hide':
        visible = false;
        break;
    }
  }

  return { visible, alive };
}
