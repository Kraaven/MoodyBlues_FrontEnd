import { useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { SceneLoader } from './SceneLoader';
import { ViewerToolbar } from './ViewerToolbar';
import { useViewerStore } from './viewerStore';

export function ViewerCanvas({ developerId, sceneId }: { developerId: string; sceneId: string }) {
  const showGrid = useViewerStore((s) => s.showGrid);
  const cameraResetToken = useViewerStore((s) => s.cameraResetToken);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei's OrbitControls ref type is unwieldy to import just for .reset()
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    if (cameraResetToken > 0) {
      controlsRef.current?.reset();
    }
  }, [cameraResetToken]);

  return (
    <div className="relative h-full w-full">
      <Canvas camera={{ position: [3, 2, 4], fov: 45 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
        <color attach="background" args={['#09090b']} />
        <hemisphereLight args={['#ffffff', '#26262e', 0.9]} />
        <directionalLight position={[5, 8, 5]} intensity={1.4} castShadow />
        <directionalLight position={[-5, -2, -5]} intensity={0.4} />

        {showGrid && <Grid args={[20, 20]} cellColor="#20202a" sectionColor="#33333f" fadeDistance={25} infiniteGrid />}

        <SceneLoader developerId={developerId} sceneId={sceneId} />

        <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.08} />
      </Canvas>

      <ViewerToolbar />
    </div>
  );
}
