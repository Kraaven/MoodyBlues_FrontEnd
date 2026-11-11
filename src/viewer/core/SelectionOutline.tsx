import { useMemo } from 'react';
import { EffectComposer, Outline, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type * as THREE from 'three';
import { ACCENT_DIM, hex, PALETTE } from './palette';

/** The amber outline around the selected object. */
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
      <Outline selection={selection} visibleEdgeColor={hex(PALETTE.accent)} hiddenEdgeColor={hex(ACCENT_DIM)} edgeStrength={4} blur xRay />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
