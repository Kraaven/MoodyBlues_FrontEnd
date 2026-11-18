import { useCallback, useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Replay } from '../../viewer/replay/replayFile';
import { orbitHasCamera, setNearPlaneOverride } from '../../stage/rigState';
import { reducedMotion } from '../../stage/support';
import { useStage } from '../../stage/store';
import { cameraForward } from '../cameras';
import type { Playback } from '../playback';
import { useStudio } from '../studioStore';
import type { CameraMode } from '../viewSettings';
import { measurePlayer, objectMoves, resolveFollowTarget } from './followTarget';
import { OccluderFade, MAX_FADED } from './occluderFade';
import { hideOwnMeshes } from './ownBody';
import { firstPersonNear, followDistance, type PlayerSize } from './poses';
import { followRestPose, ViewRig } from './ViewRig';
import { ObjectTracker } from './tracker';

/** Leaving first person for the free camera: the orbit pivots this far ahead of the lens. */
const LEAVE_DISTANCE = 3;

const player = new THREE.Vector3();
const eyePosition = new THREE.Vector3();
const eyeQuaternion = new THREE.Quaternion();
const eyeForward = new THREE.Vector3();
const selectedGoal = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
// Bounds trees answer for the nearest hit of each mesh, which is all an obstruction test needs.
raycaster.firstHitOnly = true;
/** Things smaller than this (grass, flowers, small props) do not hide the view. */
const MIN_OBSTACLE_RADIUS = 0.5;

/** Is this hit a visible, big enough mesh outside the nodes being followed (one that would hide the view)? */
function hides(mesh: THREE.Mesh, root: THREE.Object3D, ignore: readonly THREE.Object3D[]): boolean {
  if (!mesh.isMesh) return false;
  for (let n: THREE.Object3D | null = mesh; n && n !== root; n = n.parent) if (!n.visible || ignore.includes(n)) return false;
  const sphere = (mesh.geometry.boundingSphere ??= (mesh.geometry.computeBoundingSphere(), mesh.geometry.boundingSphere));
  return !sphere || sphere.radius * mesh.matrixWorld.getMaxScaleOnAxis() >= MIN_OBSTACLE_RADIUS;
}

/**
 * Casts the ray from -> to and calls `each` with every mesh that would hide the view, nearest first,
 * until it returns false.
 */
function castObstacles(
  root: THREE.Object3D,
  ignore: readonly THREE.Object3D[],
  from: THREE.Vector3,
  to: THREE.Vector3,
  each: (mesh: THREE.Mesh, distance: number) => boolean,
): void {
  const length = rayDirection.copy(to).sub(from).length();
  if (length < 1e-3) return;
  raycaster.set(from, rayDirection.divideScalar(length));
  raycaster.near = 0;
  raycaster.far = length;
  for (const hit of raycaster.intersectObject(root, true)) {
    const mesh = hit.object as THREE.Mesh;
    if (hides(mesh, root, ignore) && !each(mesh, hit.distance)) return;
  }
}

/** The first thing along from -> to that would hide the view. */
function firstObstacle(root: THREE.Object3D, ignore: readonly THREE.Object3D[], from: THREE.Vector3, to: THREE.Vector3): number | null {
  let found: number | null = null;
  castObstacles(root, ignore, from, to, (_mesh, distance) => ((found = distance), false));
  return found;
}

/** Fills `out` with the first few meshes along from -> to that hide the view. */
function collectObstacles(root: THREE.Object3D, ignore: readonly THREE.Object3D[], from: THREE.Vector3, to: THREE.Vector3, out: THREE.Mesh[]): void {
  out.length = 0;
  castObstacles(root, ignore, from, to, (mesh) => (out.push(mesh), out.length < MAX_FADED));
}

/** What the controls were set to before the rig took the camera, so they can be given back. */
interface Claimed {
  minPolarAngle: number;
  maxPolarAngle: number;
  enablePan: boolean;
}

interface Options {
  root: THREE.Object3D | null;
  replay: Replay | null;
  playback: Playback | null;
  /** The node of an exported camera: its replayed one while a recording plays, else the scene's own. */
  cameraNode: (id: number) => THREE.Object3D | undefined;
}

/**
 * Connects the {@link ViewRig} to the Stage: each frame it reads the focused camera and the player it
 * belongs to, lets the rig move the viewer and the orbit target, and gives the controls back when no
 * camera is focused. It also does Follow selected (the F key), with the same easing. While a camera
 * is focused the controls are still the input device (see ViewRig), except in first person, where
 * the rig takes over the pointer on the stage's surface for the free look.
 *
 * Where the spring arm cannot come in far enough (see occlusion.ts), the meshes in the way fade out
 * so the player stays visible, and fade back when they no longer block.
 *
 * It waits while the camera rig is moving the view (a transition, the intro) and takes over from
 * wherever the camera then is, so nothing cuts. Asks for the next frame while anything moves.
 */
export function useViewRig({ root, replay, playback, cameraNode }: Options): {
  introPose: (id: number, mode: CameraMode) => { position: [number, number, number]; target: [number, number, number] } | null;
  followDistanceOf: (id: number) => number | null;
} {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const invalidate = useThree((s) => s.invalidate);
  const surface = useStage((s) => s.surface);
  const [rig] = useState(() => new ViewRig());
  const [tracker] = useState(() => new ObjectTracker());
  const [fade] = useState(() => new OccluderFade());
  /** The meshes blocking the view this frame, found by the rig's frame and faded by the one after it. */
  const blockers = useRef<THREE.Mesh[]>([]);
  const claimed = useRef<Claimed | null>(null);
  const followNode = useRef<{ camera: THREE.Object3D; node: THREE.Object3D; size: PlayerSize } | null>(null);
  const dragging = useRef(false);
  const firstPerson = useRef(false);
  const ownHidden = useRef<{ eye: THREE.Object3D; restore: () => void } | null>(null);

  const showOwn = useCallback(() => {
    ownHidden.current?.restore();
    ownHidden.current = null;
  }, []);

  /** The controls go back to what the page set; a view still partly in first person stays where it is, looking the same way. */
  const release = useCallback(() => {
    firstPerson.current = false;
    showOwn();
    if (!claimed.current || !controls) return;
    if (rig.firstPerson > 0) controls.target.copy(camera.position).addScaledVector(cameraForward(camera, eyeForward), LEAVE_DISTANCE);
    Object.assign(controls, claimed.current);
    controls.enabled = true;
    claimed.current = null;
    setNearPlaneOverride(null);
    camera.fov = useStudio.getState().settings.fov;
    camera.updateProjectionMatrix();
    rig.reset();
    invalidate();
  }, [camera, controls, invalidate, rig, showOwn]);

  useEffect(() => release, [release]);
  useEffect(() => () => fade.clear(), [fade, root]);

  useEffect(() => {
    if (!controls) return;
    const down = () => (dragging.current = true);
    const up = () => {
      dragging.current = false;
      invalidate();
    };
    controls.addEventListener('start', down);
    controls.addEventListener('end', up);
    return () => {
      controls.removeEventListener('start', down);
      controls.removeEventListener('end', up);
    };
  }, [controls, invalidate]);

  useEffect(() => playback?.subscribeSeek(() => rig.noteSeek()), [playback, rig]);

  // First person: dragging the stage turns the view a little, and it springs back on release.
  useEffect(() => {
    if (!surface) return;
    let last: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (!firstPerson.current || e.button !== 0) return;
      last = { x: e.clientX, y: e.clientY };
      rig.freeLook.drag(0, 0);
      surface.setPointerCapture(e.pointerId);
      invalidate();
    };
    const onMove = (e: PointerEvent) => {
      if (!last) return;
      const perRadian = (camera.fov * Math.PI) / 180 / Math.max(1, surface.clientHeight);
      rig.freeLook.drag((e.clientX - last.x) * perRadian, (e.clientY - last.y) * perRadian);
      last = { x: e.clientX, y: e.clientY };
      invalidate();
    };
    const onUp = () => {
      if (!last) return;
      last = null;
      rig.freeLook.release();
      invalidate();
    };
    surface.addEventListener('pointerdown', onDown);
    surface.addEventListener('pointermove', onMove);
    surface.addEventListener('pointerup', onUp);
    surface.addEventListener('pointercancel', onUp);
    return () => {
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerup', onUp);
      surface.removeEventListener('pointercancel', onUp);
    };
  }, [surface, camera, rig, invalidate]);

  /** The player a camera's view follows and its size, measured once when it is first resolved. */
  const followOf = useCallback(
    (eye: THREE.Object3D) => {
      if (followNode.current?.camera === eye) return followNode.current;
      const node = root ? resolveFollowTarget(eye, root, (id) => objectMoves(replay?.objectsById.get(id))) : eye;
      followNode.current = { camera: eye, node, size: measurePlayer(node) };
      return followNode.current;
    },
    [root, replay],
  );

  const followDistanceOf = useCallback(
    (id: number) => {
      const eye = cameraNode(id);
      return eye ? followDistance('behind', followOf(eye).size) : null;
    },
    [cameraNode, followOf],
  );

  const introPose = useCallback(
    (id: number, mode: CameraMode) => {
      const eye = cameraNode(id);
      if (!eye) return null;
      if (mode === 'firstPerson') {
        // Through the lens: at the camera, looking where it looks. The rig takes it from there.
        eye.updateWorldMatrix(true, false);
        const at = eye.getWorldPosition(eyePosition);
        return { position: at.toArray(), target: at.clone().addScaledVector(cameraForward(eye, eyeForward), LEAVE_DISTANCE).toArray() };
      }
      const { node, size } = followOf(eye);
      node.updateWorldMatrix(true, false);
      eye.updateWorldMatrix(true, false);
      const goal = followRestPose(useStudio.getState().settings.followStyle, node.getWorldPosition(player), size, cameraForward(eye, eyeForward), {
        position: new THREE.Vector3(),
        target: new THREE.Vector3(),
      });
      return { position: goal.position.toArray(), target: goal.target.toArray() };
    },
    [cameraNode, followOf],
  );

  useFrame((_, rawDelta) => {
    const studio = useStudio.getState();
    blockers.current.length = 0;
    // While the camera rig moves the view (a transition, the intro) it has the camera; the rig takes over from where that ends.
    if (!controls || !orbitHasCamera() || studio.introRunning) {
      rig.reset();
      tracker.reset();
      return;
    }
    const delta = Math.min(rawDelta, 0.1);
    const reduced = reducedMotion();
    const eye = studio.focusCameraId !== null ? cameraNode(studio.focusCameraId) : undefined;

    if (studio.focusCameraId !== null && eye) {
      tracker.reset();
      claimed.current ??= { minPolarAngle: controls.minPolarAngle, maxPolarAngle: controls.maxPolarAngle, enablePan: controls.enablePan };
      // The rig may put the viewer anywhere on the sphere, and only it moves the target.
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI;
      controls.enablePan = false;
      const { node: followed, size } = followOf(eye);
      followed.updateWorldMatrix(true, false);
      eye.updateWorldMatrix(true, false);
      const out = rig.update({
        dt: delta,
        time: playback?.time ?? 0,
        reduced,
        focusId: studio.focusCameraId,
        mode: studio.cameraMode,
        style: studio.settings.followStyle,
        player: followed.getWorldPosition(player),
        eye: {
          position: eye.getWorldPosition(eyePosition),
          quaternion: eye.getWorldQuaternion(eyeQuaternion),
          forward: cameraForward(eye, eyeForward),
          fov: (eye as THREE.PerspectiveCamera).isPerspectiveCamera ? (eye as THREE.PerspectiveCamera).fov : null,
        },
        view: { position: camera.position, target: controls.target },
        dragging: dragging.current,
        probe: root ? (from, to) => firstObstacle(root, [followed, eye], from, to) : undefined,
        size,
        fov: studio.settings.fov,
      });
      camera.position.copy(out.position);
      controls.target.copy(out.target);
      if (out.firstPerson > 0) camera.quaternion.copy(out.quaternion);
      else camera.lookAt(out.target);
      if (Math.abs(camera.fov - out.fov) > 1e-4) {
        camera.fov = out.fov;
        camera.updateProjectionMatrix();
      }
      controls.enabled = out.orbitEnabled;
      firstPerson.current = studio.cameraMode === 'firstPerson';
      // Through the lens the camera's own model is left out, once the glide is mostly in.
      if (ownHidden.current && (out.firstPerson <= 0.6 || ownHidden.current.eye !== eye)) showOwn();
      if (out.firstPerson > 0.6 && !ownHidden.current) ownHidden.current = { eye, restore: hideOwnMeshes(eye) };
      setNearPlaneOverride(out.firstPerson > 0 ? firstPersonNear(studio.settings.firstPersonNear, size) : null);
      if (out.animating) invalidate();
      if (out.squeezed && root) collectObstacles(root, [followed, eye], out.target, out.position, blockers.current);
      return;
    }

    release();
    const selected = studio.follow ? studio.selected : null;
    if (!selected) {
      tracker.reset();
      return;
    }
    selected.updateWorldMatrix(true, false);
    const shift = tracker.step(selected.getWorldPosition(selectedGoal), controls.target, delta, reduced);
    controls.target.add(shift);
    camera.position.add(shift);
    if (tracker.moving) invalidate();
  });

  // After the rig's frame (same priority, registered later): fades what it found, and what it no longer finds back in.
  useFrame((_, rawDelta) => {
    fade.set(blockers.current);
    if (fade.step(Math.min(rawDelta, 0.1))) invalidate();
  });

  return { introPose, followDistanceOf };
}
