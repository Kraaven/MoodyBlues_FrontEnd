import type { ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Atmosphere } from './core/Atmosphere';
import { Ground } from './core/Ground';
import { StudioEnvironment } from './core/StudioEnvironment';
import { PALETTE } from './core/palette';

/**
 * LEGACY: a Canvas per view, used by the player, the inspector and the scene preview until each
 * moves onto the root Stage (src/stage). Removed in Phases 3 and 4 of REBUILD_PLAN.md.
 */
export function Stage({
  children,
  grid = true,
  frameloop = 'always',
  className,
}: {
  children: ReactNode;
  grid?: boolean;
  frameloop?: 'always' | 'never' | 'demand';
  className?: string;
}) {
  return (
    <div className={className} style={{ background: PALETTE.ink0 }}>
      <Canvas
        frameloop={frameloop}
        dpr={[1, 2]}
        camera={{ position: [6, 4, 8], fov: 45, near: 0.05, far: 2000 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <Atmosphere />
        <StudioEnvironment />
        <hemisphereLight args={['#d6defa', PALETTE.ink3, 0.3]} />
        <directionalLight position={[6, 10, 4]} intensity={1.2} color="#fff4e6" />
        {grid && <Ground />}
        {children}
      </Canvas>
    </div>
  );
}
