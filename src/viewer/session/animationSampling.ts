import * as THREE from 'three';
import type { AnimationChannel, AnimationLifecycleMoment, AnimationObjectData } from '../../lib/types';

const CHANNEL_KEY_NAMES: Record<string, 'position' | 'rotation' | 'scale' | null> = {
  posX: 'position', posY: 'position', posZ: 'position',
  rotX: 'rotation', rotY: 'rotation', rotZ: 'rotation', rotW: 'rotation',
  sclX: 'scale', sclY: 'scale', sclZ: 'scale',
};

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

/** Resolves the lifecycle state for one object at `time` by scanning its events linearly (lifecycle lists are expected to be small, tens of entries at most). */
export function resolveLifecycle(
  lifecycle: AnimationLifecycleMoment[],
  time: number,
): { visible: boolean; alive: boolean } {
  let visible = true;
  let alive = true;

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
