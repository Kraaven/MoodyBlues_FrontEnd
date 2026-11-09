import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { useStage } from './store';
import { reducedMotion } from './support';
import { PoseTransition, type Pose } from './transition';

/** One full turn of the idle drift takes three minutes. */
const DRIFT_RADIANS_PER_SECOND = (Math.PI * 2) / 180;
/** How far the pointer can swing the camera, in radians. */
const PARALLAX_YAW = 0.05;
const PARALLAX_PITCH = 3;

function writeVar(name: string, value: number, last: { current: string }) {
  const text = value.toFixed(3);
  if (text === last.current) return;
  last.current = text;
  document.documentElement.style.setProperty(name, text);
}

/**
 * Moves the camera to whatever pose the current view asked for, on the transition clock, then
 * adds the idle drift and pointer parallax on top. Also publishes the clock to CSS as `--view-p`
 * and the stage opacity as `--stage-dim`, so the page can move with the camera without React
 * re-rendering.
 */
export function CameraRig() {
  const transition = useRef<PoseTransition | null>(null);
  const seenVersion = useRef(-1);
  const driftTime = useRef(0);
  const pointer = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  const lastProgress = useRef({ current: '' });
  const lastDim = useRef({ current: '' });
  const lastFov = useRef(0);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useFrame(({ camera }, rawDelta) => {
    // A long frame (a hitch, a tab coming back) must not teleport the camera.
    const delta = Math.min(rawDelta, 0.1);
    const state = useStage.getState();
    const calm = reducedMotion();

    if (!transition.current) {
      transition.current = new PoseTransition(state.pose);
      transition.current.start(state.pose, 0);
      seenVersion.current = state.poseVersion;
    } else if (seenVersion.current !== state.poseVersion) {
      seenVersion.current = state.poseVersion;
      // The first view, and anyone who asked for less motion, gets a cut rather than a move.
      transition.current.start(state.pose, calm ? 0 : state.durationMs);
    }

    const base: Pose = transition.current.advance(delta);
    writeVar('--view-p', transition.current.progress, lastProgress.current);
    writeVar('--stage-dim', base.dim, lastDim.current);

    // Idle drift and parallax, scaled by the pose's own drift weight so they ease in and out.
    let yaw = 0;
    let lift = 0;
    if (!calm && base.drift > 0.001) {
      driftTime.current += delta;
      const p = pointer.current;
      p.sx += (p.x - p.sx) * Math.min(1, delta * 2.5);
      p.sy += (p.y - p.sy) * Math.min(1, delta * 2.5);
      yaw = base.drift * (driftTime.current * DRIFT_RADIANS_PER_SECOND + p.sx * PARALLAX_YAW);
      lift = base.drift * p.sy * PARALLAX_PITCH;
    }

    const dx = base.px - base.tx;
    const dz = base.pz - base.tz;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    camera.position.set(base.tx + dx * cos + dz * sin, base.py + lift, base.tz - dx * sin + dz * cos);
    camera.lookAt(base.tx, base.ty, base.tz);

    if (Math.abs(base.fov - lastFov.current) > 1e-4) {
      lastFov.current = base.fov;
      (camera as THREE.PerspectiveCamera).fov = base.fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
