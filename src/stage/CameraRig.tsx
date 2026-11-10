import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
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

interface OrbitLike {
  target: THREE.Vector3;
  update: () => void;
}

/**
 * Moves the camera to whatever pose the current view asked for, on the transition clock. Then, in
 * `rig` mode, adds the idle drift and pointer parallax on top; in `free` mode, hands the camera to
 * the orbit controls once the move has finished. Also publishes the clock to CSS as `--view-p` and
 * the stage opacity as `--stage-dim`, so the page can move with the camera without React
 * re-rendering, and applies the view inset so the 3D centres in the part of the window left over.
 */
export function CameraRig() {
  const size = useThree((s) => s.size);
  const transition = useRef<PoseTransition | null>(null);
  const seenVersion = useRef(-1);
  const wasFree = useRef(false);
  const driftTime = useRef(0);
  const pointer = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  const lastProgress = useRef({ current: '' });
  const lastDim = useRef({ current: '' });
  const lastFov = useRef(0);
  const lastOffset = useRef('');

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useFrame(({ camera, controls }, rawDelta) => {
    // A long frame (a hitch, a tab coming back) must not teleport the camera.
    const delta = Math.min(rawDelta, 0.1);
    const state = useStage.getState();
    const calm = reducedMotion();
    const orbit = (controls as OrbitLike | null) ?? null;
    const free = state.view.control === 'free' && Boolean(orbit);

    if (!transition.current) {
      transition.current = new PoseTransition(state.pose);
      transition.current.start(state.pose, 0);
      seenVersion.current = state.poseVersion;
    } else if (seenVersion.current !== state.poseVersion) {
      seenVersion.current = state.poseVersion;
      // If orbit controls had the camera, the next move starts from where the user left it.
      if (wasFree.current && orbit) {
        const here = transition.current.pose;
        transition.current.reset({
          ...here,
          px: camera.position.x,
          py: camera.position.y,
          pz: camera.position.z,
          tx: orbit.target.x,
          ty: orbit.target.y,
          tz: orbit.target.z,
        });
      }
      // The first view, and anyone who asked for less motion, gets a cut rather than a move.
      transition.current.start(state.pose, calm ? 0 : state.durationMs);
    }

    const handedOver = free && transition.current.done;
    wasFree.current = handedOver;

    const base: Pose = transition.current.advance(delta);
    writeVar('--view-p', transition.current.progress, lastProgress.current);
    writeVar('--stage-dim', base.dim, lastDim.current);

    if (!handedOver) {
      // Idle drift and parallax, scaled by the pose's own drift weight so they ease in and out.
      let yaw = 0;
      let lift = 0;
      if (!calm && !free && base.drift > 0.001) {
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
      if (orbit) {
        orbit.target.set(base.tx, base.ty, base.tz);
        orbit.update();
      }
    }

    if (Math.abs(base.fov - lastFov.current) > 1e-4) {
      lastFov.current = base.fov;
      (camera as THREE.PerspectiveCamera).fov = base.fov;
      camera.updateProjectionMatrix();
    }

    // Centre the projection in the part of the window the view left free (panels, a text column).
    const { left, right, top, bottom } = state.inset;
    const key = `${left}|${right}|${top}|${bottom}|${size.width}|${size.height}`;
    if (key !== lastOffset.current) {
      lastOffset.current = key;
      const persp = camera as THREE.PerspectiveCamera;
      if (left === 0 && right === 0 && top === 0 && bottom === 0) persp.clearViewOffset();
      else persp.setViewOffset(size.width, size.height, -(left - right) / 2, -(top - bottom) / 2, size.width, size.height);
      persp.updateProjectionMatrix();
    }
  });

  return null;
}
