import { useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { framePose } from '../viewer/core/gltf';
import { Ground } from '../viewer/core/Ground';
import { SelectionOutline } from '../viewer/core/SelectionOutline';
import { ReplayPlayer } from '../viewer/replay/ReplayPlayer';
import { acquireScene, cloneScene, isAbortError, sceneKey } from '../stage/sceneAssets';
import { SceneLights } from '../stage/SceneContent';
import { regionFill, useStage } from '../stage/store';
import { useReplayBinding } from './binding';
import { usePlayerUi } from './playback';

const FRAME_DIRECTION = new THREE.Vector3(1, 0.7, 1.2);

/**
 * The recorded scene driven by its replay (DESIGN.md 7.7), inside the Stage's canvas. The scene
 * version comes from the shared cache, so arriving from the scene page costs no second download; the
 * replay animates its own copy and the cached master stays untouched.
 */
export default function ReplayContent() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;

  const replay = useReplayBinding((s) => s.replay);
  const playback = useReplayBinding((s) => s.playback);
  const developerId = useStage((s) => s.view.scene?.developerId);
  const sceneId = useStage((s) => s.view.scene?.sceneId);
  const hash = useStage((s) => s.view.scene?.hash);
  const attempt = useStage((s) => s.scene.attempt);
  const surface = useStage((s) => s.surface);

  const selectedId = usePlayerUi((s) => s.selectedId);
  const follow = usePlayerUi((s) => s.follow);
  const showGrid = usePlayerUi((s) => s.showGrid);
  const frameAllRequest = usePlayerUi((s) => s.frameAllRequest);
  const frameSelectedRequest = usePlayerUi((s) => s.frameSelectedRequest);

  const [root, setRoot] = useState<THREE.Object3D | null>(null);
  const [player, setPlayer] = useState<ReplayPlayer | null>(null);
  const [radius, setRadius] = useState(10);

  // Load the exact scene version the session was recorded in (Unity Spec 5.1).
  useEffect(() => {
    if (!developerId || !sceneId || !hash || !replay || !playback) return;
    const label = 'Downloading the scene';
    const stage = useStage.getState();
    stage.setSceneState({ status: 'loading', error: null });
    stage.setLoading('scene', { label, received: 0, total: null });

    const lease = acquireScene(gl, { developerId, sceneId, hash }, (received, total) => useStage.getState().setLoading('scene', { label, received, total }));
    let alive = true;
    let clone: THREE.Object3D | null = null;
    let created: ReplayPlayer | null = null;
    const perspective = camera as THREE.PerspectiveCamera;

    lease.promise
      .then((master) => {
        if (!alive) return;
        clone = cloneScene(master);
        scene.add(clone);
        created = new ReplayPlayer(clone, replay);
        playback.attach(created);

        const fill = regionFill(window.innerWidth, window.innerHeight, useStage.getState().inset);
        const pose = framePose(clone, perspective.fov, { direction: FRAME_DIRECTION, fill });
        if (pose) {
          perspective.near = Math.max(0.01, pose.distance / 1000);
          perspective.far = Math.max(1000, pose.distance * 20);
          perspective.updateProjectionMatrix();
          setRadius(pose.radius);
          // Arriving from the scene page keeps the camera where the user left it.
          const key = sceneKey({ developerId, sceneId, hash });
          if (useStage.getState().framedKey !== key) {
            useStage.getState().setCameraPose({ position: pose.position, target: pose.target }, 900);
            useStage.getState().setFramedKey(key);
          }
        }
        setRoot(clone);
        setPlayer(created);
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
      playback.attach(null);
      created?.dispose();
      if (clone) scene.remove(clone);
      lease.release();
      useStage.getState().setLoading('scene', null);
      perspective.near = 0.1;
      perspective.far = 2000;
      perspective.updateProjectionMatrix();
      setRoot(null);
      setPlayer(null);
    };
  }, [developerId, sceneId, hash, replay, playback, attempt, gl, scene, camera]);

  // Advance the clock; keep the followed object centred while the user still orbits freely.
  useFrame((_, delta) => {
    playback?.advance(delta);
    if (!follow || !player || selectedId === null || !controls) return;
    const node = player.getObject(selectedId);
    if (!node) return;
    const shift = node.getWorldPosition(new THREE.Vector3()).sub(controls.target);
    controls.target.add(shift);
    camera.position.add(shift);
    controls.update();
  });

  // Frame requests from the UI (A, frame selected), flown by the camera rig.
  useEffect(() => {
    if (frameAllRequest === 0 || !root) return;
    const pose = framePose(root, (camera as THREE.PerspectiveCamera).fov, { direction: camera.position.clone().sub(controls?.target ?? new THREE.Vector3()) });
    if (pose) useStage.getState().setCameraPose({ position: pose.position, target: pose.target }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameAllRequest]);

  useEffect(() => {
    if (frameSelectedRequest === 0 || !player || selectedId === null) return;
    const node = player.getObject(selectedId);
    if (!node) return;
    const pose = framePose(node, (camera as THREE.PerspectiveCamera).fov, {
      padding: 2.2,
      direction: camera.position.clone().sub(controls?.target ?? new THREE.Vector3()),
    });
    if (pose) useStage.getState().setCameraPose({ position: pose.position, target: pose.target }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameSelectedRequest]);

  // Click to select, on the view's surface. Hidden objects (inactive, deleted, templates) cannot be picked.
  useEffect(() => {
    if (!root || !player || !surface) return;
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      down = null;
      // NDC against the whole canvas: the camera's view offset already accounts for the part of it the view uses.
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(root, true).find((h) => ReplayPlayer.isEffectivelyVisible(h.object));
      usePlayerUi.getState().select(hit ? player.objectIdOf(hit.object) : null);
    };
    surface.addEventListener('pointerdown', onDown);
    surface.addEventListener('pointerup', onUp);
    return () => {
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointerup', onUp);
    };
  }, [root, player, surface, gl, camera]);

  // The selected node can change identity (a spawn appearing or a clone being reused).
  const [selectedNode, setSelectedNode] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    if (!player || !playback || selectedId === null) {
      setSelectedNode(null);
      return;
    }
    const resolve = () =>
      setSelectedNode((prev) => {
        const node = player.getObject(selectedId) ?? null;
        return node === prev ? prev : node;
      });
    return playback.subscribe(resolve);
  }, [player, playback, selectedId]);

  return (
    <>
      <SceneLights />
      {showGrid && <Ground y={0} fadeDistance={Math.max(60, radius * 6)} />}
      {/* The outline pass costs a multisampled render every frame, so it exists only while something is selected. */}
      {selectedNode && <SelectionOutline object={selectedNode} />}
    </>
  );
}
