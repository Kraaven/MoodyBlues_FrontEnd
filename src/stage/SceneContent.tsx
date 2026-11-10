import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { framePose } from '../viewer/core/gltf';
import { Ground } from '../viewer/core/Ground';
import { PALETTE } from '../viewer/core/palette';
import { acquireScene, isAbortError, sceneKey } from './sceneAssets';
import { captureSnapshot } from './snapshotCapture';
import { regionFill, useStage } from './store';

const FRAME_DIRECTION = new THREE.Vector3(1, 0.7, 1.2);

/** The lights a scene or a replay is seen under; the environment map comes from the host. */
export function SceneLights() {
  return (
    <>
      <hemisphereLight args={['#d6defa', PALETTE.ink3, 0.3]} />
      <directionalLight position={[6, 10, 4]} intensity={1.2} color="#fff4e6" />
    </>
  );
}

/**
 * Shows the scene version the current view asked for (DESIGN.md 4.2): downloads it through the shared
 * cache, adds the shared master graph to the Stage, flies the camera to frame it, and keeps one
 * snapshot of it for the lists. The master is never changed here.
 */
export function SceneContent() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const developerId = useStage((s) => s.view.scene?.developerId);
  const sceneId = useStage((s) => s.view.scene?.sceneId);
  const hash = useStage((s) => s.view.scene?.hash);
  const attempt = useStage((s) => s.scene.attempt);
  const [radius, setRadius] = useState(10);

  useEffect(() => {
    if (!developerId || !sceneId || !hash) return;
    const stage = useStage.getState();
    const label = 'Downloading the scene';
    stage.setSceneState({ status: 'loading', error: null });
    stage.setLoading('scene', { label, received: 0, total: null });

    const lease = acquireScene(gl, { developerId, sceneId, hash }, (received, total) => useStage.getState().setLoading('scene', { label, received, total }));
    let alive = true;
    let mounted: THREE.Object3D | null = null;
    const perspective = camera as THREE.PerspectiveCamera;

    lease.promise
      .then((root) => {
        if (!alive) return;
        scene.add(root);
        mounted = root;
        const fill = regionFill(window.innerWidth, window.innerHeight, useStage.getState().inset);
        const pose = framePose(root, perspective.fov, { direction: FRAME_DIRECTION, fill });
        if (pose) {
          perspective.near = Math.max(0.01, pose.distance / 1000);
          perspective.far = Math.max(1000, pose.distance * 20);
          perspective.updateProjectionMatrix();
          setRadius(pose.radius);
          // Showing the same scene again keeps the camera where the user left it.
          const key = sceneKey({ developerId, sceneId, hash });
          if (useStage.getState().framedKey !== key) {
            useStage.getState().setCameraPose({ position: pose.position, target: pose.target }, 900);
            useStage.getState().setFramedKey(key);
          }
        }
        useStage.getState().setSceneState({ status: 'ready' });
        useStage.getState().setLoading('scene', null);
        // Two frames later the scene has been drawn once, so the capture is not of a half-built view.
        requestAnimationFrame(() => requestAnimationFrame(() => alive && void captureSnapshot(gl, scene, root, hash)));
      })
      .catch((err: unknown) => {
        if (!alive || isAbortError(err)) return;
        useStage.getState().setSceneState({ status: 'error', error: err });
        useStage.getState().setLoading('scene', null);
      });

    return () => {
      alive = false;
      if (mounted) scene.remove(mounted);
      lease.release();
      useStage.getState().setLoading('scene', null);
      perspective.near = 0.1;
      perspective.far = 2000;
      perspective.updateProjectionMatrix();
    };
  }, [developerId, sceneId, hash, attempt, gl, scene, camera]);

  return (
    <>
      <SceneLights />
      <Ground y={0} fadeDistance={Math.max(60, radius * 6)} />
    </>
  );
}
