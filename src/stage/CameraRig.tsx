import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { nearPlaneOverride, setOrbitHasCamera } from './rigState';
import { useStage } from './store';
import { reducedMotion } from './support';
import { PoseTransition, type Pose } from './transition';

/** One full turn of the idle drift takes three minutes. */
const DRIFT_RADIANS_PER_SECOND = (Math.PI * 2) / 180;
/** How far the pointer can swing the camera, in radians. */
const PARALLAX_YAW = 0.05;
const PARALLAX_PITCH = 3;
/** The near plane is this far from the camera, per unit of distance to what it looks at. */
const NEAR_PER_DISTANCE = 1 / 500;
const MIN_FAR = 1000;
/** Clip planes are only rewritten when they have drifted this far, so the projection is not rebuilt every frame. */
const CLIP_TOLERANCE = 0.05;

const lookTarget = new THREE.Vector3();

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
 *
 * The canvas draws on demand, so the rig asks for the next frame for as long as something here is
 * still moving: a transition, the idle drift, the inset gliding to its place. The near and far
 * planes follow the distance to what is looked at, so zooming right in does not clip the model
 * (unless a view fixes the near plane, see `nearPlaneOverride`).
 */
export function CameraRig() {
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const controlsInstance = useThree((s) => s.controls);
  const transition = useRef<PoseTransition | null>(null);
  const seenVersion = useRef(-1);
  const wasFree = useRef(false);
  const driftTime = useRef(0);
  const pointer = useRef({ x: 0, y: 0, sx: 0, sy: 0 });
  const lastProgress = useRef({ current: '' });
  const lastDim = useRef({ current: '' });
  const lastFov = useRef(0);
  const lastOffset = useRef('');
  const inset = useRef({ left: 0, right: 0, top: 0, bottom: 0 });

  // A new view, pose or inset, or controls arriving, changes the picture without any React prop saying so.
  useEffect(() => {
    invalidate();
    return useStage.subscribe((state, previous) => {
      if (state.poseVersion !== previous.poseVersion || state.view !== previous.view || state.inset !== previous.inset) invalidate();
    });
  }, [invalidate, controlsInstance]);

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
    setOrbitHasCamera(handedOver);

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

    // Centre the projection in the part of the window the view left free (panels, a card on a page).
    // A view change glides there with the camera; scrolling and resizing follow at once.
    const goal = state.inset;
    const shown = inset.current;
    const k = state.insetSmooth && !calm ? 1 - Math.exp(-delta * 7) : 1;
    shown.left += (goal.left - shown.left) * k;
    shown.right += (goal.right - shown.right) * k;
    shown.top += (goal.top - shown.top) * k;
    shown.bottom += (goal.bottom - shown.bottom) * k;
    if (Math.abs(goal.left - shown.left) + Math.abs(goal.right - shown.right) + Math.abs(goal.top - shown.top) + Math.abs(goal.bottom - shown.bottom) < 0.5) {
      Object.assign(shown, goal);
    }
    const settled = shown.left === goal.left && shown.right === goal.right && shown.top === goal.top && shown.bottom === goal.bottom;
    const { left, right, top, bottom } = shown;
    const key = `${left.toFixed(1)}|${right.toFixed(1)}|${top.toFixed(1)}|${bottom.toFixed(1)}|${size.width}|${size.height}`;
    if (key !== lastOffset.current) {
      lastOffset.current = key;
      const persp = camera as THREE.PerspectiveCamera;
      if (Math.abs(left) + Math.abs(right) + Math.abs(top) + Math.abs(bottom) < 0.5) persp.clearViewOffset();
      else persp.setViewOffset(size.width, size.height, -(left - right) / 2, -(top - bottom) / 2, size.width, size.height);
      persp.updateProjectionMatrix();
    }

    const perspective = camera as THREE.PerspectiveCamera;
    const looking = handedOver && orbit ? orbit.target : lookTarget.set(base.tx, base.ty, base.tz);
    const distance = Math.max(camera.position.distanceTo(looking), 1e-3);
    const near = nearPlaneOverride() ?? Math.max(0.01, distance * NEAR_PER_DISTANCE);
    const far = Math.max(MIN_FAR, state.sceneRadius * 20, distance * 10);
    if (Math.abs(near / perspective.near - 1) > CLIP_TOLERANCE || Math.abs(far / perspective.far - 1) > CLIP_TOLERANCE) {
      perspective.near = near;
      perspective.far = far;
      perspective.updateProjectionMatrix();
    }

    const drifting = !handedOver && !calm && !free && base.drift > 0.001;
    if (!transition.current.done || drifting || !settled) invalidate();
  });

  useEffect(
    () => () => {
      setOrbitHasCamera(false);
    },
    [],
  );

  return null;
}
