import { useLayoutEffect, useRef } from 'react';
import { Grid } from '@react-three/drei';
import type * as THREE from 'three';
import type { GroundPlan } from './floor';
import { PALETTE } from './palette';

/**
 * The floor: an infinite grid that fades with distance and, when the scene has no ground of its own,
 * an invisible plane level with it that only catches shadows, so a scene sits on the ground instead of
 * floating in it. Where the plan puts the grid and whether there is a catcher comes from
 * `planGround`; the grid is drawn without writing depth and with a depth offset away from the
 * surface it shares, so it never fights the ground.
 */
export function Ground({
  plan,
  fadeDistance = 60,
  cellSize = 1,
  grid = true,
  shadows = true,
}: {
  plan: GroundPlan;
  fadeDistance?: number;
  cellSize?: number;
  grid?: boolean;
  shadows?: boolean;
}) {
  const gridMesh = useRef<THREE.Mesh>(null);
  useLayoutEffect(() => {
    const material = gridMesh.current?.material as THREE.Material | undefined;
    if (!material) return;
    material.depthWrite = false;
    material.polygonOffset = true;
    material.polygonOffsetFactor = plan.depthBias * 2;
    material.polygonOffsetUnits = plan.depthBias * 2;
  }, [plan.depthBias, grid]);

  return (
    <>
      {grid && (
        <Grid
          ref={gridMesh}
          position={[0, plan.gridY, 0]}
          infiniteGrid
          cellSize={cellSize}
          sectionSize={cellSize * 5}
          cellColor={PALETTE.grid}
          sectionColor={PALETTE.gridStrong}
          cellThickness={0.55}
          sectionThickness={0.9}
          fadeDistance={fadeDistance}
          fadeStrength={1.6}
          followCamera={false}
        />
      )}
      {shadows && plan.catcher && (
        <mesh rotation-x={-Math.PI / 2} position={[plan.centerX, plan.gridY, plan.centerZ]} receiveShadow renderOrder={-1}>
          <planeGeometry args={[plan.extent, plan.extent]} />
          <shadowMaterial transparent opacity={0.42} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}
