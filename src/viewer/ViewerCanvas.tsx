import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { SceneLoader } from './SceneLoader';
import { useViewerStore } from './viewerStore';

export function ViewerCanvas({ developerId, sceneId }: { developerId: string; sceneId: string }) {
  const showGrid = useViewerStore((s) => s.showGrid);

  return (
    <Canvas camera={{ position: [3, 2, 4], fov: 45 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
      <color attach="background" args={['#0b0b0f']} />
      <hemisphereLight args={['#ffffff', '#26262e', 0.9]} />
      <directionalLight position={[5, 8, 5]} intensity={1.4} castShadow />
      <directionalLight position={[-5, -2, -5]} intensity={0.4} />

      {showGrid && <Grid args={[20, 20]} cellColor="#262630" sectionColor="#39394a" fadeDistance={25} infiniteGrid />}

      <SceneLoader developerId={developerId} sceneId={sceneId} />

      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}
