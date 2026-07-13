import { List, MousePointer2, Palette, BarChart3, Settings } from 'lucide-react';
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

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div className="pointer-events-auto absolute left-3 top-3 flex items-center gap-1 rounded-full border border-hairline bg-canvas-raised/95 px-1.5 py-1 shadow-lg shadow-black/40">
        <ToolbarIcon
          icon={List}
          label="Hierarchy"
          active={openPanels.hierarchy}
          onClick={() => togglePanel('hierarchy')}
        />
        <ToolbarIcon
          icon={MousePointer2}
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

      <div className="pointer-events-auto absolute right-3 top-3">
        <ToolbarIcon
          icon={Settings}
          label="Settings"
          active={openPanels.settings}
          onClick={() => togglePanel('settings')}
        />
      </div>
    </div>
  );
}
