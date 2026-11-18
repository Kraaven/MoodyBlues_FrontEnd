import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FRAME_DIRECTION, framePose, visibleBox } from '../viewer/core/gltf';
import { planGround, sampleFloor, type GroundPlan } from '../viewer/core/floor';
import { Ground } from '../viewer/core/Ground';
import { warmUp } from '../viewer/core/warmup';
import { inspectScene } from '../inspector/inspection';
import { useStudio } from '../studio/studioStore';
import { acquireScene, isAbortError } from './sceneAssets';
import { useRedraw } from './redraw';
import { captureSnapshot } from './snapshotCapture';
import { needsFraming, regionFill, useStage, type SceneRef } from './store';

/** Where a loaded scene sits: its centre and size for lights and shadows, and how its floor is drawn. */
export interface SceneBounds {
  center: THREE.Vector3;
  radius: number;
  ground: GroundPlan;
}

function measureScene(root: THREE.Object3D): SceneBounds {
  const box = visibleBox(root);
  if (box.isEmpty()) {
    return { center: new THREE.Vector3(), radius: 10, ground: planGround({ floorY: 0, minY: 0, share: 0, radius: 10, center: { x: 0, z: 0 }, footprint: { x: 20, z: 20 } }) };
  }
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.5);
  const floor = sampleFloor(root, box, radius);
  const ground = planGround({ floorY: floor.floorY, share: floor.share, minY: box.min.y, radius, center: floor.center, footprint: floor.footprint });
  return { center: sphere.center, radius, ground };
}

/** Turn shadows on or off for every mesh under `root`. Display only; the scene data is unchanged. */
export function applyShadows(root: THREE.Object3D, on: boolean): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.castShadow === on && mesh.receiveShadow === on) return;
    mesh.castShadow = on;
    mesh.receiveShadow = on;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (m) m.needsUpdate = true;
  });
}

/**
 * Show or hide the lights the Unity scene exported. Off by default: the viewer lights the scene
 * itself, and every visible light is paid for by every material. An invisible light is left out of
 * the shaders altogether, yet stays in the graph for the inspector. Lights the scene marks inactive
 * stay off.
 */
export function applySceneLights(root: THREE.Object3D, on: boolean): void {
  root.traverse((node) => {
    if ((node as THREE.Light).isLight) node.visible = on && node.userData?.isHidden !== true;
  });
}

/** What a scene needs before its first frame: the display settings that change which shaders it uses. */
export function prepareScene(root: THREE.Object3D, shadows: boolean): void {
  applyShadows(root, shadows);
  applySceneLights(root, useStudio.getState().settings.sceneLights);
}

const LIGHT_DIRECTION = new THREE.Vector3(-0.9, 1.6, 0.7).normalize();
const SHADOW_MAP_SIZE = 2048;
/** Zoom steps of the shadow region: it changes in steps, so the map is not redrawn on every wheel notch. */
const SHADOW_STEP = 1.25;
const PLACEHOLDER_BOUNDS = { center: new THREE.Vector3(), radius: 10 };

const lightAxes = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
const lightBasis = new THREE.Matrix4();
const snapped = new THREE.Vector3();

/**
 * The lights a scene is seen under (the environment map comes from the host): a warm key from the
 * front left, high, casting soft shadows, and a cool sky fill.
 *
 * The shadow map covers the part of the scene being looked at, not all of it: centred on the orbit
 * target, as wide as the view is deep, in steps, and snapped to whole shadow texels so the edges do
 * not shimmer while the camera moves. The map is drawn again only when that region changes or
 * something that casts shadows does (see `useRedraw`). The lights exist before the scene does
 * (`bounds` null), so the scene's shaders are built against them.
 */
export function SceneLights({ bounds, shadows = true }: { bounds: Pick<SceneBounds, 'center' | 'radius'> | null; shadows?: boolean }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3 } | null;
  const gl = useThree((s) => s.gl);
  const { shadowsChanged } = useRedraw();
  const light = useMemo(() => new THREE.DirectionalLight('#fff3e2', 2.1), []);
  const fitted = useRef('');
  const { center, radius } = bounds ?? PLACEHOLDER_BOUNDS;

  useEffect(() => {
    light.castShadow = shadows;
    light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    light.shadow.bias = -0.0004;
    light.shadow.radius = 4;
    fitted.current = '';
    shadowsChanged();
  }, [light, center, radius, shadows, shadowsChanged]);

  useFrame(() => {
    if (!shadows) return;
    // Without orbit controls (a preview) the whole scene is the region.
    const target = controls?.target ?? center;
    const widest = radius * 1.2;
    const smallest = Math.max(radius * 0.05, 1);
    let half = widest;
    if (controls) {
      const wanted = Math.max(camera.position.distanceTo(target) * 0.9, smallest);
      half = Math.min(widest, smallest * SHADOW_STEP ** Math.ceil(Math.log(wanted / smallest) / Math.log(SHADOW_STEP)));
    }
    const whole = half >= widest;
    const focus = whole ? center : target;

    // Snap the focus to the shadow map's texel grid, on the axes the light looks across.
    const texel = (2 * half) / SHADOW_MAP_SIZE;
    lightBasis.lookAt(LIGHT_DIRECTION, ORIGIN, UP).extractBasis(lightAxes.x, lightAxes.y, lightAxes.z);
    const x = Math.round(focus.dot(lightAxes.x) / texel) * texel - focus.dot(lightAxes.x);
    const y = Math.round(focus.dot(lightAxes.y) / texel) * texel - focus.dot(lightAxes.y);
    snapped.copy(focus).addScaledVector(lightAxes.x, x).addScaledVector(lightAxes.y, y);

    const key = `${half.toFixed(4)}|${snapped.x.toFixed(4)}|${snapped.y.toFixed(4)}|${snapped.z.toFixed(4)}`;
    if (key === fitted.current) return;
    fitted.current = key;

    const distance = radius * 2.4;
    light.position.copy(snapped).addScaledVector(LIGHT_DIRECTION, distance);
    light.target.position.copy(snapped);
    light.target.updateMatrixWorld();
    const cam = light.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    // Deep enough to hold the whole scene along the light's direction, wherever the focus is in it.
    cam.near = Math.max(0.1, distance - radius * 2);
    cam.far = distance + radius * 2;
    cam.updateProjectionMatrix();
    light.shadow.normalBias = texel * 1.5;
    // This frame is being drawn already; it only has to draw the shadow map too.
    gl.shadowMap.needsUpdate = true;
  });

  useEffect(() => () => light.dispose(), [light]);

  return (
    <>
      <hemisphereLight args={['#dfe6f0', '#3a3530', 0.55]} />
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
}

const ORIGIN = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Options for {@link useStagedScene}. */
interface StagedSceneOptions {
  /** What of the shared master to show (default all of it; a replay shows its own copy). */
  pick?: (master: THREE.Object3D) => THREE.Object3D;
  /** Settles the display settings on what was picked, before its shaders are built. */
  prepare?: (root: THREE.Object3D) => void;
  onReady?: (root: THREE.Object3D, master: THREE.Object3D) => (() => void) | void;
  /** Changing this rebuilds what was picked (the replay a copy is made for) without downloading the scene again. */
  variant?: unknown;
}

const identity = (master: THREE.Object3D) => master;

/** An abort the hook did not cause (its own cleanup is the only thing that should abort a load) is retried this many times. */
const UNEXPECTED_ABORT_RETRIES = 1;
const DOWNLOADING = 'Downloading the scene';

/**
 * Loads a scene version through the shared cache, builds its shaders and uploads its textures while
 * it is still out of view, then adds `pick(master)` to the Stage and frames the camera on it when it
 * is new here (or the part of the window it is shown in changed a lot). Returns the root that was
 * added and its bounds, or null while loading.
 *
 * Two effects with separate lifetimes: the first holds the shared master (keyed by the scene's URL
 * and the retry attempt only), the second shows what is picked from it and re-runs when `variant`
 * changes. The replay arriving mid-download therefore never releases the download's lease.
 */
export function useStagedScene(
  ref: SceneRef | null,
  { pick = identity, prepare, onReady, variant = null }: StagedSceneOptions = {},
): { root: THREE.Object3D | null; bounds: SceneBounds | null } {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const attempt = useStage((s) => s.scene.attempt);
  // Tagged with what it was loaded for: after the URL changes, one render still holds the previous master.
  const [loaded, setLoaded] = useState<{ url: string; attempt: number; root: THREE.Object3D } | null>(null);
  const [state, setState] = useState<{ root: THREE.Object3D | null; bounds: SceneBounds | null }>({ root: null, bounds: null });
  const url = ref?.url;

  // The shared master: downloaded (or taken from the cache) once per URL and attempt.
  useEffect(() => {
    if (!url) return;
    const stage = useStage.getState();
    stage.setSceneState({ status: 'loading', error: null });
    stage.setLoading('scene', { label: DOWNLOADING, received: 0, total: null });

    let alive = true;
    let lease: ReturnType<typeof acquireScene> | null = null;
    const load = (retriesLeft: number) => {
      const current = acquireScene(gl, url, (received, total) => useStage.getState().setLoading('scene', { label: DOWNLOADING, received, total }));
      lease = current;
      current.promise.then(
        (root) => {
          if (alive) setLoaded({ url, attempt, root });
        },
        (err: unknown) => {
          if (!alive) return;
          if (isAbortError(err) && retriesLeft > 0) {
            // Nothing in this effect aborted the load, so another view's cleanup did: start over.
            current.release();
            load(retriesLeft - 1);
            return;
          }
          useStage.getState().setSceneState({ status: 'error', error: err });
          useStage.getState().setLoading('scene', null);
        },
      );
    };
    load(UNEXPECTED_ABORT_RETRIES);

    return () => {
      alive = false;
      lease?.release();
      setLoaded(null);
      useStage.getState().setLoading('scene', null);
    };
  }, [url, attempt, gl]);

  const master = loaded && loaded.url === url && loaded.attempt === attempt ? loaded : null;

  // What is shown of the master: picked, prepared, warmed up, then added. Re-runs for a new variant.
  useEffect(() => {
    if (!url || !master) return;
    const masterRoot = master.root;
    let alive = true;
    let mounted: THREE.Object3D | null = null;
    let teardown: (() => void) | void;
    const perspective = camera as THREE.PerspectiveCamera;

    const show = async () => {
      const root = pick(masterRoot);
      prepare?.(root);
      useStage.getState().setLoading('scene', { label: 'Preparing the scene', received: 0, total: null });
      await warmUp(gl, root, perspective, scene, () => alive);
      if (!alive) return;

      scene.add(root);
      mounted = root;
      const bounds = measureScene(root);
      useStage.getState().setSceneRadius(bounds.radius);
      const fill = regionFill(window.innerWidth, window.innerHeight, useStage.getState().inset);
      const pose = framePose(root, perspective.fov, { direction: FRAME_DIRECTION, fill });
      if (pose && needsFraming(url, fill)) {
        useStage.getState().setCameraPose({ position: pose.position, target: pose.target }, 1000);
        useStage.getState().setFramedKey(url, fill);
      }
      teardown = onReady?.(root, masterRoot);
      if (!useStage.getState().summaries[url]) {
        const found = inspectScene(masterRoot);
        useStage.getState().setSummary({
          key: url,
          nodes: found.nodeCount,
          meshes: found.meshCount,
          materials: found.materials.length,
          textures: found.textures.length,
          triangles: found.triangleCount,
          vertices: found.vertexCount,
        });
      }
      setState({ root, bounds });
      useStage.getState().setSceneState({ status: 'ready' });
      useStage.getState().setLoading('scene', null);
      gl.shadowMap.needsUpdate = true;
      invalidate();
    };
    show().catch((err: unknown) => {
      if (!alive) return;
      useStage.getState().setSceneState({ status: 'error', error: err });
      useStage.getState().setLoading('scene', null);
    });

    return () => {
      alive = false;
      teardown?.();
      if (mounted) scene.remove(mounted);
      useStage.getState().setSceneRadius(0);
      setState({ root: null, bounds: null });
      invalidate();
    };
    // `pick`, `prepare` and `onReady` are expected to be stable for one scene; the master and variant drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, master, gl, scene, camera, variant]);

  return state;
}

/**
 * A scene version on its own, as a page preview shows it: the shared master graph (never changed),
 * lit and on its floor, and one snapshot of it kept for the lists.
 */
export function SceneContent() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const ref = useStage((s) => s.view.scene ?? null);
  const sceneLights = useStudio((s) => s.settings.sceneLights);
  const { redraw, shadowsChanged } = useRedraw();
  const { root, bounds } = useStagedScene(ref, { prepare: prepareForPreview });

  useEffect(() => {
    if (!root) return;
    applySceneLights(root, sceneLights);
    redraw();
  }, [root, sceneLights, redraw]);

  useEffect(() => {
    if (!root || !ref) return;
    shadowsChanged();
    let alive = true;
    // Two frames later the scene has been drawn once, so the capture is not of a half-built view.
    requestAnimationFrame(() => requestAnimationFrame(() => alive && void captureSnapshot(gl, scene, root, ref.hash)));
    return () => {
      alive = false;
    };
  }, [root, ref, gl, scene, shadowsChanged]);

  return (
    <>
      <SceneLights bounds={bounds} />
      {bounds && <Ground plan={bounds.ground} fadeDistance={Math.max(40, bounds.radius * 5)} cellSize={gridCell(bounds.radius)} />}
    </>
  );
}

function prepareForPreview(root: THREE.Object3D): void {
  prepareScene(root, true);
}

/** A grid cell size that reads at the scene's scale: 1 m for a room, 10 m for a town. */
export function gridCell(radius: number): number {
  if (radius > 150) return 10;
  if (radius > 40) return 5;
  if (radius < 3) return 0.25;
  return 1;
}
