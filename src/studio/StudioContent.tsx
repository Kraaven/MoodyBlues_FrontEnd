import { useCallback, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { framePose } from '../viewer/core/gltf';
import { Ground } from '../viewer/core/Ground';
import { SelectionOutline } from '../viewer/core/SelectionOutline';
import { ReplayPlayer } from '../viewer/replay/ReplayPlayer';
import { useReplayBinding } from '../player/binding';
import { cloneScene } from '../stage/sceneAssets';
import { applyShadows, gridCell, SceneLights, useStagedScene } from '../stage/SceneContent';
import { captureSnapshot } from '../stage/snapshotCapture';
import { useStage } from '../stage/store';
import { useStudio } from './studioStore';

function effectivelyVisible(node: THREE.Object3D): boolean {
  for (let n: THREE.Object3D | null = node; n; n = n.parent) if (!n.visible) return false;
  return true;
}

/** The node a click means: the nearest GameObject that has an ObjectID, else what was hit. */
function gameObjectOf(node: THREE.Object3D, root: THREE.Object3D): THREE.Object3D {
  for (let n: THREE.Object3D | null = node; n && n !== root; n = n.parent) if (typeof n.userData?.objectId === 'number') return n;
  return node;
}

/**
 * The studio inside the Stage's canvas: one scene version, either as it was exported (inspection,
 * the cached master shown read only) or driven by a session's replay (a copy the replay animates).
 * Arriving from the scene page costs no second download; the scene cache already has it.
 */
export default function StudioContent() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const ref = useStage((s) => s.view.scene ?? null);
  const surface = useStage((s) => s.surface);
  const replay = useReplayBinding((s) => s.replay);
  const playback = useReplayBinding((s) => s.playback);
  const settings = useStudio((s) => s.settings);
  const selected = useStudio((s) => s.selected);
  const frameAllRequest = useStudio((s) => s.frameAllRequest);
  const frameSelectedRequest = useStudio((s) => s.frameSelectedRequest);
  const [player, setPlayer] = useState<ReplayPlayer | null>(null);

  const replaying = Boolean(replay && playback);
  const pick = useCallback((master: THREE.Object3D) => (replaying ? cloneScene(master) : master), [replaying]);
  const onReady = useCallback(
    (root: THREE.Object3D, master: THREE.Object3D) => {
      if (replay && playback) {
        const created = new ReplayPlayer(root, replay);
        playback.attach(created);
        setPlayer(created);
        useStudio.getState().attach({ root, master, renderer: gl, player: created });
        return () => {
          playback.attach(null);
          created.dispose();
          setPlayer(null);
          useStudio.getState().attach(null);
        };
      }
      useStudio.getState().attach({ root, master, renderer: gl, player: null });
      // The first time a version is opened anywhere, keep a picture of it for the lists.
      let alive = true;
      if (ref) requestAnimationFrame(() => requestAnimationFrame(() => alive && void captureSnapshot(gl, scene, master, ref.hash)));
      return () => {
        alive = false;
        useStudio.getState().attach(null);
      };
    },
    [replay, playback, gl, scene, ref],
  );
  const { root, bounds } = useStagedScene(ref, pick, onReady, replaying ? replay : null);

  // Display settings. None of them change the scene's data.
  useEffect(() => {
    if (root) applyShadows(root, settings.shadows);
  }, [root, settings.shadows]);

  useEffect(() => {
    if (!root || !settings.wireframe) return;
    const changed = new Set<THREE.Material>();
    root.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const w = m as THREE.Material & { wireframe?: boolean };
        if (w && 'wireframe' in w && !w.wireframe) {
          w.wireframe = true;
          changed.add(w);
        }
      }
    });
    return () => changed.forEach((m) => ((m as THREE.Material & { wireframe: boolean }).wireframe = false));
  }, [root, settings.wireframe]);

  useEffect(() => {
    camera.fov = settings.fov;
    camera.updateProjectionMatrix();
  }, [camera, settings.fov]);

  // Advance the clock; keep the selection pointing at the right node; follow it.
  useFrame((_, delta) => {
    playback?.advance(delta);
    const studio = useStudio.getState();
    if (player && studio.selectedId !== null) {
      studio.resolveSelected(player.getObject(studio.selectedId) ?? null);
    }
    if (!studio.follow || !studio.selected || !controls) return;
    const shift = studio.selected.getWorldPosition(new THREE.Vector3()).sub(controls.target);
    controls.target.add(shift);
    camera.position.add(shift);
    controls.update();
  });

  // Frame requests from the UI, flown by the camera rig.
  useEffect(() => {
    if (frameAllRequest === 0 || !root) return;
    const pose = framePose(root, camera.fov, { direction: camera.position.clone().sub(controls?.target ?? new THREE.Vector3()) });
    if (pose) useStage.getState().setCameraPose({ position: pose.position, target: pose.target }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameAllRequest]);

  useEffect(() => {
    const node = useStudio.getState().selected;
    if (frameSelectedRequest === 0 || !node) return;
    const pose = framePose(node, camera.fov, { padding: 2.4, direction: camera.position.clone().sub(controls?.target ?? new THREE.Vector3()) });
    if (pose) useStage.getState().setCameraPose({ position: pose.position, target: pose.target }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameSelectedRequest]);

  // Click to select, on the view's surface. Hidden objects (inactive, deleted, templates) cannot be picked.
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
      const hit = raycaster.intersectObject(root, true).find((h) => (h.object as THREE.Mesh).isMesh && effectivelyVisible(h.object));
      const studio = useStudio.getState();
      if (!hit) studio.select(null);
      else if (player) studio.selectId(player.objectIdOf(hit.object));
      else studio.select(gameObjectOf(hit.object, root));
    };
    surface.addEventListener('pointerdown', onDown);
    surface.addEventListener('pointerup', onUp);
    return () => {
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointerup', onUp);
    };
  }, [root, player, surface, gl, camera]);

  if (!bounds) return null;
  return (
    <>
      <SceneLights bounds={bounds} shadows={settings.shadows} />
      <Ground y={bounds.floorY} fadeDistance={Math.max(40, bounds.radius * 5)} cellSize={gridCell(bounds.radius)} grid={settings.grid} shadows={settings.shadows} extent={bounds.radius * 12} />
      {settings.axes && <axesHelper args={[Math.max(1, bounds.radius * 0.5)]} position={[bounds.center.x, bounds.floorY + 0.01, bounds.center.z]} />}
      {/* The outline pass costs a multisampled render every frame, so it exists only while something is selected. */}
      {selected && <SelectionOutline object={selected} />}
    </>
  );
}
