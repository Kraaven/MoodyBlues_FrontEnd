import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStage } from '../stage/store';

function carriesObjectId(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((n) => {
    if (typeof n.userData?.objectId === 'number') found = true;
  });
  return found;
}

/** Whatever the Debug panel's toggles ask of the scene, inside the canvas. Every change is undone when its toggle goes off. */
export default function DebugEffects() {
  const scene = useThree((s) => s.scene);
  const wireframe = useStage((s) => s.debug.wireframe);
  const axes = useStage((s) => s.debug.axes);
  const bounds = useStage((s) => s.debug.bounds);
  const showHidden = useStage((s) => s.debug.showHidden);
  const fog = useStage((s) => s.debug.fog);

  // Wireframe: flipped on the materials in use, and put back.
  useEffect(() => {
    if (!wireframe) return;
    const touched = new Set<THREE.Material & { wireframe: boolean }>();
    const apply = () =>
      scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh || mesh.userData.__debug) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const material = m as THREE.Material & { wireframe?: boolean };
          if (typeof material.wireframe === 'boolean' && !touched.has(material as never)) {
            touched.add(material as never);
            material.wireframe = true;
          }
        }
      });
    apply();
    const timer = window.setInterval(apply, 1000); // catches scenes that finish loading afterwards
    return () => {
      window.clearInterval(timer);
      for (const m of touched) m.wireframe = false;
    };
  }, [wireframe, scene]);

  // Show the nodes the scene marks inactive at start.
  useEffect(() => {
    if (!showHidden) return;
    const forced = new Set<THREE.Object3D>();
    const apply = () =>
      scene.traverse((node) => {
        if (node.userData?.isHidden === true && !node.visible && !forced.has(node)) {
          forced.add(node);
          node.visible = true;
        }
      });
    apply();
    const timer = window.setInterval(apply, 1000);
    return () => {
      window.clearInterval(timer);
      for (const node of forced) node.visible = false;
    };
  }, [showHidden, scene]);

  useEffect(() => {
    if (fog) return;
    const saved = scene.fog;
    scene.fog = null;
    return () => {
      scene.fog = saved;
    };
  }, [fog, scene]);

  useEffect(() => {
    if (!axes) return;
    const helper = new THREE.AxesHelper(5);
    helper.userData.__debug = true;
    scene.add(helper);
    return () => {
      scene.remove(helper);
      helper.dispose();
    };
  }, [axes, scene]);

  // Bounds of everything in the scene except the helpers and the ground, refreshed as it changes.
  useEffect(() => {
    if (!bounds) return;
    const box = new THREE.Box3();
    const helper = new THREE.Box3Helper(box, new THREE.Color('#ffb547'));
    helper.userData.__debug = true;
    scene.add(helper);
    return () => {
      scene.remove(helper);
      helper.dispose();
    };
  }, [bounds, scene]);

  useFrame(() => {
    if (!bounds) return;
    const helper = scene.children.find((c) => c instanceof THREE.Box3Helper) as THREE.Box3Helper | undefined;
    if (!helper) return;
    helper.box.makeEmpty();
    for (const child of scene.children) {
      if (child === helper || child.userData.__debug || (child as THREE.Light).isLight) continue;
      if (!child.visible || !carriesObjectId(child)) continue; // the infinite grid has no bounds worth drawing
      helper.box.expandByObject(child);
    }
  });

  return null;
}
