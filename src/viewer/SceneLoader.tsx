import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useViewerStore } from './viewerStore';
import { ModelRoot } from './ModelRoot';
import { createGltfLoader, fetchSceneArrayBuffer, parseGlb } from './loadScene';

export function SceneLoader({ developerId, sceneId }: { developerId: string; sceneId: string }) {
  const { gl } = useThree();
  const gltf = useViewerStore((s) => s.gltf);

  useEffect(() => {
    let cancelled = false;
    const store = useViewerStore.getState();
    store.setLoading(true);
    store.setError(null);

    (async () => {
      try {
        const buffer = await fetchSceneArrayBuffer(developerId, sceneId);
        const loader = createGltfLoader(gl);
        const parsed = await parseGlb(loader, buffer);
        if (!cancelled) {
          useViewerStore.getState().setFileSizeBytes(buffer.byteLength);
          useViewerStore.getState().setGltf(parsed);
        }
      } catch (err) {
        if (!cancelled) {
          useViewerStore.getState().setError(err instanceof Error ? err.message : 'Failed to load scene.');
        }
      } finally {
        if (!cancelled) {
          useViewerStore.getState().setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [developerId, sceneId, gl]);

  if (!gltf) {
    return null;
  }

  return <ModelRoot gltf={gltf} />;
}
