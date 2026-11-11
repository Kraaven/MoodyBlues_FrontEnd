import { Grid } from '@react-three/drei';
import { PALETTE } from './palette';

/**
 * The floor: an infinite grid that fades with distance and, under it, an invisible plane that only
 * catches shadows, so a scene sits on the ground instead of floating in it.
 */
export function Ground({
  y = 0,
  fadeDistance = 60,
  cellSize = 1,
  grid = true,
  shadows = false,
  extent = 200,
}: {
  y?: number;
  fadeDistance?: number;
  cellSize?: number;
  grid?: boolean;
  shadows?: boolean;
  extent?: number;
}) {
  return (
    <>
      {grid && (
        <Grid
          position={[0, y + 0.001, 0]}
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
      {shadows && (
        <mesh rotation-x={-Math.PI / 2} position={[0, y, 0]} receiveShadow renderOrder={-1}>
          <planeGeometry args={[extent, extent]} />
          <shadowMaterial transparent opacity={0.42} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}
