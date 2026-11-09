import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * A small studio of emissive panels turned into an environment map, so PBR materials exported from
 * Unity read correctly without hand-tuned lights. The idea (and the layout: four overhead panels
 * around a dark floor) is from glb-viewer-core's StudioLightScene (MIT, OHZI Interactive Studio);
 * the colours are ours: cool panels with one warmer key.
 */
function buildStudio(): THREE.Scene {
  const studio = new THREE.Scene();
  const panel = (size: [number, number, number], at: [number, number, number], color: string, gain: number) => {
    const material = new THREE.MeshBasicMaterial({ color });
    material.color.multiplyScalar(gain);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...at);
    studio.add(mesh);
  };
  const height = 5;
  panel([3, 3, 3], [5, height, 5], '#dfe8ff', 5);
  panel([3, 3, 3], [-5, height, 5], '#b9ccff', 4);
  panel([3, 3, 3], [5, height, -5], '#c8d6ff', 4);
  panel([5, 3, 5], [-5, height, -5], '#fff1de', 5); // the warm key
  panel([10, 0.1, 10], [0, -1, 0], '#1a2340', 0.5);
  return studio;
}

export function StudioEnvironment({ intensity = 0.4 }: { intensity?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl);
    const studio = buildStudio();
    const target = generator.fromScene(studio, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      target.dispose();
      generator.dispose();
      studio.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
    };
  }, [gl, scene, intensity]);

  return null;
}
