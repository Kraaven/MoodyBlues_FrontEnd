import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useViewerStore } from './viewerStore';
import { inspectScene } from './gltfInspection';

const SELECTION_COLOR = '#5b7cfa';
const MATERIAL_HIGHLIGHT_COLOR = '#dceeb1';
const CLICK_DRAG_THRESHOLD_PX = 4;

export function ModelRoot({ gltf }: { gltf: GLTF }) {
  const { scene, gl, camera } = useThree();
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<THREE.AnimationAction[]>([]);
  const uiThrottleRef = useRef(0);
  const skeletonHelpersRef = useRef<THREE.SkeletonHelper[]>([]);
  const selectionHelperRef = useRef<THREE.BoxHelper | null>(null);
  const materialHighlightHelpersRef = useRef<THREE.BoxHelper[]>([]);

  const wireframe = useViewerStore((s) => s.wireframe);
  const showSkeleton = useViewerStore((s) => s.showSkeleton);
  const selectedUuid = useViewerStore((s) => s.selectedUuid);
  const highlightedMaterialUuid = useViewerStore((s) => s.highlightedMaterialUuid);

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

  // Click-to-select directly in the viewport -- a pointerdown/pointerup pair that didn't move far
  // (so orbit-control drags don't get mistaken for a selection) raycasts against the model and
  // selects the first mesh hit, or clears selection if the click missed everything.
  useEffect(() => {
    const canvasEl = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downPos: { x: number; y: number } | null = null;

    const onPointerDown = (event: PointerEvent) => {
      downPos = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!downPos) return;
      const dx = event.clientX - downPos.x;
      const dy = event.clientY - downPos.y;
      downPos = null;
      if (Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD_PX) return;

      const rect = canvasEl.getBoundingClientRect();
      ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);

      const hits = raycaster.intersectObject(gltf.scene, true);
      const meshHit = hits.find((hit) => (hit.object as THREE.Mesh).isMesh);
      useViewerStore.getState().selectNode(meshHit ? meshHit.object.uuid : null);
    };

    canvasEl.addEventListener('pointerdown', onPointerDown);
    canvasEl.addEventListener('pointerup', onPointerUp);
    return () => {
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      canvasEl.removeEventListener('pointerup', onPointerUp);
    };
  }, [gltf, gl, camera]);

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
        const helper = new THREE.BoxHelper(target, new THREE.Color(SELECTION_COLOR));
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

  // Material Index cross-highlight -- outlines every mesh using the selected material.
  useEffect(() => {
    materialHighlightHelpersRef.current.forEach((helper) => scene.remove(helper));
    materialHighlightHelpersRef.current = [];

    if (highlightedMaterialUuid) {
      gltf.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (materials.some((m) => m?.uuid === highlightedMaterialUuid)) {
          const helper = new THREE.BoxHelper(mesh, new THREE.Color(MATERIAL_HIGHLIGHT_COLOR));
          scene.add(helper);
          materialHighlightHelpersRef.current.push(helper);
        }
      });
    }

    return () => {
      materialHighlightHelpersRef.current.forEach((helper) => scene.remove(helper));
      materialHighlightHelpersRef.current = [];
    };
  }, [gltf, highlightedMaterialUuid, scene]);

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
    materialHighlightHelpersRef.current.forEach((helper) => helper.update());
  });

  return null;
}
