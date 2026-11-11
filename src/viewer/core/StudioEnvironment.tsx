import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * A small studio of emissive panels turned into an environment map, so PBR materials exported from
 * Unity read correctly without hand-tuned lights. The idea (four overhead panels around a dark
 * floor) is from glb-viewer-core's StudioLightScene (MIT, OHZI Interactive Studio); the colours are
 * ours: a warm key, neutral fills and a cool rim, like an overcast afternoon.
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
  panel([5, 3, 5], [-5, height, 5], '#fff0dc', 5.5); // warm key, front left
  panel([3, 3, 3], [5, height, 5], '#f4f1ea', 3.5);
  panel([3, 3, 3], [-5, height, -5], '#ece9e4', 3);
  panel([3, 3, 3], [5, height, -5], '#d9e4f2', 3.5); // cool rim
  panel([12, 0.1, 12], [0, -1, 0], '#2a2b2e', 0.6);
  return studio;
}

export function StudioEnvironment({ intensity = 0.55 }: { intensity?: number }) {
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
