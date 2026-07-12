import { useViewerStore } from '../viewerStore';

function Toggle({ label, description, checked, onChange, disabled }: { label: string; description: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2.5 text-left disabled:opacity-40"
    >
      <div>
        <p className="text-xs font-medium text-zinc-200">{label}</p>
        <p className="text-[10px] text-zinc-500">{description}</p>
      </div>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-violet-500' : 'bg-white/10'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}

export function SettingsPanel() {
  const wireframe = useViewerStore((s) => s.wireframe);
  const toggleWireframe = useViewerStore((s) => s.toggleWireframe);
  const showSkeleton = useViewerStore((s) => s.showSkeleton);
  const toggleSkeleton = useViewerStore((s) => s.toggleSkeleton);
  const showGrid = useViewerStore((s) => s.showGrid);
  const toggleGrid = useViewerStore((s) => s.toggleGrid);
  const skinnedMeshCount = useViewerStore((s) => s.skinnedMeshCount);
  const meshes = useViewerStore((s) => s.meshes);
  const materials = useViewerStore((s) => s.materials);
  const textures = useViewerStore((s) => s.textures);

  return (
    <div className="space-y-2">
      <Toggle label="Wireframe" description="Render all materials as wireframe" checked={wireframe} onChange={toggleWireframe} />
      <Toggle
        label="Skeleton"
        description={skinnedMeshCount > 0 ? `Show bones for ${skinnedMeshCount} skinned mesh(es)` : 'No skinned meshes in this model'}
        checked={showSkeleton}
        onChange={toggleSkeleton}
        disabled={skinnedMeshCount === 0}
      />
      <Toggle label="Grid" description="Show the ground reference grid" checked={showGrid} onChange={toggleGrid} />

      <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3 text-xs text-zinc-400">
        <p className="mb-1.5 text-[10px] uppercase tracking-wide text-zinc-600">Model stats</p>
        <div className="flex justify-between py-0.5">
          <span>Meshes</span>
          <span className="text-zinc-200">{meshes.length}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span>Materials</span>
          <span className="text-zinc-200">{materials.length}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span>Textures</span>
          <span className="text-zinc-200">{textures.length}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span>Skinned meshes</span>
          <span className="text-zinc-200">{skinnedMeshCount}</span>
        </div>
      </div>
    </div>
  );
}
