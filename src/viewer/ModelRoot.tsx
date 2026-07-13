import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useViewerStore } from './viewerStore';
import { inspectScene } from './gltfInspection';

const SELECTION_COLOR = '#f3ab6f';
const WIREFRAME_COLOR = '#5b7cfa';
const MATERIAL_HIGHLIGHT_COLOR = '#dceeb1';
const CLICK_DRAG_THRESHOLD_PX = 4;
const GIZMO_MIN_LENGTH = 0.2;
const GIZMO_MAX_LENGTH = 5;

export function ModelRoot({ gltf }: { gltf: GLTF }) {
  const { scene, gl, camera } = useThree();
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<THREE.AnimationAction[]>([]);
  const uiThrottleRef = useRef(0);
  const skeletonHelpersRef = useRef<THREE.SkeletonHelper[]>([]);
  const materialHighlightHelpersRef = useRef<THREE.BoxHelper[]>([]);
  const gizmoGroupRef = useRef<THREE.Group | null>(null);
  const originalMaterialsRef = useRef<Map<string, THREE.Material | THREE.Material[]>>(new Map());

  const wireframe = useViewerStore((s) => s.wireframe);
  const showSkeleton = useViewerStore((s) => s.showSkeleton);
  const selectedUuid = useViewerStore((s) => s.selectedUuid);
  const highlightedMaterialUuid = useViewerStore((s) => s.highlightedMaterialUuid);

  useEffect(() => {
    scene.add(gltf.scene);

    const inspection = inspectScene(gltf.scene);
    useViewerStore.getState().setInspection(inspection);

    const originalMaterials = originalMaterialsRef.current;
    originalMaterials.clear();
    gltf.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      originalMaterials.set(mesh.uuid, mesh.material);
    });

    gltf.scene.traverse((object) => {
      const userData = (object as THREE.Object3D).userData;
      if (userData) {
        const isHidden = getFlag(userData, 'isHidden');
        if (isHidden) {
          object.visible = false;
        }
      }
    });

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
  }, [gltf, scene]);

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

  const wireBlueRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const wireOrangeRef = useRef<THREE.MeshBasicMaterial | null>(null);

  useEffect(() => {
    if (!wireBlueRef.current) {
      wireBlueRef.current = new THREE.MeshBasicMaterial({ color: WIREFRAME_COLOR, wireframe: true });
    }
    if (!wireOrangeRef.current) {
      wireOrangeRef.current = new THREE.MeshBasicMaterial({ color: SELECTION_COLOR, wireframe: true });
    }

    const wireBlue = wireBlueRef.current;
    const wireOrange = wireOrangeRef.current;
    const originalMaterials = originalMaterialsRef.current;

    gltf.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;

      const isSelected = mesh.uuid === selectedUuid;

      if (isSelected) {
        mesh.material = wireOrange;
      } else if (wireframe) {
        mesh.material = wireBlue;
      } else {
        const original = originalMaterials.get(mesh.uuid);
        if (original !== undefined) {
          mesh.material = original;
        }
      }
    });
  }, [gltf, wireframe, selectedUuid]);

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

  useEffect(() => {
    if (gizmoGroupRef.current) {
      scene.remove(gizmoGroupRef.current);
      gizmoGroupRef.current = null;
    }

    if (selectedUuid) {
      const target = gltf.scene.getObjectByProperty('uuid', selectedUuid);
      if (target) {
        const sphere = new THREE.Sphere();
        const box = new THREE.Box3().setFromObject(target);
        box.getBoundingSphere(sphere);
        const length = THREE.MathUtils.clamp(sphere.radius * 1.8, GIZMO_MIN_LENGTH, GIZMO_MAX_LENGTH);

        const group = new THREE.Group();
        group.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), length, '#ff4444', 0.12, 0.08));
        group.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), length, '#44ff44', 0.12, 0.08));
        group.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), length, '#4444ff', 0.12, 0.08));

        target.getWorldPosition(group.position);
        target.getWorldQuaternion(group.quaternion);

        scene.add(group);
        gizmoGroupRef.current = group;
      }
    }

    return () => {
      if (gizmoGroupRef.current) {
        scene.remove(gizmoGroupRef.current);
        gizmoGroupRef.current = null;
      }
    };
  }, [gltf, selectedUuid, scene]);

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

    if (gizmoGroupRef.current && selectedUuid) {
      const target = gltf.scene.getObjectByProperty('uuid', selectedUuid);
      if (target) {
        target.getWorldPosition(gizmoGroupRef.current.position);
        target.getWorldQuaternion(gizmoGroupRef.current.quaternion);
      }
    }

    materialHighlightHelpersRef.current.forEach((helper) => helper.update());
  });

  return null;
}

function getFlag(userData: Record<string, unknown>, key: string): unknown {
  for (const [k, v] of Object.entries(userData)) {
    if (k.toLowerCase() === key.toLowerCase()) return v;
  }
  return undefined;
}
