import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { hex, PALETTE } from '../viewer/core/palette';
import { ReplayPlayer } from '../viewer/replay/ReplayPlayer';
import { frustumSegments, gizmoDepth, type CameraInfo } from './cameras';

const nothing = () => undefined;

/**
 * A wireframe frustum at each exported camera, the focused one in the accent colour. They live in the
 * Stage's scene, beside the loaded scene rather than inside it, so the scene graph the inspector and
 * the cache hold is never touched; each one copies its camera node's world position and rotation
 * every frame, which is what makes it follow the camera through a replay. They are not pickable, cast
 * no shadows, and are left out of the scene's bounds (which count meshes only). A camera that is
 * hidden at the moment hides its gizmo.
 */
export function CameraGizmos({ cameras, focusId, radius }: { cameras: CameraInfo[]; focusId: number | null; radius: number }) {
  const parts = useMemo(() => {
    const depth = gizmoDepth(radius);
    const focused = new THREE.LineBasicMaterial({ color: hex(PALETTE.accent), toneMapped: false });
    const muted = new THREE.LineBasicMaterial({ color: hex(PALETTE.fg), transparent: true, opacity: 0.45, toneMapped: false });
    const items = cameras.map((camera) => {
      const perspective = camera.node as THREE.PerspectiveCamera;
      const fov = perspective.isPerspectiveCamera ? perspective.fov : 60;
      const aspect = perspective.isPerspectiveCamera && perspective.aspect > 0 ? perspective.aspect : 16 / 9;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(frustumSegments(depth, fov, aspect), 3));
      const lines = new THREE.LineSegments(geometry);
      lines.userData.__debug = true;
      lines.raycast = nothing;
      lines.castShadow = false;
      lines.receiveShadow = false;
      lines.frustumCulled = false;
      lines.matrixAutoUpdate = false;
      return { camera, lines };
    });
    return { items, focused, muted };
  }, [cameras, radius]);

  useEffect(
    () => () => {
      for (const { lines } of parts.items) lines.geometry.dispose();
      parts.focused.dispose();
      parts.muted.dispose();
    },
    [parts],
  );

  useFrame(({ invalidate }) => {
    for (const { camera, lines } of parts.items) {
      const material = camera.id === focusId ? parts.focused : parts.muted;
      if (lines.material !== material) {
        lines.material = material;
        invalidate();
      }
      lines.visible = ReplayPlayer.isEffectivelyVisible(camera.node);
      if (!lines.visible) continue;
      camera.node.updateWorldMatrix(true, false);
      // Position and rotation only: a scaled parent must not stretch the gizmo.
      camera.node.matrixWorld.decompose(lines.position, lines.quaternion, lines.scale);
      lines.scale.set(1, 1, 1);
      lines.updateMatrix();
      lines.matrixWorld.copy(lines.matrix);
    }
  });

  return (
    <>
      {parts.items.map(({ camera, lines }) => (
        <primitive key={camera.id} object={lines} />
      ))}
    </>
  );
}
