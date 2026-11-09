import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { disposeObject3D, frameObject, type Progress } from '../viewer/core/gltf';
import { loadSceneGltf } from '../stage/sceneSource';
import { ReplayPlayer } from '../viewer/replay/ReplayPlayer';
import type { Replay } from '../viewer/replay/replayFile';
import { SelectionOutline } from '../viewer/core/SelectionOutline';
import { Stage } from '../viewer/Stage';
import { usePlayerUi, type Playback } from './playback';

interface Props {
  developerId: string;
  sceneId: string;
  sceneHash: string;
  replay: Replay;
  playback: Playback;
  onProgress: Progress;
  onLoaded: () => void;
  onError: (err: unknown) => void;
}

/** The player's 3D view (DESIGN.md 7.6): the recorded scene version, driven by the replay. */
export function PlayerViewport(props: Props) {
  const showGrid = usePlayerUi((s) => s.showGrid);
  return (
    <Stage grid={showGrid} className="absolute inset-0">
      <ReplayScene {...props} />
    </Stage>
  );
}

function ReplayScene({ developerId, sceneId, sceneHash, replay, playback, onProgress, onLoaded, onError }: Props) {
  const { gl, camera, scene } = useThree();
  const controls = useRef<OrbitControlsImpl | null>(null);
  const [root, setRoot] = useState<THREE.Object3D | null>(null);
  const [player, setPlayer] = useState<ReplayPlayer | null>(null);
  const callbacks = useRef({ onProgress, onLoaded, onError });
  callbacks.current = { onProgress, onLoaded, onError };

  const selectedId = usePlayerUi((s) => s.selectedId);
  const follow = usePlayerUi((s) => s.follow);
  const frameAllRequest = usePlayerUi((s) => s.frameAllRequest);
  const frameSelectedRequest = usePlayerUi((s) => s.frameSelectedRequest);

  // Load the exact scene version the session was recorded in (Unity Spec 5.1).
  useEffect(() => {
    const controller = new AbortController();
    let loaded: THREE.Object3D | null = null;
    let created: ReplayPlayer | null = null;

    loadSceneGltf(gl, developerId, sceneId, sceneHash, (r, t) => callbacks.current.onProgress(r, t), controller.signal)
      .then((gltf) => {
        if (controller.signal.aborted) return disposeObject3D(gltf.scene);
        loaded = gltf.scene;
        scene.add(loaded);
        frameObject(camera as THREE.PerspectiveCamera, controls.current?.target ?? null, loaded, { direction: new THREE.Vector3(1, 0.7, 1.2) });
        controls.current?.update();
        created = new ReplayPlayer(loaded, replay);
        playback.attach(created);
        setRoot(loaded);
        setPlayer(created);
        callbacks.current.onLoaded();
      })
      .catch((err) => {
        if (!controller.signal.aborted) callbacks.current.onError(err);
      });

    return () => {
      controller.abort();
      playback.attach(null);
      created?.dispose();
      if (loaded) {
        scene.remove(loaded);
        disposeObject3D(loaded);
      }
      setRoot(null);
      setPlayer(null);
    };
  }, [gl, camera, scene, developerId, sceneId, sceneHash, replay, playback]);

  // Advance the clock; keep the followed object centred.
  useFrame((_, delta) => {
    playback.advance(delta);
    const ctl = controls.current;
    if (!follow || !player || selectedId === null || !ctl) return;
    const node = player.getObject(selectedId);
    if (!node) return;
    // Move camera and target by how far the object moved, so orbiting still works while following.
    const shift = node.getWorldPosition(new THREE.Vector3()).sub(ctl.target);
    ctl.target.add(shift);
    camera.position.add(shift);
    ctl.update();
  });

  // Frame requests from the UI (A, frame selected).
  useEffect(() => {
    if (frameAllRequest === 0 || !root) return;
    frameObject(camera as THREE.PerspectiveCamera, controls.current?.target ?? null, root);
    controls.current?.update();
  }, [frameAllRequest, root, camera]);

  useEffect(() => {
    if (frameSelectedRequest === 0 || !player || selectedId === null) return;
    const node = player.getObject(selectedId);
    if (node) frameObject(camera as THREE.PerspectiveCamera, controls.current?.target ?? null, node, { padding: 2.2 });
    controls.current?.update();
  }, [frameSelectedRequest, player, selectedId, camera]);

  // Click to select. Hidden objects (inactive, deleted, templates) cannot be picked.
  useEffect(() => {
    if (!root || !player) return;
    const dom = gl.domElement;
    const raycaster = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      down = null;
      const rect = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(root, true).find((h) => ReplayPlayer.isEffectivelyVisible(h.object));
      usePlayerUi.getState().select(hit ? player.objectIdOf(hit.object) : null);
    };
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointerup', onUp);
    return () => {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointerup', onUp);
    };
  }, [root, player, gl, camera]);

  // The selected node can change identity (a spawn appearing or a clone being reused).
  const [selectedNode, setSelectedNode] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    if (!player || selectedId === null) {
      setSelectedNode(null);
      return;
    }
    const check = () => setSelectedNode((prev) => {
      const node = player.getObject(selectedId) ?? null;
      return node === prev ? prev : node;
    });
    check();
    return playback.subscribe(check);
  }, [player, selectedId, playback]);

  return (
    <>
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} />
      <SelectionOutline object={selectedNode} />
    </>
  );
}
