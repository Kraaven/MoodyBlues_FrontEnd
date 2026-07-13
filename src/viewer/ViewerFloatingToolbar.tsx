import {
  List,
  Info,
  Palette,
  BarChart3,
  Spline,
  Grid3x3,
  Bone,
  RefreshCcw,
} from 'lucide-react';
import { useViewerStore } from './viewerStore';

function ToolbarIcon({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof List;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
        active
          ? 'border-accent/40 bg-accent-soft text-accent-strong'
          : 'border-hairline bg-canvas-raised/90 text-ink-muted hover:border-hairline-strong hover:text-ink'
      }`}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

export function ViewerFloatingToolbar() {
  const openPanels = useViewerStore((s) => s.openPanels);
  const togglePanel = useViewerStore((s) => s.togglePanel);
  const wireframe = useViewerStore((s) => s.wireframe);
  const toggleWireframe = useViewerStore((s) => s.toggleWireframe);
  const showGrid = useViewerStore((s) => s.showGrid);
  const toggleGrid = useViewerStore((s) => s.toggleGrid);
  const showSkeleton = useViewerStore((s) => s.showSkeleton);
  const toggleSkeleton = useViewerStore((s) => s.toggleSkeleton);
  const skinnedMeshCount = useViewerStore((s) => s.skinnedMeshCount);
  const requestCameraReset = useViewerStore((s) => s.requestCameraReset);

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div className="pointer-events-auto absolute left-3 top-3 flex items-center gap-1 rounded-full border border-hairline bg-canvas-raised/95 px-1.5 py-1 shadow-lg shadow-black/40">
        <div className="flex items-center gap-0.5">
          <ToolbarIcon
            icon={List}
            label="Hierarchy"
            active={openPanels.hierarchy}
            onClick={() => togglePanel('hierarchy')}
          />
          <ToolbarIcon
            icon={Info}
            label="Inspector"
            active={openPanels.inspector}
            onClick={() => togglePanel('inspector')}
          />
          <ToolbarIcon
            icon={Palette}
            label="Materials"
            active={openPanels.materials}
            onClick={() => togglePanel('materials')}
          />
          <ToolbarIcon
            icon={BarChart3}
            label="Scene stats"
            active={openPanels.stats}
            onClick={() => togglePanel('stats')}
          />
        </div>
        <div className="mx-0.5 h-5 w-px bg-hairline" />
        <div className="flex items-center gap-0.5">
          <ToolbarIcon
            icon={Spline}
            label="Wireframe"
            active={wireframe}
            onClick={toggleWireframe}
          />
          <ToolbarIcon
            icon={Grid3x3}
            label="Grid"
            active={showGrid}
            onClick={toggleGrid}
          />
          {skinnedMeshCount > 0 && (
            <ToolbarIcon
              icon={Bone}
              label={`Skeleton (${skinnedMeshCount} skinned)`}
              active={showSkeleton}
              onClick={toggleSkeleton}
            />
          )}
          <ToolbarIcon
            icon={RefreshCcw}
            label="Reset camera"
            active={false}
            onClick={requestCameraReset}
          />
        </div>
      </div>
    </div>
  );
}
