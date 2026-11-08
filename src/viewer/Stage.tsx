import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import { EffectComposer, Outline, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';

/** Background colour of every viewport; the fog fades into it. */
export const VIEWPORT_BG = '#070a14';

/**
 * The shared viewport (DESIGN.md 7.6): deep gradient behind a transparent canvas, distance fog,
 * soft hemisphere and key light, and a ground grid that fades out. Used by the player, the scene
 * inspector and the scene header preview.
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
    <div className={className} style={{ background: 'radial-gradient(120% 90% at 50% 0%, #121b36 0%, #0a0f1e 45%, #05070e 100%)' }}>
      <Canvas
        frameloop={frameloop}
        dpr={[1, 2]}
        camera={{ position: [6, 4, 8], fov: 45, near: 0.05, far: 2000 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      >
        <Atmosphere />
        <hemisphereLight args={['#d6defa', '#1a2140', 1.1]} />
        <directionalLight position={[6, 10, 4]} intensity={1.6} color="#fff4e6" />
        <directionalLight position={[-6, 3, -6]} intensity={0.45} color="#8fa6ff" />
        {grid && (
          <Grid
            infiniteGrid
            cellSize={1}
            sectionSize={5}
            cellColor="#1a2442"
            sectionColor="#273866"
            cellThickness={0.6}
            sectionThickness={1}
            fadeDistance={60}
            fadeStrength={1.5}
            followCamera={false}
          />
        )}
        {children}
      </Canvas>
    </div>
  );
}

/**
 * Background and fog. The background is a screen-space gradient texture (not CSS behind a
 * transparent canvas) so the selection outline's post-processing keeps it. Fog follows the
 * camera's distance to what it orbits, so small and huge scenes both fade only far away.
 */
function Atmosphere() {
  const scene = useThree((s) => s.scene);
  const fog = useMemo(() => new THREE.Fog(VIEWPORT_BG, 60, 400), []);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#131c38');
    gradient.addColorStop(0.45, '#0a0f1e');
    gradient.addColorStop(1, '#05070e');
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

/** Accent outline around the selected object (DESIGN.md 7.6). */
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
      <Outline selection={selection} visibleEdgeColor={0x8fa6ff} hiddenEdgeColor={0x3b4fa8} edgeStrength={4} blur xRay />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
