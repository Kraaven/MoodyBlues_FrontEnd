import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { disposeObject3D, frameObject } from '../../viewer/core/gltf';
import { loadSceneGltf } from '../../stage/sceneSource';
import { Stage } from '../../viewer/Stage';

/**
 * The scene header's live preview (DESIGN.md 7.5): the version's GLB, slowly orbiting, no
 * controls. Stops rendering while off-screen, and does not orbit with reduced motion.
 */
export default function ScenePreview({ developerId, sceneId, hash }: { developerId: string; sceneId: string; hash: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="absolute inset-0">
      <Stage
        grid
        frameloop={visible ? 'always' : 'never'}
        className={`absolute inset-0 transition-opacity duration-[600ms] ${ready ? 'opacity-100' : 'opacity-0'}`}
      >
        <PreviewModel developerId={developerId} sceneId={sceneId} hash={hash} onReady={() => setReady(true)} />
      </Stage>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgb(10_15_30/0.65),transparent_35%)]" />
    </div>
  );
}

function PreviewModel({ developerId, sceneId, hash, onReady }: { developerId: string; sceneId: string; hash: string; onReady: () => void }) {
  const { gl, camera, scene } = useThree();
  const pivot = useRef(new THREE.Vector3());
  const radius = useRef(10);
  const height = useRef(4);
  const reducedMotion = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const controller = new AbortController();
    let root: THREE.Object3D | null = null;
    loadSceneGltf(gl, developerId, sceneId, hash, undefined, controller.signal)
      .then((gltf) => {
        if (controller.signal.aborted) return disposeObject3D(gltf.scene);
        root = gltf.scene;
        scene.add(root);
        const cam = camera as THREE.PerspectiveCamera;
        frameObject(cam, pivot.current, root, { padding: 0.95, direction: new THREE.Vector3(1, 0.55, 1) });
        const offset = cam.position.clone().sub(pivot.current);
        height.current = offset.y;
        radius.current = Math.hypot(offset.x, offset.z);
        onReadyRef.current();
      })
      .catch(() => {
        // The cover stays visible behind; a preview failure is not worth an error here.
      });
    return () => {
      controller.abort();
      if (root) {
        scene.remove(root);
        disposeObject3D(root);
      }
    };
  }, [gl, camera, scene, developerId, sceneId, hash]);

  useFrame(({ clock }) => {
    if (reducedMotion.current) return;
    const angle = clock.elapsedTime * 0.08 + Math.PI / 4;
    camera.position.set(
      pivot.current.x + Math.cos(angle) * radius.current,
      pivot.current.y + height.current,
      pivot.current.z + Math.sin(angle) * radius.current,
    );
    camera.lookAt(pivot.current);
  });

  return null;
}
