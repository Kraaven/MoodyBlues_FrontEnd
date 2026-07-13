import { useMemo } from 'react';
import {
  Boxes,
  Cuboid,
  Crosshair,
  HardDrive,
  Image,
  Layers,
  Spline,
  Triangle,
  EyeOff,
} from 'lucide-react';
import { useViewerStore } from '../viewerStore';
import { computeSceneStats } from '../sceneStats';
import { formatBytes, formatCount } from '../../lib/format';

const statItemCls =
  'flex items-center justify-between gap-3 rounded-md px-2.5 py-2 border border-hairline bg-surface-soft';

export function SceneStatsPanel() {
  const meshes = useViewerStore((s) => s.meshes);
  const materials = useViewerStore((s) => s.materials);
  const textures = useViewerStore((s) => s.textures);
  const clips = useViewerStore((s) => s.clips);
  const fileSizeBytes = useViewerStore((s) => s.fileSizeBytes);
  const staticCount = useViewerStore((s) => s.staticCount);
  const trackedCount = useViewerStore((s) => s.trackedCount);
  const hiddenCount = useViewerStore((s) => s.hiddenCount);

  const stats = useMemo(
    () => computeSceneStats(meshes, materials.length, textures.length, clips),
    [meshes, materials.length, textures.length, clips],
  );

  return (
    <div className="space-y-2">
      <div className="mb-3">
        <p className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
          Scene overview
        </p>
      </div>

      <div className={statItemCls}>
        <div className="flex items-center gap-2">
          <Boxes className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
          <span className="text-xs text-ink-muted">Total objects</span>
        </div>
        <span className="font-mono text-sm tabular-nums text-ink">
          {formatCount(stats.objectCount)}
        </span>
      </div>

      <div className={statItemCls}>
        <div className="flex items-center gap-2">
          <Spline className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
          <span className="text-xs text-ink-muted">Total vertices</span>
        </div>
        <span className="font-mono text-sm tabular-nums text-ink">
          {formatCount(stats.totalVertices)}
        </span>
      </div>

      <div className={statItemCls}>
        <div className="flex items-center gap-2">
          <Triangle className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
          <span className="text-xs text-ink-muted">Total triangles</span>
        </div>
        <span className="font-mono text-sm tabular-nums text-ink">
          {formatCount(stats.totalTriangles)}
        </span>
      </div>

      <div className="my-2 border-t border-hairline" />

      <div className="mb-2">
        <p className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
          Object breakdown
        </p>
      </div>

      <div className={statItemCls}>
        <div className="flex items-center gap-2">
          <Cuboid className="h-3.5 w-3.5 shrink-0 text-icon-mesh" />
          <span className="text-xs text-ink-muted">Draw calls (meshes)</span>
        </div>
        <span className="font-mono text-sm tabular-nums text-ink">
          {formatCount(stats.objectCount)}
        </span>
      </div>

      <div className={statItemCls}>
        <div className="flex items-center gap-2">
          <Cuboid className="h-3.5 w-3.5 shrink-0 text-success" />
          <span className="text-xs text-ink-muted">Static objects</span>
        </div>
        <span className="font-mono text-sm tabular-nums text-ink">
          {formatCount(staticCount)}
        </span>
      </div>

      <div className={statItemCls}>
        <div className="flex items-center gap-2">
          <Crosshair className="h-3.5 w-3.5 shrink-0 text-accent-strong" />
          <span className="text-xs text-ink-muted">Tracked objects (ObjectID)</span>
        </div>
        <span className="font-mono text-sm tabular-nums text-ink">
          {formatCount(trackedCount)}
        </span>
      </div>

      <div className={statItemCls}>
        <div className="flex items-center gap-2">
          <EyeOff className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="text-xs text-ink-muted">Pre-hidden objects</span>
        </div>
        <span className="font-mono text-sm tabular-nums text-ink">
          {formatCount(hiddenCount)}
        </span>
      </div>

      <div className="my-2 border-t border-hairline" />

      <div className="mb-2">
        <p className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
          Assets
        </p>
      </div>

      <div className={statItemCls}>
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 shrink-0 text-icon-light" />
          <span className="text-xs text-ink-muted">Materials</span>
        </div>
        <span className="font-mono text-sm tabular-nums text-ink">
          {formatCount(stats.materialCount)}
        </span>
      </div>

      <div className={statItemCls}>
        <div className="flex items-center gap-2">
          <Image className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
          <span className="text-xs text-ink-muted">Textures</span>
        </div>
        <span className="font-mono text-sm tabular-nums text-ink">
          {formatCount(stats.textureCount)}
        </span>
      </div>

      <div className={statItemCls}>
        <div className="flex items-center gap-2">
          <HardDrive className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
          <span className="text-xs text-ink-muted">File size</span>
        </div>
        <span className="font-mono text-sm tabular-nums text-ink">
          {fileSizeBytes ? formatBytes(fileSizeBytes) : '--'}
        </span>
      </div>
    </div>
  );
}
