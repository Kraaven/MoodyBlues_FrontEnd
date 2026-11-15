import * as THREE from 'three';
import type { ReplayTrack } from './replayFile';

/**
 * Turns the replay file's Hermite curves into three.js keyframe tracks that use the built-in
 * `InterpolateBezier` mode.
 *
 * A Hermite segment from key k to key k+1 with slopes m0 (k's out-slope) and m1 ((k+1)'s
 * in-slope) is exactly the cubic Bezier whose control points sit one third of the way along the
 * interval: (t_k + dt/3, v_k + m0*dt/3) and (t_k+1 - dt/3, v_k+1 - m1*dt/3). With control points
 * placed in thirds, the Bezier's time axis is linear, so three's Newton solve for the curve
 * parameter converges immediately.
 */

/**
 * BezierInterpolant evaluates each quaternion component independently; this subclass normalizes
 * the result, which is how the backend measured the fitting error. (Same approach as GLTFLoader's
 * cubic-spline quaternion interpolant.)
 */
export class QuaternionBezierInterpolant extends THREE.BezierInterpolant {
  interpolate_(i1: number, t0: number, t: number, t1: number) {
    const result = super.interpolate_(i1, t0, t, t1);
    const x = result[0], y = result[1], z = result[2], w = result[3];
    const len = Math.hypot(x, y, z, w) || 1;
    result[0] = x / len;
    result[1] = y / len;
    result[2] = z / len;
    result[3] = w / len;
    return result;
  }
}

interface BezierSettings {
  inTangents: Float32Array;
  outTangents: Float32Array;
}

/**
 * Converts session times (float64) to the float32 times three.js stores, keeping them strictly
 * increasing: a session several hours long can have keys closer together than float32 can
 * separate at that magnitude, and equal times would divide by zero during interpolation.
 */
export function toStrictFloat32Times(times: Float64Array): Float32Array {
  const out = new Float32Array(times.length);
  for (let i = 0; i < times.length; i++) {
    let t = Math.fround(times[i]);
    if (i > 0 && t <= out[i - 1]) {
      const prev = out[i - 1];
      // Smallest float32 strictly greater than prev.
      t = Math.fround(prev + Math.max(Math.abs(prev) * 1.2e-7, 1e-6));
      while (t <= prev) t = Math.fround(t + Math.max(Math.abs(t) * 1.2e-7, 1e-6));
    }
    out[i] = t;
  }
  return out;
}

function bezierSettings(times: Float32Array, track: ReplayTrack): BezierSettings {
  const n = times.length;
  const dim = track.dimension;
  const inTangents = new Float32Array(n * dim * 2);
  const outTangents = new Float32Array(n * dim * 2);

  for (let k = 0; k < n; k++) {
    const t = times[k];
    const dtPrev = k > 0 ? t - times[k - 1] : 0;
    const dtNext = k < n - 1 ? times[k + 1] - t : 0;
    for (let c = 0; c < dim; c++) {
      const v = track.values[k * dim + c];
      const o = (k * dim + c) * 2;
      inTangents[o] = t - dtPrev / 3;
      inTangents[o + 1] = v - (track.inTangents[k * dim + c] * dtPrev) / 3;
      outTangents[o] = t + dtNext / 3;
      outTangents[o + 1] = v + (track.outTangents[k * dim + c] * dtNext) / 3;
    }
  }

  return { inTangents, outTangents };
}

/** A `.position` or `.scale` track on the action's root object. */
export function vectorTrack(property: '.position' | '.scale', track: ReplayTrack): THREE.VectorKeyframeTrack {
  const times = toStrictFloat32Times(track.times);
  const kt = new THREE.VectorKeyframeTrack(property, times, track.values, THREE.InterpolateBezier);
  // `settings` is read by KeyframeTrack.InterpolantFactoryMethodBezier; it is not in the typings.
  (kt as unknown as { settings: BezierSettings }).settings = bezierSettings(kt.times, track);
  return kt;
}

/** A `.quaternion` track whose interpolant normalizes its output. */
export function quaternionTrack(track: ReplayTrack): THREE.QuaternionKeyframeTrack {
  const times = toStrictFloat32Times(track.times);
  const kt = new THREE.QuaternionKeyframeTrack('.quaternion', times, track.values);
  const settings = bezierSettings(kt.times, track);
  // createInterpolant is assigned by setInterpolation at runtime but is not in the typings.
  (kt as unknown as { createInterpolant: (result?: THREE.TypedArray) => THREE.Interpolant }).createInterpolant = (result) => {
    const interpolant = new QuaternionBezierInterpolant(kt.times, kt.values, kt.getValueSize(), result);
    (interpolant as unknown as BezierSettings).inTangents = settings.inTangents;
    (interpolant as unknown as BezierSettings).outTangents = settings.outTangents;
    return interpolant;
  };
  return kt;
}

/** A `.visible` step track. Times must already be sorted; duplicates keep the last value. */
export function visibilityTrack(changes: { time: number; visible: boolean }[]): THREE.BooleanKeyframeTrack {
  const times: number[] = [];
  const values: boolean[] = [];
  for (const change of changes) {
    if (times.length > 0 && change.time <= times[times.length - 1]) {
      values[values.length - 1] = change.visible;
    } else {
      times.push(change.time);
      values.push(change.visible);
    }
  }
  return new THREE.BooleanKeyframeTrack('.visible', toStrictFloat32Times(Float64Array.from(times)), values);
}
