import { Grid3x3, RefreshCcw, Spline, Bone } from 'lucide-react';
import { useViewerStore } from './viewerStore';
import { IconToggle } from '../components/ui/Toggle';
import { IconButton } from '../components/ui/Button';

export function ViewerToolbar() {
  const wireframe = useViewerStore((s) => s.wireframe);
  const toggleWireframe = useViewerStore((s) => s.toggleWireframe);
  const showSkeleton = useViewerStore((s) => s.showSkeleton);
  const toggleSkeleton = useViewerStore((s) => s.toggleSkeleton);
  const showGrid = useViewerStore((s) => s.showGrid);
  const toggleGrid = useViewerStore((s) => s.toggleGrid);
  const skinnedMeshCount = useViewerStore((s) => s.skinnedMeshCount);
  const requestCameraReset = useViewerStore((s) => s.requestCameraReset);

  return (
    <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-hairline bg-canvas-raised p-1 shadow-sm">
      <IconToggle label="Wireframe" icon={Spline} checked={wireframe} onChange={toggleWireframe} />
      <IconToggle
        label={skinnedMeshCount > 0 ? `Skeleton (${skinnedMeshCount} skinned mesh(es))` : 'No skinned meshes'}
        icon={Bone}
        checked={showSkeleton}
        onChange={toggleSkeleton}
        disabled={skinnedMeshCount === 0}
      />
      <IconToggle label="Grid" icon={Grid3x3} checked={showGrid} onChange={toggleGrid} />
      <div className="mx-0.5 h-4 w-px bg-hairline" />
      <IconButton title="Reset camera" aria-label="Reset camera" onClick={requestCameraReset}>
        <RefreshCcw className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  );
}
