import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FRAME_DIRECTION, framePose, visibleBox } from '../viewer/core/gltf';
import { planGround, sampleFloor, type GroundPlan } from '../viewer/core/floor';
import { Ground } from '../viewer/core/Ground';
import { lightEnabled } from '../viewer/core/lightRules';
import type { Look } from '../viewer/core/look';
import { warmUp } from '../viewer/core/warmup';
import { inspectScene } from '../inspector/inspection';
import { useStudio } from '../studio/studioStore';
import { acquireScene, gameSceneOf, isAbortError } from './sceneAssets';
import { LookLights } from './SceneLights';
import { applyGameSun, currentQualityTier, effectiveLook, shadowsOn, useEffectiveLook, useShadowsOn } from './lookState';
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
 * Show or hide the lights the Unity scene exported. A visible light is paid for by every material,
 * so an invisible one is left out of the shaders altogether, yet stays in the graph for the inspector.
 * Lights the scene marks inactive stay off, and in the game look so do baked lights (their light is in
 * the lightmaps; see `lightEnabled`).
 */
export function applySceneLights(root: THREE.Object3D, on: boolean, look: Look): void {
  root.traverse((node) => {
    if ((node as THREE.Light).isLight) node.visible = lightEnabled(node, on, look);
  });
}

/**
 * What a scene needs before its first frame: the display settings that change which shaders it uses
 * (shadows, which lights are on, the game look's materials and the sun's shadow). `shadows` is the
 * user's Shadows setting; the tier and look can turn realtime shadows off.
 */
export function prepareScene(root: THREE.Object3D, shadows: boolean): void {
  const look = effectiveLook();
  const on = shadowsOn(shadows);
  applyShadows(root, on);
  applySceneLights(root, useStudio.getState().settings.sceneLights, look);
  const game = useStage.getState().game;
  if (game && look === 'game') applyGameSun(root, game, on, look, currentQualityTier());
}

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

/** Resolves after the next frame, or 100 ms (a hidden tab draws none), whichever is first. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 100);
    requestAnimationFrame(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });
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
      useStage.getState().setGame(null);
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
      // The game look: shown through the scene's materials and backdrop. Set before the shaders are built,
      // and given a frame so the backdrop (fog, environment) exists when they are.
      const game = gameSceneOf(url);
      useStage.getState().setGame(game);
      if (game) {
        game.surface.setLook(effectiveLook());
        await nextFrame();
        if (!alive) return;
      }
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
  const look = useEffectiveLook();
  const shadows = useShadowsOn(true);
  const { shadowsChanged } = useRedraw();
  const { root, bounds } = useStagedScene(ref, { prepare: prepareForPreview });

  useEffect(() => {
    if (!root) return;
    applySceneLights(root, sceneLights, look);
    applyShadows(root, shadows);
    shadowsChanged();
  }, [root, sceneLights, look, shadows, shadowsChanged]);

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
      <LookLights root={root} bounds={bounds} shadows={shadows} />
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
