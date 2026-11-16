import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from './palette';

/**
 * Background and fog. The background is a screen-space gradient texture (not CSS behind a
 * transparent canvas) so post-processing keeps it: a cool charcoal, a touch lighter at the top, with
 * a faint vignette. Fog is set by the scene's size (and the camera's distance when it is farther out than that),
 * so small and huge scenes both fade only far away and a close follow stays lit.
 */
export function Atmosphere({ sceneRadius }: { sceneRadius: number }) {
  const scene = useThree((s) => s.scene);
  const fog = useMemo(() => new THREE.Fog(PALETTE.world1, 60, 400), []);

  useEffect(() => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const vertical = ctx.createLinearGradient(0, 0, 0, size);
    vertical.addColorStop(0, PALETTE.world2);
    vertical.addColorStop(0.55, PALETTE.world1);
    vertical.addColorStop(1, PALETTE.world0);
    ctx.fillStyle = vertical;
    ctx.fillRect(0, 0, size, size);
    const vignette = ctx.createRadialGradient(size * 0.5, size * 0.42, size * 0.15, size * 0.5, size * 0.5, size * 0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    scene.background = texture;
    scene.fog = fog;
    return () => {
      scene.background = null;
      scene.fog = null;
      texture.dispose();
    };
  }, [scene, fog]);

  useFrame(({ camera, controls }) => {
    const target = (controls as { target?: THREE.Vector3 } | null)?.target;
    const distance = target ? camera.position.distanceTo(target) : camera.position.length();
    // The scene's size sets the fog, so a close follow does not fog the world; only a camera farther out than that pushes it back.
    fog.near = Math.max(sceneRadius * 1.5, 60, distance * 2.5);
    fog.far = Math.max(sceneRadius * 5, 300, distance * 9);
  });

  return null;
}
