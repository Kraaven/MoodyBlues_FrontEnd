import { useMemo } from 'react';
import { EffectComposer, Outline, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type * as THREE from 'three';
import { hex, NOW_DIM, PALETTE } from './palette';

/** The `now` outline around the selected object (DESIGN.md 7.7). */
export function SelectionOutline({ object }: { object: THREE.Object3D | null }) {
  const selection = useMemo(() => {
    const meshes: THREE.Object3D[] = [];
    object?.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) meshes.push(node);
    });
    return meshes;
  }, [object]);

  return (
    <EffectComposer multisampling={4} autoClear={false}>
      <Outline selection={selection} visibleEdgeColor={hex(PALETTE.now)} hiddenEdgeColor={hex(NOW_DIM)} edgeStrength={4} blur xRay />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
