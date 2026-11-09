import { Grid } from '@react-three/drei';
import { PALETTE } from './palette';

/** The infinite ground grid that fades out with distance. */
export function Ground({ y = 0, fadeDistance = 60, strength = 1 }: { y?: number; fadeDistance?: number; strength?: number }) {
  return (
    <Grid
      position={[0, y, 0]}
      infiniteGrid
      cellSize={1}
      sectionSize={5}
      cellColor={PALETTE.rule}
      sectionColor={PALETTE.ruleStrong}
      cellThickness={0.6 * strength}
      sectionThickness={1 * strength}
      fadeDistance={fadeDistance}
      fadeStrength={1.5}
      followCamera={false}
    />
  );
}
