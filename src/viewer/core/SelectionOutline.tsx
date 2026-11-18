import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { EffectComposer, Outline, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type * as THREE from 'three';
import type { ToneMapper } from './look';
import { ACCENT_DIM, hex, PALETTE } from './palette';

/**
 * The amber outline around the selected object.
 *
 * While it exists the composer draws the scene, so its cost is kept down: the outline is built at
 * half resolution (it is a blurred edge, so nothing is visible lost) and the composer does not
 * multisample. Trade-off: the composer's buffer replaces the canvas's own antialiasing, so while
 * something is selected the scene's own edges are not antialiased (the outline's are soft anyway);
 * 4x MSAA on the full-size buffers roughly doubled the cost of every frame. The tone mapping is the
 * same one, at the renderer's exposure, that the canvas applies without the composer (`mapper`).
 *
 * Only the full tier mounts this; the simple tier (phones) never creates a composer and tints the
 * selection instead (SelectionTint).
 */
export function SelectionOutline({ object, mapper = 'neutral' }: { object: THREE.Object3D | null; mapper?: ToneMapper }) {
  const invalidate = useThree((s) => s.invalidate);
  const selection = useMemo(() => {
    const meshes: THREE.Object3D[] = [];
    object?.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) meshes.push(node);
    });
    return meshes;
  }, [object]);

  // The outline is drawn by the composer, outside React's props; ask for a frame when the selection changes.
  useEffect(() => {
    invalidate();
    return () => invalidate();
  }, [selection, invalidate]);

  return (
    <EffectComposer multisampling={0} autoClear={false}>
      <Outline selection={selection} visibleEdgeColor={hex(PALETTE.accent)} hiddenEdgeColor={hex(ACCENT_DIM)} edgeStrength={4} blur xRay resolutionScale={0.5} />
      <ToneMapping mode={mapper === 'aces' ? ToneMappingMode.ACES_FILMIC : ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}
