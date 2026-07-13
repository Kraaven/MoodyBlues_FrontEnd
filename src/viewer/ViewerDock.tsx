import type { ComponentType } from 'react';
import {
  List,
  Grid3x3,
  Bone,
  RefreshCcw,
  Maximize2,
  Info,
  Palette,
  BarChart3,
  Spline,
} from 'lucide-react';
import { useViewerStore } from './viewerStore';

function DockButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
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
      className={`flex h-10 w-10 items-center justify-center rounded-md transition ${
        active
          ? 'bg-accent-soft text-accent-strong border-l-2 border-accent'
          : 'text-ink-faint hover:bg-white/5 hover:text-ink-muted'
      }`}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

export function ViewerDock({ side }: { side: 'left' | 'right' }) {
  const wireframe = useViewerStore((s) => s.wireframe);
  const showSkeleton = useViewerStore((s) => s.showSkeleton);
  const showGrid = useViewerStore((s) => s.showGrid);
  const skinnedMeshCount = useViewerStore((s) => s.skinnedMeshCount);
  const leftPanelOpen = useViewerStore((s) => s.leftPanelOpen);
  const rightPanelTab = useViewerStore((s) => s.rightPanelTab);

  const toggleWireframe = useViewerStore((s) => s.toggleWireframe);
  const toggleSkeleton = useViewerStore((s) => s.toggleSkeleton);
  const toggleGrid = useViewerStore((s) => s.toggleGrid);
  const requestCameraReset = useViewerStore((s) => s.requestCameraReset);
  const toggleLeftPanel = useViewerStore((s) => s.toggleLeftPanel);
  const setRightPanelTab = useViewerStore((s) => s.setRightPanelTab);
  const collapseAllPanels = useViewerStore((s) => s.collapseAllPanels);

  if (side === 'left') {
    return (
      <div
        className="flex shrink-0 flex-col border-r border-hairline bg-canvas"
        style={{ width: 48 }}
      >
        <div className="flex flex-1 flex-col items-center gap-1 px-1 pt-2">
          <DockButton
            icon={List}
            label="Hierarchy (H)"
            active={leftPanelOpen}
            onClick={toggleLeftPanel}
          />
          <div className="my-1.5 h-px w-6 bg-hairline" />
          <DockButton
            icon={Spline}
            label="Wireframe (Z)"
            active={wireframe}
            onClick={toggleWireframe}
          />
          <DockButton
            icon={Grid3x3}
            label="Grid"
            active={showGrid}
            onClick={toggleGrid}
          />
          {skinnedMeshCount > 0 && (
            <DockButton
              icon={Bone}
              label={`Skeleton (${skinnedMeshCount} skinned)`}
              active={showSkeleton}
              onClick={toggleSkeleton}
            />
          )}
          <DockButton
            icon={RefreshCcw}
            label="Reset camera"
            active={false}
            onClick={requestCameraReset}
          />
        </div>
        <div className="flex items-center justify-center pb-2">
          <DockButton
            icon={Maximize2}
            label="Focus mode (Tab)"
            active={false}
            onClick={collapseAllPanels}
          />
        </div>
      </div>
    );
  }

  const tab = rightPanelTab;
  return (
    <div
      className="flex shrink-0 flex-col border-l border-hairline bg-canvas"
      style={{ width: 48 }}
    >
      <div className="flex flex-1 flex-col items-center gap-1 px-1 pt-2">
        <DockButton
          icon={Info}
          label="Inspector (D)"
          active={tab === 'inspector'}
          onClick={() => setRightPanelTab('inspector')}
        />
        <DockButton
          icon={Palette}
          label="Materials"
          active={tab === 'materials'}
          onClick={() => setRightPanelTab('materials')}
        />
        <DockButton
          icon={BarChart3}
          label="Scene stats"
          active={tab === 'stats'}
          onClick={() => setRightPanelTab('stats')}
        />
      </div>
      <div className="flex items-center justify-center pb-2">
        <DockButton
          icon={Maximize2}
          label="Focus mode (Tab)"
          active={false}
          onClick={collapseAllPanels}
        />
      </div>
    </div>
  );
}
