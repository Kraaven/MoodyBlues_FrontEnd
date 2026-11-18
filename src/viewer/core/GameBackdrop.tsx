import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { QualityTier } from './look';
import { createFog } from './mbSurface';
import type { MoodyScene } from './sceneExtension';
import { createSkyScene, disposeSkyScene } from './sky';

/**
 * The game look's background, environment and fog, from the scene's own extension. The sky is drawn
 * once into a PMREM cube map (see sky.ts) that is both `scene.background` and `scene.environment`;
 * the fog is Unity's, read from the extension. Rebuilt only when the scene or tier changes, never per frame.
 * `sunDirection` is the way to the sun (its node's world +Z), or null when the scene has none.
 */
export function GameBackdrop({ moody, sunDirection, tier }: { moody: MoodyScene; sunDirection: THREE.Vector3 | null; tier: QualityTier }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl);
    const sky = createSkyScene(moody.sky, moody.ambientCube, sunDirection);
    const target = generator.fromScene(sky, 0, 0.1, 100, { size: tier === 'simple' ? 256 : 512 });
    disposeSkyScene(sky);
    generator.dispose();
    scene.background = target.texture;
    scene.backgroundIntensity = 1;
    scene.environment = target.texture;
    scene.environmentIntensity = 1;
    scene.fog = moody.fog ? createFog(moody.fog) : null;
    invalidate();
    return () => {
      scene.background = null;
      scene.environment = null;
      scene.fog = null;
      target.dispose();
    };
  }, [gl, scene, moody, sunDirection, tier, invalidate]);

  return null;
}
