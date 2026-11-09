import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from './palette';

/**
 * Background and fog. The background is a screen-space gradient texture (not CSS behind a
 * transparent canvas) so post-processing keeps it. Fog follows the camera's distance to what it
 * orbits, so small and huge scenes both fade only far away.
 */
export function Atmosphere() {
  const scene = useThree((s) => s.scene);
  const fog = useMemo(() => new THREE.Fog(PALETTE.ink1, 60, 400), []);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, PALETTE.ink2);
    gradient.addColorStop(0.45, PALETTE.ink1);
    gradient.addColorStop(1, PALETTE.ink0);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 4, 256);
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
    fog.near = Math.max(10, distance * 2.5);
    fog.far = Math.max(60, distance * 9);
  });

  return null;
}
