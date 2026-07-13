import { Grid3x3, Spline, Bone, RefreshCcw } from 'lucide-react';
import { useViewerStore } from '../viewerStore';

function ToggleRow({
  icon: Icon,
  label,
  checked,
  onChange,
  disabled,
}: {
  icon: typeof Grid3x3;
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-md border px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-30 ${
        checked ? 'border-accent/40 bg-accent-soft' : 'border-hairline bg-surface-soft hover:border-hairline-strong'
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${checked ? 'text-accent-strong' : 'text-ink-faint'}`} />
      <span className={`flex-1 text-xs ${checked ? 'font-medium text-ink' : 'text-ink-muted'}`}>{label}</span>
      <span
        className={`inline-flex h-4 w-7 shrink-0 items-center rounded-full transition ${
          checked ? 'bg-accent' : 'bg-white/10'
        }`}
      >
        <span className={`inline-block h-3 w-3 rounded-full bg-white transition ${checked ? 'ml-3.5' : 'ml-0.5'}`} />
      </span>
    </button>
  );
}

export function SettingsPanel() {
  const wireframe = useViewerStore((s) => s.wireframe);
  const toggleWireframe = useViewerStore((s) => s.toggleWireframe);
  const showGrid = useViewerStore((s) => s.showGrid);
  const toggleGrid = useViewerStore((s) => s.toggleGrid);
  const showSkeleton = useViewerStore((s) => s.showSkeleton);
  const toggleSkeleton = useViewerStore((s) => s.toggleSkeleton);
  const skinnedMeshCount = useViewerStore((s) => s.skinnedMeshCount);
  const requestCameraReset = useViewerStore((s) => s.requestCameraReset);

  return (
    <div className="space-y-2">
      <ToggleRow icon={Grid3x3} label="Grid" checked={showGrid} onChange={toggleGrid} />
      <ToggleRow icon={Spline} label="Wireframe" checked={wireframe} onChange={toggleWireframe} />
      <ToggleRow
        icon={Bone}
        label={`Skeleton${skinnedMeshCount > 0 ? ` (${skinnedMeshCount} skinned)` : ''}`}
        checked={showSkeleton}
        onChange={toggleSkeleton}
        disabled={skinnedMeshCount === 0}
      />
      <div className="pt-1">
        <button
          type="button"
          onClick={requestCameraReset}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-hairline bg-surface-soft px-3 py-2 text-xs text-ink-muted transition hover:border-hairline-strong hover:text-ink"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Reset camera
        </button>
      </div>
    </div>
  );
}
