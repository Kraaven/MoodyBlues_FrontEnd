import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FRAME_DIRECTION, framePose } from '../viewer/core/gltf';
import { Ground } from '../viewer/core/Ground';
import { SelectionOutline } from '../viewer/core/SelectionOutline';
import { ReplayPlayer } from '../viewer/replay/ReplayPlayer';
import { useReplayBinding } from './binding';
import { cloneScene } from '../stage/sceneAssets';
import { applySceneLights, applyShadows, gridCell, prepareScene, SceneLights, useStagedScene } from '../stage/SceneContent';
import { reducedMotion } from '../stage/support';
import { useRedraw } from '../stage/redraw';
import { captureSnapshot } from '../stage/snapshotCapture';
import { regionFill, useStage } from '../stage/store';
import { CameraGizmos } from './CameraGizmos';
import { gizmoDepth, listCameras } from './cameras';
import { Intro } from './intro';
import { useStudio } from './studioStore';
import { useViewRig } from './viewRig/useViewRig';

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
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3 } | null;
  const ref = useStage((s) => s.view.scene ?? null);
  const surface = useStage((s) => s.surface);
  const replay = useReplayBinding((s) => s.replay);
  const playback = useReplayBinding((s) => s.playback);
  const settings = useStudio((s) => s.settings);
  const selected = useStudio((s) => s.selected);
  const frameAllRequest = useStudio((s) => s.frameAllRequest);
  const frameSelectedRequest = useStudio((s) => s.frameSelectedRequest);
  const focusCameraId = useStudio((s) => s.focusCameraId);
  const cameraMode = useStudio((s) => s.cameraMode);
  const introRequest = useStudio((s) => s.introRequest);
  const [player, setPlayer] = useState<ReplayPlayer | null>(null);
  const { redraw, shadowsChanged } = useRedraw();

  const replaying = Boolean(replay && playback);
  const pick = useCallback((master: THREE.Object3D) => (replaying ? cloneScene(master) : master), [replaying]);
  const onReady = useCallback(
    (root: THREE.Object3D, master: THREE.Object3D) => {
      if (replay && playback) {
        const created = new ReplayPlayer(root, replay);
        created.setSceneLights(useStudio.getState().settings.sceneLights);
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
  const prepare = useCallback((picked: THREE.Object3D) => prepareScene(picked, useStudio.getState().settings.shadows), []);
  const { root, bounds } = useStagedScene(ref, { pick, prepare, onReady, variant: replaying ? replay : null });

  const cameras = useMemo(() => (root ? listCameras(root) : []), [root]);
  const cameraNodes = useRef(new Map<number, THREE.Object3D>());
  useEffect(() => {
    cameraNodes.current = new Map(cameras.map((c) => [c.id, c.node]));
  }, [cameras]);
  const cameraNode = useCallback((id: number) => player?.getObject(id) ?? cameraNodes.current.get(id), [player]);

  // The canvas draws on demand: a seek, a pause or a speed change while the clock is stopped needs a frame.
  useEffect(() => {
    if (!playback) return;
    const changed = () => shadowsChanged();
    const offState = playback.subscribeState(changed);
    const offSeek = playback.subscribeSeek(changed);
    return () => {
      offState();
      offSeek();
    };
  }, [playback, shadowsChanged]);

  // Display settings. None of them change the scene's data.
  useEffect(() => {
    if (!root) return;
    applyShadows(root, settings.shadows);
    shadowsChanged();
  }, [root, settings.shadows, shadowsChanged]);

  useEffect(() => {
    if (!root) return;
    if (player) player.setSceneLights(settings.sceneLights);
    else applySceneLights(root, settings.sceneLights);
    redraw();
  }, [root, player, settings.sceneLights, redraw]);

  useEffect(() => {
    camera.fov = settings.fov;
    camera.updateProjectionMatrix();
    redraw();
  }, [camera, settings.fov, redraw]);

  // Advance the clock and keep the selection pointing at the right node. While the clock runs every
  // frame asks for the next one, and the shadows move with the replay.
  useFrame(({ gl: renderer, invalidate }, delta) => {
    playback?.advance(delta);
    if (playback?.playing) {
      renderer.shadowMap.needsUpdate = true;
      invalidate();
    }
    const studio = useStudio.getState();
    if (player && studio.selectedId !== null) {
      studio.resolveSelected(player.getObject(studio.selectedId) ?? null);
    }
  });

  // The view of a focused camera (1st person, Follow) and of the followed selection. Registered after
  // the clock above, so it sees the objects where the replay just put them.
  const { introPose, followDistanceOf } = useViewRig({ root, replay, playback, cameraNode });
  const gizmoSize = useMemo(() => gizmoDepth(bounds?.radius ?? 10, focusCameraId !== null ? followDistanceOf(focusCameraId) : null), [bounds, focusCameraId, followDistanceOf]);

  // The gizmos mark which camera is focused, and the focused one is hidden while the view is through it.
  useEffect(() => {
    redraw();
  }, [focusCameraId, cameraMode, settings.cameraGizmos, redraw]);

  // Opening a recording (a shared link waits at the overview for the welcome card's Play): the whole scene, a beat, then a flight to where following the main camera's player starts, and play. Any
  // input, or asking for less motion, goes straight to the end. Runs for every recording opened, even
  // when the scene page already framed this scene, and again from the Viewpoint window.
  useEffect(() => {
    if (!player || !root || !bounds || !playback) return;
    const { introFromStart, introGate } = useStudio.getState();
    const gated = introGate === 'waiting' && !introFromStart;
    const startTime = introFromStart ? 0 : playback.time;
    // Pressing Play on the welcome card always ends in playing, whatever ?t= said.
    const play = introFromStart || gated ? true : playback.playing;
    const main = cameras[0];
    const fov = () => useStudio.getState().settings.fov;
    const intro = new Intro(
      {
        pause: () => {
          playback.seek(startTime);
          playback.setPlaying(false);
          if (main) useStudio.getState().setFocusCamera(main.id);
        },
        showScene: () => {
          const fill = regionFill(window.innerWidth, window.innerHeight, useStage.getState().inset);
          const pose = framePose(root, fov(), { direction: FRAME_DIRECTION, fill });
          if (pose) useStage.getState().setCameraPose({ position: pose.position, target: pose.target, fov: fov() }, 0);
        },
        flyToCamera: (durationMs) => {
          const pose = main ? introPose(main.id) : null;
          if (pose) useStage.getState().setCameraPose({ ...pose, fov: fov() }, durationMs);
        },
        play: () => playback.setPlaying(play),
      },
      (running) => useStudio.getState().setIntroRunning(running),
    );
    const skip = () => intro.skip();
    surface?.addEventListener('pointerdown', skip);
    surface?.addEventListener('wheel', skip, { passive: true });
    window.addEventListener('keydown', skip);
    intro.start({ hasCameras: cameras.length > 0, reduced: reducedMotion(), waitForGo: gated });
    const unsubscribe = useStudio.subscribe((state, previous) => {
      if (previous.introGate === 'waiting' && state.introGate === 'open') intro.go();
    });
    return () => {
      unsubscribe();
      surface?.removeEventListener('pointerdown', skip);
      surface?.removeEventListener('wheel', skip);
      window.removeEventListener('keydown', skip);
      intro.cancel();
    };
    // A new recording, scene or request starts it; moving the camera or settings must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, root, bounds, playback, cameras, introRequest]);

  // Frame requests from the UI, flown by the camera rig. They end the camera focus, which would fight the move.
  useEffect(() => {
    if (frameAllRequest === 0 || !root) return;
    useStudio.getState().setFocusCamera(null);
    const pose = framePose(root, camera.fov, { direction: camera.position.clone().sub(controls?.target ?? new THREE.Vector3()) });
    if (pose) useStage.getState().setCameraPose({ position: pose.position, target: pose.target }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameAllRequest]);

  useEffect(() => {
    const node = useStudio.getState().selected;
    if (frameSelectedRequest === 0 || !node) return;
    useStudio.getState().setFocusCamera(null);
    const pose = framePose(node, camera.fov, { padding: 2.4, direction: camera.position.clone().sub(controls?.target ?? new THREE.Vector3()) });
    if (pose) useStage.getState().setCameraPose({ position: pose.position, target: pose.target }, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameSelectedRequest]);

  // Click to select, on the view's surface. Hidden objects (inactive, deleted, templates) cannot be picked.
  useEffect(() => {
    if (!root || !surface) return;
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    // Bounds trees answer for the nearest hit of each mesh, which is all a click needs from it.
    raycaster.firstHitOnly = true;
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

  return (
    <>
      <SceneLights bounds={bounds} shadows={settings.shadows} />
      {bounds && (
        <>
          <Ground plan={bounds.ground} fadeDistance={Math.max(40, bounds.radius * 5)} cellSize={gridCell(bounds.radius)} grid={settings.grid} shadows={settings.shadows} />
          {settings.cameraGizmos && cameras.length > 0 && <CameraGizmos cameras={cameras} focusId={focusCameraId} hiddenId={cameraMode === 'firstPerson' ? focusCameraId : null} depth={gizmoSize} />}
          {/* The outline pass renders the scene through a buffer every frame, so it exists only while something is selected. */}
          {selected && <SelectionOutline object={selected} />}
        </>
      )}
    </>
  );
}
