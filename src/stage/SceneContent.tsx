import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { framePose } from '../viewer/core/gltf';
import { Ground } from '../viewer/core/Ground';
import { inspectScene } from '../inspector/inspection';
import { acquireScene, isAbortError, sceneKey } from './sceneAssets';
import { captureSnapshot } from './snapshotCapture';
import { needsFraming, regionFill, useStage, type SceneRef } from './store';

export const FRAME_DIRECTION = new THREE.Vector3(1, 0.78, 1.15);

/** Where a loaded scene sits: its centre, size and floor, for lights, shadows and the grid. */
export interface SceneBounds {
  center: THREE.Vector3;
  radius: number;
  floorY: number;
}

export function measureScene(root: THREE.Object3D): SceneBounds {
  const box = new THREE.Box3().setFromObject(root, true);
  if (box.isEmpty()) return { center: new THREE.Vector3(), radius: 10, floorY: 0 };
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  return { center: sphere.center, radius: Math.max(sphere.radius, 0.5), floorY: box.min.y };
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
 * The lights a scene is seen under (the environment map comes from the host): a warm key from the
 * front left, high, casting soft shadows sized to the scene, and a cool sky fill.
 */
export function SceneLights({ bounds, shadows = true }: { bounds: SceneBounds; shadows?: boolean }) {
  const light = useMemo(() => new THREE.DirectionalLight('#fff3e2', 2.1), []);
  const { center, radius } = bounds;

  useEffect(() => {
    light.position.set(center.x - radius * 0.9, center.y + radius * 1.6, center.z + radius * 0.7);
    light.target.position.copy(center);
    light.target.updateMatrixWorld();
    light.castShadow = shadows;
    const cam = light.shadow.camera;
    cam.left = -radius * 1.2;
    cam.right = radius * 1.2;
    cam.top = radius * 1.2;
    cam.bottom = -radius * 1.2;
    cam.near = radius * 0.1;
    cam.far = radius * 5;
    cam.updateProjectionMatrix();
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = radius * 0.0015;
    light.shadow.radius = 4;
    light.shadow.needsUpdate = true;
  }, [light, center, radius, shadows]);

  useEffect(() => () => light.dispose(), [light]);

  return (
    <>
      <hemisphereLight args={['#dfe6f0', '#3a3530', 0.55]} />
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
}

/**
 * Loads a scene version through the shared cache, adds `pick(master)` to the Stage, and frames the
 * camera on it when it is new here (or the part of the window it is shown in changed a lot).
 * Returns the root that was added and its bounds, or null while loading.
 */
export function useStagedScene(
  ref: SceneRef | null,
  pick: (master: THREE.Object3D) => THREE.Object3D = (m) => m,
  onReady?: (root: THREE.Object3D, master: THREE.Object3D) => (() => void) | void,
  /** Changing this rebuilds what was picked (the replay a copy is made for). */
  variant: unknown = null,
): { root: THREE.Object3D | null; bounds: SceneBounds | null } {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const attempt = useStage((s) => s.scene.attempt);
  const [state, setState] = useState<{ root: THREE.Object3D | null; bounds: SceneBounds | null }>({ root: null, bounds: null });
  const developerId = ref?.developerId;
  const sceneId = ref?.sceneId;
  const hash = ref?.hash;

  useEffect(() => {
    if (!developerId || !sceneId || !hash) return;
    const label = 'Downloading the scene';
    const stage = useStage.getState();
    stage.setSceneState({ status: 'loading', error: null });
    stage.setLoading('scene', { label, received: 0, total: null });

    const lease = acquireScene(gl, { developerId, sceneId, hash }, (received, total) => useStage.getState().setLoading('scene', { label, received, total }));
    let alive = true;
    let mounted: THREE.Object3D | null = null;
    let teardown: (() => void) | void;
    const perspective = camera as THREE.PerspectiveCamera;

    lease.promise
      .then((master) => {
        if (!alive) return;
        const root = pick(master);
        scene.add(root);
        mounted = root;
        const bounds = measureScene(root);
        const fill = regionFill(window.innerWidth, window.innerHeight, useStage.getState().inset);
        const pose = framePose(root, perspective.fov, { direction: FRAME_DIRECTION, fill });
        if (pose) {
          perspective.near = Math.max(0.01, pose.distance / 1000);
          perspective.far = Math.max(1000, pose.distance * 20);
          perspective.updateProjectionMatrix();
          const key = sceneKey({ developerId, sceneId, hash });
          if (needsFraming(key, fill)) {
            useStage.getState().setCameraPose({ position: pose.position, target: pose.target }, 1000);
            useStage.getState().setFramedKey(key, fill);
          }
        }
        teardown = onReady?.(root, master);
        if (!useStage.getState().summaries[sceneKey({ developerId, sceneId, hash })]) {
          const found = inspectScene(master);
          useStage.getState().setSummary({
            key: sceneKey({ developerId, sceneId, hash }),
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
      })
      .catch((err: unknown) => {
        if (!alive || isAbortError(err)) return;
        useStage.getState().setSceneState({ status: 'error', error: err });
        useStage.getState().setLoading('scene', null);
      });

    return () => {
      alive = false;
      teardown?.();
      if (mounted) scene.remove(mounted);
      lease.release();
      useStage.getState().setLoading('scene', null);
      perspective.near = 0.1;
      perspective.far = 2000;
      perspective.updateProjectionMatrix();
      setState({ root: null, bounds: null });
    };
    // `pick` and `onReady` are expected to be stable for one scene; the scene identity drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [developerId, sceneId, hash, attempt, gl, scene, camera, variant]);

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
  const { root, bounds } = useStagedScene(ref);

  useEffect(() => {
    if (!root || !ref) return;
    applyShadows(root, true);
    let alive = true;
    // Two frames later the scene has been drawn once, so the capture is not of a half-built view.
    requestAnimationFrame(() => requestAnimationFrame(() => alive && void captureSnapshot(gl, scene, root, ref.hash)));
    return () => {
      alive = false;
    };
  }, [root, ref, gl, scene]);

  if (!bounds) return null;
  return (
    <>
      <SceneLights bounds={bounds} />
      <Ground y={bounds.floorY} fadeDistance={Math.max(40, bounds.radius * 5)} cellSize={gridCell(bounds.radius)} shadows extent={bounds.radius * 12} />
    </>
  );
}

/** A grid cell size that reads at the scene's scale: 1 m for a room, 10 m for a town. */
export function gridCell(radius: number): number {
  if (radius > 150) return 10;
  if (radius > 40) return 5;
  if (radius < 3) return 0.25;
  return 1;
}
