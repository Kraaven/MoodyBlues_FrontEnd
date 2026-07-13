import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useViewerStore } from './viewerStore';
import { inspectScene } from './gltfInspection';

const SELECTION_COLOR = '#F4B675';
const WIREFRAME_COLOR = '#5B7CFA';
const MATERIAL_HIGHLIGHT_COLOR = '#DCEB1';
const CAMERA_HELPER_COLOR = '#C586C0';
const CLICK_DRAG_THRESHOLD_PX = 4;
const GIZMO_MIN_LENGTH = 0.06;
const GIZMO_MAX_LENGTH = 0.8;

function createWireMaterial(color: string) {
  return new THREE.MeshBasicMaterial({
    color,
    wireframe: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -10,
    polygonOffsetUnits: -10,
  });
}

function createCameraFrustum(): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const h = 0.25;
  const wNear = 0.12;
  const wFar = 0.18;
  const d = 0.3;
  const o = 0.06;

  const vertices = new Float32Array([
    0, 0, 0,
    -wNear, h, d, wNear, h, d, wNear, -h, d, -wNear, -h, d,
    -wFar, h, d + o, wFar, h, d + o, wFar, -h, d + o, -wFar, -h, d + o,
  ]);

  const indices = [
    0, 1, 0, 2, 0, 3, 0, 4,
    1, 5, 2, 6, 3, 7, 4, 8,
    5, 6, 6, 7, 7, 8, 8, 5,
    5, 1, 6, 2, 7, 3, 8, 4,
  ];

  geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geom.setIndex(indices);
  return geom;
}

export function ModelRoot({ gltf }: { gltf: GLTF }) {
  const { scene, gl, camera } = useThree();
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<THREE.AnimationAction[]>([]);
  const uiThrottleRef = useRef(0);
  const skeletonHelpersRef = useRef<THREE.SkeletonHelper[]>([]);
  const cameraHelpersRef = useRef<THREE.LineSegments[]>([]);
  const materialHighlightHelpersRef = useRef<THREE.BoxHelper[]>([]);
  const gizmoGroupRef = useRef<THREE.Group | null>(null);
  const wireOverlaysRef = useRef<THREE.Mesh[]>([]);

  const wireframe = useViewerStore((s) => s.wireframe);
  const showSkeleton = useViewerStore((s) => s.showSkeleton);
  const selectedUuid = useViewerStore((s) => s.selectedUuid);
  const highlightedMaterialUuid = useViewerStore((s) => s.highlightedMaterialUuid);
  const hiddenNodes = useViewerStore((s) => s.hiddenNodes);

  useEffect(() => {
    scene.add(gltf.scene);

    const inspection = inspectScene(gltf.scene);
    const store = useViewerStore.getState();
    store.setInspection({
      materials: inspection.materials,
      textures: inspection.textures,
      meshes: inspection.meshes,
      skinnedMeshCount: inspection.skinnedMeshCount,
      staticCount: inspection.staticCount,
      trackedCount: inspection.trackedCount,
      hiddenCount: inspection.hiddenCount,
      preHiddenUuids: inspection.preHiddenUuids,
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
      const meshHit = hits.find((hit) => {
        const obj = hit.object as THREE.Mesh;
        return obj.isMesh && !obj.userData._wireOverlay;
      });
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
      wireBlueRef.current = createWireMaterial(WIREFRAME_COLOR);
    }
    if (!wireOrangeRef.current) {
      wireOrangeRef.current = createWireMaterial(SELECTION_COLOR);
    }

    wireOverlaysRef.current.forEach((overlay) => overlay.removeFromParent());
    wireOverlaysRef.current = [];

    const wireBlue = wireBlueRef.current;
    const wireOrange = wireOrangeRef.current;

    gltf.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.userData._wireOverlay) return;

      const isSelected = mesh.uuid === selectedUuid;

      if (isSelected) {
        addWireOverlay(mesh, wireOrange, wireOverlaysRef);
      } else if (wireframe) {
        addWireOverlay(mesh, wireBlue, wireOverlaysRef);
      }
    });

    return () => {
      wireOverlaysRef.current.forEach((overlay) => overlay.removeFromParent());
      wireOverlaysRef.current = [];
    };
  }, [gltf, wireframe, selectedUuid]);

  useEffect(() => {
    cameraHelpersRef.current.forEach((helper) => {
      helper.geometry.dispose();
      (helper.material as THREE.Material).dispose();
      helper.removeFromParent();
    });
    cameraHelpersRef.current = [];

    const frustumGeom = createCameraFrustum();
    const camMaterial = new THREE.LineBasicMaterial({ color: CAMERA_HELPER_COLOR, depthTest: true });

    gltf.scene.traverse((object) => {
      if ((object as THREE.Camera).isCamera) {
        const helper = new THREE.LineSegments(frustumGeom, camMaterial);
        helper.matrixAutoUpdate = false;
        object.getWorldPosition(helper.position);
        object.getWorldQuaternion(helper.quaternion);
        helper.updateMatrix();
        scene.add(helper);
        cameraHelpersRef.current.push(helper);
      }
    });

    return () => {
      cameraHelpersRef.current.forEach((helper) => {
        helper.removeFromParent();
      });
    };
  }, [gltf, scene]);

  useEffect(() => {
    gltf.scene.traverse((object) => {
      const userData = object.userData as Record<string, unknown>;
      const wasPrehidden = Boolean(getFlag(userData, 'isHidden'));
      const isToggledHidden = Boolean(hiddenNodes[object.uuid]);

      if (isToggledHidden) {
        object.visible = false;
      } else if (wasPrehidden) {
        object.visible = false;
      } else {
        object.visible = true;
      }
    });

    cameraHelpersRef.current.forEach((helper, i) => {
      const cameras: THREE.Camera[] = [];
      gltf.scene.traverse((obj) => {
        if ((obj as THREE.Camera).isCamera) cameras.push(obj as THREE.Camera);
      });
      if (cameras[i]) {
        cameras[i].getWorldPosition(helper.position);
        cameras[i].getWorldQuaternion(helper.quaternion);
      }
    });
  }, [hiddenNodes, gltf.scene]);

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
        const length = THREE.MathUtils.clamp(sphere.radius * 0.8, GIZMO_MIN_LENGTH, GIZMO_MAX_LENGTH);

        const group = new THREE.Group();
        group.add(new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), length, '#E06C75', 0.05, 0.03));
        group.add(new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), length, '#98C379', 0.05, 0.03));
        group.add(new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), length, '#61AFEF', 0.05, 0.03));

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
        if (mesh.userData._wireOverlay) return;
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

    cameraHelpersRef.current.forEach((helper, i) => {
      const cameras: THREE.Camera[] = [];
      gltf.scene.traverse((obj) => {
        if ((obj as THREE.Camera).isCamera) cameras.push(obj as THREE.Camera);
      });
      if (cameras[i]) {
        cameras[i].getWorldPosition(helper.position);
        cameras[i].getWorldQuaternion(helper.quaternion);
      }
    });
  });

  return null;
}

function addWireOverlay(
  mesh: THREE.Mesh,
  material: THREE.MeshBasicMaterial,
  ref: React.MutableRefObject<THREE.Mesh[]>,
) {
  const parent = mesh.parent;
  if (!parent) return;

  let overlay: THREE.Mesh;

  if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
    const im = mesh as THREE.InstancedMesh;
    overlay = new THREE.InstancedMesh(im.geometry, material, im.count);
    for (let i = 0; i < im.count; i++) {
      const matrix = new THREE.Matrix4();
      im.getMatrixAt(i, matrix);
      (overlay as THREE.InstancedMesh).setMatrixAt(i, matrix);
    }
    (overlay as THREE.InstancedMesh).instanceMatrix.needsUpdate = true;
  } else if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
    const skinned = mesh as THREE.SkinnedMesh;
    overlay = new THREE.SkinnedMesh(mesh.geometry, material);
    (overlay as THREE.SkinnedMesh).bind(skinned.skeleton, skinned.bindMatrix);
  } else {
    overlay = new THREE.Mesh(mesh.geometry, material);
  }

  overlay.userData._wireOverlay = true;
  parent.add(overlay);
  ref.current.push(overlay);
}

function getFlag(userData: Record<string, unknown>, key: string): unknown {
  for (const [k, v] of Object.entries(userData)) {
    if (k.toLowerCase() === key.toLowerCase()) return v;
  }
  return undefined;
}
