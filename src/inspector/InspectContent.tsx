import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { framePose } from '../viewer/core/gltf';
import { Ground } from '../viewer/core/Ground';
import { SelectionOutline } from '../viewer/core/SelectionOutline';
import { acquireScene, isAbortError, sceneKey } from '../stage/sceneAssets';
import { SceneLights } from '../stage/SceneContent';
import { regionFill, useStage } from '../stage/store';
import { useInspector } from './inspectorStore';

const FRAME_DIRECTION = new THREE.Vector3(1, 0.7, 1.2);

function effectivelyVisible(node: THREE.Object3D): boolean {
  for (let n: THREE.Object3D | null = node; n; n = n.parent) if (!n.visible) return false;
  return true;
}

/**
 * The scene inspector's content inside the Stage's canvas (DESIGN.md 7.8). It adds the shared,
 * cached scene as it is (read-only, nothing animates it), lets the panels see it through the
 * inspector store, and takes clicks on the view's surface to select what was hit.
 */
export default function InspectContent() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;

  const developerId = useStage((s) => s.view.scene?.developerId);
  const sceneId = useStage((s) => s.view.scene?.sceneId);
  const hash = useStage((s) => s.view.scene?.hash);
  const attempt = useStage((s) => s.scene.attempt);
  const surface = useStage((s) => s.surface);

  const selected = useInspector((s) => s.selected);
  const showGrid = useInspector((s) => s.showGrid);
  const frameAllRequest = useInspector((s) => s.frameAllRequest);
  const frameSelectedRequest = useInspector((s) => s.frameSelectedRequest);

  const [root, setRoot] = useState<THREE.Object3D | null>(null);
  const [radius, setRadius] = useState(10);

  useEffect(() => {
    if (!developerId || !sceneId || !hash) return;
    const label = 'Downloading the scene';
    const stage = useStage.getState();
    stage.setSceneState({ status: 'loading', error: null });
    stage.setLoading('scene', { label, received: 0, total: null });

    const lease = acquireScene(gl, { developerId, sceneId, hash }, (received, total) => useStage.getState().setLoading('scene', { label, received, total }));
    let alive = true;
    let added: THREE.Object3D | null = null;
    const perspective = camera as THREE.PerspectiveCamera;

    lease.promise
      .then((master) => {
        if (!alive) return;
        added = master;
        scene.add(master);
        const fill = regionFill(window.innerWidth, window.innerHeight, useStage.getState().inset);
        const pose = framePose(master, perspective.fov, { direction: FRAME_DIRECTION, fill });
        if (pose) {
          perspective.near = Math.max(0.01, pose.distance / 1000);
          perspective.far = Math.max(1000, pose.distance * 20);
          perspective.updateProjectionMatrix();
          setRadius(pose.radius);
          const key = sceneKey({ developerId, sceneId, hash });
          if (useStage.getState().framedKey !== key) {
            useStage.getState().setCameraPose({ position: pose.position, target: pose.target }, 900);
            useStage.getState().setFramedKey(key);
          }
        }
        setRoot(master);
        useInspector.getState().attach(master, gl);
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
      useInspector.getState().attach(null, null);
      if (added) scene.remove(added);
      lease.release();
      useStage.getState().setLoading('scene', null);
      perspective.near = 0.1;
      perspective.far = 2000;
      perspective.updateProjectionMatrix();
      setRoot(null);
    };
  }, [developerId, sceneId, hash, attempt, gl, scene, camera]);

  useEffect(() => {
    if (frameAllRequest === 0 || !root) return;
    const pose = framePose(root, (camera as THREE.PerspectiveCamera).fov, { direction: camera.position.clone().sub(controls?.target ?? new THREE.Vector3()) });
    if (pose) useStage.getState().setCameraPose({ position: pose.position, target: pose.target }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameAllRequest]);

  useEffect(() => {
    if (frameSelectedRequest === 0 || !selected) return;
    const pose = framePose(selected, (camera as THREE.PerspectiveCamera).fov, {
      padding: 2.2,
      direction: camera.position.clone().sub(controls?.target ?? new THREE.Vector3()),
    });
    if (pose) useStage.getState().setCameraPose({ position: pose.position, target: pose.target }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameSelectedRequest]);

  // Click to select, on the view's surface. Anything inactive at start cannot be hit.
  useEffect(() => {
    if (!root || !surface) return;
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      down = null;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(root, true).find((h) => effectivelyVisible(h.object));
      useInspector.getState().select(hit?.object ?? null);
    };
    surface.addEventListener('pointerdown', onDown);
    surface.addEventListener('pointerup', onUp);
    return () => {
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointerup', onUp);
    };
  }, [root, surface, gl, camera]);

  return (
    <>
      <SceneLights />
      {showGrid && <Ground y={0} fadeDistance={Math.max(60, radius * 6)} />}
      {selected && <SelectionOutline object={selected} />}
    </>
  );
}
