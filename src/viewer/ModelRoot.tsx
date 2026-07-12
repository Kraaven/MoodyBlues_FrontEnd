import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useViewerStore } from './viewerStore';
import { inspectScene } from './gltfInspection';

export function ModelRoot({ gltf }: { gltf: GLTF }) {
  const { scene } = useThree();
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<THREE.AnimationAction[]>([]);
  const uiThrottleRef = useRef(0);
  const skeletonHelpersRef = useRef<THREE.SkeletonHelper[]>([]);
  const selectionHelperRef = useRef<THREE.BoxHelper | null>(null);

  const wireframe = useViewerStore((s) => s.wireframe);
  const showSkeleton = useViewerStore((s) => s.showSkeleton);
  const selectedUuid = useViewerStore((s) => s.selectedUuid);

  // One-time setup per loaded model: register it in the scene, collect inspection data, set up animations.
  useEffect(() => {
    scene.add(gltf.scene);

    const inspection = inspectScene(gltf.scene);
    useViewerStore.getState().setInspection(inspection);

    const mixer = new THREE.AnimationMixer(gltf.scene);
    mixerRef.current = mixer;
    actionsRef.current = gltf.animations.map((clip) => mixer.clipAction(clip));
    useViewerStore.getState().setClips(gltf.animations);
    if (actionsRef.current.length > 0) {
      actionsRef.current[0].play();
    }

    return () => {
      mixer.stopAllAction();
      scene.remove(gltf.scene);
      useViewerStore.getState().reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf, scene]);

  // Switch which clip is "active" when the Animations panel changes selection.
  useEffect(() => {
    const unsubscribe = useViewerStore.subscribe((state, prevState) => {
      if (state.currentClipIndex === prevState.currentClipIndex) return;
      actionsRef.current.forEach((action, i) => {
        if (i === state.currentClipIndex) {
          action.reset();
          if (state.isPlaying) action.play();
        } else {
          action.stop();
        }
      });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = useViewerStore.subscribe((state, prevState) => {
      if (state.isPlaying === prevState.isPlaying) return;
      const action = actionsRef.current[state.currentClipIndex];
      if (!action) return;
      if (state.isPlaying) {
        action.paused = false;
        if (!action.isRunning()) action.play();
      } else {
        action.paused = true;
      }
    });
    return unsubscribe;
  }, []);

  // Wireframe toggle -- applied to every material on every mesh in the model.
  useEffect(() => {
    gltf.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (material && 'wireframe' in material) {
          (material as THREE.MeshStandardMaterial).wireframe = wireframe;
        }
      }
    });
  }, [gltf, wireframe]);

  // Skeleton visualization toggle -- adds a SkeletonHelper per SkinnedMesh.
  useEffect(() => {
    skeletonHelpersRef.current.forEach((helper) => scene.remove(helper));
    skeletonHelpersRef.current = [];

    if (showSkeleton) {
      gltf.scene.traverse((object) => {
        if ((object as THREE.SkinnedMesh).isSkinnedMesh) {
          const helper = new THREE.SkeletonHelper(object);
          scene.add(helper);
          skeletonHelpersRef.current.push(helper);
        }
      });
    }

    return () => {
      skeletonHelpersRef.current.forEach((helper) => scene.remove(helper));
      skeletonHelpersRef.current = [];
    };
  }, [gltf, showSkeleton, scene]);

  // Selection highlight -- a bounding-box outline around the currently selected node.
  useEffect(() => {
    if (selectionHelperRef.current) {
      scene.remove(selectionHelperRef.current);
      selectionHelperRef.current = null;
    }

    if (selectedUuid) {
      const target = gltf.scene.getObjectByProperty('uuid', selectedUuid);
      if (target) {
        const helper = new THREE.BoxHelper(target, new THREE.Color('#a855f7'));
        scene.add(helper);
        selectionHelperRef.current = helper;
      }
    }

    return () => {
      if (selectionHelperRef.current) {
        scene.remove(selectionHelperRef.current);
        selectionHelperRef.current = null;
      }
    };
  }, [gltf, selectedUuid, scene]);

  useFrame((_, delta) => {
    const mixer = mixerRef.current;
    if (!mixer) return;

    const state = useViewerStore.getState();

    if (state.seekRequest !== null) {
      const action = actionsRef.current[state.currentClipIndex];
      if (action) {
        action.time = state.seekRequest;
        mixer.update(0);
      }
      useViewerStore.getState().setPlaybackTime(state.seekRequest, action?.getClip().duration ?? 0);
      useViewerStore.getState().clearSeekRequest();
    } else if (state.isPlaying) {
      mixer.update(delta);

      uiThrottleRef.current += delta;
      if (uiThrottleRef.current > 0.05) {
        uiThrottleRef.current = 0;
        const action = actionsRef.current[state.currentClipIndex];
        if (action) {
          useViewerStore.getState().setPlaybackTime(action.time % action.getClip().duration, action.getClip().duration);
        }
      }
    }

    selectionHelperRef.current?.update();
  });

  return null;
}
